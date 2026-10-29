# semantic_parity

Records a Flutter semantics tree inside a widget test, in the JSON shape of a browser accessibility tree. The [`semantic-parity`](https://github.com/sorena-labs/semantic-parity/tree/main/js) npm package records the web version of the same component with Playwright and compares the two, so a component built for the web and for Flutter can be checked to expose the same roles, names and states and to move focus the same way. The [repository README](https://github.com/sorena-labs/semantic-parity#readme) explains the format and what is compared.

## Install

```yaml
dev_dependencies:
  semantic_parity: ^0.1.0
```

Needs Flutter 3.44 or later.

## Use

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:semantic_parity/semantic_parity.dart';

void main() {
  testWidgets('colour picker', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: ColourPicker()));
    await record(
      tester,
      steps: [
        {'focus': {'role': 'radio', 'name': 'Teal'}},
        {'press': 'ArrowDown'},
      ],
      out: 'build/parity/flutter/colour.json',
    );
  });
}
```

Then compare with the web recordings:

```bash
npx semantic-parity build/parity/web build/parity/flutter
```

## API

### `record(tester, {root, steps, out})`

Takes a `snapshot`, then runs each step, waits for the frame to settle with `pumpAndSettle`, and takes another. Returns the list of states. With `out`, also writes them there as JSON, creating the folders.

A step is `{'focus': {'role': ..., 'name': ...}}`, which sends `SemanticsAction.focus` to the node with that role and name, or `{'press': key}`, which sends that key: `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Home`, `End`, `PageUp`, `PageDown`, `Tab`, `Enter`, `Escape`, `Space`, `Backspace`, `Delete` or one character, after any of `Shift+`, `Control+`, `Alt+` and `Meta+`. These are Playwright's names, so one script runs on both sides.

### `snapshot(tester, {root})`

Returns `{'tree': [...], 'focus': ...}`: the semantics tree under the widget `root` finds (the whole view when null), with roles and states in ARIA's words, and the role and name of the focused node, or `null`.

Semantics must be on, which it is by default in `testWidgets`.

## Licence

[MIT](LICENSE)
