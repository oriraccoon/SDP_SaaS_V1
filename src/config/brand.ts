// 서비스 이름과 가격을 한 곳에서 관리합니다. 이름을 바꿀 때는 이 파일만 고치면 됩니다.
export const APP_NAME = 'ezorder';
// 기본 구독 월 요금 (랜딩과 구독권 화면에 함께 쓰입니다)
export const MONTHLY_PRICE_KRW = 4900;
// 프로 구독 월 요금
export const PRO_PRICE_KRW = 9900;
// 예전 무료 플랜의 월 업로드 횟수. 이미 이 플랜을 쓰는 회원에게만 남아 있습니다 (새 회원은 무료 체험)
export const FREE_MONTHLY_UPLOADS = 5;
// 무료 체험 기간 (일). 무료 체험을 시작한 때부터 이 기간 동안 업로드 횟수 제한 없이 씁니다
export const FREE_TRIAL_DAYS = 3;

/** 요금제. 랜딩 가격 섹션과 구독권 화면이 함께 씁니다. */
export const PLANS = [
  { name: '무료 체험', price: 0, desc: `${FREE_TRIAL_DAYS}일 동안 모든 기능을 써 보세요`, features: [`${FREE_TRIAL_DAYS}일 동안 무료`, '업로드 횟수 제한 없음', '모든 정리 기능'] },
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
