# Family Meal Planner (`/tools/meal-planner`)

Four pages over one shared household: **Plan**, **Recipes**, **Inventory**,
and **Shopping**. Nothing matches recipes against inventory or recommends
anything. The plan draws its choices from recipes and what's in stock, and
tapping **Ate** on the plan feeds back into both.

## Pages

**Recipes.** Name, source (a pasted link, or "typed in"), free-text
ingredients, and optionally **From inventory**: the inventory items the
recipe uses (search and tap, or type a new one to add it to inventory on the
spot). Linked items come up in the follow-up when the recipe is eaten. Afterwards, whenever someone gets to
it: a **Made it** toggle (turning it on stamps today as the last made date,
turning it off clears it; "Made it again today" re-stamps), and a thumbs
up / neutral / down from each person in the kitchen. Tapping a
chosen thumb again clears it, so "hasn't rated" stays distinct from neutral.

**Plan.** Monday through Sunday, one day at a time, with a strip showing
how many of each day's slots are settled.

Each kitchen lays its meals out its own way (see **Kitchen settings**). Every
section is either **Everyone**, one shared row with a mods note for
per-person tweaks ("Luis: no cheese"), or **Per person**, a row for each
chosen person. A kitchen starts with breakfast, lunch, and snacks per
person and dinner and dessert shared.

| Section | Draws from |
|---|---|
| Breakfast | recipes, inventory, or typed in |
| Lunch | recipes, inventory, or typed in |
| Snacks | inventory |
| Dinner | recipes or inventory |
| Dessert | recipes or inventory |

Every slot holds a list, so a snack can be goldfish *and* a meat stick and
dinner can be pizza *and* sausage. Each item is a chip whose look says what
it is, with no label needed: **recipes are solid green**, **inventory is a
tint of the same green** (recipes are made from inventory), and **typed-in
meals are outlined**. The difference is in the fill as well as the hue, so
it reads without color too, and a small legend sits under the day's name.
Text on every chip meets 4.5:1 contrast.

Quick edits happen right in the row, no picker needed:

- **✕** on a chip takes it off.
- **Skip** on an undecided row marks it not needed (tap again to undo).
- **Ate** on any filled slot records that it's what was actually eaten.

The **+** (or tapping the empty part of a row) opens the picker, which
stays open for several picks: tap to add, tap again to remove, and each tap
saves. Typing "goldfish, cheese stick" is two things: known ones are
selected, and anything new can be added to Inventory or Recipes on the spot.
Inventory choices only offer what's in stock.

Turning Ate on opens one follow-up covering every item in the slot:

- **recipe**: marked made, with a last made date of that plan day (never
  moving the date backwards), and a thumb asked of whoever had it: that
  person for a per-person row, and everyone for a shared one.
- **inventory**: one row per item, with two independent toggles,
  **Used up** and **+ List**. Tap either, both, or neither; neither means
  there's some left, so no tap is needed. The rows cover items picked
  directly *and* items linked to a recipe that was eaten, each listed once.
  They show the item's live state (already on the list reads "✓ List") and
  each tap saves, so tapping again undoes it.
- **typed in**: nothing to update.

With only ratings to give, the follow-up closes itself once everyone has
one, so one person and one recipe is a single tap. With inventory rows it
waits for Done, since leaving a row alone is a valid answer.
Turning Ate off only clears the
flag. It doesn't undo ratings or used-up marks. A slot keeps a copy of each
item's name, so it still reads correctly after a recipe is renamed or an
inventory row is deleted.

**Inventory.** A running table, A to Z by default. Tap the **Item** or
**Added** header to sort by it, and tap again to flip the order. Tap the
circle when something runs out: it stays in the list struck through and
greyed out (*Hide used* tucks those away) and shows up under Used up on
the shopping list. The ✕ deletes a row for good.

Type or dictate a list and it splits into rows on **commas,
semicolons, and line breaks** only. There's no guessing at food boundaries,
so "mac and cheese" stays one item; when dictating, say "comma" between
items. A preview shows the split before anything is saved. Pasted bullets
and list numbers are trimmed, and repeats in one entry collapse. Each row is
a name plus the date it came in, the basis for aging logic later. Adding
a name that already has a row, even a struck-through one, brings that row
back with today's date instead of making a second one.

**Shopping.** Three sections:

- **Add to the list**: the same comma-separated entry. Known items are
  flagged onto the list; anything new is marked *new*.
- **To buy**: check things off as they go in the cart (the check is shared,
  so two people can split the store). *Done shopping* puts every checked
  item into inventory dated today. Anything left unchecked stays on the list.
- **Used up**: everything struck through in inventory. Tap one to put it
  back on the list, or ✕ to drop it if you won't buy it again.

An item keeps one row for its whole life: in stock, used up, on the list,
and back in stock when you buy it.

## Ask AI

The round chat button (bottom right) opens a chat with Claude about the
kitchen. It runs in the browser with your own Anthropic API key, the same
key Sunday Desk stores on this device (`sd.anthropicKey.v1` in
localStorage, never Firestore), so a phone needs it entered once.

- **What it can see** is chosen per question with the chips above the text
  box: Recipes, Inventory, Shopping list, Today's plan or This week. Only
  ticked parts are sent, as a `<kitchen>` block with the question. The block
  is only resent when it has changed, so follow-ups stay cheap.
- **🌐 Web** lets it search the web.
- **Recipes it suggests** come back as a card (the `propose_recipe` tool):
  *Save recipe* adds it to Recipes, with the inventory items it uses linked,
  and a to-buy list with *Add to shopping list*. The to-buy list leaves out
  pantry staples (salt, pepper, oils, vinegar, dried herbs and spices; fresh
  herbs stay) and uses purchase amounts (1 lemon, not 1 tsp lemon juice).
  Anything matching an in-stock item starts unticked.
- **"Add 2 lemons to my list"** is done straight away (the
  `add_to_shopping_list` tool), amounts included.
- The model defaults to Claude Opus 5 with server-side refusal fallback
  (`fallbacks: "default"`); the picker offers the same models as Sunday
  Desk. A running cost estimate sits under the text box.
- The conversation is kept on the device per kitchen; ↺ starts a new one.

`assistant.js` holds the tools, input validation, system prompt, and context
builder (no network, so it's unit tested); `Chat.jsx` holds the tool loop,
streaming, and cards, and is lazy-loaded with the SDK only when opened.

**Amounts on the shopping list.** Every list item can carry an optional
amount, shown in grey under its name ("2", "1 dozen", "1 lb"). Tap it (or
*+ amount*) to type one. Amounts the assistant adds land in the same place,
and they clear when the item is bought.

## Kitchen settings

The **settings** link (top right) holds everything about the kitchen:

- **Kitchen name.**
- **People.** Add, rename, reorder (↑), or remove. A person's key, not their
  name, is what plans and ratings point at, so a rename keeps everything.
  Removing someone takes them off the plan and out of rating prompts but
  keeps their history, and they can be brought back from the *Removed* row.
  Nothing about a person is ever deleted.
- **Meals.** For each section, *Everyone* or *Per person*, and for per
  person, tap names to choose who gets a row. A new person joins every
  per-person section. A per-person section with nobody chosen is hidden.
- **Who can see this kitchen.** The email list.

A kitchen started before this existed has no `people` or `sections` saved,
and reads as Josh, Ashley, Cam, and Bodhi (keys `josh`, `ashley`, `cam`,
`bodhi`) with today's layout, so nothing about it changes until someone
edits the settings. New kitchens name their people at setup.

## Households and access

Data belongs to a household, not a user, so two accounts plan the same
week. Membership is a list of emails on the household, which is what lets
one person add the other before they've ever signed in (Kitchen settings,
top right). Because access hangs on the email, it has to be a proven one: the
tool offers **Google sign-in only**, and the rules require
`email_verified`. An email-and-password account claiming someone's address
gets nothing.

A member can add or remove anyone except themselves; the founder
(`ownerUid`) is fixed and is the only one who can delete the household.

## Firestore

```
mealplan_households/{hid}                 name, ownerUid, memberEmails[], people[], sections{}
mealplan_households/{hid}/recipes/{id}    name, link, ingredients, uses[{id, name}], made, lastMade, ratings{person}
mealplan_households/{hid}/days/{date}     date, {section}{personKey | all}, mods{section}
mealplan_households/{hid}/inventory/{id}  name, addedAt, usedAt, onList, inCart, amount, createdAt
```

Dates (`days/{date}`, `lastMade`) are local `YYYY-MM-DD` strings rather
than timestamps, so Tuesday's plan is Tuesday wherever it's read. A slot is
`{ items: [pick, ...], eaten? }`, `{ none: true }`, or absent (undecided),
stored at `{section}.{personKey}` for a per-person row or `{section}.all` for
a shared one. Both can sit in the same section, so switching a section
between *Everyone* and *Per person* never throws away what was planned
under the other. A pick is `{ kind: "recipe" | "inventory" | "text", id,
name }`. Each shared section's mods note is at `mods.{section}`.

Older days still read correctly (`readDay` in `plan.js`), and each old shape
is replaced by the new one on its first edit:

- a single `{ pick }` or bare pick reads as a one-item list
- dinner and dessert stored directly on the field (`dinner: { items }`)
  read as the shared slot, and move under `dinner.all`
- `dinnerMod` reads as dinner's mods note, and moves to `mods.dinner`
- the old two-slot `snacks` array maps to Cam (first) and Bodhi (second)
  when those people exist, and becomes the per-person snack map

An inventory row's state comes from its fields: in stock (`addedAt` set,
`usedAt` null), used (`usedAt` set), or list-only (`addedAt` null, never
bought). Rows saved before the shopping list existed have only `createdAt`,
which is read as their added date.

Each plan edit writes a single field path with `setDoc(..., { mergeFields })`,
which creates the day on first touch and replaces the slot whole, so moving
someone from a meal to "not needed" can't leave the old meal behind, and two
phones editing different people's slots don't overwrite each other.

Every query filters on one field (`memberEmails array-contains`, a `date`
range), so no composite indexes are needed. Rules are in the repo root
`firestore.rules`; the catch-all at the bottom excludes `mealplan_*`.

## Tests

- `apps/portfolio/test/meal-planner.test.mjs`: week math, the inventory
  splitter, kitchen config (people, section modes, defaults), slots in both
  modes and the old shapes they read from, the inventory lifecycle, sorting,
  what the after-eating follow-up covers, and the Ask AI tools, validation,
  and context. No dependencies; CI and `deploy.sh` run it.
- `apps/portfolio/test/mealplan-rules.test.mjs`: security rules against
  the Firestore emulator. See `apps/portfolio/test/README.md`.

## Out of scope for v1

Ingredient parsing and inventory matching, photo or receipt entry,
voice-to-structured parsing, expiration and aging, food tagging (sweet vs.
savory), recommendations and taste profiles, and recurring per-person
defaults like "Josh: no lunch on Mondays".
