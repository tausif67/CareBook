import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../shared/providers.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final search = TextEditingController();
  List<dynamic> specialties = [];
  List<dynamic> doctors = [];
  bool loading = true;

  @override void initState() { super.initState(); Future.microtask(load); }
  Future<void> load({String? specialty}) async {
    setState(() => loading = true);
    final api = ref.read(apiProvider);
    final results = await Future.wait([api.specializations(), api.searchDoctors(query: search.text, specialty: specialty)]);
    if (mounted) setState(() { specialties = results[0] as List<dynamic>; doctors = (results[1] as Map<String, dynamic>)['items'] as List<dynamic>? ?? []; loading = false; });
  }

  @override Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Hello 👋', style: TextStyle(fontSize: 13, color: Colors.black54)), Text('Find care near you', style: TextStyle(fontWeight: FontWeight.w700))]), actions: [IconButton(onPressed: () => context.push('/notifications'), icon: const Icon(Icons.notifications_none))]),
    bottomNavigationBar: NavigationBar(selectedIndex: 0, destinations: const [NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'), NavigationDestination(icon: Icon(Icons.calendar_month_outlined), label: 'Appointments'), NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile')], onDestinationSelected: (index) { if (index == 1) context.push('/appointments'); if (index == 2) context.push('/profile'); }),
    body: RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.fromLTRB(18, 8, 18, 28), children: [
      TextField(controller: search, textInputAction: TextInputAction.search, onSubmitted: (_) => load(), decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search doctors, specialists or clinics')),
      const SizedBox(height: 22),
      _heading('Specialties'), const SizedBox(height: 12),
      SizedBox(height: 96, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: specialties.length, separatorBuilder: (_, __) => const SizedBox(width: 10), itemBuilder: (_, index) { final item = specialties[index] as Map<String, dynamic>; return InkWell(onTap: () => load(specialty: item['slug'] as String), child: SizedBox(width: 86, child: Column(children: [CircleAvatar(radius: 28, backgroundColor: const Color(0xFFE4F6F2), child: Icon(_specialtyIcon(item['slug'] as String), color: const Color(0xFF08766A))), const SizedBox(height: 7), Text(item['nameEn'] as String, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11))]))); })),
      const SizedBox(height: 22), _heading('Popular doctors'), const SizedBox(height: 12),
      if (loading) const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
      else if (doctors.isEmpty) const _EmptyDoctors()
      else ...doctors.map((value) => _DoctorCard(doctor: value as Map<String, dynamic>)),
    ])),
  );

  Widget _heading(String value) => Text(value, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700));
  IconData _specialtyIcon(String slug) => slug == 'dentist' ? Icons.medical_services_outlined : slug == 'cardiologist' ? Icons.favorite_outline : slug == 'ophthalmologist' ? Icons.visibility_outlined : Icons.health_and_safety_outlined;
}

class _DoctorCard extends StatelessWidget {
  const _DoctorCard({required this.doctor}); final Map<String, dynamic> doctor;
  @override Widget build(BuildContext context) {
    final user = doctor['user'] as Map<String, dynamic>;
    final specs = doctor['specializations'] as List<dynamic>? ?? [];
    return Padding(padding: const EdgeInsets.only(bottom: 12), child: Card(child: InkWell(borderRadius: BorderRadius.circular(18), onTap: () => context.push('/doctors/${doctor['id']}'), child: Padding(padding: const EdgeInsets.all(16), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const CircleAvatar(radius: 30, backgroundColor: Color(0xFFE4F6F2), child: Icon(Icons.person, color: Color(0xFF08766A))), const SizedBox(width: 14),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Row(children: [Expanded(child: Text(user['displayName'] as String, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))), const Icon(Icons.verified, color: Color(0xFF08766A), size: 18)]), const SizedBox(height: 4), Text(specs.isEmpty ? 'Doctor' : ((specs.first as Map<String, dynamic>)['specialization'] as Map<String, dynamic>)['nameEn'] as String, style: const TextStyle(color: Colors.black54)), const SizedBox(height: 9), Row(children: [const Icon(Icons.star, color: Colors.amber, size: 17), Text(' ${doctor['averageRating']}  •  ${doctor['experienceYears']} yrs'), const Spacer(), Text('₹${(doctor['clinicFeePaise'] as int) ~/ 100}', style: const TextStyle(fontWeight: FontWeight.w700))])]))
    ])))));
  }
}
class _EmptyDoctors extends StatelessWidget { const _EmptyDoctors(); @override Widget build(BuildContext context) => const Card(child: Padding(padding: EdgeInsets.all(28), child: Column(children: [Icon(Icons.search_off, size: 38, color: Colors.black38), SizedBox(height: 10), Text('No approved doctors match this search.'), Text('Try another specialty or area.', style: TextStyle(color: Colors.black54))]))); }

