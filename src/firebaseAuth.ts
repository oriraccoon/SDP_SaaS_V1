import { initializeApp, type FirebaseApp } from 'firebase/app';
import { markSignedIn } from './lib/signedInFlag';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
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
  return onAuthStateChanged(a, (user) => {
    markSignedIn(Boolean(user));
    callback(user);
  });
}

export async function signInWithGoogle(): Promise<void> {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase 설정이 없습니다.');
  await signInWithPopup(a, new GoogleAuthProvider());
}

/** 이메일과 비밀번호로 로그인. */
export async function signInWithEmail(email: string, password: string): Promise<void> {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase 설정이 없습니다.');
  await signInWithEmailAndPassword(a, email.trim(), password);
}

/** 이메일과 비밀번호로 회원가입. 가입과 동시에 로그인되고, 인증 메일을 보냅니다. */
export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase 설정이 없습니다.');
  const cred = await createUserWithEmailAndPassword(a, email.trim(), password);
  await sendEmailVerification(cred.user);
}

/** 인증 메일을 다시 보냅니다. */
export async function resendVerificationEmail(): Promise<void> {
  const u = getCurrentUser();
  if (!u) throw new Error('로그인 상태가 아니에요.');
  await sendEmailVerification(u);
}

/** 인증 완료 여부를 서버에서 다시 확인합니다. 인증되었으면 true. */
export async function refreshEmailVerified(): Promise<boolean> {
  const u = getCurrentUser();
  if (!u) return false;
  await u.reload();
  if (u.emailVerified) {
    // 보안 규칙은 토큰의 email_verified 값을 보므로, 새 토큰을 받아 둬야 회원 정보 저장이 통과합니다.
    await u.getIdToken(true);
  }
  return u.emailVerified;
}

/** 이메일/비밀번호로 가입한 계정인지. 구글 로그인 계정은 제외합니다. */
export function needsEmailVerification(user: User): boolean {
  const usesPassword = user.providerData.some((p) => p.providerId === 'password');
  return usesPassword && !user.emailVerified;
}

/** Firebase 오류 코드를 사용자에게 보여 줄 문장으로 바꿉니다. */
export function describeAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-email': '이메일 형식이 맞지 않아요.',
    'auth/missing-password': '비밀번호를 입력해 주세요.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 해요.',
    'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요.',
    'auth/wrong-password': '이메일 또는 비밀번호가 맞지 않아요.',
    'auth/user-not-found': '이메일 또는 비밀번호가 맞지 않아요.',
    'auth/too-many-requests': '잠시 후 다시 시도해 주세요.',
    'auth/network-request-failed': '네트워크 연결을 확인해 주세요.',
    'auth/operation-not-allowed': '이메일 로그인이 아직 켜져 있지 않아요. 관리자에게 알려 주세요.',
    'auth/popup-closed-by-user': '로그인 창이 닫혔어요.',
  };
  return map[code] ?? '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.';
}

export async function logout(): Promise<void> {
  const a = getFirebaseAuth();
  try {
    if (a) await signOut(a);
  } finally {
    markSignedIn(false);
    // 로그아웃하면 처음 화면(랜딩)으로 보냅니다. 랜딩에서 눌러도 새로 불러와서 바뀐 화면이 바로 보입니다.
    window.location.assign('/');
  }
}
