import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../shared/providers.dart';

class DoctorDashboardScreen extends ConsumerWidget {
  const DoctorDashboardScreen({super.key});
  @override Widget build(BuildContext context,WidgetRef ref)=>Scaffold(appBar:AppBar(title:const Text('Doctor dashboard'),actions:[IconButton(onPressed:()=>context.push('/profile'),icon:const Icon(Icons.person_outline))]),body:FutureBuilder<Map<String,dynamic>>(future:ref.read(apiProvider).doctorDashboard(),builder:(context,snapshot){if(!snapshot.hasData)return const Center(child:CircularProgressIndicator());final data=snapshot.data!;return ListView(padding:const EdgeInsets.all(18),children:[
    Text('Good morning, Doctor',style:Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight:FontWeight.w700)),const SizedBox(height:5),Text('Verification: ${(data['verificationStatus'] as String).replaceAll('_',' ')}',style:const TextStyle(color:Color(0xFF08766A),fontWeight:FontWeight.w600)),const SizedBox(height:20),
    GridView.count(crossAxisCount:2,shrinkWrap:true,physics:const NeverScrollableScrollPhysics(),crossAxisSpacing:12,mainAxisSpacing:12,childAspectRatio:1.35,children:[_metric('Today',data['todayAppointments'],Icons.today),_metric('Upcoming',data['upcomingAppointments'],Icons.calendar_month),_metric('Completed',data['completedAppointments'],Icons.task_alt),_metric('Gross earnings','₹${(data['grossEarningsPaise'] as int)~/100}',Icons.currency_rupee)]),
    const SizedBox(height:20),Card(child:Padding(padding:const EdgeInsets.all(18),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[const Text('Verification & profile',style:TextStyle(fontWeight:FontWeight.w700,fontSize:16)),const SizedBox(height:7),const Text('Complete professional details and upload authentic documents. Your profile remains hidden until an admin approves it.',style:TextStyle(color:Colors.black54,height:1.4)),const SizedBox(height:14),OutlinedButton.icon(onPressed:()=>context.push('/doctor-registration'),icon:const Icon(Icons.edit_document),label:const Text('Complete registration'))]))),
    const SizedBox(height:12),Card(child:ListTile(leading:const CircleAvatar(child:Icon(Icons.schedule)),title:const Text('Schedule management'),subtitle:Text('${(data['schedules'] as List<dynamic>).length} working windows configured'),trailing:const Icon(Icons.chevron_right),onTap:()=>context.push('/doctor-schedule'))),
    const SizedBox(height:12),FilledButton.icon(onPressed:()=>context.push('/appointments'),icon:const Icon(Icons.calendar_month),label:const Text('Manage appointments')),
  ]); }));
  Widget _metric(String label,Object? value,IconData icon)=>Card(child:Padding(padding:const EdgeInsets.all(15),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Icon(icon,color:const Color(0xFF08766A)),const Spacer(),Text('$value',style:const TextStyle(fontWeight:FontWeight.w700,fontSize:22)),Text(label,style:const TextStyle(color:Colors.black54))])));
}

