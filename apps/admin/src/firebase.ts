import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const testAuthEnabled = import.meta.env.VITE_ENABLE_TEST_AUTH === 'true';
export const firebaseAuth = testAuthEnabled ? undefined : getAuth(getApps()[0] ?? initializeApp(config));
