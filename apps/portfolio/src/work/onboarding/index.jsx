import React, { useState, useEffect, useRef, useCallback } from "react";
import { signOutOfWork } from "../auth";
import { loadPage, savePage } from "../store";

/* ------------------------------------------------------------------ */
/* Brand + shared style tokens                                         */
/* ------------------------------------------------------------------ */
const BLUE = "#2268e6";
const INDIGO = "#2227a0";
const INK = "#101828";
const SLATE = "#475467";
const MUTED = "#98a2b3";
const LINE = "#e4e7ec";
const BG = "#f6f7f9";
const RED = "#d92d20";
const GREEN = "#12b76a";
const AMBER = "#f79009";

const TYPE_META = {
  radio: { label: "Single select", chip: "Select" },
  checkbox: { label: "Multi select", chip: "Multi" },
  text: { label: "Short text", chip: "Text" },
  textarea: { label: "Long text", chip: "Long text" },
  date: { label: "Date", chip: "Date" },
  datetime: { label: "Date & time", chip: "Date/time" },
  currency: { label: "Currency amount", chip: "$" },
  number: { label: "Number", chip: "123" },
  upload: { label: "File upload", chip: "Upload" },
  info: { label: "Info note", chip: "Info" },
  stop: { label: "Hard stop", chip: "Stop" },
};

/* ------------------------------------------------------------------ */
/* ID + node builders                                                  */
/* ------------------------------------------------------------------ */
let __uid = 0;
const uid = () => "n" + ++__uid + "_" + Math.random().toString(36).slice(2, 7);

const opt = (label, children = []) => ({ id: uid(), label, children });
const radio = (label, options) => ({ id: uid(), kind: "question", label, type: "radio", options });
const multi = (label, options) => ({ id: uid(), kind: "question", label, type: "checkbox", options });
const input = (label, type = "text") => ({ id: uid(), kind: "question", label, type, options: [] });
const info = (text) => ({ id: uid(), kind: "info", label: text, type: "info", options: [] });
const stop = (text) => ({ id: uid(), kind: "stop", label: text, type: "stop", options: [] });

const lostStolenFollowUps = () => [
  input("Please describe the circumstances under which the card was lost or stolen", "textarea"),
  input("Please confirm the date/time of the loss", "datetime"),
  input("Please confirm the merchant in the last authorized transaction you made", "text"),
  input("Please confirm the amount of the last authorized transaction you made", "currency"),
  input("Please confirm the date of the last authorized transaction you made", "date"),
];

const merchantContactBlock = (withStop) => [
  radio(withStop ? "Did you contact the merchant and attempt to resolve the issue with them?" : "Did you contact the merchant?", [
    opt("Yes"),
    opt("No", withStop ? [stop("You have to contact the merchant first")] : []),
  ]),
  radio("How did you contact the merchant?", [opt("Phone"), opt("Email"), opt("Other")]),
  input("When did you last contact the merchant?", "date"),
  input("What was the merchant's response?", "textarea"),
];

const achStopLine = () =>
  info("If you would like to place a stop on all future transactions from this company, please call 800-765-0110.");

/* ------------------------------------------------------------------ */
/* Default question set (from Casap default intake doc)                */
/* ------------------------------------------------------------------ */
function buildDefaults() {
  __uid = 0;
  return [
    {
      id: uid(), rail: "Debit/Credit", name: "Unauthorized",
      nodes: [
        radio("Did you have your card at the time of the transaction?", [
          opt("Yes"),
          opt("No", [
            radio("What happened to the card prior to the unauthorized purchase?", [
              opt("Lost", lostStolenFollowUps()),
              opt("Stolen", lostStolenFollowUps()),
              opt("Never received"),
            ]),
          ]),
        ]),
        radio("Do you still have possession of the card?", [opt("Yes"), opt("No")]),
        multi("Have any of the following been stolen? (Select all that apply)", [
          opt("Mobile phone"), opt("Debit card"), opt("Credit card"),
          opt("Other", [input("Please describe", "text")]),
          opt("None of the above"),
        ]),
        radio("Has anyone else been authorized to use your card or card number?", [
          opt("Yes", [input("Name and relationship", "text")]),
          opt("No"),
        ]),
        radio("Has anyone else had access to your card or card number?", [opt("Yes"), opt("No")]),
      ],
    },
    {
      id: uid(), rail: "Debit/Credit", name: "Issue with quality of goods or services",
      nodes: [
        ...merchantContactBlock(true),
        radio("Was the purchase a good or a service?", [
          opt("Goods (clothes, groceries, etc.)", [
            radio("What is the return status of the merchandise?", [
              opt("Returned", [
                input("When did you return the item?", "date"),
                input("What shipping service did you use to return the item?", "text"),
                radio("Did you receive a tracking number?", [
                  opt("Yes", [input("Please provide the tracking number", "text")]),
                  opt("No"),
                ]),
                radio("Did the merchant accept your return?", [opt("Yes"), opt("No")]),
              ]),
              opt("Could not perform return", [
                multi("How did the merchant affect your ability to return?", [
                  opt("Refused the return of the merchandise"),
                  opt("Refused to provide a return merchandise authorization or label"),
                  opt("Instructed the cardholder not to return the merchandise"),
                  opt("The merchant no longer exists or is not responding to communications"),
                  opt("The merchant did not provide clear instructions on how to return"),
                  opt("The merchant advised me not to return the goods"),
                ]),
              ]),
            ]),
          ]),
          opt("Services (Netflix, Amazon Prime, etc.)"),
        ]),
        input("What was the purchase? Please describe the goods or services in detail", "textarea"),
        radio("How did you receive the purchase?", [opt("In store"), opt("Delivered")]),
        input("When did you receive the purchase?", "date"),
        multi("What was wrong with the purchase?", [
          opt("Counterfeit"), opt("Poor quality"), opt("Defective"),
          opt("Wrong delivery location"), opt("Late delivery"), opt("Mis-advertised"),
        ]),
      ],
    },
    {
      id: uid(), rail: "Debit/Credit", name: "Didn't receive the goods or services",
      nodes: [
        ...merchantContactBlock(true),
        input("When did you expect to receive the purchase?", "date"),
        input("Please describe in detail (ex: color, size, brand, etc.) the expected purchase or service", "textarea"),
        radio("Did you receive a tracking number for the order?", [
          opt("Yes", [input("Please provide the tracking number", "text")]),
          opt("No"),
        ]),
      ],
    },
    {
      id: uid(), rail: "Debit/Credit", name: "Returned the merchandise",
      nodes: [
        ...merchantContactBlock(true),
        input("When did you return the merchandise?", "date"),
        radio("How did you return the merchandise?", [
          opt("In person"), opt("FedEx"), opt("UPS"), opt("USPS"), opt("Other"),
        ]),
        radio("Did you receive a tracking number for the return?", [
          opt("Yes", [input("Please enter the tracking number", "text")]),
          opt("No"),
        ]),
      ],
    },
    {
      id: uid(), rail: "Debit/Credit", name: "Charged for a cancelled subscription or membership",
      nodes: [
        input("When did you cancel the subscription?", "date"),
        radio("Did you get a cancellation number?", [
          opt("Yes", [input("Please provide the cancellation number", "text")]),
          opt("No"),
        ]),
        radio("Was the purchase a good or a service?", [
          opt("Goods (clothes, groceries, etc.)"),
          opt("Services (Netflix, Amazon Prime, etc.)"),
        ]),
        ...merchantContactBlock(false),
        radio("Did the merchant confirm that you would receive a refund?", [
          opt("Yes", [input("Please upload proof that the merchant agreed to the refund", "upload")]),
          opt("No"),
        ]),
      ],
    },
    {
      id: uid(), rail: "Debit/Credit", name: "Didn't receive a refund",
      nodes: [
        input("What was the refund for?", "textarea"),
        radio("Did the merchant confirm that you would receive a refund?", [
          opt("Yes", [input("Please upload proof that the merchant agreed to the refund", "upload")]),
          opt("No"),
        ]),
        input("What was the expected refund amount?", "currency"),
        input("What amount did you receive?", "currency"),
        input("When were you expecting to receive the refund by?", "date"),
      ],
    },
    {
      id: uid(), rail: "Debit/Credit", name: "Charged an incorrect amount",
      nodes: [
        input("How much did you expect to be charged?", "currency"),
        ...merchantContactBlock(false),
        radio("Do you have a receipt or other documentation showing the correct amount?", [
          opt("Yes", [input("Please upload the documentation", "upload")]),
          opt("No"),
        ]),
      ],
    },
    {
      id: uid(), rail: "Debit/Credit", name: "Charged more than once for the same purchase",
      nodes: [
        input("Please select the date of the duplicate transaction", "date"),
        input("What was the amount of the duplicate transaction?", "currency"),
        ...merchantContactBlock(false),
      ],
    },
    {
      id: uid(), rail: "Debit/Credit", name: "Paid for the transaction a different way",
      nodes: [
        radio("How did you pay for the other transaction?", [
          opt("Apple Pay or Google Pay"),
          opt("Alternative credit/debit card"),
          opt("Cash"),
          opt("Check"),
          opt("Peer to peer (Venmo, Cash App, etc.)"),
        ]),
        input("What was the amount you paid by other means?", "currency"),
        ...merchantContactBlock(false),
        radio("Do you have a receipt or invoice showing the other payment method?", [
          opt("Yes", [input("Please provide a copy of the receipt or invoice", "upload")]),
          opt("No"),
        ]),
      ],
    },
    {
      id: uid(), rail: "ATM", name: "Cash not dispensed",
      nodes: [
        input("What are the last four digits of the card used for the withdrawal?", "number"),
        input("How much did you attempt to withdraw?", "currency"),
        input("Please enter the actual amount received", "currency"),
        radio("Did the ATM give you a voucher or receipt?", [
          opt("Yes", [input("If the ATM gave you a receipt or any type of proof regarding your case, please attach it here", "upload")]),
          opt("No"),
        ]),
      ],
    },
    {
      id: uid(), rail: "ATM", name: "Cash or check not deposited",
      nodes: [
        input("How much did you attempt to deposit?", "currency"),
        input("What is the physical location of the machine used? What lane or terminal ID?", "text"),
        radio("What was the type of deposit?", [
          opt("Cash"),
          opt("Check", [
            input("What is the check number?", "text"),
            input("Who is the check payable to?", "text"),
          ]),
        ]),
        input("Please enter the actual amount deposited to your account", "currency"),
        radio("Did the ATM give you a voucher or receipt?", [
          opt("Yes", [input("If the ATM gave you a receipt or any type of proof regarding your case, please attach it here", "upload")]),
          opt("No"),
        ]),
      ],
    },
    {
      id: uid(), rail: "ACH", name: "Unauthorized",
      nodes: [
        radio("Do you believe your account may be compromised due to this unauthorized transaction?", [
          opt("Yes", [input("Why?", "textarea")]),
          opt("No"),
        ]),
        radio("Did someone you do not know ask you for your routing and/or account number?", [opt("Yes"), opt("No")]),
        achStopLine(),
      ],
    },
    { id: uid(), rail: "ACH", name: "Unprompted debit", nodes: [achStopLine()] },
    {
      id: uid(), rail: "ACH", name: "Issue with goods or services",
      nodes: [
        radio("What was the issue with the goods/services procured from the merchant?", [
          opt("Never received"), opt("Damaged"), opt("Wrong goods or services"), opt("Poor quality"),
        ]),
        input("Describe the nature of the problem", "textarea"),
      ],
    },
    {
      id: uid(), rail: "ACH", name: "Incorrect debit amount",
      nodes: [
        radio("Do you believe your account may be compromised due to this transaction?", [
          opt("Yes", [input("Why?", "textarea")]),
          opt("No"),
        ]),
        achStopLine(),
      ],
    },
    {
      id: uid(), rail: "ACH", name: "Incorrect debit date",
      nodes: [
        radio("Do you believe your account may be compromised due to this transaction?", [
          opt("Yes", [input("Why?", "textarea")]),
          opt("No"),
        ]),
        achStopLine(),
      ],
    },
    { id: uid(), rail: "ACH", name: "Authorization revoked or cancelled", nodes: [achStopLine()] },
    {
      id: uid(), rail: "ACH", name: "Debited more than once",
      nodes: [
        input("What was the date of the original authorized transaction?", "date"),
        achStopLine(),
      ],
    },
    { id: uid(), rail: "ACH", name: "Incomplete debit", nodes: [achStopLine()] },
    {
      id: uid(), rail: "ACH", name: "Check processed improperly",
      nodes: [
        radio("What happened with your check?", [
          opt("My check was converted to an electronic transaction without my consent"),
          opt("Both the physical check and the electronic transaction cleared (double debit)"),
        ]),
      ],
    },
    {
      id: uid(), rail: "ACH", name: "ACH credit",
      nodes: [
        multi("Attestation", [
          opt("I attest that the information provided is true and accurate, and I understand my claim may be closed if the transaction is confirmed as authorized"),
        ]),
      ],
    },
    {
      id: uid(), rail: "P2P", name: "Unauthorized",
      nodes: [
        radio("Did you recently receive any contact (email, Instagram/Facebook, text message, call, etc.) from someone claiming to be from the credit union?", [
          opt("Yes", [
            radio("Were you asked for personal information (SSN, DOB, etc.), access codes to your account, or online banking credentials?", [opt("Yes"), opt("No")]),
          ]),
          opt("No"),
        ]),
        input("Do you have evidence of the contact they made? Please attach screenshots of calls, messages, or emails", "upload"),
      ],
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Tree helpers (operate on cloned category objects, mutating)         */
/* ------------------------------------------------------------------ */
const clone = (x) => JSON.parse(JSON.stringify(x));

function locateNode(list, id, optionId = null) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return { optionId, index: i };
    for (const o of list[i].options || []) {
      const hit = locateNode(o.children, id, o.id);
      if (hit) return hit;
    }
  }
  return null;
}

function getNode(list, id) {
  for (const n of list) {
    if (n.id === id) return n;
    for (const o of n.options || []) {
      const hit = getNode(o.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

function removeById(list, id) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list.splice(i, 1)[0];
    for (const o of list[i].options || []) {
      const removed = removeById(o.children, id);
      if (removed) return removed;
    }
  }
  return null;
}

function findOptionChildren(list, optionId) {
  for (const n of list) {
    for (const o of n.options || []) {
      if (o.id === optionId) return o.children;
      const hit = findOptionChildren(o.children, optionId);
      if (hit) return hit;
    }
  }
  return null;
}

function nodeContainsOption(node, optionId) {
  for (const o of node.options || []) {
    if (o.id === optionId) return true;
    for (const c of o.children) if (nodeContainsOption(c, optionId)) return true;
  }
  return false;
}

function remapIds(node) {
  const n = clone(node);
  const walk = (x) => {
    x.id = uid();
    (x.options || []).forEach((o) => {
      o.id = uid();
      o.children.forEach(walk);
    });
  };
  walk(n);
  return n;
}

/* Detect whether any hard stop is active given current answers */
function stopActive(nodes, ans) {
  for (const n of nodes) {
    if (n.type === "stop") return true;
    if (n.type === "radio") {
      const sel = ans[n.id];
      const o = (n.options || []).find((x) => x.id === sel);
      if (o && stopActive(o.children, ans)) return true;
    } else if (n.type === "checkbox") {
      const sel = ans[n.id] || [];
      for (const o of n.options || []) {
        if (sel.includes(o.id) && stopActive(o.children, ans)) return true;
      }
    }
  }
  return false;
}

/* Saved trees carry ids minted by a previous session, where the counter
   started at 0 again. The random suffix on uid() makes a collision
   vanishingly unlikely either way, but advancing the counter past the highest
   id already in the tree keeps new ids reading as new. */
function advanceUidPast(categories) {
  let max = 0;
  const scanId = (id) => {
    const m = /^n(\d+)_/.exec(id || "");
    if (m) max = Math.max(max, Number(m[1]));
  };
  const walkNode = (n) => {
    scanId(n.id);
    (n.options || []).forEach((o) => {
      scanId(o.id);
      (o.children || []).forEach(walkNode);
    });
  };
  categories.forEach((c) => {
    scanId(c.id);
    (c.nodes || []).forEach(walkNode);
  });
  __uid = Math.max(__uid, max);
}

/* ------------------------------------------------------------------ */
/* Small UI atoms                                                      */
/* ------------------------------------------------------------------ */
const Chip = ({ children, color = SLATE, bg = "#f2f4f7" }) => (
  <span style={{ background: bg, color, fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap", letterSpacing: 0.2 }}>
    {children}
  </span>
);

const IconBtn = ({ title, onClick, children, danger }) => (
  <button
    title={title}
    onClick={onClick}
    style={{
      border: "none", background: "transparent", cursor: "pointer", padding: "3px 5px",
      borderRadius: 6, color: danger ? RED : MUTED, fontSize: 12, lineHeight: 1,
    }}
    onMouseEnter={(e) => (e.currentTarget.style.background = "#f2f4f7")}
    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
  >
    {children}
  </button>
);

/* ------------------------------------------------------------------ */
/* Main app                                                            */
/* ------------------------------------------------------------------ */
export default function IntakeEmulator({ user, pageKey }) {
  const [categories, setCategories] = useState(buildDefaults);
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [view, setView] = useState("builder"); // builder | member
  const [editingId, setEditingId] = useState(null);
  const [drag, setDrag] = useState(null); // { nodeId, catId }
  const [answers, setAnswers] = useState({}); // catId -> { nodeId: value }
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [submitted, setSubmitted] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const loadedRef = useRef(false);
  const lastSavedRef = useRef(null);
  const saveTimer = useRef(null);

  const cat = categories.find((c) => c.id === selectedCatId) || categories[0];

  /* ---------- persistence (Firestore, scoped to the signed-in user) ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await loadPage(user.uid, pageKey);
        if (!cancelled && Array.isArray(saved) && saved.length) {
          advanceUidPast(saved);
          lastSavedRef.current = JSON.stringify(saved);
          setCategories(saved);
        }
      } catch (e) {
        console.warn("[onboarding] could not load saved config:", e.message);
      }
      if (!cancelled) loadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [user.uid, pageKey]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const serialized = JSON.stringify(categories);
    // The load itself sets state, which lands here; without this the first
    // thing every session does is write back exactly what it just read.
    if (serialized === lastSavedRef.current) return;

    setSaveState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await savePage(user.uid, pageKey, categories);
        lastSavedRef.current = serialized;
        setSaveState("saved");
      } catch (e) {
        console.warn("[onboarding] save failed:", e.message);
        setSaveState("error");
      }
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [categories, user.uid, pageKey]);

  /* ---------- mutations ---------- */
  const mutate = useCallback((fn) => {
    setCategories((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });
  }, []);

  const updateNode = (nodeId, fn) =>
    mutate((cats) => {
      const c = cats.find((x) => x.id === cat.id);
      const n = getNode(c.nodes, nodeId);
      if (n) fn(n, c);
    });

  const deleteNode = (nodeId) =>
    mutate((cats) => {
      const c = cats.find((x) => x.id === cat.id);
      removeById(c.nodes, nodeId);
    });

  const duplicateNode = (nodeId) =>
    mutate((cats) => {
      const c = cats.find((x) => x.id === cat.id);
      const loc = locateNode(c.nodes, nodeId);
      const n = getNode(c.nodes, nodeId);
      if (!loc || !n) return;
      const copy = remapIds(n);
      const list = loc.optionId ? findOptionChildren(c.nodes, loc.optionId) : c.nodes;
      list.splice(loc.index + 1, 0, copy);
    });

  const addNode = (optionId /* null for root */, type = "radio") =>
    mutate((cats) => {
      const c = cats.find((x) => x.id === cat.id);
      const n =
        type === "radio"
          ? { id: uid(), kind: "question", label: "New question", type: "radio", options: [opt("Yes"), opt("No")] }
          : { id: uid(), kind: "question", label: "New question", type, options: [] };
      const list = optionId ? findOptionChildren(c.nodes, optionId) : c.nodes;
      if (list) {
        list.push(n);
        setEditingId(n.id);
      }
    });

  const moveNode = (nodeId, target /* {optionId|null, index} */) =>
    mutate((cats) => {
      const c = cats.find((x) => x.id === cat.id);
      const dragged = getNode(c.nodes, nodeId);
      if (!dragged) return;
      if (target.optionId && (nodeId === target.optionId || nodeContainsOption(dragged, target.optionId))) return;
      const loc = locateNode(c.nodes, nodeId);
      if (!loc) return;
      removeById(c.nodes, nodeId);
      let idx = target.index;
      if (loc.optionId === target.optionId && loc.index < target.index) idx -= 1;
      const list = target.optionId ? findOptionChildren(c.nodes, target.optionId) : c.nodes;
      if (!list) return;
      if (idx < 0) idx = 0;
      if (idx > list.length) idx = list.length;
      list.splice(idx, 0, dragged);
    });

  const resetDefaults = () => {
    if (!window.confirm("Restore the default Casap question set? Your changes to every category will be replaced.")) return;
    const d = buildDefaults();
    setCategories(d);
    setAnswers({});
    setSelectedCatId(d[0].id);
    setEditingId(null);
  };

  const exportJSON = () => {
    const payload = { version: 1, exportedAt: new Date().toISOString(), tool: "casap-intake-emulator", categories };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "intake-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ---------- answers ---------- */
  const catAnswers = answers[cat?.id] || {};
  const setAnswer = (nodeId, value) => {
    setSubmitted(false);
    setAnswers((prev) => ({ ...prev, [cat.id]: { ...(prev[cat.id] || {}), [nodeId]: value } }));
  };
  const clearAnswers = () => {
    setSubmitted(false);
    setAnswers((prev) => ({ ...prev, [cat.id]: {} }));
  };

  const blocked = cat ? stopActive(cat.nodes, catAnswers) : false;

  /* ================================================================ */
  /* Builder tree components                                           */
  /* ================================================================ */

  const DropSlot = ({ optionId, index, depth }) => {
    const [hover, setHover] = useState(false);
    if (!drag || drag.catId !== cat.id) return <div style={{ height: 4 }} />;
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => { e.preventDefault(); setHover(false); moveNode(drag.nodeId, { optionId, index }); setDrag(null); }}
        style={{
          height: hover ? 26 : 8, transition: "height .1s", borderRadius: 6,
          border: hover ? `2px dashed ${BLUE}` : "2px dashed transparent",
          background: hover ? "#eaf1fe" : "transparent", margin: "1px 0",
        }}
      />
    );
  };

  const OptionRow = ({ option, node, depth }) => {
    const [hover, setHover] = useState(false);
    const draggingHere = drag && drag.catId === cat.id;
    return (
      <div style={{ marginLeft: 14, borderLeft: `2px solid ${LINE}`, paddingLeft: 10, marginTop: 4 }}>
        <div
          onDragOver={draggingHere ? (e) => { e.preventDefault(); setHover(true); } : undefined}
          onDragLeave={() => setHover(false)}
          onDrop={draggingHere ? (e) => {
            e.preventDefault(); setHover(false);
            moveNode(drag.nodeId, { optionId: option.id, index: option.children.length });
            setDrag(null);
          } : undefined}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", borderRadius: 6,
            background: hover ? "#eaf1fe" : "transparent",
            border: hover ? `1px dashed ${BLUE}` : "1px dashed transparent",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 999, border: `2px solid ${MUTED}`, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: SLATE, fontWeight: 500 }}>
            {option.label}
            {option.children.length > 0 && (
              <span style={{ color: MUTED, fontWeight: 400 }}> · {option.children.length} follow-up{option.children.length > 1 ? "s" : ""}</span>
            )}
          </span>
          <button
            onClick={() => addNode(option.id)}
            style={{ marginLeft: "auto", border: "none", background: "transparent", color: BLUE, fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "2px 4px" }}
          >
            + Follow-up
          </button>
        </div>
        {option.children.length > 0 && (
          <div>
            {option.children.map((child, i) => (
              <React.Fragment key={child.id}>
                <DropSlot optionId={option.id} index={i} depth={depth + 1} />
                <NodeRow node={child} depth={depth + 1} />
              </React.Fragment>
            ))}
            <DropSlot optionId={option.id} index={option.children.length} depth={depth + 1} />
          </div>
        )}
      </div>
    );
  };

  const EditorCard = ({ node }) => {
    return (
      <div style={{ background: "#fbfcfe", border: `1px solid ${LINE}`, borderRadius: 10, padding: 12, marginTop: 6, marginBottom: 4 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {node.type === "info" || node.type === "stop" ? "Message" : "Question text"}
            </label>
            <textarea
              value={node.label}
              onChange={(e) => updateNode(node.id, (n) => (n.label = e.target.value))}
              rows={2}
              style={{ width: "100%", border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 9px", fontSize: 13, color: INK, resize: "vertical", boxSizing: "border-box", marginTop: 3, fontFamily: "inherit" }}
            />
          </div>
          <div style={{ width: 170 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Type</label>
            <select
              value={node.type}
              onChange={(e) =>
                updateNode(node.id, (n) => {
                  n.type = e.target.value;
                  n.kind = e.target.value === "info" ? "info" : e.target.value === "stop" ? "stop" : "question";
                  if ((n.type === "radio" || n.type === "checkbox") && (!n.options || n.options.length === 0)) {
                    n.options = [opt("Yes"), opt("No")];
                  }
                })
              }
              style={{ width: "100%", border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 8px", fontSize: 13, marginTop: 3, background: "#fff", color: INK }}
            >
              {Object.entries(TYPE_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {(node.type === "radio" || node.type === "checkbox") && (
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Options</label>
            {(node.options || []).map((o) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <input
                  value={o.label}
                  onChange={(e) => updateNode(node.id, (n) => {
                    const oo = n.options.find((x) => x.id === o.id);
                    if (oo) oo.label = e.target.value;
                  })}
                  style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 8, padding: "5px 9px", fontSize: 13, color: INK }}
                />
                {o.children.length > 0 && <Chip>{o.children.length} nested</Chip>}
                <IconBtn
                  title="Delete option (removes nested follow-ups)"
                  danger
                  onClick={() => {
                    if (o.children.length > 0 && !window.confirm("This option has nested follow-ups that will be removed too. Delete it?")) return;
                    updateNode(node.id, (n) => (n.options = n.options.filter((x) => x.id !== o.id)));
                  }}
                >
                  ✕
                </IconBtn>
              </div>
            ))}
            <button
              onClick={() => updateNode(node.id, (n) => n.options.push(opt("New option")))}
              style={{ marginTop: 6, border: `1px dashed ${LINE}`, background: "#fff", color: BLUE, fontSize: 12, fontWeight: 600, borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}
            >
              + Add option
            </button>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button
            onClick={() => setEditingId(null)}
            style={{ background: BLUE, color: "#fff", border: "none", borderRadius: 8, padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Done
          </button>
        </div>
      </div>
    );
  };

  const NodeRow = ({ node, depth }) => {
    const meta = TYPE_META[node.type] || TYPE_META.text;
    const isStop = node.type === "stop";
    const isInfo = node.type === "info";
    return (
      <div>
        <div
          style={{
            display: "flex", alignItems: "flex-start", gap: 6, padding: "6px 8px",
            background: editingId === node.id ? "#eaf1fe" : "#fff",
            border: `1px solid ${editingId === node.id ? BLUE : LINE}`,
            borderRadius: 8,
            opacity: drag && drag.nodeId === node.id ? 0.4 : 1,
          }}
        >
          <span
            draggable
            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag({ nodeId: node.id, catId: cat.id }); }}
            onDragEnd={() => setDrag(null)}
            title="Drag to reorder or nest under an option"
            style={{ cursor: "grab", color: MUTED, fontSize: 13, lineHeight: "18px", userSelect: "none", padding: "0 2px" }}
          >
            ⠿
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: isStop ? RED : INK, fontWeight: 500, lineHeight: 1.35 }}>
              {node.label || <span style={{ color: MUTED }}>Untitled</span>}
            </div>
          </div>
          <Chip color={isStop ? RED : isInfo ? AMBER : BLUE} bg={isStop ? "#fee4e2" : isInfo ? "#fef0c7" : "#eaf1fe"}>
            {meta.chip}
          </Chip>
          <IconBtn title="Edit" onClick={() => setEditingId(editingId === node.id ? null : node.id)}>✎</IconBtn>
          <IconBtn title="Duplicate" onClick={() => duplicateNode(node.id)}>⧉</IconBtn>
          <IconBtn title="Delete" danger onClick={() => { if (window.confirm("Delete this question and everything nested under it?")) deleteNode(node.id); }}>🗑</IconBtn>
        </div>
        {editingId === node.id && <EditorCard node={node} />}
        {(node.type === "radio" || node.type === "checkbox") &&
          (node.options || []).map((o) => <OptionRow key={o.id} option={o} node={node} depth={depth} />)}
      </div>
    );
  };

  /* ================================================================ */
  /* Live preview (member view) components                             */
  /* ================================================================ */

  const RadioCircle = ({ selected }) => (
    <span style={{
      width: 17, height: 17, borderRadius: 999, flexShrink: 0, boxSizing: "border-box",
      border: selected ? `5px solid ${BLUE}` : "2px solid #cfd4dc", background: "#fff", display: "inline-block",
    }} />
  );

  const CheckSquare = ({ selected }) => (
    <span style={{
      width: 16, height: 16, borderRadius: 4, flexShrink: 0, boxSizing: "border-box",
      border: selected ? `1px solid ${BLUE}` : "2px solid #cfd4dc",
      background: selected ? BLUE : "#fff", color: "#fff", fontSize: 11, fontWeight: 800,
      display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
    }}>
      {selected ? "✓" : ""}
    </span>
  );

  const inputStyle = {
    border: "1px solid #cfd4dc", borderRadius: 8, padding: "8px 11px", fontSize: 13.5,
    color: INK, width: "100%", maxWidth: 340, boxSizing: "border-box", background: "#fff", fontFamily: "inherit",
  };

  const PreviewNode = ({ node, depth }) => {
    const val = catAnswers[node.id];
    const indent = depth > 0 ? { marginLeft: 16, paddingLeft: 12, borderLeft: `2px solid #e8edf5` } : {};

    if (node.type === "info") {
      return (
        <div style={{ ...indent, margin: "10px 0", background: "#f2f6ff", border: "1px solid #d6e3fb", color: "#1d4fb8", borderRadius: 8, padding: "9px 12px", fontSize: 12.5 }}>
          {node.label}
        </div>
      );
    }
    if (node.type === "stop") {
      return (
        <div style={{ ...indent, margin: "10px 0", background: "#fef3f2", border: `1px solid #fecdca`, color: RED, borderRadius: 8, padding: "9px 12px", fontSize: 12.5, fontWeight: 600 }}>
          {node.label}
        </div>
      );
    }

    return (
      <div style={{ ...indent, margin: "14px 0" }}>
        <div style={{ fontSize: 13.5, color: INK, fontWeight: 500, marginBottom: 7, lineHeight: 1.4 }}>{node.label}</div>

        {node.type === "radio" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 22px" }}>
            {(node.options || []).map((o) => (
              <label key={o.id} onClick={() => setAnswer(node.id, val === o.id ? null : o.id)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13, color: SLATE }}>
                <RadioCircle selected={val === o.id} />
                {o.label}
              </label>
            ))}
          </div>
        )}

        {node.type === "checkbox" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {(node.options || []).map((o) => {
              const arr = Array.isArray(val) ? val : [];
              const sel = arr.includes(o.id);
              return (
                <label key={o.id} onClick={() => setAnswer(node.id, sel ? arr.filter((x) => x !== o.id) : [...arr, o.id])}
                  style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, cursor: "pointer", fontSize: 13, color: SLATE, lineHeight: 1.4 }}>
                  <span style={{ paddingTop: 1 }}><CheckSquare selected={sel} /></span>
                  {o.label}
                </label>
              );
            })}
          </div>
        )}

        {node.type === "text" && <input style={inputStyle} value={val || ""} onChange={(e) => setAnswer(node.id, e.target.value)} />}
        {node.type === "textarea" && <textarea rows={3} style={{ ...inputStyle, maxWidth: 440, resize: "vertical" }} value={val || ""} onChange={(e) => setAnswer(node.id, e.target.value)} />}
        {node.type === "number" && <input type="number" style={{ ...inputStyle, maxWidth: 180 }} value={val || ""} onChange={(e) => setAnswer(node.id, e.target.value)} />}
        {node.type === "date" && <input type="date" style={{ ...inputStyle, maxWidth: 190 }} value={val || ""} onChange={(e) => setAnswer(node.id, e.target.value)} />}
        {node.type === "datetime" && <input type="datetime-local" style={{ ...inputStyle, maxWidth: 230 }} value={val || ""} onChange={(e) => setAnswer(node.id, e.target.value)} />}
        {node.type === "currency" && (
          <div style={{ position: "relative", maxWidth: 180 }}>
            <span style={{ position: "absolute", left: 11, top: 8, color: MUTED, fontSize: 13.5 }}>$</span>
            <input type="number" step="0.01" style={{ ...inputStyle, paddingLeft: 24 }} value={val || ""} onChange={(e) => setAnswer(node.id, e.target.value)} />
          </div>
        )}
        {node.type === "upload" && (
          <div
            onClick={() => setAnswer(node.id, val ? null : "attachment_simulated.pdf")}
            style={{
              border: `1.5px dashed ${val ? GREEN : "#cfd4dc"}`, borderRadius: 10, padding: "16px 14px", maxWidth: 380,
              textAlign: "center", cursor: "pointer", background: val ? "#f0fdf4" : "#fcfcfd",
            }}
          >
            {val ? (
              <span style={{ fontSize: 12.5, color: GREEN, fontWeight: 600 }}>✓ attachment_simulated.pdf attached (click to remove)</span>
            ) : (
              <span style={{ fontSize: 12.5, color: SLATE }}>
                <span style={{ color: BLUE, fontWeight: 600 }}>Click to upload</span> or drag and drop<br />
                <span style={{ color: MUTED, fontSize: 11.5 }}>PDF, JPG, PNG, CSV, XLSX, WORD, DOC (max 10 MB allowed)</span>
              </span>
            )}
          </div>
        )}

        {/* conditional children */}
        {node.type === "radio" && (node.options || []).map((o) =>
          val === o.id && o.children.length > 0 ? (
            <div key={o.id} style={{ marginTop: 6 }}>
              {o.children.map((c) => <PreviewNode key={c.id} node={c} depth={depth + 1} />)}
            </div>
          ) : null
        )}
        {node.type === "checkbox" && (node.options || []).map((o) => {
          const arr = Array.isArray(val) ? val : [];
          return arr.includes(o.id) && o.children.length > 0 ? (
            <div key={o.id} style={{ marginTop: 6 }}>
              {o.children.map((c) => <PreviewNode key={c.id} node={c} depth={depth + 1} />)}
            </div>
          ) : null;
        })}
      </div>
    );
  };

  const answeredCount = Object.values(catAnswers).filter((v) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)).length;

  const PreviewPane = ({ full }) => (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
      {/* preview chrome */}
      <div style={{ padding: "14px 18px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ background: "#f2f4f7", borderRadius: 999, padding: "4px 12px", fontSize: full ? 16 : 13, fontWeight: 600, color: INK }}>👤 James</span>
          <span style={{ fontSize: full ? 20 : 15, fontWeight: 800, color: INK }}>is disputing</span>
          <span style={{ background: "#f2f4f7", borderRadius: 999, padding: "4px 12px", fontSize: full ? 16 : 13, fontWeight: 600, color: INK }}>⇄ 1 transaction</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: GREEN, letterSpacing: 0.6 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: GREEN, display: "inline-block" }} />
            LIVE PREVIEW
          </span>
        </div>
        <div style={{ marginTop: 12, display: "inline-block", fontSize: 14, fontWeight: 700, color: INK, borderBottom: `2.5px solid ${BLUE}`, paddingBottom: 3 }}>
          {cat.rail} · {cat.name}
        </div>
        <div style={{ marginTop: 10 }}>
          <span style={{ background: "#f2f4f7", borderRadius: 8, padding: "5px 11px", fontSize: 12.5, color: SLATE, fontWeight: 500 }}>
            Sketch for $212.49 on 2026-08-05
          </span>
        </div>
      </div>

      {/* questions */}
      <div style={{ padding: "4px 18px 14px", overflowY: "auto", flex: 1 }}>
        {cat.nodes.length === 0 && (
          <div style={{ color: MUTED, fontSize: 13, padding: "30px 0", textAlign: "center" }}>
            No questions yet. Add one in the builder to see it here.
          </div>
        )}
        {cat.nodes.map((n) => <PreviewNode key={n.id} node={n} depth={0} />)}

        {submitted && (
          <div style={{ marginTop: 14, background: "#f0fdf4", border: `1px solid #bbf7d0`, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>Intake captured: {answeredCount} answer{answeredCount === 1 ? "" : "s"}</div>
            <button onClick={() => setShowPayload(!showPayload)} style={{ marginTop: 4, border: "none", background: "transparent", color: "#15803d", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              {showPayload ? "Hide payload" : "View payload"}
            </button>
            {showPayload && (
              <pre style={{ marginTop: 8, background: "#052e16", color: "#bbf7d0", fontSize: 10.5, padding: 10, borderRadius: 8, overflowX: "auto", maxHeight: 200 }}>
                {JSON.stringify({ category: `${cat.rail} / ${cat.name}`, answers: catAnswers }, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* footer */}
      <div style={{ borderTop: `1px solid ${LINE}`, padding: "10px 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={clearAnswers} style={{ border: `1px solid ${LINE}`, background: "#fff", color: SLATE, borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Clear answers
        </button>
        {blocked && <span style={{ fontSize: 11.5, color: RED, fontWeight: 600 }}>Submission blocked by a hard stop</span>}
        <button
          onClick={() => !blocked && setSubmitted(true)}
          disabled={blocked}
          style={{
            marginLeft: "auto", border: "none", borderRadius: 8, padding: "7px 22px", fontSize: 13, fontWeight: 700,
            background: blocked ? "#e4e7ec" : BLUE, color: blocked ? MUTED : "#fff", cursor: blocked ? "not-allowed" : "pointer",
          }}
        >
          Submit
        </button>
      </div>
    </div>
  );

  /* ================================================================ */
  /* Layout                                                            */
  /* ================================================================ */
  const rails = [...new Set(categories.map((c) => c.rail))];

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Inter', -apple-system, 'Segoe UI', sans-serif", color: INK, display: "flex", flexDirection: "column" }}>
      {/* top bar */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${LINE}`, padding: "10px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${BLUE}, ${INDIGO})`, color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>C</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: -0.2 }}>Intake Emulator</div>
            <div style={{ fontSize: 10.5, color: MUTED, marginTop: -1 }}>Onboarding questionnaire builder</div>
          </div>
        </div>

        <div style={{ display: "flex", background: "#f2f4f7", borderRadius: 9, padding: 3, marginLeft: 6 }}>
          {[["builder", "Build"], ["member", "Member view"]].map(([k, label]) => (
            <button key={k} onClick={() => setView(k)}
              style={{
                border: "none", borderRadius: 7, padding: "5px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                background: view === k ? "#fff" : "transparent", color: view === k ? BLUE : SLATE,
                boxShadow: view === k ? "0 1px 3px rgba(16,24,40,.1)" : "none",
              }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: saveState === "saved" ? GREEN : saveState === "error" ? RED : MUTED, fontWeight: 600 }}>
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
              ? "✓ Saved"
              : saveState === "error"
              ? "Save failed — retrying on next edit"
              : ""}
          </span>
          <button onClick={resetDefaults} style={{ border: `1px solid ${LINE}`, background: "#fff", color: SLATE, borderRadius: 8, padding: "6px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            Reset to defaults
          </button>
          <button onClick={exportJSON} style={{ border: "none", background: BLUE, color: "#fff", borderRadius: 8, padding: "6px 15px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            Export JSON
          </button>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, paddingLeft: 10, borderLeft: `1px solid ${LINE}` }}>
            <span style={{ fontSize: 11, color: MUTED, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={user.email}>
              {user.email}
            </span>
            <button onClick={signOutOfWork} style={{ border: "none", background: "transparent", color: SLATE, fontSize: 11.5, fontWeight: 600, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              Sign out
            </button>
          </span>
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, display: "flex", gap: 14, padding: 14, minHeight: 0, alignItems: "stretch" }}>
        {/* categories */}
        <div style={{ width: 218, flexShrink: 0, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "10px 8px", overflowY: "auto", maxHeight: "calc(100vh - 90px)" }}>
          {rails.map((rail) => (
            <div key={rail} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, padding: "4px 8px" }}>{rail}</div>
              {categories.filter((c) => c.rail === rail).map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCatId(c.id); setSubmitted(false); setEditingId(null); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                    background: cat.id === c.id ? "#eaf1fe" : "transparent",
                    color: cat.id === c.id ? BLUE : SLATE,
                    fontWeight: cat.id === c.id ? 700 : 500,
                    fontSize: 12.5, borderRadius: 8, padding: "7px 9px", lineHeight: 1.3, marginBottom: 1,
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ))}
        </div>

        {view === "builder" ? (
          <>
            {/* tree */}
            <div style={{ flex: "1 1 46%", minWidth: 340, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, overflowY: "auto", maxHeight: "calc(100vh - 90px)" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{cat.name}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{cat.rail} · drag ⠿ to reorder, drop onto an option to nest</div>
                </div>
                <button onClick={() => addNode(null)} style={{ marginLeft: "auto", border: `1px dashed ${BLUE}`, background: "#f5f9ff", color: BLUE, borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  + Add question
                </button>
              </div>
              {cat.nodes.map((n, i) => (
                <React.Fragment key={n.id}>
                  <DropSlot optionId={null} index={i} depth={0} />
                  <NodeRow node={n} depth={0} />
                </React.Fragment>
              ))}
              <DropSlot optionId={null} index={cat.nodes.length} depth={0} />
            </div>

            {/* live preview */}
            <div style={{ flex: "1 1 40%", minWidth: 320, maxHeight: "calc(100vh - 90px)" }}>
              <PreviewPane full={false} />
            </div>
          </>
        ) : (
          <div style={{ flex: 1, maxWidth: 860, margin: "0 auto", maxHeight: "calc(100vh - 90px)", width: "100%" }}>
            <PreviewPane full={true} />
          </div>
        )}
      </div>
    </div>
  );
}
