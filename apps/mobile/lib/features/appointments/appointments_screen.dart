import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';
import '../../shared/providers.dart';

class AppointmentsScreen extends ConsumerStatefulWidget {
  const AppointmentsScreen({super.key});
  @override ConsumerState<AppointmentsScreen> createState() => _AppointmentsScreenState();
}

class _AppointmentsScreenState extends ConsumerState<AppointmentsScreen> with SingleTickerProviderStateMixin {
  late final TabController tabs = TabController(length: 3, vsync: this);
  final views = ['upcoming','completed','cancelled'];
  @override void dispose() { tabs.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Appointments'), bottom: TabBar(controller: tabs, tabs: const [Tab(text:'Upcoming'),Tab(text:'Completed'),Tab(text:'Cancelled')])),
    body: TabBarView(controller: tabs, children: views.map((view) => _AppointmentList(view: view)).toList()),
  );
}

class _AppointmentList extends ConsumerStatefulWidget {
  const _AppointmentList({required this.view}); final String view;
  @override ConsumerState<_AppointmentList> createState() => _AppointmentListState();
}

class _AppointmentListState extends ConsumerState<_AppointmentList> {
  int refreshKey = 0;
  Future<(List<dynamic>, String?)> load() async {
    final values = await Future.wait([ref.read(apiProvider).appointments(widget.view), ref.read(sessionProvider).role()]);
    return (values[0] as List<dynamic>, values[1] as String?);
  }

  @override Widget build(BuildContext context) => FutureBuilder<(List<dynamic>, String?)>(
    key: ValueKey(refreshKey), future: load(), builder: (context, snapshot) {
      if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
      final items = snapshot.data!.$1; final role = snapshot.data!.$2;
      if (items.isEmpty) return const Center(child: Text('No appointments here yet.',style:TextStyle(color:Colors.black54)));
      return ListView.separated(
        padding: const EdgeInsets.all(18), itemCount: items.length, separatorBuilder: (_,__) => const SizedBox(height:12),
        itemBuilder: (_, index) => _card(context, items[index] as Map<String,dynamic>, role),
      );
    },
  );

  Widget _card(BuildContext context, Map<String,dynamic> item, String? role) {
    final doctor = (item['doctor'] as Map<String,dynamic>)['user'] as Map<String,dynamic>;
    final start = DateTime.parse(item['startAt'] as String).toLocal();
    return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children:[Expanded(child:Text(doctor['displayName'] as String,style:const TextStyle(fontWeight:FontWeight.w700,fontSize:16))),_status(item['status'] as String)]),
      const SizedBox(height:8), Text(DateFormat('EEE, d MMM • hh:mm a').format(start)), const SizedBox(height:6),
      Text(item['publicId'] as String,style:const TextStyle(color:Colors.black54)),
      if (widget.view == 'upcoming') ...[const Divider(height:24), Wrap(spacing:10,runSpacing:8,children:[
        if (role == 'PATIENT') OutlinedButton(onPressed:()=>reschedule(item),child:const Text('Reschedule')),
        if (role == 'DOCTOR' && start.isBefore(DateTime.now())) FilledButton(onPressed:()=>complete(item['id'] as String),child:const Text('Mark completed')),
        OutlinedButton(onPressed:()=>cancel(item['id'] as String),child:const Text('Cancel')),
      ])],
    ])));
  }

  Future<void> reschedule(Map<String,dynamic> item) async {
    final date = await showDatePicker(context:context,firstDate:DateTime.now().add(const Duration(days:1)),lastDate:DateTime.now().add(const Duration(days:60)),initialDate:DateTime.now().add(const Duration(days:1)));
    if (date == null) return;
    final availability = await ref.read(apiProvider).availability(
      item['doctorId'] as String, DateFormat('yyyy-MM-dd').format(date), item['consultationType'] as String,
      clinicId: item['clinicId'] as String?,
    );
    final slots = (availability['slots'] as List<dynamic>? ?? []).where((value)=>(value as Map<String,dynamic>)['available']==true).toList();
    if (!mounted) return;
    if (slots.isEmpty) { message('No slots are available on this date.'); return; }
    final selected = await showModalBottomSheet<String>(context:context,builder:(context)=>SafeArea(child:Padding(padding:const EdgeInsets.all(18),child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[const Text('Choose a new slot',style:TextStyle(fontWeight:FontWeight.w700,fontSize:18)),const SizedBox(height:14),Wrap(spacing:8,runSpacing:8,children:slots.map((value){final start=(value as Map<String,dynamic>)['startAt'] as String;return ActionChip(label:Text(DateFormat('hh:mm a').format(DateTime.parse(start).toLocal())),onPressed:()=>Navigator.pop(context,start));}).toList())]))));
    if (selected == null) return;
    try { await ref.read(apiProvider).rescheduleAppointment(item['id'] as String, selected, const Uuid().v4()); message('Appointment rescheduled.'); reload(); }
    catch (_) { message('That slot is no longer available.'); }
  }

  Future<void> complete(String id) async { try { await ref.read(apiProvider).completeAppointment(id); message('Appointment marked completed.'); reload(); } catch (_) { message('Appointment could not be completed.'); } }
  Future<void> cancel(String id) async { final accepted=await showDialog<bool>(context:context,builder:(context)=>AlertDialog(title:const Text('Cancel appointment?'),content:const Text('Refund processing will start automatically when applicable.'),actions:[TextButton(onPressed:()=>Navigator.pop(context,false),child:const Text('Keep')),FilledButton(onPressed:()=>Navigator.pop(context,true),child:const Text('Cancel appointment'))]));if(accepted!=true)return;try{await ref.read(apiProvider).cancelAppointment(id,'Cancelled from mobile app');message('Appointment cancelled.');reload();}catch(_){message('Appointment could not be cancelled.');} }
  void reload() { if (mounted) setState(() => refreshKey++); }
  void message(String value) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(value))); }
  Widget _status(String value) => Container(padding:const EdgeInsets.symmetric(horizontal:9,vertical:5),decoration:BoxDecoration(color:const Color(0xFFE4F6F2),borderRadius:BorderRadius.circular(99)),child:Text(value.replaceAll('_',' '),style:const TextStyle(fontSize:10,fontWeight:FontWeight.w700,color:Color(0xFF08766A))));
}

