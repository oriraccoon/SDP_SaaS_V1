import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';

// 웹 앱 설정값은 공개되어도 되는 값이지만, 환경변수로 관리합니다 (.env.local, Cloudflare 빌드 변수).
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function getFirebaseAuth(): Auth | null {
  if (!isFirebaseConfigured) return null;
  if (!app) app = initializeApp(config);
  if (!auth) auth = getAuth(app);
  return auth;
}

export function watchUser(callback: (user: User | null) => void): () => void {
  const a = getFirebaseAuth();
  if (!a) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(a, callback);
}

export async function signInWithGoogle(): Promise<void> {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase 설정이 없습니다.');
  await signInWithPopup(a, new GoogleAuthProvider());
}

export async function logout(): Promise<void> {
  const a = getFirebaseAuth();
  if (a) await signOut(a);
}
