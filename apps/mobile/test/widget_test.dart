import 'package:carebook_mobile/main.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('CareBook opens on onboarding', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: CareBookApp()));
    await tester.pumpAndSettle();

    expect(find.text('Find trusted doctors'), findsOneWidget);
  });
}
