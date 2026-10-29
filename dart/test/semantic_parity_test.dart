import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:semantic_parity/semantic_parity.dart';

Widget node({
  String? label,
  bool? button,
  bool? toggled,
  bool? mixed,
  bool? enabled,
  bool? selected,
  bool? expanded,
  bool? textField,
  bool? link,
  bool? image,
  bool? hidden,
  String? value,
  SemanticsRole? role,
}) => Semantics(
  container: true,
  label: label,
  button: button,
  toggled: toggled,
  mixed: mixed,
  enabled: enabled,
  selected: selected,
  expanded: expanded,
  textField: textField,
  link: link,
  image: image,
  hidden: hidden,
  value: value,
  role: role,
  // Flutter checks that a tab can be activated.
  onTap: role == SemanticsRole.tab ? () {} : null,
  child: const SizedBox(width: 10, height: 10),
);

void main() {
  testWidgets('maps flags and roles to ARIA roles and states', (tester) async {
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: Column(
          children: [
            node(label: 'All', mixed: true),
            node(label: 'Bold', button: true, toggled: true),
            node(label: 'Wifi', toggled: false),
            node(label: 'Off', button: true, enabled: false),
            node(label: 'One', role: SemanticsRole.tab, selected: true),
            node(label: 'More', button: true, expanded: true),
            node(label: 'Name', textField: true, value: 'Ada'),
            node(label: 'Docs', link: true),
            node(label: 'Logo', image: true),
            node(label: 'Offstage', button: true, hidden: true),
            const ExcludeSemantics(child: Text('Decoration')),
            const Text('Plain text'),
          ],
        ),
      ),
    );

    expect(snapshot(tester), {
      'tree': [
        {'role': 'checkbox', 'name': 'All', 'checked': 'mixed'},
        {'role': 'button', 'name': 'Bold', 'pressed': true},
        {'role': 'switch', 'name': 'Wifi'},
        {'role': 'button', 'name': 'Off', 'disabled': true},
        {'role': 'tab', 'name': 'One', 'selected': true},
        {'role': 'button', 'name': 'More', 'expanded': true},
        {'role': 'textbox', 'name': 'Name', 'value': 'Ada'},
        {'role': 'link', 'name': 'Docs'},
        {'role': 'img', 'name': 'Logo'},
        {'role': 'text', 'name': 'Plain text'},
      ],
      'focus': null,
    });
  });

  testWidgets('a label wrapped around a widget names that widget', (tester) async {
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: Semantics(
          label: 'Colour',
          child: Semantics(
            container: true,
            role: SemanticsRole.radioGroup,
            child: node(label: 'Teal'),
          ),
        ),
      ),
    );

    expect(snapshot(tester)['tree'], [
      {
        'role': 'radiogroup',
        'name': 'Colour',
        'children': [
          {'role': 'text', 'name': 'Teal'},
        ],
      },
    ]);
  });

  testWidgets('record moves focus, presses keys, writes what it returns and explains a bad step', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Material(
          child: Column(
            children: [
              ElevatedButton(onPressed: () {}, child: const Text('One')),
              ElevatedButton(onPressed: () {}, child: const Text('Two')),
            ],
          ),
        ),
      ),
    );
    final out = '${Directory.systemTemp.createTempSync('semantic_parity').path}/buttons/tab.json';

    final states = await record(
      tester,
      steps: [
        {
          'focus': {'role': 'button', 'name': 'One'},
        },
        {'press': 'Tab'},
        {'press': 'Shift+Tab'},
      ],
      out: out,
    );

    expect(states.map((state) => state['focus']), [
      null,
      {'role': 'button', 'name': 'One'},
      {'role': 'button', 'name': 'Two'},
      {'role': 'button', 'name': 'One'},
    ]);
    expect(jsonDecode(File(out).readAsStringSync()), jsonDecode(jsonEncode(states)));
    await expectLater(
      record(
        tester,
        steps: [
          {'press': 'Banana'},
        ],
      ),
      throwsArgumentError,
    );
    await expectLater(
      record(
        tester,
        steps: [
          {
            'focus': {'role': 'button', 'name': 'Three'},
          },
        ],
      ),
      throwsStateError,
    );
  });
}
