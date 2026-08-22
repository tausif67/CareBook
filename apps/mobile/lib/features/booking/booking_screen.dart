import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:uuid/uuid.dart';
import '../../core/config/app_config.dart';
import '../../shared/providers.dart';

class BookingScreen extends ConsumerStatefulWidget {
  const BookingScreen({required this.doctorId, super.key}); final String doctorId;
  @override ConsumerState<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends ConsumerState<BookingScreen> {
  final razorpay = Razorpay(); final name = TextEditingController(); final age = TextEditingController(); final phone = TextEditingController(text: '+91'); final reason = TextEditingController();
  DateTime date = DateTime.now().add(const Duration(days: 1)); String type = 'CLINIC'; String? clinicId; String? slot; Map<String, dynamic>? doctor; List<dynamic> slots = []; bool loading = true; String gender = 'Male';
  @override void initState() { super.initState(); razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, (_) => context.go('/appointments')); razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse response) => _message(response.message ?? 'Payment failed')); Future.microtask(loadDoctor); }
  @override void dispose() { razorpay.clear(); name.dispose(); age.dispose(); phone.dispose(); reason.dispose(); super.dispose(); }

  Future<void> loadDoctor() async { final data = await ref.read(apiProvider).doctor(widget.doctorId); final clinics = data['clinics'] as List<dynamic>? ?? []; clinicId = clinics.isEmpty ? null : (clinics.first as Map<String,dynamic>)['clinicId'] as String?; doctor = data; await loadSlots(); }
  Future<void> loadSlots() async { setState(() { loading = true; slot = null; }); final data = await ref.read(apiProvider).availability(widget.doctorId, DateFormat('yyyy-MM-dd').format(date), type, clinicId: type == 'CLINIC' ? clinicId : null); if (mounted) setState(() { slots = data['slots'] as List<dynamic>? ?? []; loading = false; }); }
  Future<void> book() async {
    if (slot == null || name.text.isEmpty || age.text.isEmpty || reason.text.length < 3) { _message('Complete patient details and select a slot.'); return; }
    setState(() => loading = true);
    try {
      final appointment = await ref.read(apiProvider).book({
        'doctorId': widget.doctorId, if (type == 'CLINIC') 'clinicId': clinicId, 'consultationType': type, 'startAt': slot,
        'patientName': name.text.trim(), 'patientAge': int.parse(age.text), 'patientGender': gender, 'patientPhoneE164': phone.text.trim(),
        'reasonForVisit': reason.text.trim(), 'paymentMode': 'ONLINE', 'idempotencyKey': const Uuid().v4(),
      });
      if (AppConfig.testMode) {
        await ref.read(apiProvider).confirmTestPayment(appointment['id'] as String);
        _message('Test payment successful. No real money was charged.');
        if (mounted) context.go('/appointments');
        return;
      }
      final order = await ref.read(apiProvider).paymentOrder(appointment['id'] as String); final payment = order['payment'] as Map<String,dynamic>;
      razorpay.open({'key': order['keyId'], 'order_id': payment['gatewayOrderId'], 'amount': payment['amountPaise'], 'currency': 'INR', 'name': 'CareBook', 'description': appointment['publicId'], 'prefill': {'contact': phone.text.trim(), 'name': name.text.trim()}, 'theme': {'color': '#08766A'}});
    } catch (_) { _message('Booking could not be completed. The slot may have been taken.'); } finally { if (mounted) setState(() => loading = false); }
  }
  void _message(String value) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(value))); }

  @override Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Book appointment')), body: doctor == null ? const Center(child: CircularProgressIndicator()) : ListView(padding: const EdgeInsets.all(18), children: [
    Text('Consultation type', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)), const SizedBox(height: 10),
    SegmentedButton<String>(segments: [const ButtonSegment(value:'CLINIC',icon:Icon(Icons.local_hospital_outlined),label:Text('Clinic visit')), if (doctor!['onlineEnabled'] == true) const ButtonSegment(value:'ONLINE',icon:Icon(Icons.videocam_outlined),label:Text('Online'))], selected:{type}, onSelectionChanged:(value){type=value.first;loadSlots();}),
    const SizedBox(height: 22), Text('Select date', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)), const SizedBox(height: 10),
    SizedBox(height:76,child:ListView.separated(scrollDirection:Axis.horizontal,itemCount:7,separatorBuilder:(_,__)=>const SizedBox(width:8),itemBuilder:(_,index){final item=DateTime.now().add(Duration(days:index+1));final selected=DateUtils.isSameDay(item,date);return ChoiceChip(selected:selected,label:Column(mainAxisAlignment:MainAxisAlignment.center,children:[Text(DateFormat('EEE').format(item)),Text(DateFormat('d MMM').format(item),style:const TextStyle(fontWeight:FontWeight.w700))]),onSelected:(_){date=item;loadSlots();});})),
    const SizedBox(height: 22), Text('Available slots', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)), const SizedBox(height: 10),
    if(loading) const Center(child:Padding(padding:EdgeInsets.all(18),child:CircularProgressIndicator())) else if(slots.isEmpty) const Text('No slots are available on this date.',style:TextStyle(color:Colors.black54)) else Wrap(spacing:8,runSpacing:8,children:slots.map((value){final item=value as Map<String,dynamic>;final start=item['startAt'] as String;final enabled=item['available']==true;return ChoiceChip(label:Text(DateFormat('hh:mm a').format(DateTime.parse(start).toLocal())),selected:slot==start,onSelected:enabled?(_)=>setState(()=>slot=start):null);}).toList()),
    const SizedBox(height: 24), Text('Patient details', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)), const SizedBox(height: 10),
    TextField(controller:name,decoration:const InputDecoration(labelText:'Patient name')),const SizedBox(height:10),Row(children:[Expanded(child:TextField(controller:age,keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'Age'))),const SizedBox(width:10),Expanded(child:DropdownButtonFormField(initialValue:gender,items:['Male','Female','Other'].map((x)=>DropdownMenuItem(value:x,child:Text(x))).toList(),onChanged:(value)=>gender=value!,decoration:const InputDecoration(labelText:'Gender')))]),const SizedBox(height:10),
    TextField(controller:phone,keyboardType:TextInputType.phone,decoration:const InputDecoration(labelText:'Phone')),const SizedBox(height:10),TextField(controller:reason,maxLength:500,maxLines:3,decoration:const InputDecoration(labelText:'Reason for visit')),const SizedBox(height:14),
    Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(children:[_row('Consultation fee','₹${(doctor!['clinicFeePaise'] as int)~/100}'),const Divider(),Text(AppConfig.testMode ? 'Test payment only. No real money will be charged.' : 'Final platform fee, discounts and total are calculated securely by the server.',style:const TextStyle(fontSize:12,color:Colors.black54))]))),const SizedBox(height:16),FilledButton(onPressed:loading?null:book,child:Text(AppConfig.testMode ? 'Confirm test payment' : 'Continue to secure payment')),const SizedBox(height:24),
  ]));
  Widget _row(String label,String value)=>Row(mainAxisAlignment:MainAxisAlignment.spaceBetween,children:[Text(label),Text(value,style:const TextStyle(fontWeight:FontWeight.w700))]);
}
