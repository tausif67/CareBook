const env = process.env;
const failures = [];
const required = [
  'DATABASE_URL','REDIS_URL','JWT_ACCESS_SECRET','ADMIN_WEB_ORIGIN',
  'FIREBASE_PROJECT_ID','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY',
  'RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET',
  'OBJECT_STORAGE_BUCKET',
];
for (const key of required) if (!env[key]?.trim()) failures.push(`${key} is missing`);
if (env.NODE_ENV !== 'production') failures.push('NODE_ENV must be production');
if ((env.JWT_ACCESS_SECRET?.length ?? 0) < 64) failures.push('JWT_ACCESS_SECRET must contain at least 64 characters');
if (env.ALLOW_LOCAL_OTP === 'true') failures.push('ALLOW_LOCAL_OTP must be false');
if (env.ENABLE_TEST_PAYMENT === 'true') failures.push('ENABLE_TEST_PAYMENT must be false');
if (env.SEED_TEST_DATA === 'true') failures.push('SEED_TEST_DATA must be false');
if (env.ADMIN_WEB_ORIGIN && !env.ADMIN_WEB_ORIGIN.split(',').every((value) => value.trim().startsWith('https://'))) failures.push('Every ADMIN_WEB_ORIGIN must use HTTPS');
if (env.DATABASE_URL?.includes('localhost')) failures.push('Production DATABASE_URL must not use localhost');
if (env.OBJECT_STORAGE_ENDPOINT?.includes('localhost') || env.OBJECT_STORAGE_ENDPOINT?.includes('minio:9000')) failures.push('Production object storage must not use the local MinIO endpoint');
if (Boolean(env.OBJECT_STORAGE_ACCESS_KEY) !== Boolean(env.OBJECT_STORAGE_SECRET_KEY)) failures.push('Object storage access key and secret must be configured together');
if (failures.length) {
  console.error('CareBook production preflight failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('CareBook production environment preflight passed. No secret values were printed.');
