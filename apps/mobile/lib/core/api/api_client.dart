import 'package:dio/dio.dart';
import '../config/app_config.dart';
import 'session_store.dart';

class ApiClient {
  ApiClient(this._session, {String? baseUrl})
      : dio = Dio(BaseOptions(
          baseUrl: baseUrl ?? AppConfig.apiBaseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 15),
          headers: {'Accept-Language': 'en-IN'},
        )) {
    dio.interceptors.add(InterceptorsWrapper(onRequest: (options, handler) async {
      final token = await _session.token();
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
      handler.next(options);
    }));
  }

  final SessionStore _session;
  final Dio dio;

  Future<Map<String, dynamic>> exchangeFirebaseToken({required String idToken, required String role, required String name}) async {
    final response = await dio.post<Map<String, dynamic>>('/auth/otp/exchange', data: {
      'firebaseIdToken': idToken,
      'role': role,
      'displayName': name,
    });
    return response.data!;
  }

  Future<Map<String, dynamic>> exchangeLocalOtp({required String phone, required String localOtp, required String role, required String name}) async {
    final response = await dio.post<Map<String, dynamic>>('/auth/otp/exchange', data: {
      'phone': phone,
      'localOtp': localOtp,
      'role': role,
      'displayName': name,
    });
    return response.data!;
  }

  Future<List<dynamic>> specializations() async => (await dio.get<List<dynamic>>('/specializations')).data!;
  Future<List<dynamic>> clinics() async => (await dio.get<List<dynamic>>('/clinics')).data!;
  Future<Map<String, dynamic>> searchDoctors({String? query, String? specialty}) async {
    final response = await dio.get<Map<String, dynamic>>('/doctors', queryParameters: {
      if (query?.isNotEmpty == true) 'q': query,
      if (specialty != null) 'specialty': specialty,
    });
    return response.data!;
  }
  Future<Map<String, dynamic>> doctor(String id) async => (await dio.get<Map<String, dynamic>>('/doctors/$id')).data!;
  Future<Map<String, dynamic>> availability(String id, String date, String type, {String? clinicId}) async =>
      (await dio.get<Map<String, dynamic>>('/doctors/$id/availability', queryParameters: {'date': date, 'type': type, if (clinicId != null) 'clinicId': clinicId})).data!;
  Future<Map<String, dynamic>> book(Map<String, dynamic> payload) async => (await dio.post<Map<String, dynamic>>('/appointments', data: payload)).data!;
  Future<Map<String, dynamic>> paymentOrder(String appointmentId) async =>
      (await dio.post<Map<String, dynamic>>('/payments/orders', data: {'appointmentId': appointmentId})).data!;
  Future<Map<String, dynamic>> confirmTestPayment(String appointmentId) async =>
      (await dio.post<Map<String, dynamic>>('/payments/test/confirm', data: {'appointmentId': appointmentId})).data!;
  Future<List<dynamic>> appointments(String view) async => (await dio.get<List<dynamic>>('/appointments', queryParameters: {'view': view})).data!;
  Future<void> rescheduleAppointment(String appointmentId, String startAt, String idempotencyKey) async {
    await dio.post<void>('/appointments/$appointmentId/reschedule', data: {'startAt': startAt, 'idempotencyKey': idempotencyKey});
  }
  Future<void> completeAppointment(String appointmentId) async {
    await dio.post<void>('/appointments/$appointmentId/complete');
  }
  Future<void> cancelAppointment(String appointmentId, String reason) async {
    await dio.post<void>('/appointments/$appointmentId/cancel', data: {'reason': reason});
  }
  Future<Map<String, dynamic>> doctorDashboard() async => (await dio.get<Map<String, dynamic>>('/doctors/me/dashboard')).data!;
  Future<void> registerDeviceToken(String token) async {
    await dio.post<void>('/notifications/devices', data: {'token': token, 'platform': 'android'});
  }
  Future<void> updateDoctorProfile(Map<String, dynamic> payload) async {
    await dio.patch<void>('/doctors/me/profile', data: payload);
  }
  Future<void> submitDoctorProfile() async {
    await dio.post<void>('/doctors/me/submit');
  }
  Future<Map<String, dynamic>> uploadDoctorDocument({
    required String type,
    required String fileName,
    required String contentType,
    required List<int> bytes,
    required String sha256,
  }) async {
    final started = (await dio.post<Map<String, dynamic>>('/doctors/me/documents/upload-url', data: {
      'type': type,
      'fileName': fileName,
      'contentType': contentType,
      'sizeBytes': bytes.length,
      'sha256': sha256,
    })).data!;
    final headers = Map<String, dynamic>.from(started['requiredHeaders'] as Map);
    await Dio().put<void>(started['uploadUrl'] as String, data: bytes, options: Options(headers: headers, contentType: contentType));
    final document = started['document'] as Map<String, dynamic>;
    return (await dio.post<Map<String, dynamic>>('/doctors/me/documents/${document['id']}/complete')).data!;
  }
}
