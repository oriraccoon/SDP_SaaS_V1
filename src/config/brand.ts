// 서비스 이름과 가격을 한 곳에서 관리합니다. 이름을 바꿀 때는 이 파일만 고치면 됩니다.
export const APP_NAME = 'ezorder';
// 기본 구독 월 요금 (랜딩과 구독권 화면에 함께 쓰입니다)
export const MONTHLY_PRICE_KRW = 4900;
// 프로 구독 월 요금
export const PRO_PRICE_KRW = 9900;
// 무료 플랜의 기본 월 업로드 횟수 (관리자 회원 카드에서 회원별로 바꿀 수 있습니다)
export const FREE_MONTHLY_UPLOADS = 5;

/** 요금제. 랜딩 가격 섹션과 구독권 화면이 함께 씁니다. */
export const PLANS = [
  { name: '무료', price: 0, desc: '가볍게 써 보고 싶을 때', features: [`월 ${FREE_MONTHLY_UPLOADS}회 업로드`, '주문 정리 기본 기능'] },
  { name: '기본', price: MONTHLY_PRICE_KRW, desc: '매달 주문을 정리하는 셀러', features: ['업로드 횟수 제한 없음', '모든 정리 기능', '설정 백업'] },
  { name: '프로', price: PRO_PRICE_KRW, desc: '주문이 많은 셀러', features: ['기본 플랜의 모든 기능', '우선 문의 응대'] },
];

/**
 * 사업자 정보. 값을 채우면 랜딩 푸터에 나옵니다. 비어 있는 항목은 보이지 않습니다.
 * 예: name '이지오더', owner '홍길동', regNo '000-00-00000', email 'help@…'
 */
export const BUSINESS_INFO = {
  name: '',
  owner: '',
  regNo: '',
  email: '',
};
