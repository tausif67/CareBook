import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SessionStore {
  static const _tokenKey = 'carebook_access_token';
  static const _roleKey = 'carebook_role';
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  Future<String?> token() => _storage.read(key: _tokenKey);
  Future<String?> role() => _storage.read(key: _roleKey);
  Future<void> save({required String token, required String role}) async {
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _roleKey, value: role);
  }
  Future<void> clear() => _storage.deleteAll();
}

