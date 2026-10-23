/**
 * The Arabic safety net for text the screens draw straight from a record: a person's name, a
 * department, a resignation reason in a table cell. Screens should pass such text through `t()`;
 * where one does not, this translates the text node in place when its whole text has an Arabic
 * entry (lib/ar.ts, a template in AR_PATTERNS, or the names from /api/names), and a person's or
 * department's English name inside a longer text ("أكّدها Ravi Reddy، 23 أكتوبر"). Other partial
 * sentences are left alone: those are for `t()` at the call site. Turning Arabic off puts every
 * changed node back, because React does not rewrite text it believes unchanged.
 */
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'INPUT', 'OPTION']);
const original = new Map<Text, string>();
const wrote = new WeakMap<Text, string>();
let observer: MutationObserver | null = null;
let busy = false;
let names: Record<string, string> = {};
let namesRe: RegExp | null = null;
let namesCount = -1;
function nameRe() {
  const keys = Object.keys(names);
  if (keys.length !== namesCount) {
    namesCount = keys.length;
    const multi = keys.filter((k) => /^[A-Z][\w'-]*(?: [A-Z&][\w'-]*| and| of| the)+$/.test(k)).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    namesRe = multi.length ? new RegExp(`\\b(?:${multi.join('|')})\\b`, 'g') : null;
  }
  return namesRe;
}

function fix(node: Text, lookup: (s: string) => string) {
  const v = node.nodeValue ?? '';
  if (wrote.get(node) === v) return; // our own change coming back through the observer
  const s = v.trim();
  if (s.length < 3 || !/[A-Za-z]{2}/.test(s)) return;
  const p = node.parentElement;
  if (!p || SKIP.has(p.tagName) || p.closest('[contenteditable="true"], .font-mono, [data-no-ar]')) return;
  const re = nameRe();
  let ar = s;
  if (/[\u0600-\u06FF]/.test(s)) { if (re) ar = s.replace(re, (n) => names[n] ?? n); }
  else { ar = lookup(s); if (ar === s && re) ar = s.replace(re, (n) => names[n] ?? n); }
  if (ar === s) return;
  original.set(node, v); // what React last wrote
  const out = v.replace(s, ar);
  wrote.set(node, out);
  node.nodeValue = out;
}

function walk(root: Node, lookup: (s: string) => string) {
  if (root.nodeType === Node.TEXT_NODE) { fix(root as Text, lookup); return; }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) fix(w.currentNode as Text, lookup);
}

export function arabicDom(on: boolean, lookup: (s: string) => string, nameMap: Record<string, string> = {}) {
  names = nameMap;
  observer?.disconnect(); observer = null;
  if (!on) {
    for (const [node, v] of original) if (node.isConnected) node.nodeValue = v;
    original.clear();
    return;
  }
  walk(document.body, lookup);
  observer = new MutationObserver((list) => {
    if (busy) return;
    busy = true;
    try {
      for (const m of list) {
        if (m.type === 'characterData') fix(m.target as Text, lookup);
        else m.addedNodes.forEach((n) => walk(n, lookup));
      }
    } finally { busy = false; }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
}

/** Run again once the names arrive, for what was drawn before them. */
export function arabicDomRefresh(lookup: (s: string) => string) { if (observer) walk(document.body, lookup); }
