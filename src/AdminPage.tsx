import { useEffect, useState } from 'react';
import { getCurrentUser, isFirebaseConfigured } from './firebaseAuth';
import {
  FEATURE_LABELS,
  isAdminUser,
  listAccounts,
  listReports,
  resolveFeatures,
  resolveStatus,
  saveNotice,
  setReportStatus,
  subscribeNotice,
  updateAccount,
  type Account,
  type FeatureKey,
  type FeedbackReport,
} from './lib/account';

type Tab = 'members' | 'reports' | 'notice';

const DAY = 24 * 60 * 60 * 1000;

/** 기간 연장: 지금 남은 기간이 있으면 그 뒤에, 없으면 지금부터 더합니다. */
function extendDays(account: Account, days: number): string {
  const base = Math.max(Date.now(), account.expiresAt ? new Date(account.expiresAt).getTime() : 0);
  return new Date(base + days * DAY).toISOString();
}

export default function AdminPage() {
  const [checked, setChecked] = useState<'checking' | 'admin' | 'denied'>('checking');
  const [tab, setTab] = useState<Tab>('members');

  useEffect(() => {
    if (!isFirebaseConfigured) return setChecked('denied');
    const user = getCurrentUser();
    if (!user) return setChecked('denied');
    isAdminUser(user.uid).then((ok) => setChecked(ok ? 'admin' : 'denied')).catch(() => setChecked('denied'));
  }, []);

  if (checked === 'checking') return <Center text="권한 확인 중..." />;
  if (checked === 'denied') {
    return <Center text="관리자만 볼 수 있는 화면입니다." desc="관리자 계정으로 로그인했는지 확인해 주세요." />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-base font-bold">관리자 화면</h1>
          <a href="/app" className="text-xs font-semibold text-indigo-600 hover:underline">앱으로 돌아가기</a>
        </div>
      </header>

      <nav className="mx-auto mt-4 flex max-w-5xl gap-2 px-4">
        {(
          [
            ['members', '회원 관리'],
            ['reports', '신고 내용'],
            ['notice', '공지 배너'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              tab === key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="mx-auto max-w-5xl space-y-4 p-4">
        {tab === 'members' && <MembersTab />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'notice' && <NoticeTab />}
      </main>
    </div>
  );
}

function Center({ text, desc }: { text: string; desc?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-center">
      <div>
        <p className="text-base font-semibold text-slate-900">{text}</p>
        {desc && <p className="mt-2 text-sm text-slate-600">{desc}</p>}
      </div>
    </div>
  );
}

function MembersTab() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = () => listAccounts().then(setAccounts).catch((e) => setMessage(String(e?.message || e)));
  useEffect(() => {
    reload();
  }, []);

  const run = async (uid: string, action: () => Promise<void>, doneText: string) => {
    setBusy(uid);
    setMessage(null);
    try {
      await action();
      setMessage(doneText);
      await reload();
    } catch (e: any) {
      setMessage(`실패: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">회원 {accounts.length}명</p>
        <button onClick={reload} className="text-xs font-semibold text-indigo-600 hover:underline">새로고침</button>
      </div>
      {message && <p className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs text-slate-700">{message}</p>}

      {accounts.map((acc) => {
        const status = resolveStatus(acc);
        const features = resolveFeatures(acc);
        const statusLabel = { active: '사용 중', new: '기간 미등록', expired: '기간 만료', blocked: '정지' }[status];
        const statusColor = {
          active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          new: 'bg-slate-100 text-slate-600 border-slate-200',
          expired: 'bg-amber-50 text-amber-700 border-amber-200',
          blocked: 'bg-rose-50 text-rose-700 border-rose-200',
        }[status];

        return (
          <div key={acc.uid} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold">{acc.email || '(이메일 없음)'}</p>
                <p className="text-[11px] text-slate-500">
                  마지막 접속: {acc.lastLoginAt ? new Date(acc.lastLoginAt).toLocaleString('ko-KR') : '-'}
                  {' · '}만료일: {acc.expiresAt ? new Date(acc.expiresAt).toLocaleDateString('ko-KR') : '-'}
                </p>
              </div>
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${statusColor}`}>{statusLabel}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {[30, 365].map((days) => (
                <button
                  key={days}
                  disabled={busy === acc.uid}
                  onClick={() => run(acc.uid, () => updateAccount(acc.uid, { expiresAt: extendDays(acc, days) }), `기간 ${days === 30 ? '1개월' : '1년'} 연장했습니다.`)}
                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                >
                  {days === 30 ? '+1개월' : '+1년'}
                </button>
              ))}
              <button
                disabled={busy === acc.uid}
                onClick={() => {
                  const v = window.prompt('만료일을 입력하세요 (예: 2027-06-30). 비우면 기간을 지웁니다.', acc.expiresAt ? acc.expiresAt.slice(0, 10) : '');
                  if (v === null) return;
                  const expiresAt = v.trim() ? new Date(`${v.trim()}T23:59:59`).toISOString() : null;
                  run(acc.uid, () => updateAccount(acc.uid, { expiresAt }), '만료일을 저장했습니다.');
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                날짜 직접 입력
              </button>
              <button
                disabled={busy === acc.uid}
                onClick={() => run(acc.uid, () => updateAccount(acc.uid, { blocked: !acc.blocked }), acc.blocked ? '정지를 풀었습니다.' : '이용을 정지했습니다.')}
                className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                {acc.blocked ? '정지 해제' : '이용 정지'}
              </button>
            </div>

            <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-3">
              {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => (
                <label key={key} className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={features[key]}
                    disabled={busy === acc.uid}
                    onChange={(e) =>
                      run(
                        acc.uid,
                        () => updateAccount(acc.uid, { features: { ...acc.features, [key]: e.target.checked } }),
                        '기능 설정을 저장했습니다.',
                      )
                    }
                  />
                  {FEATURE_LABELS[key]}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

const REPORT_STATUS: Record<NonNullable<FeedbackReport['status']>, string> = {
  new: '접수',
  working: '확인 중',
  done: '완료',
};

function ReportsTab() {
  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const reload = () => listReports().then(setReports).catch((e) => setMessage(String(e?.message || e)));
  useEffect(() => {
    reload();
  }, []);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">신고 {reports.length}건</p>
        <button onClick={reload} className="text-xs font-semibold text-indigo-600 hover:underline">새로고침</button>
      </div>
      {message && <p className="text-xs text-rose-600">{message}</p>}

      {reports.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              <b className="text-slate-800">[{r.category}]</b> {r.email || '(이메일 없음)'}
              {' · '}
              {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('ko-KR') : '-'}
              {r.pageUrl ? ` · ${r.pageUrl}` : ''}
            </span>
            <select
              value={r.status ?? 'new'}
              onChange={async (e) => {
                const status = e.target.value as NonNullable<FeedbackReport['status']>;
                try {
                  await setReportStatus(r.id, status);
                  setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
                } catch (err: any) {
                  setMessage(`상태 변경 실패: ${err?.message || err}`);
                }
              }}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            >
              {(Object.keys(REPORT_STATUS) as (keyof typeof REPORT_STATUS)[]).map((k) => (
                <option key={k} value={k}>{REPORT_STATUS[k]}</option>
              ))}
            </select>
          </div>
          <p className="whitespace-pre-line text-sm text-slate-800">{r.message}</p>
        </div>
      ))}
    </section>
  );
}

function NoticeTab() {
  const [text, setText] = useState('');
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => subscribeNotice((n) => {
    setText(n?.text ?? '');
    setActive(Boolean(n?.active));
  }), []);

  const save = async () => {
    try {
      await saveNotice({ text, active });
      setMessage('공지를 저장했습니다. 회원 화면에 바로 반영됩니다.');
    } catch (e: any) {
      setMessage(`저장 실패: ${e?.message || e}`);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">모든 회원 화면 위쪽에 띄우는 안내 문구입니다.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="예: 3월 1일부터 택배사 양식이 추가됩니다."
        className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-none"
      />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        공지 띄우기
      </label>
      <div className="flex items-center gap-3">
        <button onClick={save} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700">
          저장
        </button>
        {message && <span className="text-xs text-slate-600">{message}</span>}
      </div>
    </section>
  );
}
