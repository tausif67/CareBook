import 'package:carebook_mobile/core/config/app_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('API base URL keeps the versioned contract', () {
    final uri = Uri.parse(AppConfig.apiBaseUrl);
    expect(uri.path.endsWith('/api/v1'), isTrue);
  });

  test('test mode is opt-in for normal builds', () {
    expect(AppConfig.testMode, isFalse);
  });
}
