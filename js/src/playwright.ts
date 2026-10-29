import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { normalize, type Focus, type State, type Step } from "./index.js";

/** The parts of a Playwright `Locator` used here, so any Playwright 1.63 or later works without importing it. */
export interface LocatorLike {
  ariaSnapshotJSON(): Promise<unknown>;
  locator(selector: string): LocatorLike;
  count(): Promise<number>;
  getByRole(role: string, options: { name: string; exact: boolean }): { focus(): Promise<void> };
  page(): { keyboard: { press(key: string): Promise<void> } };
}

/** The accessibility tree under `root` and the focused node inside it, if any. */
export async function snapshot(root: LocatorLike): Promise<State> {
  if (typeof root.ariaSnapshotJSON !== "function") {
    throw new Error("semantic-parity needs Playwright 1.63 or later, for Locator.ariaSnapshotJSON().");
  }
  const tree = normalize((await root.ariaSnapshotJSON()) as unknown[]);
  // The default snapshot does not mark focus, and the "ai" one also shows aria-hidden content, so ask separately.
  const focused = root.locator(":scope:focus, :focus");
  let focus: Focus | null = null;
  if (await focused.count()) {
    const [node] = (await focused.ariaSnapshotJSON()) as Array<{ role?: string; name?: string }>;
    if (node?.role) focus = node.name ? { role: node.role, name: node.name.replace(/\s+/g, " ").trim() } : { role: node.role };
  }
  return { tree, focus };
}

/**
 * Takes a snapshot, then runs each step and takes another. With `out`, also writes the states there as JSON, for
 * the `semantic-parity` command to compare with the Flutter side.
 */
export async function record(root: LocatorLike, steps: readonly Step[] = [], options: { out?: string } = {}): Promise<State[]> {
  const states = [await snapshot(root)];
  for (const step of steps) {
    if ("focus" in step) await root.getByRole(step.focus.role, { name: step.focus.name, exact: true }).focus();
    else await root.page().keyboard.press(step.press);
    states.push({ step, ...(await snapshot(root)) });
  }
  if (options.out) {
    await mkdir(dirname(options.out), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(states, null, 2)}\n`);
  }
  return states;
}
