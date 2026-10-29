/// Records the semantics tree of a widget test in the JSON shape the
/// `semantic-parity` npm package reads, so it can be compared with the
/// accessibility tree of the same component in a browser.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:ui' show CheckedState, SemanticsRole, Tristate;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// The semantics tree under [root] (the whole view when null) and the
/// focused node in it, as `{"tree": [...], "focus": {...} or null}`.
///
/// Roles and states use ARIA's words: a node with `isButton` is a `button`,
/// `isEnabled: false` is `disabled: true`. A state that is false is left out,
/// and a node with no role and no name is left out with its children moved up.
Map<String, Object?> snapshot(WidgetTester tester, {Finder? root}) {
  final walk = _Walk();
  final tree = walk.nodes(_root(tester, root));
  final focus = walk.focus;
  return {
    'tree': tree,
    'focus': focus == null ? null : {'role': focus['role'], if (focus['name'] != null) 'name': focus['name']},
  };
}

/// Takes a [snapshot], then runs each step and takes another. A step is
/// `{"focus": {"role": "radio", "name": "Teal"}}`, which moves focus to that
/// node, or `{"press": "ArrowRight"}`, a key in Playwright's names
/// (`"Shift+Tab"`, `"Home"`, `"a"`). With [out], also writes the states there
/// as JSON for the `semantic-parity` command.
Future<List<Map<String, Object?>>> record(
  WidgetTester tester, {
  Finder? root,
  List<Map<String, Object?>> steps = const [],
  String? out,
}) async {
  final states = [snapshot(tester, root: root)];
  for (final step in steps) {
    final target = step['focus'];
    final press = step['press'];
    if (target is Map) {
      _focus(_root(tester, root), '${target['role']}', '${target['name']}');
    } else if (press is String) {
      await _press(tester, press);
    } else {
      throw ArgumentError.value(step, 'steps', 'A step has "focus" or "press"');
    }
    await tester.pumpAndSettle();
    states.add({'step': step, ...snapshot(tester, root: root)});
  }
  if (out != null) {
    File(out)
      ..parent.createSync(recursive: true)
      ..writeAsStringSync('${const JsonEncoder.withIndent('  ').convert(states)}\n');
  }
  return states;
}

SemanticsNode _root(WidgetTester tester, Finder? root) {
  if (!tester.binding.semanticsEnabled) {
    throw StateError(
      'Semantics is off. Leave testWidgets(semanticsEnabled: true), the default, or call tester.ensureSemantics().',
    );
  }
  if (root != null) return tester.getSemantics(root);
  return tester.binding.renderViews.first.owner!.semanticsOwner!.rootSemanticsNode!;
}

void _focus(SemanticsNode root, String role, String name) {
  final walk = _Walk()..nodes(root);
  final matches = walk.emitted.where((n) => n.$1['role'] == role && n.$1['name'] == name);
  if (matches.isEmpty) throw StateError('There is no $role "$name" to focus.');
  final node = matches.first.$2;
  if (!node.getSemanticsData().hasAction(SemanticsAction.focus)) {
    throw StateError('$role "$name" cannot take focus.');
  }
  node.owner!.performAction(node.id, SemanticsAction.focus);
}

// SemanticsRole values that have an ARIA role of the same meaning.
const _roles = {
  SemanticsRole.tab: 'tab',
  SemanticsRole.tabBar: 'tablist',
  SemanticsRole.tabPanel: 'tabpanel',
  SemanticsRole.dialog: 'dialog',
  SemanticsRole.alertDialog: 'alertdialog',
  SemanticsRole.table: 'table',
  SemanticsRole.cell: 'cell',
  SemanticsRole.row: 'row',
  SemanticsRole.columnHeader: 'columnheader',
  SemanticsRole.spinButton: 'spinbutton',
  SemanticsRole.comboBox: 'combobox',
  SemanticsRole.menuBar: 'menubar',
  SemanticsRole.menu: 'menu',
  SemanticsRole.menuItem: 'menuitem',
  SemanticsRole.menuItemCheckbox: 'menuitemcheckbox',
  SemanticsRole.menuItemRadio: 'menuitemradio',
  SemanticsRole.list: 'list',
  SemanticsRole.listItem: 'listitem',
  SemanticsRole.form: 'form',
  SemanticsRole.tooltip: 'tooltip',
  SemanticsRole.loadingSpinner: 'progressbar',
  SemanticsRole.progressBar: 'progressbar',
  SemanticsRole.radioGroup: 'radiogroup',
  SemanticsRole.status: 'status',
  SemanticsRole.alert: 'alert',
  SemanticsRole.complementary: 'complementary',
  SemanticsRole.contentInfo: 'contentinfo',
  SemanticsRole.main: 'main',
  SemanticsRole.navigation: 'navigation',
  SemanticsRole.region: 'region',
};

class _Walk {
  // The focused node's JSON, read once the walk is done, since a label can
  // still move onto it.
  Map<String, Object?>? focus;
  // Every node written, for finding the one a step focuses.
  final emitted = <(Map<String, Object?>, SemanticsNode)>[];

  List<Map<String, Object?>> nodes(SemanticsNode node) {
    final data = node.getSemanticsData();
    final flags = data.flagsCollection;
    if (flags.isHidden) return const [];
    final children = [
      if (!node.mergeAllDescendantsIntoThisNode)
        for (final child in node.debugListChildrenInOrder(DebugSemanticsDumpOrder.traversalOrder)) ...nodes(child),
    ];
    final name = (data.label.isNotEmpty ? data.label : data.tooltip).replaceAll(RegExp(r'\s+'), ' ').trim();
    var role = _roles[data.role] ?? _roleFromFlags(flags);
    final focused = flags.isFocused == Tristate.isTrue;

    // Flutter names a widget by wrapping it in Semantics(label: ...), which
    // makes a parent node; the label belongs to the one node it wraps.
    final only = children.length == 1 ? children.first : null;
    if (role == null && !focused && name.isNotEmpty && only != null && only['name'] == null && only['role'] != 'text') {
      // Changed in place, so emitted and focus see the name too.
      final rest = Map.of(only)..remove('role');
      final wrapped = only['role'];
      only
        ..clear()
        ..addAll({'role': wrapped, 'name': name, ...rest});
      return children;
    }
    if (role == null && name.isNotEmpty) role = children.isEmpty ? 'text' : 'group';

    if (role == null) {
      if (focused) focus = {'role': 'generic'};
      return children;
    }
    final toggled = flags.isToggled == Tristate.isTrue;
    final json = <String, Object?>{
      'role': role,
      if (name.isNotEmpty) 'name': name,
      if (data.value.isNotEmpty) 'value': data.value,
      if (flags.isChecked == CheckedState.isTrue || (role == 'switch' && toggled)) 'checked': true,
      if (flags.isChecked == CheckedState.mixed) 'checked': 'mixed',
      if (role == 'button' && toggled) 'pressed': true,
      if (flags.isSelected == Tristate.isTrue) 'selected': true,
      if (flags.isEnabled == Tristate.isFalse) 'disabled': true,
      if (flags.isExpanded == Tristate.isTrue) 'expanded': true,
      if (data.validationResult == SemanticsValidationResult.invalid) 'invalid': true,
      if (role == 'heading' && data.headingLevel > 0) 'level': data.headingLevel,
      if (children.isNotEmpty) 'children': children,
    };
    emitted.add((json, node));
    if (focused) focus = json;
    return [json];
  }
}

String? _roleFromFlags(SemanticsFlags flags) {
  if (flags.isTextField) return 'textbox';
  if (flags.isSlider) return 'slider';
  if (flags.isLink) return 'link';
  if (flags.isHeader) return 'heading';
  if (flags.isImage) return 'img';
  if (flags.isChecked != CheckedState.none) {
    return flags.isInMutuallyExclusiveGroup ? 'radio' : 'checkbox';
  }
  if (flags.isToggled != Tristate.none && !flags.isButton) return 'switch';
  if (flags.isButton) return 'button';
  return null;
}

const _keys = {
  'ArrowLeft': LogicalKeyboardKey.arrowLeft,
  'ArrowRight': LogicalKeyboardKey.arrowRight,
  'ArrowUp': LogicalKeyboardKey.arrowUp,
  'ArrowDown': LogicalKeyboardKey.arrowDown,
  'Home': LogicalKeyboardKey.home,
  'End': LogicalKeyboardKey.end,
  'PageUp': LogicalKeyboardKey.pageUp,
  'PageDown': LogicalKeyboardKey.pageDown,
  'Tab': LogicalKeyboardKey.tab,
  'Enter': LogicalKeyboardKey.enter,
  'Escape': LogicalKeyboardKey.escape,
  'Space': LogicalKeyboardKey.space,
  ' ': LogicalKeyboardKey.space,
  'Backspace': LogicalKeyboardKey.backspace,
  'Delete': LogicalKeyboardKey.delete,
};

const _modifiers = {
  'Shift': LogicalKeyboardKey.shiftLeft,
  'Control': LogicalKeyboardKey.controlLeft,
  'Alt': LogicalKeyboardKey.altLeft,
  'Meta': LogicalKeyboardKey.metaLeft,
};

Future<void> _press(WidgetTester tester, String chord) async {
  final parts = chord.length > 1 ? chord.split('+') : [chord];
  final name = parts.removeLast();
  // A single character is its own key: its key id is the lower case code point.
  final key = _keys[name] ?? (name.length == 1 ? LogicalKeyboardKey(name.toLowerCase().codeUnitAt(0)) : null);
  final modifiers = [for (final part in parts) _modifiers[part]];
  if (key == null || modifiers.contains(null)) {
    throw ArgumentError.value(
      chord,
      'press',
      'Use one character or ${_keys.keys.where((k) => k != ' ').join(', ')}, after any of ${_modifiers.keys.join(', ')} and "+"',
    );
  }
  for (final modifier in modifiers) {
    await tester.sendKeyDownEvent(modifier!);
  }
  await tester.sendKeyEvent(key);
  for (final modifier in modifiers.reversed) {
    await tester.sendKeyUpEvent(modifier!);
  }
}
