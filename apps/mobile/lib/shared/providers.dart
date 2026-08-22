import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api/api_client.dart';
import '../core/api/session_store.dart';
import '../core/config/app_config.dart';

final sessionProvider = Provider((_) => SessionStore());
final apiBaseUrlProvider = StateProvider<String>((_) => AppConfig.apiBaseUrl);
final apiProvider = Provider((ref) => ApiClient(ref.watch(sessionProvider), baseUrl: ref.watch(apiBaseUrlProvider)));
final roleProvider = StateProvider<String?>((_) => null);
