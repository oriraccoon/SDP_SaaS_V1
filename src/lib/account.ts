import { FREE_TRIAL_DAYS } from '../config/brand';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
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
  /** 무료 체험을 시작한 시각 (서버 시각). 이때부터 FREE_TRIAL_DAYS일 동안 씁니다. */
  trialStartedAt?: { toMillis: () => number } | null;
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

  await setDoc(ref, { email, lastLoginAt: now }, { merge: true });
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

export function resolveStatus(account: Account | null): AccountStatus {
  if (!account) return 'new';
  // 휴지통에 든 회원은 구독권이 없는 것으로 봅니다 (이용 중지와 구분)
  if (account.deletedAt) return 'new';
  if (account.blocked) return 'blocked';
  // 무료 체험 중이면 구독 기간과 상관없이 이용할 수 있습니다 (구독 기간이 끝난 계정도 체험을 한 번 쓸 수 있습니다)
  const trialEnd = trialEndsAtMs(account);
  if (trialEnd !== null && trialEnd > Date.now()) return 'active';
  if (account.expiresAt) return new Date(account.expiresAt).getTime() > Date.now() ? 'active' : 'expired';
  // 구독 기간이 없으면: 체험을 써서 끝난 회원인지, 예전 무료 플랜(월 횟수 한도)인지 봅니다
  if (trialEnd !== null) return 'expired';
  return typeof account.uploadLimit === 'number' ? 'active' : 'new';
}

/** 무료 체험이 끝나는 시각(ms). 체험을 시작하지 않았으면 null입니다. */
export function trialEndsAtMs(account: Account | null): number | null {
  const started = account?.trialStartedAt;
  if (!started || typeof started.toMillis !== 'function') return null;
  return started.toMillis() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000;
}

/** 무료 체험 남은 날 (올림). 체험 중이 아니면 null입니다. */
export function trialDaysLeft(account: Account | null): number | null {
  const end = trialEndsAtMs(account);
  if (end === null || end <= Date.now()) return null;
  return Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
}

/** 무료 체험을 아직 한 번도 쓰지 않은 계정인지. 구독 기간·월 한도와 상관없이, 한 번도 안 썼으면 됩니다. */
export function canStartTrial(account: Account | null): boolean {
  return !account?.trialStartedAt;
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

/** 무료 체험 시작: 본인 계정에 체험 시작 시각(서버 시각)을 한 번 기록합니다. */
export async function startFreeTrial(uid: string): Promise<void> {
  await setDoc(doc(database(), 'users', uid), { trialStartedAt: serverTimestamp() }, { merge: true });
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
