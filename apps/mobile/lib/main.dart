import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/config/app_config.dart';
import 'core/theme/app_theme.dart';
import 'features/appointments/appointments_screen.dart';
import 'features/appointments/notifications_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/onboarding_screen.dart';
import 'features/auth/profile_screen.dart';
import 'features/booking/booking_screen.dart';
import 'features/doctor_dashboard/doctor_dashboard_screen.dart';
import 'features/doctor_dashboard/doctor_registration_screen.dart';
import 'features/doctor_dashboard/doctor_schedule_screen.dart';
import 'features/doctors/doctor_profile_screen.dart';
import 'features/home/home_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (!AppConfig.testMode) await Firebase.initializeApp();
  runApp(const ProviderScope(child: CareBookApp()));
}

class CareBookApp extends StatelessWidget {
  const CareBookApp({super.key});

  static final router = GoRouter(
    initialLocation: '/onboarding',
    routes: [
      GoRoute(path: '/onboarding', builder: (_, __) => const OnboardingScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
      GoRoute(path: '/doctors/:id', builder: (_, state) => DoctorProfileScreen(doctorId: state.pathParameters['id']!)),
      GoRoute(path: '/doctors/:id/book', builder: (_, state) => BookingScreen(doctorId: state.pathParameters['id']!)),
      GoRoute(path: '/appointments', builder: (_, __) => const AppointmentsScreen()),
      GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
      GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
      GoRoute(path: '/doctor-dashboard', builder: (_, __) => const DoctorDashboardScreen()),
      GoRoute(path: '/doctor-registration', builder: (_, __) => const DoctorRegistrationScreen()),
      GoRoute(path: '/doctor-schedule', builder: (_, __) => const DoctorScheduleScreen()),
    ],
  );

  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: 'CareBook',
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light,
    routerConfig: router,
    localizationsDelegates: const [],
    supportedLocales: const [Locale('en', 'IN'), Locale('hi', 'IN')],
    builder: (context, child) => AppConfig.testMode
        ? Banner(message: 'TEST MODE', location: BannerLocation.topEnd, child: child ?? const SizedBox.shrink())
        : child ?? const SizedBox.shrink(),
  );
}
