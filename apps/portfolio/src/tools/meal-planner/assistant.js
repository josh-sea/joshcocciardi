/* ------------------------------------------------------------------ */
/*  Family Meal Planner: the Ask AI assistant, minus the network      */
/*                                                                     */
/*  Tool definitions, input validation, the system prompt, and the    */
/*  kitchen context the assistant is given. No React, no Firebase and  */
/*  no SDK in here, so test/meal-planner.test.mjs can import it.      */
/* ------------------------------------------------------------------ */

import {
  findByName,
  itemState,
  mondayOf,
  ratingSummary,
  readDay,
  sectionSlots,
  shownSections,
  slotState,
  weekDays,
} from "./plan.js";

// What the assistant can be shown. Each is opt-in per question, so nothing
// about the kitchen leaves the device unless someone ticked it.
export const CONTEXTS = [
  { key: "recipes", label: "Recipes" },
  { key: "inventory", label: "Inventory" },
  { key: "shopping", label: "Shopping list" },
  { key: "today", label: "Today's plan" },
  { key: "week", label: "This week" },
];

/* ------------------------------- tools ------------------------------ */

// eager_input_streaming lets a long recipe stream in as it's written. The
// API stops validating the input when it's on, so every input goes through
// the validators below before anything is done with it.
export const TOOLS = [
  {
    name: "propose_recipe",
    description:
      "Show the user a recipe as a card they can save to their recipe box and shop for. Call this whenever your answer includes a specific recipe, instead of writing the recipe out in text. One call per recipe.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short recipe name, e.g. 'Sheet pan lemon chicken'." },
        servings: { type: "string", description: "e.g. '4'. Optional." },
        source_url: { type: "string", description: "Link to the recipe if it came from a web page. Optional." },
        ingredients: {
          type: "array",
          items: { type: "string" },
          description: "Ingredient lines as the recipe gives them, with quantities: '2 tbsp olive oil'.",
        },
        steps: { type: "array", items: { type: "string" }, description: "Method, one step per entry." },
        uses_inventory: {
          type: "array",
          items: { type: "string" },
          description:
            "Names of items from the user's inventory that this recipe uses, spelled exactly as they appear in the inventory context. Empty if no inventory was shared.",
        },
        to_buy: {
          type: "array",
          description:
            "What the user would need to buy for this recipe, as it would go on a shopping list. Leave out anything already in stock in the inventory, and pantry staples: salt, pepper, cooking oils, vinegar, dried herbs and spices. Fresh herbs are fine to include.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "What to buy, as a store would sell it: 'lemon', 'chicken thighs'." },
              amount: {
                type: "string",
                description:
                  "The smallest sensible amount to buy, never the recipe measure: '1' lemon rather than '1 tsp lemon juice', '1 bunch', '1 lb', '1 dozen'.",
              },
            },
            required: ["name"],
          },
        },
      },
      required: ["name", "ingredients", "steps", "to_buy"],
    },
  },
  {
    name: "add_to_shopping_list",
    description:
      "Add items to the user's shopping list right away. Only call this when the user asks you to add something to their list.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              amount: {
                type: "string",
                description: "How much to buy, in purchase units ('2', '1 dozen', '1 lb'). Optional.",
              },
            },
            required: ["name"],
          },
        },
      },
      required: ["items"],
    },
  },
];

const str = (v) => (typeof v === "string" ? v.trim() : "");
const strList = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : null);
const buyList = (v) =>
  Array.isArray(v)
    ? v
        .filter((x) => x && typeof x === "object" && str(x.name))
        .map((x) => ({ name: str(x.name), amount: str(x.amount) }))
    : null;

// Returns { ok: true, value } with a clean copy, or { ok: false, error }.
// A streamed input can come back truncated rather than failing to parse, so
// required fields are checked, not assumed.
export const validateRecipe = (input) => {
  const name = str(input?.name);
  const ingredients = strList(input?.ingredients);
  const steps = strList(input?.steps);
  const toBuy = buyList(input?.to_buy);
  if (!name || !ingredients || !ingredients.length || !steps || !toBuy) {
    return { ok: false, error: "propose_recipe needs name, ingredients, steps, and to_buy." };
  }
  const url = str(input?.source_url);
  return {
    ok: true,
    value: {
      name,
      servings: str(input?.servings),
      sourceUrl: /^https?:\/\//i.test(url) ? url : "",
      ingredients,
      steps,
      usesInventory: strList(input?.uses_inventory) || [],
      toBuy,
    },
  };
};

export const validateListItems = (input) => {
  const items = buyList(input?.items);
  if (!items || !items.length) return { ok: false, error: "add_to_shopping_list needs at least one item." };
  return { ok: true, value: items };
};

// What gets saved when someone taps Save recipe: the ingredient lines and
// the method go into the free-text ingredients field, and the inventory
// names the assistant matched become real links to inventory rows.
export const recipeToSave = (recipe, inventory) => {
  const lines = [...recipe.ingredients];
  if (recipe.servings) lines.unshift(`Serves ${recipe.servings}`);
  const method = recipe.steps.map((s, i) => `${i + 1}. ${s}`);
  const uses = [];
  recipe.usesInventory.forEach((name) => {
    const item = findByName(inventory, name);
    if (item && itemState(item) !== "wanted" && !uses.some((u) => u.id === item.id)) {
      uses.push({ id: item.id, name: item.name });
    }
  });
  return {
    name: recipe.name,
    link: recipe.sourceUrl,
    ingredients: `${lines.join("\n")}\n\nMethod:\n${method.join("\n")}`,
    uses,
  };
};

// The to-buy list as the card shows it. The assistant is told to leave out
// what's in stock, but it only knows the inventory if it was shared, so
// anything that matches an in-stock item by name starts unticked.
export const buyRows = (recipe, inventory) =>
  recipe.toBuy.map((b) => {
    const item = findByName(inventory, b.name);
    return { ...b, inStock: !!item && itemState(item) === "stock", onList: !!item?.onList };
  });

/* --------------------------- the prompt ---------------------------- */

// Stable for a kitchen, so it caches: nothing here changes per question.
// Today's date and the kitchen data go in the context block with each
// question instead.
export const systemPrompt = (kitchenName, people) => `You are the cooking and meal planning assistant inside ${kitchenName}, a family meal planner. The household: ${people.map((p) => p.name).join(", ")}.

Help with what to cook, what to eat this week, using up what's in the house, and shopping. Be concise and practical; this is read on a phone in a kitchen. Use short paragraphs or short lists, not long essays.

The user can share parts of their kitchen with you (recipes, inventory, shopping list, the plan). What they shared arrives in a <kitchen> block with their message. Only rely on what's there; if you'd need something they didn't share, say which box to tick.

When you suggest a specific recipe, call propose_recipe so it appears as a card they can save and shop for, and keep your own text to a sentence or two about it rather than repeating the recipe. For to_buy:
- list what they'd need to buy, leaving out anything their inventory shows in stock
- leave out pantry staples: salt, pepper, cooking oils, vinegar, dried herbs and spices (fresh herbs are fine)
- give purchase amounts, the smallest sensible thing to buy at a store: 1 lemon rather than 1 tsp lemon juice, 1 bunch of cilantro, 1 lb ground beef, 1 dozen eggs
- if no inventory was shared, list everything non-staple and say they may already have some of it

When they ask you to put something on their shopping list, call add_to_shopping_list with purchase amounts in the same way.`;

/* ----------------------------- context ------------------------------ */

const fmtDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : "");

const dayLines = (dayDoc, config) => {
  const d = readDay(dayDoc, config);
  const lines = [];
  shownSections(config).forEach((sec) => {
    const rows = sectionSlots(sec, d).map(({ person, slot }) => {
      const who = person ? person.name : "everyone";
      const state = slotState(slot);
      const what =
        state === "none"
          ? "not needed"
          : state === "undecided"
          ? "undecided"
          : slot.items.map((p) => `${p.name} (${p.kind === "text" ? "typed in" : p.kind})`).join(", ");
      return `${who}: ${what}${slot.eaten ? " [eaten]" : ""}`;
    });
    const mod = sec.mode === "all" && d.mods[sec.key] ? ` Mods: ${d.mods[sec.key]}` : "";
    lines.push(`  ${sec.label}: ${rows.join("; ")}.${mod}`);
  });
  return lines;
};

// The <kitchen> block that rides along with a question: today's date, plus
// whichever parts the user ticked. `days` is the current week's day docs
// keyed by date.
export const buildContext = ({ picked, todayKey, recipes, inventory, days, config, people }) => {
  const parts = [`Today is ${todayKey}.`];
  if (picked.includes("recipes")) {
    const rows = recipes.map((r) => {
      const { up, down } = ratingSummary(r.ratings, people);
      const meta = [
        r.lastMade ? `last made ${r.lastMade}` : "never made",
        up || down ? `${up} up, ${down} down` : "",
        r.uses?.length ? `uses ${r.uses.map((u) => u.name).join(", ")}` : "",
      ].filter(Boolean);
      const ing = r.ingredients ? `\n    ${r.ingredients.replace(/\s*\n\s*/g, "; ")}` : "";
      return `- ${r.name} (${meta.join("; ")})${ing}`;
    });
    parts.push(`Recipes (${recipes.length}):\n${rows.join("\n") || "(none)"}`);
  }
  if (picked.includes("inventory")) {
    const stock = inventory.filter((i) => itemState(i) === "stock");
    const used = inventory.filter((i) => itemState(i) === "used");
    parts.push(
      `Inventory in stock (${stock.length}):\n${stock.map((i) => `- ${i.name} (added ${fmtDate(i.addedAt)})`).join("\n") || "(none)"}`
    );
    if (used.length) parts.push(`Used up, not restocked: ${used.map((i) => i.name).join(", ")}`);
  }
  if (picked.includes("shopping")) {
    const list = inventory.filter((i) => i.onList);
    parts.push(
      `Shopping list (${list.length}):\n${list.map((i) => `- ${i.name}${i.amount ? ` (${i.amount})` : ""}`).join("\n") || "(empty)"}`
    );
  }
  if (picked.includes("week")) {
    const lines = weekDays(mondayOf(todayKey)).map((d) => `${d.name} ${d.key}:\n${dayLines(days[d.key], config).join("\n")}`);
    parts.push(`This week's plan:\n${lines.join("\n")}`);
  } else if (picked.includes("today")) {
    parts.push(`Today's plan:\n${dayLines(days[todayKey], config).join("\n")}`);
  }
  return `<kitchen>\n${parts.join("\n\n")}\n</kitchen>`;
};

export const isContextBlock = (text) => typeof text === "string" && text.startsWith("<kitchen>");

