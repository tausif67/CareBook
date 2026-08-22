import { access, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const environmentPath = resolve(root, '.env.testing');
const templatePath = resolve(root, '.env.testing.example');
const action = process.argv[2] ?? 'up';

if (!['up', 'down', 'logs'].includes(action)) {
  throw new Error('Usage: node scripts/testing-release.mjs up|down|logs');
}

try {
  await access(environmentPath);
} catch {
  const postgresPassword = randomBytes(24).toString('hex');
  const generated = {
    DATABASE_URL: `postgresql://carebook:${postgresPassword}@postgres:5432/carebook?schema=public`,
    POSTGRES_PASSWORD: postgresPassword,
    JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
    LOCAL_OTP_CODE: String(randomInt(100000, 1000000)),
    TEST_ADMIN_PHONE_E164: `+919${randomInt(100000000, 1000000000)}`,
    RAZORPAY_WEBHOOK_SECRET: randomBytes(32).toString('base64url'),
    OBJECT_STORAGE_ACCESS_KEY: `carebook-${randomBytes(8).toString('hex')}`,
    OBJECT_STORAGE_SECRET_KEY: randomBytes(32).toString('base64url'),
  };
  let contents = await readFile(templatePath, 'utf8');
  for (const [key, value] of Object.entries(generated)) {
    contents = contents.replace(`${key}=GENERATED_BY_TESTING_UP`, `${key}=${value}`);
  }
  await writeFile(environmentPath, contents, { mode: 0o600 });
  console.log('Created .env.testing with unique local-only credentials.');
}

const environment = Object.fromEntries((await readFile(environmentPath, 'utf8'))
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1)]; }));

const composeArgs = ['compose', '--env-file', '.env.testing'];
if (action === 'up') composeArgs.push('up', '--build', '--detach');
if (action === 'down') composeArgs.push('down');
if (action === 'logs') composeArgs.push('logs', '--follow', 'api', 'worker');

const result = spawnSync('docker', composeArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error) throw new Error(`Docker could not start: ${result.error.message}`);
if (result.status !== 0) process.exit(result.status ?? 1);

if (action === 'up') {
  console.log('CareBook testing release started.');
  console.log('Admin: http://localhost:8080');
  console.log('API docs: http://localhost:4000/api/docs');
  console.log(`Admin number: ${environment.TEST_ADMIN_PHONE_E164} | Local OTP: ${environment.LOCAL_OTP_CODE}`);
}
