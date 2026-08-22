const rawBaseUrl = process.env.STAGING_API_BASE_URL;
if (!rawBaseUrl) throw new Error('STAGING_API_BASE_URL is required, for example https://api-staging.example.com/api/v1');

const baseUrl = new URL(rawBaseUrl.endsWith('/') ? rawBaseUrl : `${rawBaseUrl}/`);
if (baseUrl.protocol !== 'https:' && process.env.ALLOW_INSECURE_SMOKE !== 'true') {
  throw new Error('Staging smoke tests require HTTPS. Set ALLOW_INSECURE_SMOKE=true only for local development.');
}

const getJson = async (url) => {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'CareBook-Staging-Smoke/1.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Smoke request failed with HTTP ${response.status} at ${url.pathname}`);
  return response.json();
};

const live = await getJson(new URL('health/live', baseUrl));
if (live.status !== 'ok' || live.service !== 'carebook-api') throw new Error('Liveness response contract failed');

const ready = await getJson(new URL('health/ready', baseUrl));
if (ready.status !== 'ready'
  || ready.dependencies?.postgresql?.status !== 'up'
  || ready.dependencies?.redis?.status !== 'up') {
  throw new Error('Readiness response contract failed');
}

const openApi = await getJson(new URL('/api/docs/openapi.json', baseUrl));
const paths = Object.keys(openApi.paths ?? {});
for (const requiredPath of ['/auth/otp/exchange', '/appointments', '/payments/webhooks/razorpay']) {
  if (!paths.some((path) => path.endsWith(requiredPath))) throw new Error(`OpenAPI is missing ${requiredPath}`);
}

console.log('CareBook staging smoke checks passed: liveness, PostgreSQL, Redis and OpenAPI contracts.');
