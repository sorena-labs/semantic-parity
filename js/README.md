# semantic-parity

Records a browser's accessibility tree in a Playwright test, and compares it with a Flutter semantics tree recorded by [`semantic_parity`](https://github.com/sorena-labs/semantic-parity/tree/main/dart). Use it when one component is built for the web and for Flutter, to check that both expose the same roles, names and states and move focus the same way. The [repository README](https://github.com/sorena-labs/semantic-parity#readme) explains the format and what is compared.

## Install

```bash
npm install --save-dev semantic-parity
```

Needs Node 20 or later and Playwright 1.63 or later. Playwright is not a dependency: pass in your own `Locator`.

## Use

```ts
import { test } from "@playwright/test";
import { record } from "semantic-parity";

const steps = [{ focus: { role: "radio", name: "Teal" } }, { press: "ArrowDown" }];

test("colour picker", async ({ page }) => {
  await page.goto("/colour");
  await record(page.locator("#colour"), steps, { out: "build/parity/web/colour.json" });
});
```

Then compare with the Flutter recordings:

```bash
npx semantic-parity build/parity/web build/parity/flutter
```

It compares every `.json` file in one folder with the file at the same path in the other, prints each difference, and exits with 1 when any recording differs or is missing on one side. It exits with 2 when it cannot read a recording.

With `--allow <file>`, it leaves out the deliberate differences listed in that file, each with a reason, and also fails when an entry no longer matches any difference. The [repository README](https://github.com/sorena-labs/semantic-parity#allowing-a-difference) describes the format.

## API

### `record(root, steps?, options?)`

Takes a `snapshot` of `root`, then runs each step and takes another. Returns the list of states. With `options.out`, also writes them there as JSON, creating the folders.

A step is `{ focus: { role, name } }`, which focuses the element inside `root` with that role and exact name, or `{ press: key }`, which presses a key with `page.keyboard.press`.

### `snapshot(root)`

Returns `{ tree, focus }`: the normalised accessibility tree under `root`, and the role and name of the focused element when focus is inside `root`, or `null`.

### `compare(web, flutter)`

Compares two recordings state by state. Returns a list of differences, each with the `state` index, the `path` to the node (`radiogroup "Colour" > radio "Plum"`), the `field` that differs, and the `web` and `flutter` values. An empty list means they match.

### `normalize(nodes)`

Brings a tree from either side into the shared shape. `compare` calls it on both sides, so recordings can hold Playwright's `ariaSnapshotJSON()` output as it comes.

### `describeStep(step)`

A step as words: `press ArrowDown`, `focus radio "Teal"`.

## Licence

[MIT](LICENSE)
