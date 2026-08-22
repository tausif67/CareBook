import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../shared/providers.dart';

class DoctorProfileScreen extends ConsumerWidget {
  const DoctorProfileScreen({required this.doctorId, super.key});

  final String doctorId;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
        appBar: AppBar(title: const Text('Doctor profile')),
        body: FutureBuilder<Map<String, dynamic>>(
          future: ref.read(apiProvider).doctor(doctorId),
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError || !snapshot.hasData) {
              return const Center(
                child: Text('Doctor profile could not be loaded.'),
              );
            }

            final doctor = snapshot.data!;
            final user = doctor['user'] as Map<String, dynamic>;
            final clinics = doctor['clinics'] as List<dynamic>? ?? [];
            final qualifications =
                doctor['qualifications'] as List<dynamic>? ?? [];
            final languages = doctor['languages'] as List<dynamic>? ?? [];

            return ListView(
              padding: const EdgeInsets.all(18),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      children: [
                        const CircleAvatar(
                          radius: 44,
                          backgroundColor: Color(0xFFE4F6F2),
                          child: Icon(
                            Icons.person,
                            size: 46,
                            color: Color(0xFF08766A),
                          ),
                        ),
                        const SizedBox(height: 13),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Flexible(
                              child: Text(
                                user['displayName'] as String,
                                textAlign: TextAlign.center,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleLarge
                                    ?.copyWith(fontWeight: FontWeight.w700),
                              ),
                            ),
                            const SizedBox(width: 6),
                            const Icon(
                              Icons.verified,
                              color: Color(0xFF08766A),
                              size: 19,
                            ),
                          ],
                        ),
                        Text(
                          '${doctor['experienceYears']} years experience • '
                          '⭐ ${doctor['averageRating']}',
                        ),
                        const SizedBox(height: 14),
                        Wrap(
                          spacing: 10,
                          children: [
                            Chip(
                              label: Text(
                                'Clinic ₹${(doctor['clinicFeePaise'] as int) ~/ 100}',
                              ),
                            ),
                            if (doctor['onlineEnabled'] == true)
                              const Chip(label: Text('Online available')),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                _section(
                  'About doctor',
                  doctor['about'] as String? ??
                      'Profile information has been submitted and reviewed by CareBook.',
                ),
                const SizedBox(height: 12),
                _section(
                  'Qualifications',
                  qualifications.map((value) => value.toString()).join(' • '),
                ),
                const SizedBox(height: 12),
                _section(
                  'Languages',
                  languages.map((value) => value.toString()).join(', '),
                ),
                if (clinics.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _section(
                    'Clinic',
                    ((clinics.first as Map<String, dynamic>)['clinic']
                        as Map<String, dynamic>)['name'] as String,
                  ),
                ],
                const SizedBox(height: 90),
              ],
            );
          },
        ),
        bottomSheet: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 12),
            child: FilledButton(
              onPressed: () => context.push('/doctors/$doctorId/book'),
              child: const Text('Book appointment'),
            ),
          ),
        ),
      );

  Widget _section(String title, String body) => Card(
        child: Padding(
          padding: const EdgeInsets.all(17),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 7),
              Text(
                body.isEmpty ? 'Not provided' : body,
                style: const TextStyle(color: Colors.black54, height: 1.4),
              ),
            ],
          ),
        ),
      );
}
