/*
 * 로그인했는지 랜딩에 알려 주는 작은 표시 (브라우저 localStorage).
 * 랜딩은 Firebase를 불러오지 않으므로, 앱이 로그인·로그아웃 때 이 표시만 남기고 랜딩은 이것만 읽습니다.
 * 진짜 로그인 여부는 앱(/app)이 Firebase로 다시 확인합니다. 이 표시는 화면 문구용입니다.
 */
const KEY = 'ezorder.signedIn';

export function isMarkedSignedIn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markSignedIn(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* 저장할 수 없는 브라우저면 그냥 넘어갑니다 */
  }
}
