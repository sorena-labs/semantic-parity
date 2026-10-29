# semantic-parity

Check that a component built twice, once for the web and once in Flutter, works the same for keyboard and screen-reader users: the same roles, names and states, and focus moving the same way when keys are pressed.

It records the accessibility tree of each side, runs the same keyboard script on both, and says where they differ: which node, which state, after which key.

```
colour.json
  after press ArrowDown: radiogroup "Colour" > radio "Teal": checked: web true, flutter none
  after press ArrowDown: radiogroup "Colour" > radio "Saffron": checked: web none, flutter true
  after press ArrowDown: focus: web radio "Teal", flutter radio "Saffron"

1 of 1 recording differs.
```

Here the web radio group ignores ArrowDown, while the Flutter one checks and focuses the next radio, Saffron.

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

## Try it

To see it work before adding it to your own tests, run it on the example form in this repository. `fixtures/` holds one sign-up form built both ways, `form.html` and a Flutter widget, and one keyboard script for both. Its Flutter recording is already in `fixtures/flutter/`. This records the browser side and compares the two (needs Node 22 or later):

```bash
git clone https://github.com/sorena-labs/semantic-parity.git
cd semantic-parity/js
npm ci
npx playwright install chromium
npm test
npm run build
node dist/cli.js build/parity/web ../fixtures/flutter
```

`npm test` writes the browser recording to `build/parity/web/form.json`, and the last command prints `1 recording matches.`

To see a difference, remove `disabled` from the "Off" button in `fixtures/form.html` and run `npm test` and the last command again. The fixture test now fails, and the command prints `button "Off": disabled: web none, flutter true` for every state and exits with 1.

## How it works

Write the steps once, as JSON, next to the component, for example `colour.steps.json`:

```json
[
  { "focus": { "role": "radio", "name": "Teal" } },
  { "press": "ArrowDown" }
]
```

Record the web side in a Playwright test:

```ts
import { readFileSync } from "node:fs";
import { record } from "semantic-parity";

const steps = JSON.parse(readFileSync("colour.steps.json", "utf8"));

await page.goto("/colour");
await record(page.locator("#colour"), steps, { out: "build/parity/web/colour.json" });
```

Record the Flutter side in a widget test:

```dart
import 'dart:convert';
import 'dart:io';

import 'package:semantic_parity/semantic_parity.dart';

final steps = (jsonDecode(File('colour.steps.json').readAsStringSync()) as List)
    .cast<Map<String, Object?>>();

await tester.pumpWidget(const MaterialApp(home: ColourPicker()));
await record(tester, steps: steps, out: 'build/parity/flutter/colour.json');
```

Compare every recording in one folder with the one at the same path in the other:

```bash
npx semantic-parity build/parity/web build/parity/flutter
```

Paths in `out` are relative to the folder each test runs in. When the web app and the Flutter app are separate projects, point both at one shared folder, or copy the recordings to one place in CI, before running the command.

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

A step is `{ "focus": { "role": ..., "name": ... } }`, which moves focus to that node, or `{ "press": "ArrowDown" }`, which presses a key. Keys use [Playwright's names](https://playwright.dev/docs/api/class-keyboard#keyboard-press). The Flutter side knows `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Home`, `End`, `PageUp`, `PageDown`, `Tab`, `Enter`, `Escape`, `Space`, `Backspace`, `Delete` and any single character, after any of `Shift+`, `Control+`, `Alt+` and `Meta+` (`"Shift+Tab"`). It fails the test on any other key, so keep scripts to these.

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
| `isButton` | `button`, with `pressed` when it is also `isToggled` |
| a label and no role | `text`, or `group` when it has children |
| `label`, or `tooltip` when there is no label | `name` |
| `value` | `value` |
| `isChecked: mixed` | `checked: "mixed"` |
| `isSelected`, `isExpanded` | `selected`, `expanded` |
| `validationResult: invalid` | `invalid: true` |
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
