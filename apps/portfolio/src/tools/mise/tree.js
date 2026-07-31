/* ------------------------------------------------------------------ */
/*  Mise: tree model, layout engine, seed templates                    */
/*  Pure functions only — no React, no Firebase.                       */
/* ------------------------------------------------------------------ */

let counter = 0;
/* Random suffix as well as a counter: ids are generated on several
   devices against the same document, so a per-tab counter isn't enough. */
export const uid = () =>
  `n${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* owner: "us" | "them" | "third" */
export const node = (name, owner = "us", done = false, children = []) => ({
  id: uid(),
  name,
  owner,
  done,
  children,
});
const n_ = node;
const grp = (name, children) => ({ id: uid(), name, owner: "us", done: false, children });

export const OWNERS = {
  us: { label: "us", color: "#2B6B58" },
  them: { label: "them", color: "#C0722A" },
  third: { label: "3rd", color: "#4A6FA5" },
};
export const OWNER_ORDER = ["us", "them", "third"];
export const COMPLETE_COLOR = "#1F4A3F";

/* Firestore caps map/array nesting at 20 levels, and one tree level costs
   two (a map inside an array), so the tree itself can go 10 deep before a
   write fails. Stop one short of that and say so in the UI. */
export const MAX_DEPTH = 9;

/* ---------------------------- templates ---------------------------- */

export const blankTemplate = () => grp("Go Live", []);

export const casapTemplate = () =>
  grp("Go Live", [
    grp("Member communications", [
      n_("Email templates shared", "us", true),
      n_("Email templates reviewed", "them", true),
      grp("Email templates implemented", [
        n_("Engineering ticket: template build", "us", true),
        n_("DKIM key generated and shared", "us", true),
        n_("DKIM record published in DNS", "them", false),
        n_("SPF entry registered", "them", false),
        n_("Sending domain verified", "third", false),
      ]),
      grp("Email templates validated", [
        n_("Test send to CU inbox", "them"),
        n_("Render check across clients", "us"),
      ]),
      n_("Feedback provided", "them"),
      n_("Feedback implemented", "us"),
    ]),
    grp("Core connection", [
      grp("VPN / Transit Gateway established", [
        n_("Tunnel config exchanged", "us", true),
        n_("Firewall rules approved", "them", true),
        n_("Connectivity test passed", "us", true),
      ]),
      n_("SymXchange credentials issued", "them", true),
      n_("Test account mapping confirmed", "them"),
      grp("GL posting path validated", [
        n_("Provisional credit GL confirmed", "them"),
        n_("Write-off GL confirmed", "them"),
      ]),
    ]),
    grp("Dispute intake", [
      n_("Intake questions finalized", "us", true),
      grp("Online banking entry point placed", [
        n_("Alkami SSO handoff configured", "third"),
        n_("JWT signing keys exchanged", "third"),
        n_("Deep link tested in staging", "us"),
      ]),
      n_("Reg E timers confirmed", "us", true),
    ]),
    grp("Network integration", [
      n_("VROL access provisioned", "third"),
      n_("Mastercom access provisioned", "third"),
      n_("Reason code mapping approved", "us", true),
    ]),
    grp("Processor integration", [
      n_("Processor confirmed", "them", true),
      n_("API credentials issued", "third"),
      n_("Sandbox transaction pull verified", "us"),
      n_("Production cutover scheduled", "us"),
    ]),
    grp("Training", [
      n_("Admin session scheduled", "us"),
      n_("Agent session delivered", "us"),
      n_("Knowledge base handed off", "us"),
    ]),
  ]);

export const TEMPLATES = [
  {
    key: "casap",
    name: "Casap implementation",
    blurb: "The full credit-union go-live structure: comms, core, intake, networks, processor, training.",
    build: casapTemplate,
  },
  {
    key: "blank",
    name: "Blank",
    blurb: "Just the outcome. Build the plan leftward from there.",
    build: blankTemplate,
  },
];

/* ---------------------------- tree helpers ------------------------- */

export const findPath = (root, id, trail = []) => {
  const next = [...trail, root];
  if (root.id === id) return next;
  for (const c of root.children) {
    const hit = findPath(c, id, next);
    if (hit) return hit;
  }
  return null;
};

export const mapTree = (root, id, fn) =>
  root.id === id ? fn(root) : { ...root, children: root.children.map((c) => mapTree(c, id, fn)) };

export const removeNode = (root, id) => ({
  ...root,
  children: root.children.filter((c) => c.id !== id).map((c) => removeNode(c, id)),
});

export const countAll = (x) => x.children.reduce((s, c) => s + 1 + countAll(c), 0);

/* true leaves only: nodes with no children anywhere below */
export const leavesOf = (x) => {
  if (x.children.length === 0) return [x];
  return x.children.flatMap(leavesOf);
};

/* levels of tree below this node, counting itself as 1 */
export const heightOf = (x) =>
  x.children.length === 0 ? 1 : 1 + Math.max(...x.children.map(heightOf));

/* depth of a node measured from the tree root, root === 0 */
export const depthOf = (root, id) => {
  const trail = findPath(root, id);
  return trail ? trail.length - 1 : 0;
};

/* Would adding a child under `id` push the tree past what Firestore stores? */
export const canNest = (root, id) => {
  const trail = findPath(root, id);
  if (!trail) return false;
  const target = trail[trail.length - 1];
  return trail.length - 1 + heightOf(target) < MAX_DEPTH;
};

/* Drop anything the UI doesn't own before a write: guards against a stray
   field (or an undefined, which Firestore rejects) riding along in the doc. */
export const sanitize = (x) => ({
  id: typeof x.id === "string" && x.id ? x.id : uid(),
  name: typeof x.name === "string" ? x.name : "Untitled step",
  owner: OWNER_ORDER.includes(x.owner) ? x.owner : "us",
  done: x.done === true,
  children: Array.isArray(x.children) ? x.children.map(sanitize) : [],
});

/* ---------------------------- layout engine ------------------------ */

export function buildLayout(focus, depthWindow) {
  const cells = [];
  let row = 0;
  const visit = (x, depth) => {
    const atLimit = depth === depthWindow - 1;
    const hasKids = x.children.length > 0;
    if (atLimit || !hasKids) {
      const start = row;
      row += 1;
      cells.push({
        node: x,
        depth,
        rowStart: start,
        rowSpan: 1,
        stretch: true,
        truncated: atLimit && hasKids,
      });
      return 1;
    }
    const start = row;
    let used = 0;
    x.children.forEach((c) => {
      used += visit(c, depth + 1);
    });
    cells.push({ node: x, depth, rowStart: start, rowSpan: used, stretch: false, truncated: false });
    return used;
  };
  const total = visit(focus, 0);
  return { cells, totalRows: Math.max(total, 1) };
}
