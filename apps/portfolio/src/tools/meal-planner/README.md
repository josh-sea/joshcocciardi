# Family Meal Planner (`/tools/meal-planner`)

Four pages over one shared household: **Plan**, **Recipes**, **Inventory**,
and **Shopping**. Nothing matches recipes against inventory or recommends
anything. The plan draws its choices from recipes and what's in stock, and
tapping **Ate** on the plan feeds back into both.

## Pages

**Recipes.** Name, source (a pasted link, or "typed in"), and free-text
ingredients. That's the whole add form. Afterwards, whenever someone gets to
it: a **Made it** toggle (turning it on stamps today as the last made date,
turning it off clears it; "Made it again today" re-stamps), and a thumbs
up / neutral / down from each of Josh, Ashley, Cam, and Bodhi. Tapping a
chosen thumb again clears it, so "hasn't rated" stays distinct from neutral.

**Plan.** Monday through Sunday, one day at a time, with a strip
showing how many of each day's 12 slots are settled.

| Section | Shape | Draws from |
|---|---|---|
| Breakfast | per person: undecided / a meal / not needed | recipes, inventory, or typed in |
| Lunch | same as breakfast | same as breakfast |
| Snacks | two slots, shared | inventory |
| Dinner | one shared pick, plus free-text **dinner mods** | recipes |
| Dessert | one shared pick | recipes or inventory |

Buttons at the right end of each row cover the common calls without opening
the picker: **Skip** on an undecided breakfast or lunch marks it not needed
(tap again to undo), and **Ate** on any filled slot records that it's what
you actually had. Turning Ate on also:

- **recipe**: marks it made, with a last made date of that plan day (never
  moving the date backwards), then asks for thumbs from whoever had it. A
  breakfast or lunch slot asks only that person, and one tap rates and
  closes. Dinner and dessert ask all four.
- **inventory item**: asks "Finish the …?" with *Used it up, add to shopping
  list*, *Used it up*, or *Still have some*. It doesn't ask when the item is
  already struck through (Cam and Bodhi split the frozen pizza).
- **typed in**: nothing to update, so no prompt.

Turning Ate off only clears the flag. It doesn't undo ratings or used-up
marks.

Every chooser offers to add what you typed to Recipes or Inventory on the
spot when it isn't there yet, and inventory choices only offer what's in
stock. A slot keeps a copy of the name it was filled with, so it still reads correctly after the recipe is renamed or the
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
mealplan_households/{hid}/inventory/{id}  name, addedAt, usedAt, onList, inCart, createdAt
```

Dates (`days/{date}`, `lastMade`) are local `YYYY-MM-DD` strings rather
than timestamps, so Tuesday's plan is Tuesday wherever it's read. A
per-person entry is `{ pick }` or `{ none: true }`; undecided is the entry
being absent. A pick is `{ kind: "recipe" | "inventory" | "text", id, name }`, plus
`eaten: true` once someone taps Ate.

An inventory row's state comes from its fields: in stock (`addedAt` set,
`usedAt` null), used (`usedAt` set), or list-only (`addedAt` null, never
bought). Rows saved before the shopping list existed have only `createdAt`,
which is read as their added date.

Each plan edit writes a single field path with `setDoc(..., { mergeFields })`,
which creates the day on first touch and replaces the slot whole, so moving
someone from a meal to "not needed" can't leave the old meal behind.

Every query filters on one field (`memberEmails array-contains`, a `date`
range), so no composite indexes are needed. Rules are in the repo root
`firestore.rules`; the catch-all at the bottom excludes `mealplan_*`.

## Tests

- `apps/portfolio/test/meal-planner.test.mjs`: week math, the inventory
  splitter, slot states, the inventory lifecycle and sorting. No dependencies; CI and `deploy.sh` run it.
- `apps/portfolio/test/mealplan-rules.test.mjs`: security rules against
  the Firestore emulator. See `apps/portfolio/test/README.md`.

## Out of scope for v1

Ingredient parsing and inventory matching, photo or receipt entry,
voice-to-structured parsing, expiration and aging, food tagging (sweet vs.
savory), recommendations and taste profiles, and recurring per-person
defaults like "Josh: no lunch on Mondays".
