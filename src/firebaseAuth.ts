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

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null;
  if (!app) app = initializeApp(config);
  return app;
}

function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!auth) auth = getAuth(firebaseApp);
  return auth;
}

/** 로그인한 사용자 정보. 로그인 전이거나 Firebase 설정이 없으면 null. */
export function getCurrentUser(): User | null {
  return getFirebaseAuth()?.currentUser ?? null;
}

/** 로그인한 계정의 ID. 로그인 전이거나 Firebase 설정이 없으면 null. */
export function getCurrentUid(): string | null {
  return getFirebaseAuth()?.currentUser?.uid ?? null;
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
