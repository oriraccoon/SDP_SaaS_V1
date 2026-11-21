import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { getFirebaseApp } from '../firebaseAuth';

export interface Faq {
  q: string;
  a: string;
}

/** 관리자가 아직 바꾸지 않았을 때 쓰는 기본 질문 */
export const DEFAULT_FAQS: Faq[] = [
  { q: '주문 정보가 저장되나요?', a: '아니요. 새로고침하면 지워져요. 품목사전과 설정만 계정에 남아요.' },
  { q: '어떤 쇼핑몰을 지원하나요?', a: '쿠팡·스마트스토어·토스·식봄·올웨이즈·G마켓 양식이 들어 있어요. 다른 쇼핑몰은 칸만 맞추면 돼요.' },
  { q: '엑셀이 어려워요. 쓸 수 있을까요?', a: '네. 화면 위 4단계를 차례로 누르면 돼요.' },
  { q: '암호가 걸린 엑셀도 되나요?', a: '.xlsx는 내 컴퓨터에서 바로 풀어요. 암호 걸린 .xls는 .xlsx로 저장해 올려 주세요.' },
  { q: '구독을 그만두면 어떻게 되나요?', a: '작업은 멈추지만 설정은 남아요. 다시 구독하면 이어서 써요.' },
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
