/* ------------------------------------------------------------------ */
/*  Mise: JSON import and export                                       */
/*  Pure functions plus one browser download helper. No Firebase.      */
/*                                                                     */
/*  One plan:                                                          */
/*    { "format": "mise", "version": 1,                                */
/*      "name": "Sunrise CU go-live", "client": "Sunrise CU",          */
/*      "theme": "harbor",                                             */
/*      "tree": { "name": "Go Live", "children": [                     */
/*        { "name": "Core connection", "children": [                   */
/*          { "name": "Credentials issued", "owner": "them",           */
/*            "done": true } ] } ] } }                                 */
/*                                                                     */
/*  Several plans: { "format": "mise", "version": 1, "plans": [ … ] }  */
/*                                                                     */
/*  Ids are left out of exports and regenerated on import, so a file   */
/*  can be written by hand (or by another tool) and imported as often  */
/*  as you like without colliding with what is already in the account. */
/* ------------------------------------------------------------------ */

import { DEFAULT_THEME, isTheme } from "./themes.js";
import { MAX_DEPTH, uid } from "./tree.js";

export const FORMAT = "mise";
export const VERSION = 1;

/* A plan is one Firestore doc, capped at 1 MiB. 2,000 steps with long names
   stays well under that, and is far past what the chart is meant to hold. */
const MAX_NODES = 2000;
const MAX_NAME = 200;

/* ------------------------------ export ----------------------------- */

const exportNode = (x) => {
  const out = { name: x.name };
  if (x.children.length === 0) {
    out.owner = x.owner;
    if (x.done) out.done = true;
  } else {
    out.children = x.children.map(exportNode);
  }
  return out;
};

const exportPlan = (impl) => ({
  name: impl.name,
  ...(impl.client ? { client: impl.client } : {}),
  theme: impl.layout?.theme || DEFAULT_THEME,
  tree: exportNode(impl.tree),
});

export const serializePlan = (impl) =>
  JSON.stringify({ format: FORMAT, version: VERSION, ...exportPlan(impl) }, null, 2);

export const serializePlans = (impls) =>
  JSON.stringify(
    { format: FORMAT, version: VERSION, plans: impls.filter((i) => i.tree).map(exportPlan) },
    null,
    2
  );

const slug = (s) =>
  (s || "plan")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "plan";

export const planFilename = (name) => `${slug(name)}.mise.json`;

export const downloadJson = (filename, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/* ------------------------------ import ----------------------------- */

const str = (v) => (typeof v === "string" ? v.trim() : "");

/* Forgiving about owner spelling, since files may be written by hand. */
const readOwner = (v) => {
  const s = str(v).toLowerCase();
  if (["third", "3rd", "third party", "third-party", "vendor", "partner"].includes(s)) return "third";
  if (["them", "client", "customer"].includes(s)) return "them";
  return "us";
};

const readDone = (x) =>
  x.done === true || ["done", "complete", "completed", "closed"].includes(str(x.status).toLowerCase());

const kidsOf = (x) => (Array.isArray(x.children) ? x.children : Array.isArray(x.steps) ? x.steps : []);

/* Builds a fresh tree with new ids, enforcing the depth and size caps as it
   goes so a runaway file fails fast with a message instead of at write time. */
const readTree = (raw, label) => {
  let count = 0;
  const walk = (x, depth, trail) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) {
      throw new Error(`${label}: "${trail}" has a step that isn't an object.`);
    }
    count += 1;
    if (count > MAX_NODES) throw new Error(`${label}: more than ${MAX_NODES} steps.`);
    const name = (str(x.name) || str(x.title) || str(x.label) || "Untitled step").slice(0, MAX_NAME);
    const here = trail ? `${trail} ▸ ${name}` : name;
    const kids = kidsOf(x);
    if (kids.length && depth + 1 >= MAX_DEPTH) {
      throw new Error(`${label}: "${here}" nests deeper than the ${MAX_DEPTH} levels Mise can store.`);
    }
    const children = kids.map((c) => walk(c, depth + 1, here));
    return {
      id: uid(),
      name,
      owner: readOwner(x.owner),
      done: children.length === 0 && readDone(x),
      children,
    };
  };
  return walk(raw, 0, "");
};

const readPlan = (raw, i, total) => {
  const label = total > 1 ? `Plan ${i + 1}` : "This file";
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label} isn't a plan object.`);
  }
  // Either a wrapped plan ({ name, tree }) or a bare tree ({ name, children }).
  const wrapped = raw.tree && typeof raw.tree === "object";
  const treeRaw = wrapped ? raw.tree : raw;
  if (!wrapped && !Array.isArray(raw.children) && !Array.isArray(raw.steps)) {
    throw new Error(`${label} has no "tree" and no "children", so there is nothing to chart.`);
  }
  const tree = readTree(treeRaw, label);
  return {
    name: (str(raw.name) || tree.name || "Imported plan").slice(0, MAX_NAME),
    client: wrapped ? str(raw.client).slice(0, MAX_NAME) : "",
    theme: isTheme(raw.theme) ? raw.theme : null,
    tree,
  };
};

/* Accepts one plan, a bare tree, a { plans: [...] } bundle, or a plain array
   of plans. Returns [{ name, client, theme, tree }] or throws a message that
   is fit to show as-is. */
export const parseImport = (text) => {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`That isn't valid JSON (${e.message}).`);
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.plans) ? data.plans : [data];
  if (list.length === 0) throw new Error("There are no plans in that file.");
  if (list.length > 100) throw new Error("That's more than 100 plans; split it into smaller files.");
  return list.map((p, i) => readPlan(p, i, list.length));
};

/* The template shown in the import panel, so the format is discoverable
   without leaving the page. */
export const EXAMPLE = JSON.stringify(
  {
    format: FORMAT,
    version: VERSION,
    name: "Kitchen remodel",
    client: "",
    theme: "ember",
    tree: {
      name: "Kitchen done",
      children: [
        {
          name: "Demo complete",
          children: [
            { name: "Permit approved", owner: "third", done: true },
            { name: "Cabinets removed", owner: "us" },
          ],
        },
        { name: "Countertop chosen", owner: "them" },
      ],
    },
  },
  null,
  2
);
