import 'package:crypto/crypto.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shared/providers.dart';

class DoctorRegistrationScreen extends ConsumerStatefulWidget {
  const DoctorRegistrationScreen({super.key});
  @override ConsumerState<DoctorRegistrationScreen> createState() => _DoctorRegistrationScreenState();
}

class _DoctorRegistrationScreenState extends ConsumerState<DoctorRegistrationScreen> {
  final registration = TextEditingController();
  final council = TextEditingController();
  final registrationYear = TextEditingController();
  final qualification = TextEditingController();
  final institution = TextEditingController();
  final experience = TextEditingController();
  final fee = TextEditingController();
  final about = TextEditingController();
  List<dynamic> specializations = [];
  List<dynamic> clinics = [];
  String? specializationId;
  String? clinicId;
  String documentType = 'MEDICAL_REGISTRATION';
  bool busy = false;
  final uploaded = <String>[];

  @override void initState() { super.initState(); Future.microtask(loadDirectories); }
  @override void dispose() { for (final item in [registration,council,registrationYear,qualification,institution,experience,fee,about]) { item.dispose(); } super.dispose(); }

  Future<void> loadDirectories() async {
    final api = ref.read(apiProvider);
    final values = await Future.wait([api.specializations(), api.clinics()]);
    if (!mounted) return;
    setState(() {
      specializations = values[0]; clinics = values[1];
      specializationId = specializations.isEmpty ? null : (specializations.first as Map<String,dynamic>)['id'] as String;
      clinicId = clinics.isEmpty ? null : (clinics.first as Map<String,dynamic>)['id'] as String;
    });
  }

  Future<void> upload() async {
    final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['pdf','jpg','jpeg','png'], withData: true);
    if (result == null) return;
    final file = result.files.single; final bytes = file.bytes;
    if (bytes == null || bytes.length > 10 * 1024 * 1024) { message('Choose a file smaller than 10 MB.'); return; }
    final extension = (file.extension ?? '').toLowerCase();
    final contentType = extension == 'pdf' ? 'application/pdf' : extension == 'png' ? 'image/png' : 'image/jpeg';
    setState(() => busy = true);
    try {
      await ref.read(apiProvider).uploadDoctorDocument(
        type: documentType, fileName: file.name, contentType: contentType,
        bytes: bytes, sha256: sha256.convert(bytes).toString(),
      );
      setState(() => uploaded.add(file.name)); message('Document uploaded securely.');
    } catch (_) { message('Document upload failed. Please retry.'); }
    finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> saveAndSubmit() async {
    if ([registration,council,registrationYear,qualification,institution,experience,fee].any((item) => item.text.trim().isEmpty) || specializationId == null) {
      message('Complete all professional fields first.'); return;
    }
    setState(() => busy = true);
    try {
      final api = ref.read(apiProvider);
      await api.updateDoctorProfile({
        'registrationNumber': registration.text.trim(), 'registrationCouncil': council.text.trim(),
        'registrationYear': int.parse(registrationYear.text), 'qualifications': [{'degree': qualification.text.trim(), 'institution': institution.text.trim()}],
        'experienceYears': int.parse(experience.text), 'about': about.text.trim(), 'languages': ['English','Hindi'],
        'clinicFeePaise': int.parse(fee.text) * 100, 'onlineEnabled': false,
        'specializationIds': [specializationId], if (clinicId != null) 'clinicId': clinicId,
      });
      await api.submitDoctorProfile(); message('Profile submitted for manual verification.');
    } catch (_) { message('Submission failed. Upload the required documents and check every field.'); }
    finally { if (mounted) setState(() => busy = false); }
  }

  void message(String value) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(value))); }

  @override Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Professional profile')),
    body: ListView(padding: const EdgeInsets.all(18), children: [
      const _Progress(), const SizedBox(height: 20),
      TextField(controller: registration, decoration: const InputDecoration(labelText: 'Medical registration number')), const SizedBox(height: 10),
      TextField(controller: council, decoration: const InputDecoration(labelText: 'Registration council')), const SizedBox(height: 10),
      TextField(controller: registrationYear, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Registration year')), const SizedBox(height: 10),
      TextField(controller: qualification, decoration: const InputDecoration(labelText: 'Qualification (e.g. MBBS, MD)')), const SizedBox(height: 10),
      TextField(controller: institution, decoration: const InputDecoration(labelText: 'Institution')), const SizedBox(height: 10),
      TextField(controller: experience, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Years of experience')), const SizedBox(height: 10),
      TextField(controller: fee, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Clinic consultation fee in ₹')), const SizedBox(height: 10),
      TextField(controller: about, maxLines: 3, decoration: const InputDecoration(labelText: 'About your practice')), const SizedBox(height: 10),
      if (specializations.isNotEmpty) DropdownButtonFormField<String>(initialValue: specializationId, items: specializations.map((value) { final item=value as Map<String,dynamic>; return DropdownMenuItem(value:item['id'] as String,child:Text(item['nameEn'] as String)); }).toList(), onChanged:(value)=>setState(()=>specializationId=value), decoration:const InputDecoration(labelText:'Primary specialization')),
      const SizedBox(height: 10),
      if (clinics.isNotEmpty) DropdownButtonFormField<String>(initialValue: clinicId, items: clinics.map((value) { final item=value as Map<String,dynamic>; return DropdownMenuItem(value:item['id'] as String,child:Text(item['name'] as String)); }).toList(), onChanged:(value)=>setState(()=>clinicId=value), decoration:const InputDecoration(labelText:'Clinic')),
      const SizedBox(height: 16),
      Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Verification documents', style: TextStyle(fontWeight: FontWeight.w700)), const SizedBox(height: 6),
        const Text('Upload authentic PDF/JPG/PNG files. Files are encrypted and visible only to authorised verification staff.', style: TextStyle(color: Colors.black54)), const SizedBox(height: 12),
        DropdownButtonFormField<String>(initialValue: documentType, items: const [
          DropdownMenuItem(value:'MEDICAL_REGISTRATION',child:Text('Medical registration')),
          DropdownMenuItem(value:'QUALIFICATION',child:Text('Qualification proof')),
          DropdownMenuItem(value:'GOVERNMENT_ID',child:Text('Government ID')),
          DropdownMenuItem(value:'CLINIC_PROOF',child:Text('Clinic proof')),
        ], onChanged:(value)=>setState(()=>documentType=value!), decoration:const InputDecoration(labelText:'Document type')),
        const SizedBox(height: 10),
        OutlinedButton.icon(onPressed: busy ? null : upload, icon: const Icon(Icons.upload_file), label: Text(busy ? 'Please wait…' : 'Upload document')),
        ...uploaded.map((name) => ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.verified,color:Color(0xFF08766A)), title: Text(name), subtitle: const Text('Upload verified'))),
      ]))),
      const SizedBox(height: 18),
      FilledButton(onPressed: busy ? null : saveAndSubmit, child: Text(busy ? 'Please wait…' : 'Save & submit for verification')),
    ]),
  );
}

class _Progress extends StatelessWidget {
  const _Progress();
  @override Widget build(BuildContext context) => const Row(children: [
    CircleAvatar(backgroundColor: Color(0xFF08766A),foregroundColor:Colors.white,child:Text('1')),
    Expanded(child:Divider()), CircleAvatar(child:Text('2')), Expanded(child:Divider()), CircleAvatar(child:Text('3')),
  ]);
}
