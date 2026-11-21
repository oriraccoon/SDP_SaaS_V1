import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Check, Megaphone } from 'lucide-react';
import { APP_NAME, FREE_TRIAL_DAYS, PLANS } from './config/brand';
import { getCurrentUid, getCurrentUser, isFirebaseConfigured, logout } from './firebaseAuth';
import {
  isAdminUser,
  resolveFeatures,
  resolveStatus,
  subscribeAccount,
  subscribeNotice,
  touchAccount,
  startFreeTrial,
  canStartTrial,
  trialEndsAtMs,
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
    // 이용이 중지된 계정은 안내만, 신규 가입자와 기간이 끝난 회원은 구독권 화면을 봅니다.
    if (status === 'blocked') return <ExpiredScreen status={status} account={account} />;
    return <PlanScreen account={account} />;
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

/** 구독하지 않은 회원(신규 가입, 기간 만료)에게 보여 주는 구독권 선택 화면. 결제는 아직 연결하지 않았습니다. */
function PlanScreen({ account }: { account: Account | null }) {
  const [notice, setNotice] = useState<string | null>(null);
  const trialAvailable = canStartTrial(account);
  const trialEnded = trialEndsAtMs(account) !== null && !account?.expiresAt;
  async function startFree() {
    if (!trialAvailable) return;
    const uid = getCurrentUid();
    if (!uid) return;
    try {
      await startFreeTrial(uid);
    } catch (err) {
      setNotice('무료 체험을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }
  return (
    <div className="flex min-h-screen flex-col bg-white px-6 text-[#191F28]" style={{ fontFamily: "'Inter', 'Noto Sans KR', system-ui, sans-serif" }}>
      <header className="flex w-full items-center justify-between py-6">
        <span className="text-lg font-bold text-brand-600">{APP_NAME}</span>
      </header>
      <main className="flex flex-1 flex-col items-center pb-16">
        <div className="w-full max-w-4xl">
          <p className="text-sm font-semibold text-brand-600">구독 플랜</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">{trialEnded ? `무료 체험 ${FREE_TRIAL_DAYS}일이 끝났어요` : '나에게 맞는 플랜을 골라 주세요'}</h1>
          <p className="mt-3 text-base leading-relaxed text-[#6B7684]">
            {trialEnded ? '계속 쓰려면 플랜을 골라 주세요. ' : ''}지금은 플랜 화면만 준비되어 있어요. 결제는 아직 연결되지 않아 관리자에게 문의해 주세요.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.name} className="flex flex-col rounded-2xl border border-[#E5E8EB] bg-white p-6">
                <p className="text-base font-semibold text-[#191F28]">{plan.name}</p>
                <p className="mt-1 text-sm text-[#6B7684]">{plan.desc}</p>
                <p className="mt-5 text-3xl font-bold">
                  {plan.price === 0 ? '0원' : `${plan.price.toLocaleString('ko-KR')}원`}
                  <span className="ml-1 text-sm font-medium text-[#8B95A1]">{plan.price === 0 ? `/ ${FREE_TRIAL_DAYS}일` : '/ 월'}</span>
                </p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[#4E5968]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => (plan.price === 0 ? startFree() : setNotice('결제는 준비 중입니다. 관리자에게 문의해 주세요.'))}
                  disabled={plan.price === 0 && !trialAvailable}
                  className={`mt-6 w-full rounded-xl px-4 py-3.5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    plan.price === 0
                      ? 'border border-[#D1D6DB] text-[#191F28] hover:bg-[#F7F8FA] disabled:hover:bg-transparent'
                      : 'bg-brand-600 text-white hover:bg-brand-700'
                  }`}
                >
                  {plan.price === 0 ? (trialAvailable ? `${FREE_TRIAL_DAYS}일 무료로 시작` : '무료 체험을 이미 썼어요') : '이 플랜 선택'}
                </button>
              </div>
            ))}
          </div>

          {notice && <p className="mt-6 text-center text-base text-brand-600">{notice}</p>}

          <p className="mt-10 text-center text-base text-[#6B7684]">
            다른 계정으로 쓰고 싶다면{' '}
            <button type="button" onClick={() => logout()} className="font-semibold text-brand-600 underline underline-offset-4">
              로그아웃
            </button>
          </p>
        </div>
      </main>
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
          className="mt-8 w-full rounded-xl bg-brand-600 px-4 py-4 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
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

