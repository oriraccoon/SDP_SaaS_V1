import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Megaphone } from 'lucide-react';
import { getCurrentUser, isFirebaseConfigured, logout } from './firebaseAuth';
import {
  isAdminUser,
  resolveFeatures,
  resolveStatus,
  subscribeAccount,
  subscribeNotice,
  touchAccount,
  type Account,
  type AccountStatus,
  type FeatureKey,
  type Notice,
} from './lib/account';

interface AccountContextValue {
  account: Account | null;
  isAdmin: boolean;
  features: Record<FeatureKey, boolean>;
}

const AccountContext = createContext<AccountContextValue>({
  account: null,
  isAdmin: true,
  features: resolveFeatures(null),
});

/** 현재 회원의 기능 사용 가능 여부를 가져옵니다. */
export function useAccount(): AccountContextValue {
  return useContext(AccountContext);
}

/**
 * 로그인 후 회원 상태를 확인합니다.
 * - 관리자는 항상 통과합니다.
 * - 구독 기간이 없거나 끝났거나 정지된 회원은 만료 안내 화면을 봅니다.
 * - Firebase 설정이 없는 로컬 개발 환경에서는 제한 없이 엽니다.
 */
export default function AccountGate({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => (isFirebaseConfigured ? subscribeNotice(setNotice) : undefined), []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsAdmin(true);
      setLoaded(true);
      return;
    }
    const user = getCurrentUser();
    if (!user) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        await touchAccount(user);
        const admin = await isAdminUser(user.uid);
        if (cancelled) return;
        setIsAdmin(admin);
        unsubscribe = subscribeAccount(user.uid, (acc) => {
          setAccount(acc);
          setLoaded(true);
        });
      } catch (err: any) {
        console.warn('회원 정보 확인 실패:', err);
        if (!cancelled) {
          setError('회원 정보를 확인하지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.');
          setLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  if (!loaded) {
    return <Message title="회원 정보를 확인하는 중..." />;
  }

  if (error) {
    return <FailureScreen message={error} />;
  }

  const status: AccountStatus = isAdmin ? 'active' : resolveStatus(account);
  if (status !== 'active') {
    return <ExpiredScreen status={status} account={account} />;
  }

  const features = resolveFeatures(account);
  return (
    <AccountContext.Provider value={{ account, isAdmin: Boolean(isAdmin), features }}>
      {notice?.active && notice.text && <NoticeBanner text={notice.text} />}
      {children}
    </AccountContext.Provider>
  );
}

function NoticeBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 border-b border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs text-indigo-900">
      <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
      <p className="whitespace-pre-line leading-relaxed">{text}</p>
    </div>
  );
}

function ExpiredScreen({ status, account }: { status: AccountStatus; account: Account | null }) {
  const titles: Record<AccountStatus, string> = {
    active: '',
    new: '구독 기간이 아직 등록되지 않았습니다',
    expired: '구독 기간이 끝났습니다',
    blocked: '이용이 중지된 계정입니다',
  };
  const descs: Record<AccountStatus, string> = {
    active: '',
    new: '이용을 시작하려면 관리자에게 문의해 주세요.',
    expired: '계속 사용하려면 관리자에게 연장을 요청해 주세요.',
    blocked: '자세한 내용은 관리자에게 문의해 주세요.',
  };
  const expires = account?.expiresAt
    ? new Date(account.expiresAt).toLocaleDateString('ko-KR')
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-md">
        <h1 className="text-lg font-semibold text-slate-900">{titles[status]}</h1>
        <p className="mt-2 text-sm text-slate-600">{descs[status]}</p>
        {expires && status === 'expired' && (
          <p className="mt-2 text-xs text-slate-500">만료일: {expires}</p>
        )}
        <button
          onClick={() => logout()}
          className="mt-6 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}

/** 회원 정보 확인에 실패했을 때: 로그아웃하고 처음 화면(랜딩)으로 보냅니다. */
function FailureScreen({ message }: { message: string }) {
  const [busy, setBusy] = useState(false);
  async function goHome() {
    setBusy(true);
    try {
      await logout();
    } catch (err) {
      console.warn("로그아웃 실패:", err);
    }
    window.location.href = "/";
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
      <div className="w-full max-w-sm">
        <p className="text-lg font-semibold text-[#191F28]">확인 실패</p>
        <p className="mt-3 text-base leading-relaxed text-[#6B7684]">{message}</p>
        <button
          onClick={goHome}
          disabled={busy}
          className="mt-8 w-full rounded-xl bg-[#1E5B4A] px-4 py-4 text-base font-semibold text-white hover:bg-[#184A3C] disabled:opacity-60"
        >
          {busy ? "이동 중..." : "처음 화면으로 돌아가기"}
        </button>
      </div>
    </div>
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

