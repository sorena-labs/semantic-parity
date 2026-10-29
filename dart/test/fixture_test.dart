import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:semantic_parity/semantic_parity.dart';

// The same form as fixtures/form.html. Its recording, fixtures/flutter/form.json,
// is what the npm package's tests compare the browser with.
// UPDATE_FIXTURES=1 flutter test writes it again.
class SignUp extends StatefulWidget {
  const SignUp({super.key});

  @override
  State<SignUp> createState() => _SignUpState();
}

class _SignUpState extends State<SignUp> {
  var news = false;
  var digest = true;
  var colour = 'Teal';

  @override
  Widget build(BuildContext context) => Material(
    child: Column(
      children: [
        Semantics(header: true, headingLevel: 1, child: const Text('Sign up')),
        const Text('Pick what you want.'),
        Checkbox(value: news, onChanged: (v) => setState(() => news = v!), semanticLabel: 'News'),
        MergeSemantics(
          child: Row(
            children: [
              const Text('Weekly digest'),
              Switch(value: digest, onChanged: (v) => setState(() => digest = v)),
            ],
          ),
        ),
        const TextField(decoration: InputDecoration(labelText: 'Name')),
        ElevatedButton(onPressed: () {}, child: const Text('Save')),
        const ElevatedButton(onPressed: null, child: Text('Off')),
        Semantics(
          label: 'Colour',
          child: RadioGroup<String>(
            groupValue: colour,
            onChanged: (v) => setState(() => colour = v!),
            child: const Column(
              children: [
                RadioListTile(value: 'Teal', title: Text('Teal')),
                RadioListTile(value: 'Plum', title: Text('Plum'), enabled: false),
                RadioListTile(value: 'Saffron', title: Text('Saffron')),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

void main() {
  testWidgets('the form records as fixtures/flutter/form.json', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: SignUp()));
    final steps = (jsonDecode(File('../fixtures/form.steps.json').readAsStringSync()) as List)
        .cast<Map<String, Object?>>();
    const path = '../fixtures/flutter/form.json';
    if (Platform.environment['UPDATE_FIXTURES'] != null) {
      await record(tester, steps: steps, out: path);
      return;
    }
    final states = await record(tester, steps: steps);
    expect(jsonDecode(jsonEncode(states)), jsonDecode(File(path).readAsStringSync()));
  });
}
