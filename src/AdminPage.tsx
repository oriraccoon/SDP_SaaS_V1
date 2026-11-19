import { useEffect, useState } from 'react';
import { loadFaqs, saveFaqs, type Faq } from './lib/siteContent';
import { getCurrentUser, isFirebaseConfigured } from './firebaseAuth';
import {
  createInvite,
  deleteInvite,
  listInvites,
  FEATURE_LABELS,
  isAdminUser,
  listAccounts,
  listReports,
  resolveFeatures,
  resolveStatus,
  deleteAccountData,
  purgeExpiredTrash,
  saveNotice,
  setReportStatus,
  TRASH_RETENTION_DAYS,
  subscribeNotice,
  updateAccount,
  type Account,
  type FeatureKey,
  type FeedbackReport,
  type Invite,
} from './lib/account';

type Tab = 'members' | 'reports' | 'notice' | 'faq';

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
            ['reports', '신고/문의 내용'],
            ['notice', '공지 배너'],
            ['faq', '랜딩 질문'],
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
        {tab === 'faq' && <FaqTab />}
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

  const reload = async () => {
    // 자동 삭제가 실패해도(예: 규칙이 아직 게시되지 않음) 회원 목록은 보여야 합니다.
    try {
      const purged = await purgeExpiredTrash();
      if (purged > 0) setMessage(`휴지통에 ${TRASH_RETENTION_DAYS}일 넘게 있던 ${purged}명을 삭제했습니다.`);
    } catch (e: any) {
      console.warn('휴지통 자동 삭제 실패:', e);
    }
    try {
      setAccounts(await listAccounts());
    } catch (e: any) {
      setMessage(String(e?.message || e));
    }
  };
  useEffect(() => {
    reload();
  }, []);

  const activeAccounts = accounts.filter((a) => !a.deletedAt);
  const trashAccounts = accounts.filter((a) => a.deletedAt);

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

      <InviteSection onChanged={reload} />

      {trashAccounts.length > 0 && (
        <section className="space-y-3 rounded-xl border border-slate-300 bg-slate-100 p-4">
          <div>
            <p className="text-sm font-bold text-slate-800">휴지통 ({trashAccounts.length}명)</p>
            <p className="text-[11px] text-slate-500">휴지통에 들어간 지 {TRASH_RETENTION_DAYS}일이 지나면 자동으로 삭제됩니다.</p>
          </div>
          {trashAccounts.map((acc) => {
            const left = Math.max(0, TRASH_RETENTION_DAYS - Math.floor((Date.now() - new Date(acc.deletedAt as string).getTime()) / (24 * 60 * 60 * 1000)));
            return (
              <div key={acc.uid} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 border border-slate-200">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{acc.email || '(이메일 없음)'}</p>
                  <p className="text-[11px] text-slate-500">자동 삭제까지 {left}일 남음</p>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busy === acc.uid}
                    onClick={() => run(acc.uid, () => updateAccount(acc.uid, { deletedAt: null, blocked: false }), '복구했습니다.')}
                    className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    복구
                  </button>
                  <button
                    disabled={busy === acc.uid}
                    onClick={() => {
                      if (!window.confirm(`${acc.email || '이 회원'}의 데이터를 바로 영구 삭제합니다. 되돌릴 수 없습니다. 계속할까요?`)) return;
                      run(acc.uid, () => deleteAccountData(acc.uid), '영구 삭제했습니다.');
                    }}
                    className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    바로 영구 삭제
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {activeAccounts.map((acc) => {
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
              <button
                disabled={busy === acc.uid}
                onClick={() => {
                  if (!window.confirm(`${acc.email || '이 회원'}을 휴지통으로 옮깁니다. ${TRASH_RETENTION_DAYS}일 뒤 자동으로 삭제되고, 그 전에는 복구할 수 있습니다. 계속할까요?`)) return;
                  run(acc.uid, () => updateAccount(acc.uid, { deletedAt: new Date().toISOString(), blocked: true }), '휴지통으로 옮겼습니다.');
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                삭제 (휴지통)
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

  const [category, setCategory] = useState<'버그' | '문의' | '제안'>('버그');
  const reload = () => listReports().then(setReports).catch((e) => setMessage(String(e?.message || e)));
  const countOf = (c: string) => reports.filter((r) => (r.category || '') === c).length;
  const shown = reports.filter((r) => (r.category || '') === category);
  useEffect(() => {
    reload();
  }, []);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['버그', '문의', '제안'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                category === c ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {c} ({countOf(c)})
            </button>
          ))}
        </div>
        <button onClick={reload} className="text-xs font-semibold text-indigo-600 hover:underline">새로고침</button>
      </div>
      {message && <p className="text-xs text-rose-600">{message}</p>}

      {shown.length === 0 && <p className="text-sm text-slate-500">아직 {category} 내용이 없습니다.</p>}

      {shown.map((r) => (
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

function InviteSection({ onChanged }: { onChanged: () => void }) {
  const [email, setEmail] = useState('');
  const [period, setPeriod] = useState<'1m' | '1y' | 'custom'>('1m');
  const [customDate, setCustomDate] = useState('');
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({ apiSync: true, analytics: true });
  const [invites, setInvites] = useState<Invite[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reloadInvites = () => listInvites().then(setInvites).catch((e) => setMessage(String(e?.message || e)));
  useEffect(() => {
    reloadInvites();
  }, []);

  const expiresFor = (): string | null => {
    if (period === '1m') return new Date(Date.now() + 30 * DAY).toISOString();
    if (period === '1y') return new Date(Date.now() + 365 * DAY).toISOString();
    if (!customDate) return null;
    return new Date(`${customDate}T23:59:59`).toISOString();
  };

  const save = async () => {
    const trimmed = email.trim();
    if (!trimmed.includes('@')) return setMessage('이메일 주소를 정확히 입력해 주세요.');
    if (period === 'custom' && !customDate) return setMessage('만료일을 입력해 주세요.');
    setSaving(true);
    setMessage(null);
    try {
      await createInvite(trimmed, { expiresAt: expiresFor(), features });
      setMessage(`${trimmed} 님을 초대했습니다. 이 Google 계정으로 처음 로그인하면 설정이 적용됩니다.`);
      setEmail('');
      await reloadInvites();
      onChanged();
    } catch (e: any) {
      setMessage(`초대 실패: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-indigo-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-bold text-slate-900">회원 초대</p>
        <p className="text-[11px] text-slate-500">
          초대할 사람의 Google 이메일을 적고 기간과 기능을 정하세요. 그 사람이 처음 로그인하면 자동으로 적용됩니다.
        </p>
      </div>

      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="example@gmail.com"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-2">
        {([['1m', '1개월'], ['1y', '1년'], ['custom', '날짜 지정']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              period === key ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
        {period === 'custom' && (
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
          />
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => (
          <label key={key} className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={features[key]}
              onChange={(e) => setFeatures((prev) => ({ ...prev, [key]: e.target.checked }))}
            />
            {FEATURE_LABELS[key]}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '초대하기'}
        </button>
        {message && <span className="text-xs text-slate-600">{message}</span>}
      </div>

      {invites.length > 0 && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-bold text-slate-700">아직 로그인하지 않은 초대 ({invites.length}명)</p>
          {invites.map((inv) => (
            <div key={inv.email} className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <span>
                {inv.email} · 만료일 {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString('ko-KR') : '-'}
              </span>
              <button
                onClick={async () => {
                  try {
                    await deleteInvite(inv.email);
                    await reloadInvites();
                  } catch (e: any) {
                    setMessage(`삭제 실패: ${e?.message || e}`);
                  }
                }}
                className="font-semibold text-rose-600 hover:underline"
              >
                초대 취소
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FaqTab() {
  const [items, setItems] = useState<Faq[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadFaqs().then((list) => {
      setItems(list);
      setLoaded(true);
    });
  }, []);

  const update = (i: number, patch: Partial<Faq>) =>
    setItems((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const move = (i: number, dir: -1 | 1) =>
    setItems((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const add = () => setItems((prev) => [...prev, { q: '', a: '' }]);

  const save = async () => {
    const clean = items.map((x) => ({ q: x.q.trim(), a: x.a.trim() })).filter((x) => x.q && x.a);
    if (clean.length === 0) return setMessage('질문과 답변을 한 개 이상 남겨 주세요.');
    setSaving(true);
    setMessage(null);
    try {
      await saveFaqs(clean);
      setItems(clean);
      setMessage('저장했습니다. 랜딩 페이지에 바로 반영됩니다.');
    } catch (e: any) {
      setMessage(`저장 실패: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <p className="text-sm text-slate-500">불러오는 중...</p>;

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-bold text-slate-900">랜딩 페이지 질문 (FAQ)</p>
        <p className="text-[11px] text-slate-500">랜딩 페이지의 "자주 묻는 질문" 목록입니다. 순서대로 보입니다.</p>
      </div>

      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">질문 {i + 1}</span>
            <div className="flex gap-2 text-xs">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="font-semibold text-slate-600 disabled:opacity-30">위로</button>
              <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="font-semibold text-slate-600 disabled:opacity-30">아래로</button>
              <button onClick={() => remove(i)} className="font-semibold text-rose-600">삭제</button>
            </div>
          </div>
          <input
            value={item.q}
            onChange={(e) => update(i, { q: e.target.value })}
            placeholder="질문"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <textarea
            value={item.a}
            onChange={(e) => update(i, { a: e.target.value })}
            rows={3}
            placeholder="답변"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={add} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
          질문 추가
        </button>
        <button onClick={save} disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? '저장 중...' : '저장'}
        </button>
        {message && <span className="text-xs text-slate-600">{message}</span>}
      </div>
    </section>
  );
}
