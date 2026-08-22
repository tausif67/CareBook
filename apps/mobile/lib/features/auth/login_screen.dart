import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/config/app_config.dart';
import '../../shared/providers.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final phone = TextEditingController(text: '+91');
  final otp = TextEditingController();
  final name = TextEditingController();
  final serverUrl = TextEditingController(text: AppConfig.apiBaseUrl);
  String role = 'PATIENT';
  String? verificationId;
  bool loading = false;
  String? error;

  Future<void> sendOtp() async {
    setState(() { loading = true; error = null; });
    if (AppConfig.testMode) {
      final uri = Uri.tryParse(serverUrl.text.trim());
      if (uri == null || !['http', 'https'].contains(uri.scheme) || !uri.path.endsWith('/api/v1')) {
        setState(() { loading = false; error = 'Enter a server URL ending in /api/v1'; });
        return;
      }
      ref.read(apiBaseUrlProvider.notifier).state = serverUrl.text.trim().replaceFirst(RegExp(r'/$'), '');
      setState(() { verificationId = 'local-test'; loading = false; });
      return;
    }
    await FirebaseAuth.instance.verifyPhoneNumber(
      phoneNumber: phone.text.trim(),
      verificationCompleted: (_) {},
      verificationFailed: (e) => setState(() { loading = false; error = e.message; }),
      codeSent: (id, _) => setState(() { verificationId = id; loading = false; }),
      codeAutoRetrievalTimeout: (id) => verificationId = id,
    );
  }

  Future<void> verify() async {
    setState(() { loading = true; error = null; });
    try {
      final Map<String, dynamic> session;
      if (AppConfig.testMode) {
        session = await ref.read(apiProvider).exchangeLocalOtp(
          phone: phone.text.trim(),
          localOtp: otp.text.trim(),
          role: role,
          name: name.text.trim(),
        );
      } else {
        final credential = PhoneAuthProvider.credential(verificationId: verificationId!, smsCode: otp.text.trim());
        final user = (await FirebaseAuth.instance.signInWithCredential(credential)).user!;
        session = await ref.read(apiProvider).exchangeFirebaseToken(idToken: await user.getIdToken(true) ?? '', role: role, name: name.text.trim());
      }
      await ref.read(sessionProvider).save(token: session['accessToken'] as String, role: role);
      if (!AppConfig.testMode) {
        final permission = await FirebaseMessaging.instance.requestPermission(alert: true, badge: true, sound: true);
        if (permission.authorizationStatus == AuthorizationStatus.authorized) {
          final deviceToken = await FirebaseMessaging.instance.getToken();
          if (deviceToken != null) await ref.read(apiProvider).registerDeviceToken(deviceToken);
        }
      }
      ref.read(roleProvider.notifier).state = role;
      if (mounted) context.go(role == 'DOCTOR' ? '/doctor-dashboard' : '/home');
    } catch (e) { setState(() { loading = false; error = 'Could not verify this number. Please retry.'; }); }
  }

  @override
  void dispose() {
    phone.dispose();
    otp.dispose();
    name.dispose();
    serverUrl.dispose();
    super.dispose();
  }

  @override Widget build(BuildContext context) => Scaffold(
    body: SafeArea(child: ListView(padding: const EdgeInsets.all(24), children: [
      const SizedBox(height: 32),
      Container(width: 54, height: 54, decoration: BoxDecoration(color: const Color(0xFF08766A), borderRadius: BorderRadius.circular(16)), child: const Icon(Icons.add, color: Colors.white, size: 32)),
      const SizedBox(height: 24),
      Text('Welcome to CareBook', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700)),
      const Text('Healthcare, simplified.'), const SizedBox(height: 28),
      if (AppConfig.testMode) ...[
        Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0xFFFFF4CC), borderRadius: BorderRadius.circular(12)), child: const Text('Private test mode · Use any new Indian mobile number · Enter the OTP printed by pnpm testing:up', style: TextStyle(color: Color(0xFF6B4E00), fontWeight: FontWeight.w600))),
        const SizedBox(height: 12),
        TextField(controller: serverUrl, keyboardType: TextInputType.url, autocorrect: false, decoration: const InputDecoration(labelText: 'Testing server URL', helperText: 'Emulator: http://10.0.2.2:4000/api/v1')),
        const SizedBox(height: 16),
      ],
      SegmentedButton<String>(segments: const [ButtonSegment(value: 'PATIENT', label: Text('Patient')), ButtonSegment(value: 'DOCTOR', label: Text('Doctor'))], selected: {role}, onSelectionChanged: (value) => setState(() => role = value.first)),
      const SizedBox(height: 18),
      TextField(controller: name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Full name')),
      const SizedBox(height: 14),
      TextField(controller: phone, keyboardType: TextInputType.phone, enabled: verificationId == null, decoration: const InputDecoration(labelText: 'Mobile number')),
      if (verificationId != null) ...[const SizedBox(height: 14), TextField(controller: otp, keyboardType: TextInputType.number, maxLength: 6, decoration: const InputDecoration(labelText: '6-digit OTP'))],
      if (error != null) Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Text(error!, style: const TextStyle(color: Colors.red))),
      const SizedBox(height: 16),
      FilledButton(onPressed: loading ? null : verificationId == null ? sendOtp : verify, child: Text(loading ? 'Please wait…' : verificationId == null ? 'Send OTP' : 'Verify & continue')),
      const SizedBox(height: 12),
      const Text('By continuing, you agree to responsible handling of appointment information.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Colors.black54)),
    ])),
  );
}
