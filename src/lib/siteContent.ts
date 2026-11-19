import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { getFirebaseApp } from '../firebaseAuth';

export interface Faq {
  q: string;
  a: string;
}

/** 관리자가 아직 바꾸지 않았을 때 쓰는 기본 질문 */
export const DEFAULT_FAQS: Faq[] = [
  { q: '주문 정보가 저장되나요?', a: '주문 엑셀 내용은 서버에 저장하지 않아요. 새로고침하면 사라집니다. 상품 이름 사전이나 설정처럼 자주 쓰는 내용만 내 계정에 저장돼요.' },
  { q: '어떤 쇼핑몰을 지원하나요?', a: '주문 엑셀을 내려받을 수 있는 주요 쇼핑몰이 대부분 지원돼요. 양식이 다르면 플랫폼 설정에서 추가할 수 있어요.' },
  { q: '엑셀이 어려워요. 쓸 수 있을까요?', a: '화면에 나오는 순서대로 누르면 돼요. 주문서 올리기, 송장 올리기, 결과 받기 세 가지만 기억하시면 됩니다.' },
  { q: '암호가 걸린 엑셀도 되나요?', a: '네. 파일을 서버로 보내지 않고 내 컴퓨터에서 암호를 풀어요.' },
  { q: '구독을 그만두면 어떻게 되나요?', a: '구독 기간이 끝나면 작업은 할 수 없지만, 설정은 그대로 남아 있어요. 다시 구독하면 이어서 쓸 수 있어요.' },
];

function faqRef() {
  const app = getFirebaseApp();
  if (!app) return null;
  return doc(getFirestore(app), 'config', 'faq');
}

/** 저장된 질문을 불러옵니다. 없거나 설정이 없으면 기본 질문을 돌려줍니다. */
export async function loadFaqs(): Promise<Faq[]> {
  try {
    const ref = faqRef();
    if (!ref) return DEFAULT_FAQS;
    const snap = await getDoc(ref);
    const items = snap.exists() ? (snap.data().items as Faq[] | undefined) : undefined;
    if (Array.isArray(items) && items.length > 0) {
      return items.filter((i) => i && i.q && i.a);
    }
  } catch (err) {
    console.warn('질문 불러오기 실패, 기본 질문을 씁니다:', err);
  }
  return DEFAULT_FAQS;
}

export async function saveFaqs(items: Faq[]): Promise<void> {
  const ref = faqRef();
  if (!ref) throw new Error('Firebase 설정이 없습니다.');
  await setDoc(ref, { items, updatedAt: new Date().toISOString() });
}
