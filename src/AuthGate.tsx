import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import {
  describeAuthError,
  isFirebaseConfigured,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  watchUser,
} from './firebaseAuth';

/**
 * 로그인 게이트.
 * - Firebase 설정이 없고 프로덕션 빌드면 실패 닫힘(fail-closed): 앱을 열지 않습니다.
 * - 개발 환경에서 설정이 없으면 로그인 없이 앱을 엽니다(로컬 확인용).
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => watchUser(setUser), []);

  if (!isFirebaseConfigured) {
    if (import.meta.env.PROD) {
      return <Message title="로그인 설정이 필요합니다" desc="VITE_FIREBASE_* 환경변수를 설정한 뒤 다시 빌드해 주세요." />;
    }
    return <>{children}</>;
  }

  if (user === undefined) {
    return <Message title="확인 중..." />;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-md">
          <h1 className="text-lg font-semibold text-slate-900">Smart Delivery 로그인</h1>
          <p className="mt-2 text-sm text-slate-600">이메일로 가입하거나 Google 계정으로 로그인하세요.</p>
          <EmailAuthForm />
          <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            또는
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <button
            onClick={async () => {
              setError(null);
              try {
                await signInWithGoogle();
              } catch (e: any) {
                setError(e?.message || '로그인에 실패했습니다.');
              }
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Google로 로그인
          </button>
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** 이메일과 비밀번호로 로그인하거나 회원가입하는 폼. */
function EmailAuthForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSignup = mode === 'signup';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (isSignup && password.length < 6) {
      setError('비밀번호는 6자 이상이어야 해요.');
      return;
    }
    setBusy(true);
    try {
      if (isSignup) await signUpWithEmail(email, password);
      else await signInWithEmail(email, password);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="이메일"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
      />
      <input
        type="password"
        required
        autoComplete={isSignup ? 'new-password' : 'current-password'}
        placeholder={isSignup ? '비밀번호 (6자 이상)' : '비밀번호'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
      />
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? '처리 중...' : isSignup ? '회원가입' : '이메일로 로그인'}
      </button>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <p className="pt-1 text-center text-sm text-slate-600">
        {isSignup ? '이미 계정이 있나요?' : '처음이신가요?'}{' '}
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode(isSignup ? 'login' : 'signup');
          }}
          className="font-semibold text-slate-900 underline"
        >
          {isSignup ? '로그인하기' : '회원가입하기'}
        </button>
      </p>
    </form>
  );
}

function Message({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-center">
      <div>
        <p className="text-base font-semibold text-slate-900">{title}</p>
        {desc && <p className="mt-2 text-sm text-slate-600">{desc}</p>}
      </div>
    </div>
  );
}
