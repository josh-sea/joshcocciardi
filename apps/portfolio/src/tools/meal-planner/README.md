# Family Meal Planner (`/tools/meal-planner`)

Three pages over one shared household: **Weekly Plan**, **Recipes**, and
**Inventory**. v1 is data capture only. Nothing matches recipes against
inventory or recommends anything; the plan just draws its choices from the
other two pages.

## Pages

**Recipes.** Name, source (a pasted link, or "typed in"), and free-text
ingredients. That's the whole add form. Afterwards, whenever someone gets to
it: a **Made it** toggle (turning it on stamps today as the last made date,
turning it off clears it; "Made it again today" re-stamps), and a thumbs
up / neutral / down from each of Josh, Ashley, Cam, and Bodhi. Tapping a
chosen thumb again clears it, so "hasn't rated" stays distinct from neutral.

**Weekly Plan.** Monday through Sunday, one day at a time, with a strip
showing how many of each day's 12 slots are settled.

| Section | Shape | Draws from |
|---|---|---|
| Breakfast | per person: undecided / a meal / not needed | recipes, inventory, or typed in |
| Lunch | same as breakfast | same as breakfast |
| Snacks | two slots, shared | inventory |
| Dinner | one shared pick, plus free-text **dinner mods** | recipes |
| Dessert | one shared pick | recipes or inventory |

Every chooser offers to add what you typed to Recipes or Inventory on the
spot when it isn't there yet. A slot keeps a copy of the name it was filled
with, so it still reads correctly after the recipe is renamed or the
inventory row is deleted.

**Inventory.** Type or dictate a list and it splits into rows on **commas,
semicolons, and line breaks** only. There's no guessing at food boundaries,
so "mac and cheese" stays one item; when dictating, say "comma" between
items. A preview shows the split before anything is saved. Pasted bullets
and list numbers are trimmed, and repeats in one entry collapse. Each row is
a name plus its creation timestamp, the basis for aging logic later.

## Households and access

Data belongs to a household, not a user, so two accounts plan the same
week. Membership is a list of emails on the household, which is what lets
one person add the other before they've ever signed in (Members, top
right). Because access hangs on the email, it has to be a proven one: the
tool offers **Google sign-in only**, and the rules require
`email_verified`. An email-and-password account claiming someone's address
gets nothing.

A member can add or remove anyone except themselves; the founder
(`ownerUid`) is fixed and is the only one who can delete the household.

## Firestore

```
mealplan_households/{hid}                 name, ownerUid, memberEmails[]
mealplan_households/{hid}/recipes/{id}    name, link, ingredients, made, lastMade, ratings{person}
mealplan_households/{hid}/days/{date}     date, breakfast{person}, lunch{person}, snacks[2],
                                          dinner, dinnerMod, dessert
mealplan_households/{hid}/inventory/{id}  name, createdAt
```

Dates (`days/{date}`, `lastMade`) are local `YYYY-MM-DD` strings rather
than timestamps, so Tuesday's plan is Tuesday wherever it's read. A
per-person entry is `{ pick }` or `{ none: true }`; undecided is the entry
being absent. A pick is `{ kind: "recipe" | "inventory" | "text", id, name }`.

Each plan edit writes a single field path with `setDoc(..., { mergeFields })`,
which creates the day on first touch and replaces the slot whole, so moving
someone from a meal to "not needed" can't leave the old meal behind.

Every query filters on one field (`memberEmails array-contains`, a `date`
range), so no composite indexes are needed. Rules are in the repo root
`firestore.rules`; the catch-all at the bottom excludes `mealplan_*`.

## Tests

- `apps/portfolio/test/meal-planner.test.mjs`: week math, the inventory
  splitter, slot states. No dependencies; CI and `deploy.sh` run it.
- `apps/portfolio/test/mealplan-rules.test.mjs`: security rules against
  the Firestore emulator. See `apps/portfolio/test/README.md`.

## Out of scope for v1

Ingredient parsing and inventory matching, photo or receipt entry,
voice-to-structured parsing, expiration and aging, food tagging (sweet vs.
savory), recommendations and taste profiles, and recurring per-person
defaults like "Josh: no lunch on Mondays".
