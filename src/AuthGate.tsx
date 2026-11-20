import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import {
  describeAuthError,
  isFirebaseConfigured,
  logout,
  needsEmailVerification,
  refreshEmailVerified,
  resendVerificationEmail,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  watchUser,
} from './firebaseAuth';
import { APP_NAME } from './config/brand';

const FONT_STYLE = { fontFamily: "'Inter', 'Noto Sans KR', system-ui, sans-serif" };

/**
 * 로그인 게이트.
 * - Firebase 설정이 없고 프로덕션 빌드면 실패 닫힘(fail-closed): 앱을 열지 않습니다.
 * - 개발 환경에서 설정이 없으면 로그인 없이 앱을 엽니다(로컬 확인용).
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [, setTick] = useState(0);
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

  if (user && needsEmailVerification(user)) {
    return <VerifyEmailScreen email={user.email ?? ''} onVerified={() => setTick((t) => t + 1)} />;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-white px-6 text-[#191F28]" style={FONT_STYLE}>
        <header className="flex w-full items-center justify-between py-6">
          <span className="text-lg font-bold text-brand-600">{APP_NAME}</span>
        </header>

        <main className="flex flex-1 items-center justify-center pb-16">
          <div className="w-full max-w-sm">
            <p className="text-sm font-semibold text-brand-600">주문 정리는 {APP_NAME}에 맡기세요</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">로그인하고 시작해요</h1>
            <p className="mt-3 text-base leading-relaxed text-[#6B7684]">
              이메일로 가입하거나 Google 계정으로 로그인하세요.
            </p>

            <EmailAuthForm />

            <div className="my-7 flex items-center gap-3 text-sm text-[#8B95A1]">
              <span className="h-px flex-1 bg-[#E5E8EB]" />
              또는
              <span className="h-px flex-1 bg-[#E5E8EB]" />
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
              className="w-full rounded-xl border border-[#D1D6DB] bg-white px-4 py-4 text-base font-semibold text-[#191F28] transition-colors hover:bg-[#F7F8FA]"
            >
              Google로 로그인
            </button>
            {error && <p className="mt-4 text-sm text-[#D9434E]">{error}</p>}
          </div>
        </main>
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

  const inputClass =
    'w-full rounded-xl border border-[#D1D6DB] bg-white px-4 py-4 text-base text-[#191F28] outline-none placeholder:text-[#B0B8C1] focus:border-brand-600';

  return (
    <form onSubmit={submit} className="mt-8 space-y-3">
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="이메일"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
      <input
        type="password"
        required
        autoComplete={isSignup ? 'new-password' : 'current-password'}
        placeholder={isSignup ? '비밀번호 (6자 이상)' : '비밀번호'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={inputClass}
      />
      <button
        type="submit"
        disabled={busy}
        className="mt-2 w-full rounded-xl bg-brand-600 px-4 py-4 text-base font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {busy ? '처리 중...' : isSignup ? '회원가입' : '이메일로 로그인'}
      </button>
      {error && <p className="pt-1 text-sm text-[#D9434E]">{error}</p>}
      <p className="pt-3 text-center text-base text-[#6B7684]">
        {isSignup ? '이미 계정이 있나요?' : '처음이신가요?'}{' '}
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode(isSignup ? 'login' : 'signup');
          }}
          className="font-semibold text-brand-600 underline underline-offset-4"
        >
          {isSignup ? '로그인하기' : '회원가입하기'}
        </button>
      </p>
    </form>
  );
}

/** 가입 후 이메일 인증을 기다리는 화면. 인증이 확인되면 onVerified를 부릅니다. */
function VerifyEmailScreen({ email, onVerified }: { email: string; onVerified: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const ok = await refreshEmailVerified();
      if (ok) onVerified();
      else setError('아직 인증이 확인되지 않았어요. 메일의 링크를 누른 뒤 다시 눌러 주세요.');
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await resendVerificationEmail();
      setMessage('인증 메일을 다시 보냈어요. 메일함과 스팸함을 확인해 주세요.');
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white px-6 text-[#191F28]" style={FONT_STYLE}>
      <header className="flex w-full items-center justify-between py-6">
        <span className="text-lg font-bold text-brand-600">{APP_NAME}</span>
      </header>
      <main className="flex flex-1 items-center justify-center pb-16">
        <div className="w-full max-w-sm">
          <p className="text-sm font-semibold text-brand-600">이메일 인증이 필요해요</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">메일함을 확인해 주세요</h1>
          <p className="mt-3 text-base leading-relaxed text-[#6B7684]">
            <span className="font-semibold text-[#191F28]">{email}</span>로 인증 메일을 보냈어요. 메일의 링크를 누른 뒤 아래 버튼을 눌러 주세요.
          </p>

          <div className="mt-8 space-y-3">
            <button
              onClick={check}
              disabled={busy}
              className="w-full rounded-xl bg-brand-600 px-4 py-4 text-base font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? '확인 중...' : '인증했어요'}
            </button>
            <button
              onClick={resend}
              disabled={busy}
              className="w-full rounded-xl border border-[#D1D6DB] bg-white px-4 py-4 text-base font-semibold text-[#191F28] transition-colors hover:bg-[#F7F8FA] disabled:opacity-60"
            >
              인증 메일 다시 보내기
            </button>
          </div>

          {message && <p className="mt-4 text-sm text-brand-600">{message}</p>}
          {error && <p className="mt-4 text-sm text-[#D9434E]">{error}</p>}

          <p className="mt-8 text-center text-base text-[#6B7684]">
            다른 이메일로 가입하려면{' '}
            <button
              type="button"
              onClick={() => logout()}
              className="font-semibold text-brand-600 underline underline-offset-4"
            >
              로그아웃
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}

function Message({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center text-[#191F28]" style={FONT_STYLE}>
      <div>
        <p className="text-lg font-semibold">{title}</p>
        {desc && <p className="mt-2 text-base text-[#6B7684]">{desc}</p>}
      </div>
    </div>
  );
}
