import { describe, expect, it } from "vitest";
import { compare, normalize, type State } from "./index.js";

describe("normalize", () => {
  it("turns Playwright's text into text nodes and values", () => {
    expect(
      normalize([
        { role: "paragraph", text: "Some  text\nbold" },
        "Name",
        { role: "textbox", name: "Name", placeholder: "Your name", text: "Ada" },
        { role: "listitem", text: "Row one" },
      ]),
    ).toEqual([
      { role: "text", name: "Some text bold Name" },
      { role: "textbox", name: "Name", value: "Ada" },
      { role: "listitem", children: [{ role: "text", name: "Row one" }] },
    ]);
  });

  it("drops nameless containers, joins the text they leave side by side, and keeps named ones", () => {
    expect(
      normalize([
        { role: "generic", children: [{ role: "text", name: "Hi" }, { role: "generic", children: ["there"] }] },
        { role: "group", name: "Size", children: [{ role: "radio", name: "Small" }] },
      ]),
    ).toEqual([
      { role: "text", name: "Hi there" },
      { role: "group", name: "Size", children: [{ role: "radio", name: "Small" }] },
    ]);
  });

  it("keeps true and mixed states and leaves out false ones", () => {
    expect(
      normalize([
        { role: "checkbox", name: "All", checked: "mixed", disabled: false },
        { role: "tab", name: "One", selected: true, expanded: false, level: 0 },
        { role: "heading", name: "Pick", level: 2, selected: "mixed" },
      ]),
    ).toEqual([
      { role: "checkbox", name: "All", checked: "mixed" },
      { role: "tab", name: "One", selected: true },
      { role: "heading", name: "Pick", level: 2 },
    ]);
  });

  it("leaves out a text child that repeats the name, as Playwright does", () => {
    expect(normalize([{ role: "button", name: "Save", children: [{ role: "text", name: "Save" }] }])).toEqual([
      { role: "button", name: "Save" },
    ]);
  });

  it("changes nothing the second time", () => {
    const once = normalize([{ role: "list", children: [{ role: "listitem", text: "A" }, "b", "c"] }]);
    expect(normalize(once)).toEqual(once);
  });
});

describe("compare", () => {
  const group = (checked: number, disabled = -1) => [
    {
      role: "radiogroup",
      name: "Colour",
      children: ["Teal", "Plum", "Saffron"].map((name, i) => ({
        role: "radio",
        name,
        ...(i === checked ? { checked: true as const } : {}),
        ...(i === disabled ? { disabled: true as const } : {}),
      })),
    },
  ];

  it("finds nothing when both sides match", () => {
    const states: State[] = [{ tree: group(0), focus: { role: "radio", name: "Teal" } }];
    expect(compare(states, structuredClone(states))).toEqual([]);
  });

  it("reports a state, a focus and a missing node, with where and when", () => {
    const web: State[] = [
      { tree: group(0, 1), focus: { role: "radio", name: "Teal" } },
      { step: { press: "ArrowRight" }, tree: group(0, 1), focus: { role: "radio", name: "Teal" } },
    ];
    const flutter: State[] = [
      { tree: group(0, 1), focus: { role: "radio", name: "Teal" } },
      { step: { press: "ArrowRight" }, tree: [...group(2, 1), { role: "button", name: "Clear" }], focus: { role: "radio", name: "Saffron" } },
    ];
    expect(compare(web, flutter)).toEqual([
      { state: 1, path: 'radiogroup "Colour" > radio "Teal"', field: "checked", web: true, flutter: undefined },
      { state: 1, path: 'radiogroup "Colour" > radio "Saffron"', field: "checked", web: undefined, flutter: true },
      { state: 1, path: "", field: "node", web: undefined, flutter: 'button "Clear"' },
      { state: 1, path: "", field: "focus", web: 'radio "Teal"', flutter: 'radio "Saffron"' },
    ]);
  });

  it("stops at the first step that differs, since the trees after it are not comparable", () => {
    const web: State[] = [{ tree: [], focus: null }, { step: { press: "Home" }, tree: [], focus: null }];
    const flutter: State[] = [{ tree: [], focus: null }, { step: { press: "End" }, tree: group(0), focus: null }];
    expect(compare(web, flutter)).toEqual([{ state: 1, path: "", field: "step", web: "press Home", flutter: "press End" }]);
  });
});
