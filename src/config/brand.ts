// 서비스 이름과 가격을 한 곳에서 관리합니다. 이름을 바꿀 때는 이 파일만 고치면 됩니다.
export const APP_NAME = 'ezorder';
// 기본 구독 월 요금 (랜딩과 구독권 화면에 함께 쓰입니다)
export const MONTHLY_PRICE_KRW = 4900;
// 프로 구독 월 요금
export const PRO_PRICE_KRW = 9900;
// 무료 플랜의 월 업로드 횟수. 무료 회원은 이 횟수만큼만 엑셀을 정리할 수 있고, 다음 달에 다시 채워집니다.
export const FREE_MONTHLY_UPLOADS = 5;
// 확인 대상 기준: 이번 달 접속한 날이 이 수 이상인데 업로드 횟수가 0이면 관리자 화면에 '확인 필요'로 표시합니다
export const WATCH_ACCESS_DAYS = 10;
// 회원에게 보내는 경고 문구의 기본 틀. 관리자 화면에서 고치면 저장되어 이 기본값 대신 씁니다.
// 바꿔 넣는 말: {email}(회원 이메일), {days}(이번 달 접속 일수), {usage}(이번 달 사용 횟수)
export const WARNING_TEMPLATE_DEFAULT = '안녕하세요. 이번 달 {days}일 접속하셨지만 주문 정리 기록이 확인되지 않았어요. 정리 과정을 다시 확인해 주세요. 문의는 관리자에게 해 주세요.';

/** 요금제. 랜딩 가격 섹션과 구독권 화면이 함께 씁니다. */
export const PLANS = [
  { name: 'Free', price: 0, desc: '가볍게 써 보는 분' },
  { name: 'Basic', price: MONTHLY_PRICE_KRW, desc: '매달 정리하는 셀러' },
  { name: 'Pro', price: PRO_PRICE_KRW, desc: '주문이 많은 셀러' },
];

/**
 * 기능표. 각 줄의 included는 PLANS 순서(Free, Basic, Pro)대로 입니다.
 * true는 ✓, false는 –, 글자면 그대로 보여 줍니다.
 */
export const PLAN_FEATURE_ROWS: { label: string; included: (boolean | string)[] }[] = [
  { label: '엑셀 정리 횟수', included: [`월 ${FREE_MONTHLY_UPLOADS}회`, '무제한', '무제한'] },
  { label: '설정 백업', included: [false, true, true] },
  { label: 'API 연동', included: [false, false, true] },
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
