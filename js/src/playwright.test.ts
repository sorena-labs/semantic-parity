import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Locator } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";
import { compare, record, type LocatorLike, type State } from "./index.js";

// A real Locator has to fit LocatorLike, or the package would only work through a cast.
export const fits = (locator: Locator): LocatorLike => locator;

// A radio group whose arrow keys skip a disabled radio.
const PAGE = `
  <h1>Pick a colour</h1>
  <div id="root" role="radiogroup" aria-label="Colour">
    <button role="radio" aria-checked="true">Teal</button>
    <button role="radio" aria-checked="false" disabled>Plum</button>
    <button role="radio" aria-checked="false" tabindex="-1">Saffron</button>
  </div>
  <script>
    const radios = [...document.querySelectorAll("[role=radio]")];
    document.getElementById("root").addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight") return;
      const open = radios.filter((radio) => !radio.disabled);
      const next = open[(open.indexOf(document.activeElement) + 1) % open.length];
      for (const radio of radios) radio.setAttribute("aria-checked", String(radio === next));
      next.focus();
    });
  </script>`;

let browser: Browser;
// PLAYWRIGHT_CHANNEL=chrome runs the tests in an installed Chrome instead of Playwright's Chromium.
beforeAll(async () => {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
});
afterAll(() => browser?.close());

it("records the tree and the focus after each step, and writes them", async () => {
  const page = await browser.newPage();
  await page.setContent(PAGE);
  const out = join(await mkdtemp(join(tmpdir(), "semantic-parity-")), "colour", "skip.json");
  const group = (checked: string) => [
    {
      role: "radiogroup",
      name: "Colour",
      children: ["Teal", "Plum", "Saffron"].map((name) => ({
        role: "radio",
        name,
        ...(name === checked ? { checked: true } : {}),
        ...(name === "Plum" ? { disabled: true } : {}),
      })),
    },
  ];

  const states = await record(page.locator("#root"), [{ focus: { role: "radio", name: "Teal" } }, { press: "ArrowRight" }], { out });

  expect(states).toEqual([
    { tree: group("Teal"), focus: null },
    { step: { focus: { role: "radio", name: "Teal" } }, tree: group("Teal"), focus: { role: "radio", name: "Teal" } },
    { step: { press: "ArrowRight" }, tree: group("Saffron"), focus: { role: "radio", name: "Saffron" } },
  ]);
  expect(JSON.parse(await readFile(out, "utf8"))).toEqual(states);
});

// fixtures/form.html is the same form as the Flutter widget in dart/test/fixture_test.dart, which recorded
// fixtures/flutter/form.json. The web recording is written to build/parity/web for CI to run the command on.
it("records the same states for the form as Flutter does", async () => {
  const fixtures = new URL("../../fixtures/", import.meta.url);
  const read = async (file: string) => JSON.parse(await readFile(new URL(file, fixtures), "utf8"));
  const page = await browser.newPage();
  await page.goto(new URL("form.html", fixtures).href);

  const web = await record(page.locator("body"), await read("form.steps.json"), { out: "build/parity/web/form.json" });

  expect(compare(web, (await read("flutter/form.json")) as State[])).toEqual([]);
});

it("leaves focus out when it is outside the root", async () => {
  const page = await browser.newPage();
  await page.setContent(`<div id="root"><button>Inside</button></div><button>Outside</button>`);
  await page.getByRole("button", { name: "Outside" }).focus();
  const [state] = await record(page.locator("#root"));
  expect(state).toEqual({ tree: [{ role: "button", name: "Inside" }], focus: null });
});
