#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { compare, describeStep, type Difference, type State } from "./index.js";

const [webDir, flutterDir] = process.argv.slice(2);
if (!webDir || !flutterDir || process.argv.length > 4) {
  console.error("Usage: semantic-parity <web folder> <flutter folder>\n\nCompares every .json recording in the two folders with the one at the same path in the other.");
  process.exit(2);
}
for (const dir of [webDir, flutterDir]) {
  if (!existsSync(dir)) {
    console.error(`${dir} does not exist. Record both sides before comparing them.`);
    process.exit(2);
  }
}

const recordings = (dir: string) =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.split(sep).join("/"));
const read = (dir: string, file: string) => JSON.parse(readFileSync(join(dir, file), "utf8")) as State[];
const show = (field: string, value: unknown) =>
  value === undefined ? "none" : field === "name" || field === "value" ? JSON.stringify(value) : String(value);

const web = new Set(recordings(webDir));
const flutter = new Set(recordings(flutterDir));
let failed = 0;
for (const file of [...new Set([...web, ...flutter])].sort()) {
  if (!web.has(file) || !flutter.has(file)) {
    console.log(`${file}: only in ${web.has(file) ? webDir : flutterDir}`);
    failed++;
    continue;
  }
  const states = read(webDir, file);
  const differences = compare(states, read(flutterDir, file));
  if (!differences.length) continue;
  failed++;
  console.log(file);
  for (const d of differences) console.log(`  ${when(d, states)}: ${d.path ? `${d.path}: ` : ""}${d.field}: web ${show(d.field, d.web)}, flutter ${show(d.field, d.flutter)}`);
}

function when(d: Difference, states: State[]) {
  const step = states[d.state]?.step;
  return step ? `after ${describeStep(step)}` : "before any step";
}

const total = new Set([...web, ...flutter]).size;
const recordingsWord = total === 1 ? "recording" : "recordings";
console.log(
  failed
    ? `\n${failed} of ${total} ${recordingsWord} ${failed === 1 ? "differs" : "differ"}.`
    : `${total} ${recordingsWord} ${total === 1 ? "matches" : "match"}.`,
);
process.exit(failed ? 1 : 0);
