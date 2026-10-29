# semantic-parity

Check that a component built twice, for the web and for Flutter, reads and moves the same for keyboards and screen readers.

It records the accessibility tree of each side, runs the same keyboard script on both, and says where they differ: which node, which state, after which key.

```
colour.json
  after press ArrowDown: radiogroup "Colour" > radio "Teal": checked: web true, flutter none
  after press ArrowDown: radiogroup "Colour" > radio "Saffron": checked: web none, flutter true
  after press ArrowDown: focus: web radio "Teal", flutter radio "Saffron"

1 of 1 recording differs.
```

- Records the browser through Playwright, and Flutter inside a widget test with `flutter_test`.
- Writes both in one plain JSON shape, in ARIA's words: role, name, value, and the states checked, pressed, selected, disabled, expanded and invalid.
- Runs one script of steps on both sides (move focus here, press this key) and records the tree and the focused node after each step.
- Compares the two recordings state by state and exits with 1 when they differ, so it can fail a build.

Two packages come from this repository:

| Package | Registry | What it does |
|---|---|---|
| [`semantic-parity`](https://www.npmjs.com/package/semantic-parity) | npm | Records in a Playwright test, and the `semantic-parity` command that compares |
| [`semantic_parity`](https://pub.dev/packages/semantic_parity) | pub.dev | Records in a Flutter widget test |

```bash
npm install --save-dev semantic-parity
flutter pub add --dev semantic_parity
```

## How it works

Write the steps once, as JSON, next to the component:

```json
[
  { "focus": { "role": "radio", "name": "Teal" } },
  { "press": "ArrowDown" }
]
```

Record the web side in a Playwright test:

```ts
import { record } from "semantic-parity";

await page.goto("/colour");
await record(page.locator("#colour"), steps, { out: "build/parity/web/colour.json" });
```

Record the Flutter side in a widget test:

```dart
import 'package:semantic_parity/semantic_parity.dart';

await tester.pumpWidget(const MaterialApp(home: ColourPicker()));
await record(tester, steps: steps, out: 'build/parity/flutter/colour.json');
```

Compare every recording in one folder with the one at the same path in the other:

```bash
npx semantic-parity build/parity/web build/parity/flutter
```

## A recording

A recording is a list of states. The first is before any step; each one after it holds the step that led to it.

```json
[
  {
    "tree": [
      {
        "role": "radiogroup",
        "name": "Colour",
        "children": [
          { "role": "radio", "name": "Teal", "checked": true },
          { "role": "radio", "name": "Plum", "disabled": true },
          { "role": "radio", "name": "Saffron" }
        ]
      }
    ],
    "focus": null
  },
  {
    "step": { "focus": { "role": "radio", "name": "Teal" } },
    "tree": ["..."],
    "focus": { "role": "radio", "name": "Teal" }
  }
]
```

A node has a `role` and, when they apply, `name`, `value`, `checked` (`true` or `"mixed"`), `pressed` (`true` or `"mixed"`), `selected`, `disabled`, `expanded`, `invalid`, `level` (headings) and `children`. A state that is false is left out, because the browser leaves it out too.

A step is `{ "focus": { "role": ..., "name": ... } }`, which moves focus to that node, or `{ "press": "ArrowDown" }`, a key in [Playwright's names](https://playwright.dev/docs/api/class-keyboard#keyboard-press): `"Tab"`, `"Shift+Tab"`, `"Home"`, `"Space"`, `"a"`.

## What is compared

Before comparing, both trees are brought into one shape:

- Text becomes `{ "role": "text", "name": "..." }`, and text next to text is joined.
- Nodes that only group (`generic`, `group`, `none`, `presentation`, `paragraph`) are left out when they have no name, and their children move up.
- Whitespace in names and values collapses to single spaces.
- A text child that only repeats its parent's name is left out, as Playwright does.

Then each state is compared: the tree node by node, then the focused node by role and name. Children are matched by position, so a node that only one side has also shows up as a difference in the siblings after it.

Descriptions, hints, link addresses, placeholders, sizes and actions are not compared.

## How Flutter maps to ARIA

| Flutter | ARIA |
|---|---|
| `SemanticsRole` (tab, list, dialog, radioGroup and the rest) | the role of the same meaning (`tab`, `list`, `dialog`, `radiogroup`) |
| `isTextField` | `textbox` |
| `isSlider` | `slider` |
| `isLink` | `link` |
| `isHeader`, `headingLevel` | `heading`, `level` |
| `isImage` | `img` |
| a checked state in a mutually exclusive group | `radio` |
| any other checked state | `checkbox` |
| `isToggled` without `isButton` | `switch`, with `checked` |
| `isButton`, with `isToggled` | `button`, with `pressed` |
| a label and no role | `text`, or `group` when it has children |
| `isEnabled: false` | `disabled: true` |
| `isFocused` | the focused node |

`Semantics(label: ...)` wrapped around one widget that has a role and no name gives that widget the name, which is how Flutter names a group. Nodes marked hidden are left out.

## Limits

- The web side needs Playwright 1.63 or later, for `Locator.ariaSnapshotJSON()`. Focus is the element with DOM focus; `aria-activedescendant` is not followed.
- The Flutter side needs Flutter 3.44 or later.
- Some differences are real but deliberate, such as a web form showing a `<label>` as text beside its input where Flutter puts the label inside the field. There is no list of allowed differences yet.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Licence

[MIT](LICENSE)
