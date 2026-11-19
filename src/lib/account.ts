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
  features?: Features;
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

  if (email) {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      const inviteRef = doc(db, 'invites', email.toLowerCase());
      const invite = await getDoc(inviteRef);
      if (invite.exists()) {
        const data = invite.data() as Invite;
        await setDoc(ref, {
          email,
          lastLoginAt: now,
          expiresAt: data.expiresAt ?? null,
          blocked: data.blocked ?? false,
          features: data.features ?? {},
        });
        await deleteDoc(inviteRef);
        return;
      }
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
  if (account.blocked) return 'blocked';
  if (!account.expiresAt) return 'new';
  return new Date(account.expiresAt).getTime() > Date.now() ? 'active' : 'expired';
}

export function resolveFeatures(account: Account | null): Record<FeatureKey, boolean> {
  return { ...DEFAULT_FEATURES, ...(account?.features ?? {}) };
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
