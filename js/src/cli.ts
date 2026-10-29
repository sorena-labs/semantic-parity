#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { parseArgs } from "node:util";
import { compare, describeStep, type Difference, type State } from "./index.js";

const USAGE = `Usage: semantic-parity [--allow <file>] <web folder> <flutter folder>

Compares every .json recording in the two folders with the one at the same path in the other.
--allow names a JSON list of differences that are expected, which are then left out.`;

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

let args;
try {
  args = parseArgs({ allowPositionals: true, options: { allow: { type: "string" } } });
} catch (error) {
  fail(`${(error as Error).message}\n\n${USAGE}`);
}
const [webDir, flutterDir, ...extra] = args.positionals;
if (!webDir || !flutterDir || extra.length) fail(USAGE);
for (const dir of [webDir, flutterDir]) {
  if (!existsSync(dir)) fail(`${dir} does not exist. Record both sides before comparing them.`);
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${file}: ${(error as Error).message}`);
  }
}

// What compare() reads from a state, checked here so a broken file is named instead of crashing it.
const isState = (state: any) =>
  typeof state === "object" &&
  state !== null &&
  Array.isArray(state.tree) &&
  (state.focus == null || typeof state.focus.role === "string") &&
  (state.step === undefined || typeof state.step?.press === "string" || typeof state.step?.focus?.role === "string");

function read(dir: string, file: string) {
  const states = readJson(join(dir, file));
  if (!Array.isArray(states) || !states.every(isState)) {
    fail(`${join(dir, file)} is not a recording: a list of states, each with a "tree" list and a "focus".`);
  }
  return states as State[];
}

/** An expected difference. Each field it has must equal the difference's; null stands for none. */
interface Allowed {
  file?: string;
  path?: string;
  field?: string;
  web?: unknown;
  flutter?: unknown;
  reason: string;
}
const MATCHED = ["file", "path", "field", "web", "flutter"] as const;

function readAllowed(file: string): Allowed[] {
  const entries = readJson(file);
  const valid = (entry: any) =>
    typeof entry === "object" &&
    entry !== null &&
    typeof entry.reason === "string" &&
    Object.keys(entry).every((key) => key === "reason" || (MATCHED as readonly string[]).includes(key));
  if (!Array.isArray(entries) || !entries.every(valid)) {
    fail(`${file} is not a list of allowed differences: each one has a "reason", and any of ${MATCHED.join(", ")}.`);
  }
  return entries;
}

const allowed = args.values.allow === undefined ? [] : readAllowed(args.values.allow);
const used = new Set<Allowed>();
const isAllowed = (file: string, d: Difference) => {
  const entries = allowed.filter((entry) => MATCHED.every((key) => !(key in entry) || (entry[key] ?? undefined) === (key === "file" ? file : d[key])));
  for (const entry of entries) used.add(entry);
  return entries.length > 0;
};

const recordings = (dir: string) =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.split(sep).join("/"));
const show = (field: string, value: unknown) =>
  value === undefined ? "none" : field === "name" || field === "value" ? JSON.stringify(value) : String(value);
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

const web = new Set(recordings(webDir));
const flutter = new Set(recordings(flutterDir));
let failed = 0;
let left = 0;
for (const file of [...new Set([...web, ...flutter])].sort()) {
  if (!web.has(file) || !flutter.has(file)) {
    console.log(`${file}: only in ${web.has(file) ? webDir : flutterDir}`);
    failed++;
    continue;
  }
  const states = read(webDir, file);
  const all = compare(states, read(flutterDir, file));
  const differences = all.filter((d) => !isAllowed(file, d));
  left += all.length - differences.length;
  if (!differences.length) continue;
  failed++;
  console.log(file);
  for (const d of differences) console.log(`  ${when(d, states)}: ${d.path ? `${d.path}: ` : ""}${d.field}: web ${show(d.field, d.web)}, flutter ${show(d.field, d.flutter)}`);
}

function when(d: Difference, states: State[]) {
  const step = states[d.state]?.step;
  return step ? `after ${describeStep(step)}` : "before any step";
}

// An entry that matches nothing fails the run too, so the list only holds differences that still happen.
const unused = allowed.filter((entry) => !used.has(entry));
for (const entry of unused) console.log(`${args.values.allow}: entry ${allowed.indexOf(entry) + 1} matches no difference, so it can go: ${entry.reason}`);

const total = new Set([...web, ...flutter]).size;
const recordingsWord = plural(total, "recording", "recordings");
console.log(
  (failed
    ? `\n${failed} of ${total} ${recordingsWord} ${plural(failed, "differs", "differ")}.`
    : `${total} ${recordingsWord} ${plural(total, "matches", "match")}.`) +
    (left ? ` ${left} allowed ${plural(left, "difference was", "differences were")} left out.` : ""),
);
process.exit(failed || unused.length ? 1 : 0);
