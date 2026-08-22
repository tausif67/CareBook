import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final controller = PageController();
  int index = 0;

  final pages = const <(String, String, IconData)>[
    (
      'Find trusted doctors',
      'Search approved doctors by specialty, clinic and area.',
      Icons.manage_search,
    ),
    (
      'Book appointments easily',
      'Choose a server-verified slot and pay securely.',
      Icons.calendar_month,
    ),
    (
      'Healthcare in one place',
      'Appointments, reminders and profiles—kept simple.',
      Icons.health_and_safety_outlined,
    ),
  ];

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: PageView(
                  controller: controller,
                  onPageChanged: (value) => setState(() => index = value),
                  children: pages
                      .map(
                        (page) => Padding(
                          padding: const EdgeInsets.all(32),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                width: 132,
                                height: 132,
                                decoration: BoxDecoration(
                                  color: const Color(0xFFE4F6F2),
                                  borderRadius: BorderRadius.circular(40),
                                ),
                                child: Icon(
                                  page.$3,
                                  size: 66,
                                  color: const Color(0xFF08766A),
                                ),
                              ),
                              const SizedBox(height: 36),
                              Text(
                                page.$1,
                                textAlign: TextAlign.center,
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineSmall
                                    ?.copyWith(fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                page.$2,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: Colors.black54,
                                  fontSize: 16,
                                  height: 1.45,
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  pages.length,
                  (itemIndex) => Container(
                    width: itemIndex == index ? 22 : 8,
                    height: 8,
                    margin: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: itemIndex == index
                          ? const Color(0xFF08766A)
                          : Colors.black12,
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(22),
                child: FilledButton(
                  onPressed: () {
                    if (index < pages.length - 1) {
                      controller.nextPage(
                        duration: const Duration(milliseconds: 250),
                        curve: Curves.easeOut,
                      );
                    } else {
                      context.go('/login');
                    }
                  },
                  child: Text(index < pages.length - 1 ? 'Next' : 'Get started'),
                ),
              ),
            ],
          ),
        ),
      );
}
