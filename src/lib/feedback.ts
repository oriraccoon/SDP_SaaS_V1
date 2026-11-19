import { addDoc, collection, getFirestore, serverTimestamp } from 'firebase/firestore';
import { getCurrentUser, getFirebaseApp } from '../firebaseAuth';

export type FeedbackCategory = '버그' | '문의' | '제안';

export const FEEDBACK_MAX_LENGTH = 2000;

/**
 * 버그/문의를 Firestore의 reports 컬렉션에 저장합니다.
 * 보안 규칙상 앱에서는 쓰기만 가능하고 읽을 수 없습니다. 내용은 Firebase 콘솔에서 확인합니다.
 */
export async function sendFeedback(category: FeedbackCategory, message: string): Promise<void> {
  const app = getFirebaseApp();
  const user = getCurrentUser();
  if (!app || !user) throw new Error('로그인 후 다시 시도해 주세요.');

  const text = message.trim();
  if (!text) throw new Error('내용을 입력해 주세요.');
  if (text.length > FEEDBACK_MAX_LENGTH) throw new Error(`${FEEDBACK_MAX_LENGTH}자 이하로 입력해 주세요.`);

  await addDoc(collection(getFirestore(app), 'reports'), {
    category,
    message: text,
    uid: user.uid,
    email: user.email ?? '',
    pageUrl: window.location.pathname,
    userAgent: navigator.userAgent.slice(0, 300),
    createdAt: serverTimestamp(),
  });
}
