# Changelog

Every release, newest first. Versions follow [semantic versioning](https://semver.org).

## 0.2.0

- `semantic-parity --allow <file>` leaves out the deliberate differences listed in that file, each with a reason, and fails when an entry no longer matches any difference.
- The command names a recording that is not valid JSON or not a recording and exits with 2, instead of crashing with a stack trace.

## 0.1.0

- `record(root, steps, { out })` records a browser's accessibility tree and focus with Playwright, before and after each step of a keyboard script, and writes it as JSON.
- `compare(web, flutter)` and the `semantic-parity <web folder> <flutter folder>` command compare those recordings with the ones `semantic_parity` writes in Flutter widget tests, and say which node, state or focus differs after which step.
- `normalize` and `snapshot` for one tree at a time.
