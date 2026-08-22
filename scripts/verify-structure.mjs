import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const required = [
  'apps/api/src/main.ts',
  'apps/api/src/health/health.controller.ts',
  'apps/api/prisma/schema.prisma',
  'apps/api/prisma/migrations/0001_init/migration.sql',
  'apps/api/test/core.e2e-spec.ts',
  'apps/admin/src/App.tsx',
  'apps/mobile/lib/main.dart',
  'apps/mobile/test/app_config_test.dart',
  'apps/mobile/tool/test_AndroidManifest.xml',
  'docs/architecture.md',
  'docs/security.md',
  'scripts/staging-smoke.mjs',
  'scripts/testing-release.mjs',
  '.github/workflows/ci.yml',
  '.github/workflows/android-test-apk.yml',
  '.dockerignore',
  '.env.example',
  '.env.testing.example',
];

await Promise.all(required.map((path) => access(resolve(root, path))));
const env = await readFile(resolve(root, '.env.example'), 'utf8');
for (const key of ['DATABASE_URL', 'REDIS_URL', 'RAZORPAY_WEBHOOK_SECRET']) {
  if (!env.includes(`${key}=`)) throw new Error(`Missing ${key}`);
}
console.log(`CareBook structure verified (${required.length} required artifacts).`);
