import { FREE_MONTHLY_UPLOADS, WATCH_ACCESS_DAYS, WARNING_TEMPLATE_DEFAULT } from '../config/brand';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { getFirebaseApp } from '../firebaseAuth';

/** 관리자가 회원별로 켜고 끌 수 있는 기능 */
export const FEATURE_LABELS = {
  apiSync: 'API 자동 수집 (쇼핑몰 연동)',
  analytics: '시각화 리포트',
} as const;

export type FeatureKey = keyof typeof FEATURE_LABELS;
export type Features = Partial<Record<FeatureKey, boolean>>;

/** 기능 설정이 없는 회원은 모든 기능을 씁니다. */
export const DEFAULT_FEATURES: Record<FeatureKey, boolean> = { apiSync: true, analytics: true };

export interface Account {
  uid: string;
  email: string;
  lastLoginAt?: string;
  /** 구독 만료 시각(ISO 문자열). 없으면 아직 기간이 등록되지 않은 회원입니다. */
  expiresAt?: string | null;
  /** true면 이용 중지 */
  blocked?: boolean;
  /** 휴지통에 넣은 시각(ISO). 30일이 지나면 자동으로 삭제됩니다. */
  deletedAt?: string | null;
  features?: Features;
  /** 월 업로드 한도. 없으면 제한이 없습니다. */
  uploadLimit?: number | null;
  /** 이번 달 업로드 사용량. 달이 바뀌면 자동으로 0이 됩니다. */
  usage?: { month: string; count: number } | null;
  /** 이번 달 접속한 날 수. 하루에 한 번만 늘어납니다. */
  access?: { month: string; count: number; lastDay: string } | null;
  /** 관리자가 보낸 경고 */
  warning?: { text: string; sentAt: string } | null;
  /** 회원이 읽었다고 표시한 경고 시각 (경고 sentAt과 같으면 읽음) */
  warningReadSentAt?: string | null;
}

export type AccountStatus = 'active' | 'new' | 'expired' | 'blocked';

export interface Notice {
  text: string;
  active: boolean;
}

export interface FeedbackReport {
  id: string;
  category: string;
  message: string;
  email: string;
  pageUrl?: string;
  status?: 'new' | 'working' | 'done';
  createdAt?: { toDate: () => Date } | null;
}

function database() {
  const app = getFirebaseApp();
  if (!app) throw new Error('Firebase 설정이 없습니다.');
  return getFirestore(app);
}

export interface Invite {
  email: string;
  expiresAt: string | null;
  blocked?: boolean;
  features?: Features;
}

/**
 * 로그인할 때마다 회원 문서를 만들거나 마지막 접속 시각을 갱신합니다.
 * 처음 로그인하는 사람이고 관리자가 초대해 둔 이메일이면, 초대 설정(기간·기능)을 적용하고 초대는 지웁니다.
 */
export async function touchAccount(user: User): Promise<void> {
  const db = database();
  const ref = doc(db, 'users', user.uid);
  const email = user.email ?? '';
  const now = new Date().toISOString();

  // 관리자가 이 이메일을 초대해 두었다면, 처음 가입이든 이미 가입한 계정이든 초대 설정을 적용합니다.
  if (email) {
    const inviteRef = doc(db, 'invites', email.toLowerCase());
    const invite = await getDoc(inviteRef);
    if (invite.exists()) {
      const data = invite.data() as Invite;
      const applied = {
        email,
        lastLoginAt: now,
        expiresAt: data.expiresAt ?? null,
        blocked: data.blocked ?? false,
        features: data.features ?? {},
      };
      const existing = await getDoc(ref);
      if (existing.exists()) {
        await updateDoc(ref, applied);
      } else {
        await setDoc(ref, applied);
      }
      await deleteDoc(inviteRef);
      return;
    }
  }

  // 무료 회원(구독 기간이 없는 회원)에게는 월 업로드 한도 5회를 문서에 기록합니다.
  // 이 값이 있어야 보안 규칙이 횟수 차감을 막을 수 있습니다.
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { email, lastLoginAt: now, uploadLimit: FREE_MONTHLY_UPLOADS });
    return;
  }
  const data = snap.data() as Account;
  if (!data.expiresAt && data.uploadLimit === undefined) {
    await updateDoc(ref, { lastLoginAt: now, uploadLimit: FREE_MONTHLY_UPLOADS });
    return;
  }
  await setDoc(ref, { email, lastLoginAt: now }, { merge: true });
}

/** 한국 시각 기준 날짜 키 (예: 2026-11-21). */
export function kstDayKey(now: Date = new Date()): string {
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`;
}

/** 오늘 접속을 한 번 기록합니다 (하루에 한 번만 늘어남). 규칙이 하루 1번 이상 늘리는 것을 막습니다. */
export async function recordAccessDay(uid: string): Promise<void> {
  const ref = doc(database(), 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as Account;
  const today = kstDayKey();
  const month = today.slice(0, 7);
  if (data.access?.lastDay === today) return;
  const prevCount = data.access?.month === month ? data.access.count : 0;
  await updateDoc(ref, { access: { month, count: prevCount + 1, lastDay: today } });
}

/** 이번 달 접속한 날 수 */
export function accessDaysThisMonth(account: Account | null, now: Date = new Date()): number {
  const access = account?.access;
  return access && access.month === currentMonthKey(now) ? access.count : 0;
}

/**
 * 관리자 확인 대상: 무료로 이용 중인데(구독 기간 없음, 이용 중지 아님),
 * 이번 달 접속한 날이 기준 이상인데 업로드 횟수가 0인 회원.
 */
export function isWatchTarget(account: Account | null): boolean {
  if (!account || account.expiresAt || account.blocked) return false;
  return accessDaysThisMonth(account) >= WATCH_ACCESS_DAYS && uploadsUsedThisMonth(account) === 0;
}

/** 회원에게 보여 줄 경고가 있고, 아직 읽지 않았으면 true */
export function hasUnreadWarning(account: Account | null): boolean {
  const w = account?.warning;
  return Boolean(w && account?.warningReadSentAt !== w.sentAt);
}

/** 경고 문구 틀 (관리자가 고칠 수 있음). 저장된 틀이 없으면 기본 문구를 씁니다. */
export async function getWarningTemplate(): Promise<string> {
  const snap = await getDoc(doc(database(), 'config', 'warning'));
  const text = snap.exists() ? (snap.data() as { text?: string }).text : undefined;
  return text ?? WARNING_TEMPLATE_DEFAULT;
}

export async function saveWarningTemplate(text: string): Promise<void> {
  await setDoc(doc(database(), 'config', 'warning'), { text });
}

/** 관리자: 회원에게 경고를 보냅니다. 회원 화면에 다시 읽기 전까지 떠 있습니다. */
export async function sendWarning(uid: string, text: string): Promise<void> {
  await updateDoc(doc(database(), 'users', uid), {
    warning: { text, sentAt: new Date().toISOString() },
    warningReadSentAt: null,
  });
}

/** 회원: 받은 경고를 읽었다고 표시합니다. */
export async function markWarningRead(uid: string, sentAt: string): Promise<void> {
  await updateDoc(doc(database(), 'users', uid), { warningReadSentAt: sentAt });
}

export function subscribeAccount(uid: string, callback: (account: Account | null) => void): Unsubscribe {
  return onSnapshot(doc(database(), 'users', uid), (snap) => {
    if (!snap.exists()) return callback(null);
    callback({ uid, ...(snap.data() as Omit<Account, 'uid'>) });
  });
}

export async function isAdminUser(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(database(), 'admins', uid));
  return snap.exists();
}

/**
 * 회원 상태.
 * - 구독 기간(expiresAt)이 없으면 무료 플랜입니다 (이번 달 업로드 5회).
 * - 구독 기간이 있으면 그 날짜까지 이용하고, 지나면 구독권 화면을 봅니다.
 */
export function resolveStatus(account: Account | null): AccountStatus {
  if (!account) return 'new';
  // 휴지통에 든 회원은 구독권이 없는 것으로 봅니다 (이용 중지와 구분)
  if (account.deletedAt) return 'new';
  if (account.blocked) return 'blocked';
  if (account.expiresAt) return new Date(account.expiresAt).getTime() > Date.now() ? 'active' : 'expired';
  return 'active';
}

/** 무료 플랜인지: 구독 기간이 없는 회원입니다. */
export function isFreePlan(account: Account | null): boolean {
  return Boolean(account) && !account?.expiresAt;
}

export function resolveFeatures(account: Account | null): Record<FeatureKey, boolean> {
  return { ...DEFAULT_FEATURES, ...(account?.features ?? {}) };
}

/** 이번 달 키 (예: 2026-11). */
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 이번 달에 쓴 업로드 횟수. 달이 바뀌면 0입니다. */
export function uploadsUsedThisMonth(account: Account | null): number {
  const usage = account?.usage;
  return usage && usage.month === currentMonthKey() ? usage.count : 0;
}

/** 남은 업로드 횟수. null이면 제한이 없는 회원입니다. */
export function uploadsLeft(account: Account | null): number | null {
  const limit = account?.uploadLimit;
  if (typeof limit !== 'number') return null;
  return Math.max(0, limit - uploadsUsedThisMonth(account));
}

/** 파일 count개를 올리려 할 때 한도 안이면 이번 달 사용량을 늘리고 true를 돌려줍니다. */
export async function consumeUploads(account: Account | null, count: number): Promise<boolean> {
  if (!account) return false;
  const left = uploadsLeft(account);
  if (left !== null && count > left) return false;
  await setDoc(
    doc(database(), 'users', account.uid),
    { usage: { month: currentMonthKey(), count: uploadsUsedThisMonth(account) + count } },
    { merge: true },
  );
  return true;
}

// ---- 관리자 전용 ----

export async function listAccounts(): Promise<Account[]> {
  const snap = await getDocs(collection(database(), 'users'));
  const list = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Account, 'uid'>) }));
  return list.sort((a, b) => (b.lastLoginAt ?? '').localeCompare(a.lastLoginAt ?? ''));
}

export async function updateAccount(uid: string, patch: Partial<Omit<Account, 'uid'>>): Promise<void> {
  await updateDoc(doc(database(), 'users', uid), patch);
}

export async function listReports(): Promise<FeedbackReport[]> {
  const snap = await getDocs(collection(database(), 'reports'));
  const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeedbackReport, 'id'>) }));
  const time = (r: FeedbackReport) => r.createdAt?.toDate?.().getTime() ?? 0;
  return list.sort((a, b) => time(b) - time(a));
}

export async function setReportStatus(id: string, status: 'new' | 'working' | 'done'): Promise<void> {
  await updateDoc(doc(database(), 'reports', id), { status });
}

export function subscribeNotice(callback: (notice: Notice | null) => void): Unsubscribe {
  return onSnapshot(doc(database(), 'config', 'notice'), (snap) => {
    callback(snap.exists() ? (snap.data() as Notice) : null);
  });
}

export async function saveNotice(notice: Notice): Promise<void> {
  await setDoc(doc(database(), 'config', 'notice'), notice);
}

// ---- 초대 (관리자) ----

export async function listInvites(): Promise<Invite[]> {
  const snap = await getDocs(collection(database(), 'invites'));
  return snap.docs.map((d) => d.data() as Invite);
}

/** 이메일 주소로 초대를 만듭니다. 그 이메일로 처음 로그인하면 이 설정이 적용됩니다. */
export async function createInvite(
  email: string,
  settings: { expiresAt: string | null; features: Features },
): Promise<void> {
  const key = email.trim().toLowerCase();
  await setDoc(doc(database(), 'invites', key), {
    email: key,
    expiresAt: settings.expiresAt,
    features: settings.features,
    blocked: false,
    createdAt: new Date().toISOString(),
  });
}

export async function deleteInvite(email: string): Promise<void> {
  await deleteDoc(doc(database(), 'invites', email.toLowerCase()));
}

// ---- 휴지통 (관리자) ----

export const TRASH_RETENTION_DAYS = 30;

/** 휴지통에 들어간 지 30일이 지난 계정을 영구 삭제합니다. 삭제한 계정 수를 돌려줍니다. */
export async function purgeExpiredTrash(): Promise<number> {
  const db = database();
  const limit = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const snap = await getDocs(collection(db, 'users'));
  let count = 0;
  for (const d of snap.docs) {
    const deletedAt = (d.data() as Account).deletedAt;
    if (!deletedAt) continue;
    if (new Date(deletedAt).getTime() > limit) continue;
    await deleteAccountData(d.id);
    count++;
  }
  return count;
}

/** 회원 문서와 그 회원의 설정을 함께 지웁니다. */
export async function deleteAccountData(uid: string): Promise<void> {
  const db = database();
  await deleteDoc(doc(db, 'users', uid, 'settings', 'main'));
  await deleteDoc(doc(db, 'users', uid));
}
