import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, RefreshCw, Search, X } from 'lucide-react';
import Modal, { btn } from '../components/ui/Modal';
import { WATCH_ACCESS_DAYS } from '../config/brand';

import {
  FEATURE_LABELS,
  accessDaysThisMonth,
  deleteAccountData,
  getWarningTemplate,
  hasUnreadWarning,
  isWatchTarget,
  listAccounts,
  purgeExpiredTrash,
  resolveFeatures,
  resolveStatus,
  saveWarningTemplate,
  sendWarning,
  TRASH_RETENTION_DAYS,
  updateAccount,
  uploadsUsedThisMonth,
  type Account,
  type AccountStatus,
  type FeatureKey,
} from '../lib/account';

const DAY = 24 * 60 * 60 * 1000;

/** 기간 연장: 지금 남은 기간이 있으면 그 뒤에, 없으면 지금부터 더합니다. */
function extendDays(account: Account, days: number): string {
  const base = Math.max(Date.now(), account.expiresAt ? new Date(account.expiresAt).getTime() : 0);
  return new Date(base + days * DAY).toISOString();
}

const STATUS_STYLE: Record<AccountStatus, { label: string; cls: string }> = {
  active: { label: '사용 중', cls: 'bg-brand-50 text-brand-700 ring-brand-200' },
  expired: { label: '기간 만료', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  new: { label: '기간 미등록', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  blocked: { label: '정지', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

type Filter = 'all' | 'active' | 'watch' | 'blocked';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '사용 중' },
  { key: 'watch', label: '확인 필요' },
  { key: 'blocked', label: '정지' },
];

function fmtDate(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function Badge({ children, cls, title }: { children: ReactNode; cls: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {children}
    </span>
  );
}

function UsageBar({ used, limit }: { used: number; limit: number | null | undefined }) {
  if (typeof limit !== 'number') {
    return <span className="text-sm text-slate-600">{used}회 · 제한 없음</span>;
  }
  const ratio = limit > 0 ? Math.min(1, used / limit) : 1;
  const full = used >= limit;
  return (
    <div className="flex min-w-[140px] items-center gap-3">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className={`h-full rounded-full ${full ? 'bg-rose-600' : 'bg-brand-600'}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className={`text-sm font-medium tabular-nums ${full ? 'text-rose-700' : 'text-slate-700'}`}>
        {used} / {limit}회
      </span>
    </div>
  );
}

/** 회원마다 여는 '...' 메뉴. 표 바깥에 띄워서 잘리지 않게 합니다. */
function MemberMenu({ rect, onClose, children }: { rect: DOMRect; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const width = 268;
  const estimated = 430;
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
  const below = rect.bottom + 6;
  const top = below + estimated > window.innerHeight ? Math.max(8, rect.top - estimated - 6) : below;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} aria-hidden="true" />
      <div
        role="menu"
        className="fixed z-50 max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        style={{ top, left, width }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  );
}

function MenuItem({
  label,
  meta,
  danger,
  disabled,
  onSelect,
}: {
  label: string;
  meta?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${
        danger ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-800'
      }`}
    >
      <span className="font-medium">{label}</span>
      {meta && <span className="text-xs text-slate-500">{meta}</span>}
    </button>
  );
}

/** 경고 문구 창: 틀을 고쳐서 저장하거나, 이 회원에게만 보낼 수 있습니다. */
export function WarningModal({ account, onClose, onSent }: { account: Account; onClose: () => void; onSent: (msg: string) => void }) {
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWarningTemplate()
      .then((t) => setText(t))
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoaded(true));
  }, []);

  const fill = (t: string) =>
    t
      .replaceAll('{email}', account.email || '')
      .replaceAll('{days}', String(accessDaysThisMonth(account)))
      .replaceAll('{usage}', String(uploadsUsedThisMonth(account)));

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendWarning(account.uid, fill(text.trim()));
      onSent(`${account.email || '회원'}에게 경고를 보냈습니다.`);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const saveTemplate = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveWarningTemplate(text.trim());
      onSent('경고 문구 틀을 저장했습니다. 다음부터 이 문구가 기본으로 나옵니다.');
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      title="경고 보내기"
      description={
        <>
          <b className="font-semibold text-slate-800">{account.email || '이 회원'}</b>에게 화면 위쪽에 안내로 보입니다. 회원이 "확인했어요"를 누르기 전까지 떠 있어요.
        </>
      }
      size="md"
      closeOnBackdrop={false}
      footerStart={<span>넣을 수 있는 말: {'{email}'} {'{days}'} {'{usage}'}</span>}
      footer={
        <>
          <button type="button" onClick={saveTemplate} disabled={busy || !loaded} className={btn.secondary}>이 문구를 기본 틀로 저장</button>
          <button type="button" onClick={send} disabled={busy || !loaded || !text.trim()} className={btn.primary}>이 회원에게 보내기</button>
        </>
      }
    >
      <div className="space-y-2">
        <label htmlFor="warning-text" className="text-sm font-semibold text-slate-800">경고 문구</label>
        <textarea
          id="warning-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!loaded}
          rows={6}
          maxLength={500}
          className="w-full rounded-lg border border-slate-300 p-3 text-sm leading-relaxed focus:border-brand-500 focus:outline-none"
        />
        <p className="text-xs text-slate-500">{text.length} / 500자 · 보낸 뒤에는 회원 화면에 그대로 보입니다.</p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    </Modal>
  );
}

type Dialog = { kind: 'date' | 'limit'; account: Account } | null;

export default function MembersTab({ renderInvite }: { renderInvite: (onChanged: () => void) => ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [trashOpen, setTrashOpen] = useState(false);
  const [warningTarget, setWarningTarget] = useState<Account | null>(null);
  const [menu, setMenu] = useState<{ account: Account; rect: DOMRect } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogValue, setDialogValue] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);

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
    } finally {
      setLoaded(true);
    }
  };
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

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.deletedAt), [accounts]);
  const trashAccounts = useMemo(() => accounts.filter((a) => a.deletedAt), [accounts]);
  const watchCount = activeAccounts.filter(isWatchTarget).length;
  const blockedCount = activeAccounts.filter((a) => a.blocked).length;
  const activeCount = activeAccounts.filter((a) => resolveStatus(a) === 'active').length;

  const shown = activeAccounts.filter((a) => {
    if (filter === 'active' && resolveStatus(a) !== 'active') return false;
    if (filter === 'watch' && !isWatchTarget(a)) return false;
    if (filter === 'blocked' && !a.blocked) return false;
    if (query.trim() && !(a.email || '').toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  const counts: Record<Filter, number> = { all: activeAccounts.length, active: activeCount, watch: watchCount, blocked: blockedCount };

  const openMenu = (account: Account, el: HTMLElement) => setMenu({ account, rect: el.getBoundingClientRect() });
  const closeMenu = () => setMenu(null);

  const openDialog = (kind: 'date' | 'limit', account: Account) => {
    setDialogError(null);
    setDialog({ kind, account });
    if (kind === 'date') setDialogValue(account.expiresAt ? account.expiresAt.slice(0, 10) : '');
    else setDialogValue(account.uploadLimit != null ? String(account.uploadLimit) : '');
  };

  const saveDialog = () => {
    if (!dialog) return;
    const { kind, account } = dialog;
    if (kind === 'date') {
      const v = dialogValue.trim();
      if (v && Number.isNaN(new Date(`${v}T23:59:59`).getTime())) return setDialogError('날짜를 다시 골라 주세요.');
      const expiresAt = v ? new Date(`${v}T23:59:59`).toISOString() : null;
      setDialog(null);
      run(account.uid, () => updateAccount(account.uid, { expiresAt }), v ? '만료일을 저장했습니다.' : '기간을 지웠습니다.');
      return;
    }
    const t = dialogValue.trim();
    const uploadLimit = t === '' ? null : Number(t);
    if (uploadLimit !== null && (!Number.isInteger(uploadLimit) || uploadLimit < 0)) {
      return setDialogError('0 이상의 정수를 입력해 주세요.');
    }
    setDialog(null);
    run(account.uid, () => updateAccount(account.uid, { uploadLimit }), '업로드 한도를 저장했습니다.');
  };

  const renderMenu = (acc: Account) => {
    const features = resolveFeatures(acc);
    const pick = (fn: () => void) => () => {
      closeMenu();
      fn();
    };
    return (
      <>
        <MenuGroup title="기간">
          <MenuItem label="1개월 연장" meta="+1개월" onSelect={pick(() => run(acc.uid, () => updateAccount(acc.uid, { expiresAt: extendDays(acc, 30) }), '기간 1개월 연장했습니다.'))} />
          <MenuItem label="1년 연장" meta="+1년" onSelect={pick(() => run(acc.uid, () => updateAccount(acc.uid, { expiresAt: extendDays(acc, 365) }), '기간 1년 연장했습니다.'))} />
          <MenuItem label="날짜 직접 입력" onSelect={pick(() => openDialog('date', acc))} />
        </MenuGroup>
        <MenuGroup title="한도와 기능">
          <MenuItem label="업로드 한도 바꾸기" meta={typeof acc.uploadLimit === 'number' ? `${acc.uploadLimit}회` : '제한 없음'} onSelect={pick(() => openDialog('limit', acc))} />
          {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => (
            <Fragment key={key}>
              <MenuItem
                label={FEATURE_LABELS[key]}
                meta={features[key] ? '켜짐' : '꺼짐'}
                onSelect={pick(() =>
                  run(acc.uid, () => updateAccount(acc.uid, { features: { ...acc.features, [key]: !features[key] } }), '기능 설정을 저장했습니다.'),
                )}
              />
            </Fragment>
          ))}
        </MenuGroup>
        <MenuGroup title="소통과 상태">
          <MenuItem label="경고 보내기" onSelect={pick(() => setWarningTarget(acc))} />
          <MenuItem
            label={acc.blocked ? '정지 풀기' : '이용 정지'}
            danger={!acc.blocked}
            onSelect={pick(() => run(acc.uid, () => updateAccount(acc.uid, { blocked: !acc.blocked }), acc.blocked ? '정지를 풀었습니다.' : '이용을 정지했습니다.'))}
          />
        </MenuGroup>
        <MenuGroup title="삭제">
          <MenuItem
            label="휴지통으로 옮기기"
            danger
            onSelect={pick(() => {
              if (!window.confirm(`${acc.email || '이 회원'}을 휴지통으로 옮깁니다. ${TRASH_RETENTION_DAYS}일 뒤 자동으로 삭제되고, 그 전에는 복구할 수 있습니다. 계속할까요?`)) return;
              run(acc.uid, () => updateAccount(acc.uid, { deletedAt: new Date().toISOString() }), '휴지통으로 옮겼습니다.');
            })}
          />
        </MenuGroup>
      </>
    );
  };

  return (
    <section className="space-y-5">
      {warningTarget && (
        <WarningModal
          account={warningTarget}
          onClose={() => setWarningTarget(null)}
          onSent={async (msg) => {
            setWarningTarget(null);
            setMessage(msg);
            await reload();
          }}
        />
      )}

      {dialog && (
        <Modal
          onClose={() => setDialog(null)}
          title={dialog.kind === 'date' ? '만료일 직접 입력' : '업로드 한도 바꾸기'}
          description={<><b className="font-semibold text-slate-800">{dialog.account.email || '이 회원'}</b>{dialog.kind === 'date' ? '의 구독 만료일을 정합니다.' : '의 월 업로드 한도를 정합니다.'}</>}
          size="sm"
          footer={
            <>
              <button type="button" onClick={() => setDialog(null)} className={btn.secondary}>취소</button>
              <button type="button" onClick={saveDialog} className={btn.primary}>저장</button>
            </>
          }
        >
          <div className="space-y-2">
            {dialog.kind === 'date' ? (
              <>
                <input
                  type="date"
                  value={dialogValue}
                  onChange={(e) => setDialogValue(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <p className="text-xs text-slate-500">비워 두고 저장하면 기간이 지워져 무료 회원이 됩니다.</p>
              </>
            ) : (
              <>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={dialogValue}
                  onChange={(e) => setDialogValue(e.target.value)}
                  placeholder="예: 5"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <p className="text-xs text-slate-500">비워 두면 업로드 횟수 제한이 없어집니다.</p>
              </>
            )}
            {dialogError && <p className="text-sm text-rose-600">{dialogError}</p>}
          </div>
        </Modal>
      )}

      {/* 머리글 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">회원 관리</h2>
          <p className="mt-1 text-sm text-slate-600">
            전체 {activeAccounts.length}명 · 확인 필요 {watchCount}명 · 이번 달 기준
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" />
          새로고침
        </button>
      </div>

      {message && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-900">
          <p>{message}</p>
          <button type="button" onClick={() => setMessage(null)} aria-label="알림 닫기" className="shrink-0 text-brand-700 hover:text-brand-900 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {renderInvite(reload)}

      {/* 필터와 검색 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="회원 필터">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition cursor-pointer ${
                  on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {f.label}
                <span className={`tabular-nums ${on ? 'text-white/80' : 'text-slate-500'}`}>{counts[f.key]}</span>
              </button>
            );
          })}
        </div>
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">이메일로 찾기</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이메일로 찾기"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
          />
        </label>
      </div>

      {/* 회원 표 (넓은 화면) */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
        <table className="w-full border-collapse text-left">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-3">회원</th>
              <th scope="col" className="px-4 py-3">상태</th>
              <th scope="col" className="px-4 py-3">이번 달 업로드</th>
              <th scope="col" className="px-4 py-3">접속</th>
              <th scope="col" className="px-4 py-3">경고</th>
              <th scope="col" className="w-14 px-4 py-3"><span className="sr-only">메뉴</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((acc) => {
              const status = resolveStatus(acc);
              const st = STATUS_STYLE[status];
              return (
                <tr key={acc.uid} className="align-middle hover:bg-slate-50/60">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-semibold text-slate-900">{acc.email || '(이메일 없음)'}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      마지막 접속 {acc.lastLoginAt ? new Date(acc.lastLoginAt).toLocaleString('ko-KR') : '-'}
                      {acc.expiresAt && <> · 만료 {fmtDate(acc.expiresAt)}</>}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge cls={st.cls}>{st.label}</Badge>
                      {isWatchTarget(acc) && (
                        <Badge cls="bg-amber-50 text-amber-800 ring-amber-300" title={`이번 달 접속 ${WATCH_ACCESS_DAYS}일 이상인데 업로드가 0회`}>확인 필요</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <UsageBar used={uploadsUsedThisMonth(acc)} limit={acc.uploadLimit} />
                  </td>
                  <td className="px-4 py-3.5 text-sm tabular-nums text-slate-700">이번 달 {accessDaysThisMonth(acc)}일</td>
                  <td className="px-4 py-3.5">
                    {acc.warning ? (
                      hasUnreadWarning(acc) ? <Badge cls="bg-rose-50 text-rose-700 ring-rose-200">안 읽음</Badge> : <Badge cls="bg-slate-100 text-slate-600 ring-slate-200">읽음</Badge>
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-label={`${acc.email || '회원'} 메뉴`}
                      disabled={busy === acc.uid}
                      onClick={(e) => openMenu(acc, e.currentTarget)}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-lg leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                      ⋯
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loaded && shown.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-500">조건에 맞는 회원이 없어요.</p>}
        {!loaded && <p className="px-5 py-10 text-center text-sm text-slate-500">회원 목록을 불러오는 중…</p>}
      </div>

      {/* 회원 카드 (좁은 화면) */}
      <ul className="space-y-3 md:hidden">
        {shown.map((acc) => {
          const status = resolveStatus(acc);
          const st = STATUS_STYLE[status];
          return (
            <li key={acc.uid} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{acc.email || '(이메일 없음)'}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    마지막 접속 {acc.lastLoginAt ? new Date(acc.lastLoginAt).toLocaleDateString('ko-KR') : '-'}
                  </p>
                </div>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-label={`${acc.email || '회원'} 메뉴`}
                  disabled={busy === acc.uid}
                  onClick={(e) => openMenu(acc, e.currentTarget)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-lg leading-none text-slate-600 disabled:opacity-50 cursor-pointer"
                >
                  ⋯
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge cls={st.cls}>{st.label}</Badge>
                {isWatchTarget(acc) && <Badge cls="bg-amber-50 text-amber-800 ring-amber-300">확인 필요</Badge>}
                {acc.warning && (hasUnreadWarning(acc) ? <Badge cls="bg-rose-50 text-rose-700 ring-rose-200">경고 안 읽음</Badge> : <Badge cls="bg-slate-100 text-slate-600 ring-slate-200">경고 읽음</Badge>)}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-sm text-slate-700">
                <UsageBar used={uploadsUsedThisMonth(acc)} limit={acc.uploadLimit} />
                <span className="shrink-0 tabular-nums">접속 {accessDaysThisMonth(acc)}일</span>
              </div>
            </li>
          );
        })}
        {loaded && shown.length === 0 && <li className="py-10 text-center text-sm text-slate-500">조건에 맞는 회원이 없어요.</li>}
        {!loaded && <li className="py-10 text-center text-sm text-slate-500">회원 목록을 불러오는 중…</li>}
      </ul>

      {menu && (
        <MemberMenu rect={menu.rect} onClose={closeMenu}>
          <div className="px-2.5 pb-1.5 pt-1">
            <p className="truncate text-xs font-semibold text-slate-900">{menu.account.email || '(이메일 없음)'}</p>
            <p className="text-[11px] text-slate-500">
              이번 달 접속 {accessDaysThisMonth(menu.account)}일 · 업로드 {uploadsUsedThisMonth(menu.account)}회
            </p>
          </div>
          {renderMenu(menu.account)}
        </MemberMenu>
      )}

      {/* 휴지통 */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setTrashOpen((v) => !v)}
          aria-expanded={trashOpen}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left hover:bg-slate-50 cursor-pointer"
        >
          <span>
            <span className="block text-sm font-semibold text-slate-800">휴지통 {trashAccounts.length}명</span>
            <span className="block text-xs text-slate-500">휴지통에 들어간 지 {TRASH_RETENTION_DAYS}일이 지나면 자동으로 삭제됩니다.</span>
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${trashOpen ? 'rotate-180' : ''}`} />
        </button>
        {trashOpen && (
          <div className="space-y-2 border-t border-slate-100 p-3">
            {trashAccounts.length === 0 && <p className="px-2 py-4 text-sm text-slate-500">휴지통이 비어 있어요.</p>}
            {trashAccounts.map((acc) => {
              const left = Math.max(0, TRASH_RETENTION_DAYS - Math.floor((Date.now() - new Date(acc.deletedAt as string).getTime()) / DAY));
              return (
                <div key={acc.uid} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{acc.email || '(이메일 없음)'}</p>
                    <p className="text-xs text-slate-500">자동 삭제까지 {left}일 남음</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy === acc.uid}
                      onClick={() => run(acc.uid, () => updateAccount(acc.uid, { deletedAt: null, blocked: false }), '복구했습니다.')}
                      className={btn.secondary}
                    >
                      복구
                    </button>
                    <button
                      type="button"
                      disabled={busy === acc.uid}
                      onClick={() => {
                        if (!window.confirm(`${acc.email || '이 회원'}의 데이터를 바로 영구 삭제합니다. 되돌릴 수 없습니다. 계속할까요?`)) return;
                        run(acc.uid, () => deleteAccountData(acc.uid), '영구 삭제했습니다.');
                      }}
                      className={btn.danger}
                    >
                      바로 영구 삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
