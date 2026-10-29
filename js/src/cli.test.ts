import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { State } from "./index.js";

class Exit {
  constructor(readonly code: number) {}
}

// Runs the command in this process: cli.ts reads process.argv when imported and ends with process.exit.
async function run(...args: string[]) {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => lines.push(line));
  vi.spyOn(console, "error").mockImplementation((line: string) => lines.push(line));
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Exit(Number(code));
  });
  process.argv = ["node", "semantic-parity", ...args];
  vi.resetModules();
  try {
    await import("./cli.js");
  } catch (error) {
    if (error instanceof Exit) return { code: error.code, out: lines.join("\n") };
    throw error;
  }
  throw new Error("The command did not exit.");
}

const argv = process.argv;
afterEach(() => {
  process.argv = argv;
  vi.restoreAllMocks();
});

// Writes each file under a new folder and returns the folder.
function folder(files: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), "semantic-parity-cli-"));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), typeof content === "string" ? content : JSON.stringify(content));
  }
  return dir;
}

const radio = (checked: boolean): State[] => [
  { tree: [{ role: "radio", name: "Teal", ...(checked ? { checked: true as const } : {}) }], focus: null },
  { step: { press: "Space" }, tree: [{ role: "radio", name: "Teal", checked: true }], focus: { role: "radio", name: "Teal" } },
];

it("exits with 0 when every recording matches", async () => {
  const web = folder({ "a.json": radio(true), "nested/b.json": radio(false) });
  const flutter = folder({ "a.json": radio(true), "nested/b.json": radio(false) });
  expect(await run(web, flutter)).toEqual({ code: 0, out: "2 recordings match." });
});

it("prints each difference and recordings on one side only, and exits with 1", async () => {
  const web = folder({ "a.json": radio(true), "web-only.json": radio(true) });
  const flutter = folder({ "a.json": radio(false) });
  expect(await run(web, flutter)).toEqual({
    code: 1,
    out: ["a.json", '  before any step: radio "Teal": checked: web true, flutter none', `web-only.json: only in ${web}`, "\n2 of 2 recordings differ."].join("\n"),
  });
});

it("names a file that is not a recording instead of crashing, and exits with 2", async () => {
  const flutter = folder({ "a.json": radio(true) });
  const cut = await run(folder({ "a.json": "[{" }), flutter);
  expect(cut.code).toBe(2);
  expect(cut.out).toMatch(/a\.json: .*JSON/);

  const wrong = await run(folder({ "a.json": [{ focus: null }] }), flutter);
  expect(wrong.code).toBe(2);
  expect(wrong.out).toMatch(/a\.json is not a recording/);
});

it("explains how to use it when the arguments are wrong, and exits with 2", async () => {
  for (const args of [[], ["web"], ["web", "flutter", "extra"], ["--nope", "web", "flutter"], ["web", "flutter", "--allow"]]) {
    const { code, out } = await run(...args);
    expect(code).toBe(2);
    expect(out).toContain("Usage: semantic-parity");
  }
});

it("leaves out the differences an --allow file lists", async () => {
  const web = folder({ "a.json": radio(true), "b.json": radio(true) });
  const flutter = folder({ "a.json": radio(false), "b.json": radio(false) });
  const allow = (entries: unknown) => join(folder({ "allow.json": entries }), "allow.json");

  // A value of null stands for none, and a field left out matches any value.
  const exact = allow([{ file: "a.json", path: 'radio "Teal"', field: "checked", web: true, flutter: null, reason: "Flutter checks on tap" }]);
  expect(await run("--allow", exact, web, flutter)).toEqual({
    code: 1,
    out: ["b.json", '  before any step: radio "Teal": checked: web true, flutter none', "\n1 of 2 recordings differs. 1 allowed difference was left out."].join("\n"),
  });

  const everywhere = allow([{ field: "checked", reason: "Flutter checks on tap" }]);
  expect(await run(web, flutter, "--allow", everywhere)).toEqual({ code: 0, out: "2 recordings match. 2 allowed differences were left out." });
});

it("fails when an allowed difference no longer happens, so the list stays current", async () => {
  const web = folder({ "a.json": radio(true) });
  const allow = join(folder({ "allow.json": [{ field: "checked", reason: "Flutter checks on tap" }] }), "allow.json");
  expect(await run("--allow", allow, web, web)).toEqual({
    code: 1,
    out: `${allow}: entry 1 matches no difference, so it can go: Flutter checks on tap\n1 recording matches.`,
  });
});

it("rejects an --allow file it cannot read, and exits with 2", async () => {
  const web = folder({ "a.json": radio(true) });
  for (const entries of [{ field: "checked" }, [{ field: "checked" }], [{ feild: "checked", reason: "typo" }]]) {
    const { code, out } = await run("--allow", join(folder({ "allow.json": entries }), "allow.json"), web, web);
    expect(code).toBe(2);
    expect(out).toMatch(/allow\.json is not a list of allowed differences/);
  }
});
