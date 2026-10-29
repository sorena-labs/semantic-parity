/** One node of an accessibility tree, in ARIA's vocabulary. A state that is false is left out. */
export interface Node {
  role: string;
  name?: string;
  value?: string;
  checked?: true | "mixed";
  pressed?: true | "mixed";
  selected?: true;
  disabled?: true;
  expanded?: true;
  invalid?: true;
  level?: number;
  children?: Node[];
}

/** The role and name of the node that has keyboard focus. */
export interface Focus {
  role: string;
  name?: string;
}

/** One step of a keyboard script: move focus to a node, or press a key ("ArrowRight", "Home", "Shift+Tab"). */
export type Step = { focus: { role: string; name: string } } | { press: string };

/** The tree and the focus before the first step, or right after `step`. */
export interface State {
  step?: Step;
  tree: Node[];
  focus: Focus | null;
}

export interface Difference {
  /** The state it was found in: 0 before any step, 1 after the first step. */
  state: number;
  /** Where in the tree, as roles and names from the top: `radiogroup "Colour" > radio "Plum"`. Empty for focus. */
  path: string;
  field: string;
  web?: unknown;
  flutter?: unknown;
}

export { record, snapshot, type LocatorLike } from "./playwright.js";

// Roles whose only text is what the person typed or set, not a child.
const VALUE_ROLES = new Set(["textbox", "searchbox", "combobox", "slider", "spinbutton", "progressbar", "meter", "scrollbar"]);
// Roles that only group: without a name they are dropped and their children move up.
const CONTAINERS = new Set(["generic", "group", "none", "presentation", "paragraph"]);
const STATES = ["checked", "pressed", "selected", "disabled", "expanded", "invalid"] as const;
const FIELDS = ["name", "value", ...STATES, "level"] as const;

const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const label = (node: Focus) => (node.name ? `${node.role} "${node.name}"` : node.role);

/**
 * Brings a tree from either side into one shape: Playwright's `ariaSnapshotJSON()` as it comes, or the Dart
 * exporter's output. Text becomes `{ role: "text", name }` with neighbours joined, nameless containers are dropped,
 * whitespace is collapsed, and false states are left out. Running it twice changes nothing.
 */
export function normalize(nodes: readonly unknown[]): Node[] {
  const out: Node[] = [];
  for (const node of nodes.flatMap(normalizeOne)) {
    const last = out[out.length - 1];
    if (node.role === "text" && last?.role === "text") last.name = `${last.name} ${node.name}`;
    else out.push(node);
  }
  return out;
}

function normalizeOne(raw: unknown): Node[] {
  if (typeof raw === "string") return raw.trim() ? [{ role: "text", name: clean(raw) }] : [];
  if (typeof raw !== "object" || raw === null) return [];
  const source = raw as Record<string, unknown>;
  const role = typeof source.role === "string" ? source.role : "generic";
  const name = typeof source.name === "string" ? clean(source.name) : "";
  const text = typeof source.text === "string" ? clean(source.text) : "";
  if (role === "text") return normalizeOne(name || text);

  let value = typeof source.value === "string" ? clean(source.value) : "";
  const rawChildren: unknown[] = Array.isArray(source.children) ? [...source.children] : [];
  // Playwright puts an element's only text in `text`: a text box's value, or a text child.
  if (text && VALUE_ROLES.has(role)) value ||= text;
  else if (text) rawChildren.unshift(text);
  let children = normalize(rawChildren);
  // Playwright leaves out text that only repeats the name; do the same for the other side.
  if (children.length === 1 && children[0]!.role === "text" && children[0]!.name === name) children = [];
  if (!name && CONTAINERS.has(role)) return children;

  const node: Node = { role };
  if (name) node.name = name;
  if (value) node.value = value;
  for (const key of STATES) {
    const state = source[key];
    if (state === true || (state === "mixed" && (key === "checked" || key === "pressed"))) Object.assign(node, { [key]: state });
  }
  if (typeof source.level === "number" && source.level > 0) node.level = source.level;
  if (children.length) node.children = children;
  return [node];
}

/** A step as words, for messages: `press ArrowRight`, `focus radio "Teal"`. */
export const describeStep = (step: Step) => ("press" in step ? `press ${step.press}` : `focus ${label(step.focus)}`);

/**
 * Compares two recordings of the same component and script, state by state. An empty list means both sides
 * expose the same tree and keep focus in the same place after every step.
 */
export function compare(web: readonly State[], flutter: readonly State[]): Difference[] {
  const out: Difference[] = [];
  if (web.length !== flutter.length) out.push({ state: 0, path: "", field: "states", web: web.length, flutter: flutter.length });
  for (let i = 0; i < Math.min(web.length, flutter.length); i++) {
    const w = web[i]!;
    const f = flutter[i]!;
    const steps = [w.step, f.step].map((step) => step && describeStep(step));
    if (steps[0] !== steps[1]) {
      out.push({ state: i, path: "", field: "step", web: steps[0], flutter: steps[1] });
      break;
    }
    diffNodes(normalize(w.tree), normalize(f.tree), "", i, out);
    const focus = [w.focus, f.focus].map((node) => (node ? label({ role: node.role, name: node.name && clean(node.name) }) : undefined));
    if (focus[0] !== focus[1]) out.push({ state: i, path: "", field: "focus", web: focus[0], flutter: focus[1] });
  }
  return out;
}

function diffNodes(web: Node[], flutter: Node[], path: string, state: number, out: Difference[]) {
  // ponytail: children are matched by position, so one extra node also reports every sibling after it; align by role and name if that gets noisy.
  for (let i = 0; i < Math.max(web.length, flutter.length); i++) {
    const w = web[i];
    const f = flutter[i];
    if (!w || !f || w.role !== f.role) {
      out.push({ state, path, field: "node", web: w && label(w), flutter: f && label(f) });
      continue;
    }
    const at = path ? `${path} > ${label(w)}` : label(w);
    for (const field of FIELDS) if (w[field] !== f[field]) out.push({ state, path: at, field, web: w[field], flutter: f[field] });
    diffNodes(w.children ?? [], f.children ?? [], at, state, out);
  }
}
