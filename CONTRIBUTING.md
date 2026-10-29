# Contributing

Thank you for helping. Bug reports, fixes and ideas are all welcome.

## Before you start

- **Bugs:** open an issue with the component on each side (the smallest HTML and the smallest widget that show it), the two recordings, and the versions of Playwright, the browser and Flutter.
- **New roles, states or steps:** open an issue first, so we can agree on the format before you write it. Both halves read and write the same JSON, so a change to it lands in both in one pull request.

## Working on it

The npm half is in `js/` and needs Node 22 or later:

```bash
cd js
npm ci
npx playwright install chromium   # once; or PLAYWRIGHT_CHANNEL=chrome npm test to use an installed Chrome
npm run typecheck
npm test
npm run build
```

The pub.dev half is in `dart/` and needs Flutter 3.44 or later:

```bash
cd dart
flutter pub get
dart format .
flutter analyze
flutter test
```

`fixtures/` holds one form built both ways: `form.html` and the `SignUp` widget in `dart/test/fixture_test.dart`, with one script, `form.steps.json`. The Flutter test checks its recording against `fixtures/flutter/form.json`, and the npm tests check the browser's recording against the same file, so the two halves agree on every role and state the form uses. When a change to the Dart side changes that recording on purpose, write it again and commit it:

```bash
cd dart && UPDATE_FIXTURES=1 flutter test test/fixture_test.dart
```

A pull request:

- does one thing, with a test that fails without it,
- adds a line under "Unreleased" in the `CHANGELOG.md` of each package it changes, saying what people get,
- keeps both packages free of runtime dependencies beyond Playwright and `flutter_test`,
- passes CI.

## Releases

Each package has its own version and changelog. Maintainers move the "Unreleased" lines under a new `## X.Y.Z` heading, bump the version in `js/package.json` or `dart/pubspec.yaml`, push the commit, then publish that package.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
