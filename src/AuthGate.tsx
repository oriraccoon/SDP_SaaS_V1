import { useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { isFirebaseConfigured, signInWithGoogle, watchUser } from './firebaseAuth';

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
          <p className="mt-2 text-sm text-slate-600">계속하려면 Google 계정으로 로그인하세요.</p>
          <button
            onClick={async () => {
              setError(null);
              try {
                await signInWithGoogle();
              } catch (e: any) {
                setError(e?.message || '로그인에 실패했습니다.');
              }
            }}
            className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
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
