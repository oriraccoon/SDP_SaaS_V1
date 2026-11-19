import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { getFirebaseApp } from '../firebaseAuth';

/**
 * 계정별 설정을 Firestore에 저장합니다.
 * 저장 위치: users/{계정 ID}/settings/main
 * 주문 데이터(엑셀 내용)는 여기에 저장하지 않습니다.
 */
function settingsRef(uid: string) {
  const app = getFirebaseApp();
  if (!app) throw new Error('Firebase 설정이 없습니다.');
  return doc(getFirestore(app), 'users', uid, 'settings', 'main');
}

export async function loadCloudSettings(uid: string): Promise<Record<string, unknown> | null> {
  const snap = await getDoc(settingsRef(uid));
  if (!snap.exists()) return null;
  const raw = snap.data()?.settingsJson;
  if (typeof raw !== 'string') return null;
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function saveCloudSettings(uid: string, settings: Record<string, unknown>): Promise<void> {
  // 중첩 배열 등 Firestore가 받지 않는 구조를 피하려고 JSON 문자열 한 덩어리로 저장합니다.
  await setDoc(settingsRef(uid), {
    settingsJson: JSON.stringify(settings),
    updatedAt: new Date().toISOString(),
  });
}
