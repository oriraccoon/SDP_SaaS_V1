/*
 * 랜딩("/")을 taste 디자인 시스템(public/assets)으로 그립니다. React를 쓰지 않습니다.
 * 앱(/app, /admin)은 main.tsx가 지금처럼 React로 엽니다.
 *
 * type: software
 * deal: hero collage, nav nav-centre, close close-word, footer footer-statement, rhythm dark-band,
 *       buttons pill, mark dots, palette: the client's own green (#1e5b4a) through start.mjs brand,
 *       type instrument (Instrument Sans + DM Mono; Hangul in Noto Sans KR)
 * effect: grain-gradient in the hero frame; card ground gradient-mesh (features)
 * moment: line-carries-colour on the privacy section (the dark band): the page turns dark where it talks
 *         about keeping order files in the browser
 */
import { APP_NAME, BUSINESS_INFO, FREE_MONTHLY_UPLOADS, PLANS } from '../config/brand';
import { DEFAULT_FAQS, loadFaqs, type Faq } from '../lib/siteContent';
import { SUPPORTED_COURIERS, SUPPORTED_SHOPS } from '../lib/supported';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const MAIN_ACTION = '무료로 시작하기';
const APP_URL = '/app';
const XLSX = '<img src="/assets/icons/xlsx.svg" alt="">';
const CHECK =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 8.2 2.3 2.3 4.7-5"/></svg>';
const ARROW =
  '<svg class="m-arrow" viewBox="0 0 12 12" aria-hidden="true"><path class="m-arrow__stem" d="M1 6h8"/><path class="m-arrow__head" d="M4.5 2.5 8 6l-3.5 3.5"/></svg>';
const shops = SUPPORTED_SHOPS.join(', ');

// ---------- nav ----------
const nav = `
<header class="nav nav--centre">
  <div class="wrap nav__bar">
    <a class="skip-link" href="#top">본문으로 건너뛰기</a>
    <a class="nav__logo" href="#top"><span class="mark" data-mark="dots" aria-hidden="true"></span>${APP_NAME}</a>
    <nav class="nav__links" aria-label="주 메뉴">
      <div class="nav__item"><a class="nav__link" href="#app">화면</a></div>
      <div class="nav__item"><a class="nav__link" href="#features">기능</a></div>
      <div class="nav__item"><a class="nav__link" href="#price">가격</a></div>
      <div class="nav__item"><a class="nav__link" href="#privacy">개인정보</a></div>
      <div class="nav__item"><a class="nav__link" href="#faq">질문</a></div>
    </nav>
    <div class="nav__actions">
      <a class="nav__link" href="${APP_URL}">로그인</a>
      <a class="btn btn--primary" href="${APP_URL}">${MAIN_ACTION}</a>
    </div>
    <button class="nav__toggle" type="button" aria-expanded="false" aria-label="메뉴">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 5h14M2 13h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>
  </div>
</header>`;

// ---------- hero: collage ----------
const heroRows: [string, string, string, string, string][] = [
  // [색, 상품, 쇼핑몰 · 받는 사람, 수량, 상태(class|글자)]
  ['#e4d7c0', '사과 5kg', '쿠팡 · 김○○', '2', '|합포장'],
  ['#c1d8ce', '배 3kg', '쿠팡 · 김○○', '1', '|합포장'],
  ['#e9c7c5', '포도 2kg', '네이버 · 이○○', '1', 'd-chip--low|확인 필요'],
  ['#d9ddc4', '귤 10kg', '네이버 · 박○○', '3', '|정리됨'],
  ['#ced3da', '단감 5kg', '토스 · 최○○', '1', '|정리됨'],
  ['#f2ebdf', '사과즙 30포', '올웨이즈 · 정○○', '2', '|정리됨'],
];

const hero = `
<section class="hero hero--collage" data-enter aria-labelledby="hero-h">
  <div class="wrap"><div class="hero-text grid hero__grid">
    <div class="hero__text span-5">
      <h1 id="hero-h">온라인 셀러를 위한 주문·송장 엑셀 정리</h1>
      <p class="hero__lead">쇼핑몰 주문 엑셀을 올리면 택배사에 넣을 파일을 만들고, 받아 온 송장 번호를 주문마다 붙여 쇼핑몰별 파일로 나눠 드려요. 기본 플랜은 월 ${won(PLANS[1].price)}이에요.</p>
      <div class="btn-row"><a class="btn btn--primary" href="${APP_URL}">${MAIN_ACTION}${ARROW}</a><a class="btn btn--secondary" href="#price">가격 보기</a></div>
      <p class="hero__proof">${shops} 주문 엑셀을 바로 읽어요.</p>
    </div>
    <div class="hero__art span-6 start-7" data-fx="grain-gradient" data-fx-seed="7" role="img" aria-label="${APP_NAME}가 같은 사람의 주문을 위로 모아 정리한 주문 목록과, 168건에 송장 번호를 붙인 결과 카드">
      <div class="ly-piece ly-piece--main d-win" aria-hidden="true">
        <div class="d-win__bar"><span class="d-win__dots"><i></i><i></i><i></i></span><span>${APP_NAME} · 11월 20일 주문</span></div>
        <div class="d-win__body">
          <div class="d-side">
            <span class="is-on"><i></i>주문정리</span><span><i></i>리포트</span><span><i></i>품목사전</span><span><i></i>설정</span>
            <span class="d-side__label">쇼핑몰</span><span><i></i>쿠팡</span><span><i></i>스마트스토어</span>
          </div>
          <div class="d-main">
            <div class="d-main__head"><h4>주문 170건</h4><span class="d-btn">택배사 파일 받기</span></div>
            <div class="d-tabs"><span class="is-on">전체 170</span><span>합포장 12</span><span>확인 필요 2</span></div>
            <div class="d-rows">
              ${heroRows
                .map(([c, name, who, qty, st]) => {
                  const [cls, label] = st.split('|');
                  return `<div class="d-row"><span class="d-thumb" style="background:${c}"></span><div><b>${name}</b><small>${who}</small></div><span class="num">${qty}</span><span class="d-chip ${cls}">${label}</span></div>`;
                })
                .join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="ly-piece ly-piece--note d-card" aria-hidden="true" data-ly-steps="700">
        <div class="d-card__row"><h5>송장 맞추기</h5><span class="d-chip" data-step data-step-at="4">완료</span></div>
        <div class="d-note__line" data-step><i class="warn">!</i><span><b>2건</b>은 받는 사람 이름이 달라요</span></div>
        <div class="d-note__line" data-step><i>✓</i><span><b>168건</b>에 송장 번호를 붙였어요</span></div>
        <div class="d-note__line" data-step><i>✓</i><span>쇼핑몰 파일 <b>2개</b>를 만들었어요</span></div>
      </div>
    </div>
  </div></div>
</section>`;

// ---------- app-frame ----------
const fileRows: [string, string, string, string, string, string][] = [
  // [tone, 줄임, 쇼핑몰, 파일 · 건수, 상태 class, 상태 글자]
  ['1', '쿠', '쿠팡', '11월_쿠팡_주문.xlsx · 98건', 'is-done', '정리됨'],
  ['3', '네', '네이버 스마트스토어', '11월_스마트스토어_주문.xlsx · 72건', 'is-done', '정리됨'],
  ['4', 'CJ', 'CJ대한통운', '송장_1120.xlsx · 170건', 'is-done', '맞춤'],
  ['2', '쿠', '쿠팡', '쿠팡_발송처리.xlsx · 97건', 'is-done', '받음'],
  ['5', '네', '네이버 스마트스토어', '스마트스토어_발송처리.xlsx · 71건', 'is-done', '받음'],
  ['1', '토', '토스', '11월_토스_주문.xlsx · 14건', 'is-you', '확인 필요'],
  ['3', '식', '식봄', '11월_식봄_주문.xlsx · 9건', '', '정리 전'],
  ['4', '올', '올웨이즈', '11월_올웨이즈_주문.xlsx · 21건', '', '정리 전'],
  ['5', 'G', 'G마켓(옥션ESM)', '11월_G마켓_주문.xlsx · 6건', '', '정리 전'],
  ['2', '롯', '롯데택배', '송장_1119.xlsx · 33건', 'is-done', '맞춤'],
];

const sheetRows: [string, string, string, string][] = [
  ['김○○', '사과 5kg, 선물용', '2', '6894 2210 3381'],
  ['김○○', '배 3kg', '1', '6894 2210 3381'],
  ['박○○', '귤 10kg', '3', '6894 2210 3412'],
  ['최○○', '단감 5kg', '1', '6894 2210 3429'],
  ['이○○', '포도 2kg', '1', ''],
  ['정○○', '사과즙 30포', '2', '6894 2210 3445'],
  ['한○○', '사과 10kg', '1', '6894 2210 3460'],
  ['윤○○', '배 5kg', '2', '6894 2210 3478'],
  ['장○○', '귤 5kg', '1', '6894 2210 3483'],
  ['임○○', '사과 5kg', '1', '6894 2210 3497'],
  ['오○○', '단감 10kg', '1', '6894 2210 3502'],
  ['서○○', '귤 10kg', '2', '6894 2210 3516'],
  ['신○○', '사과 3kg', '1', '6894 2210 3524'],
  ['권○○', '배 3kg', '1', '6894 2210 3531'],
];

const app = `
<section class="section" id="app" aria-labelledby="app-h">
  <div class="wrap">
    <div class="grid grid--top">
      <h2 id="app-h" class="span-5">주문서와 송장을 한 화면에서 맞춰요</h2>
      <div class="span-6 start-7 stack-4">
        <p>왼쪽에 올린 주문 엑셀과 송장 엑셀이 쌓이고, 오른쪽에서 주문마다 붙은 송장 번호를 바로 확인해요. 받는 사람이 다른 주문은 비워 두고 따로 알려 드려요.</p>
        <a class="link" href="#faq">자주 묻는 질문 보기</a>
      </div>
    </div>
    <div class="ui app fill" role="img" aria-label="${APP_NAME} 주문정리 화면: 올린 파일 목록 옆에 송장 번호를 붙인 쿠팡 발송처리 파일" data-ui-pause-host>
      <div class="app__pane app__pane--list">
        <div class="ui ui-panel ui-win" data-ui="window" data-open="정리 전" data-work="정리 중" data-done="정리됨">
          <div class="ui-win__bar">
            <span class="ui-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="ui-win__crumb">${APP_NAME} <i>/</i> <b>주문정리</b></span>
            <span class="ui-spacer"></span>
            <span class="ui-win__search" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg><span class="ui-win__ph">찾기</span><span class="ui-kbd">/</span></span>
          </div>
          <div class="ui-win__body">
            <nav class="ui-win__side" aria-hidden="true">
              <span class="ui-win__nav is-on"><svg class="ui-icon" viewBox="0 0 16 16"><path d="M4 2.5h5l3 3v8H4z"/><path d="M9 2.5v3h3"/></svg>파일<em>10</em></span>
              <span class="ui-win__nav"><svg class="ui-icon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.5"/><path d="M8 10.8v.2"/></svg>확인 필요<em>2</em></span>
              <span class="ui-win__nav"><svg class="ui-icon" viewBox="0 0 16 16"><path d="m3.5 8.4 2.8 2.8 6.2-6.4"/></svg>받은 파일<em>2</em></span>
              <span class="ui-win__label">쇼핑몰</span>
              <span class="ui-win__nav"><span class="ui-win__hash">#</span>쿠팡</span>
              <span class="ui-win__nav"><span class="ui-win__hash">#</span>스마트스토어</span>
            </nav>
            <div class="ui-win__main">
              <div class="ui-win__cols" aria-hidden="true"><span>쇼핑몰</span><span>파일</span><span>상태</span><span>시간</span></div>
              <ul class="ui-win__rows">
                ${fileRows
                  .map(
                    ([tone, ab, who, sub, cls, st], i) =>
                      `<li class="ui-win__row" data-row><span class="ui-avatar" data-tone="${tone}">${ab}</span><span class="ui-win__who">${who}</span><span class="ui-win__sub">${sub}</span><span class="ui-win__st ${cls}" data-st>${st}</span><span class="ui-win__age">${2 + i * 3}분</span></li>`,
                  )
                  .join('')}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div class="app__pane app__pane--open">
        <div class="ui ui-panel sheet">
          <div class="sheet__head">
            ${XLSX}<span class="sheet__name">쿠팡_발송처리.xlsx</span><span class="sheet__meta">97건 · 송장 96건</span>
            <span class="ui-spacer"></span><span class="ui-btn ui-btn--primary">파일 받기</span>
          </div>
          <table class="sheet__table">
            <thead><tr><th>받는 사람</th><th>상품</th><th class="num">수량</th><th>택배사</th><th>송장 번호</th></tr></thead>
            <tbody>
              ${sheetRows
                .map(
                  ([who, item, qty, no]) =>
                    `<tr${no ? '' : ' class="is-mark"'}><td>${who}</td><td>${item}</td><td class="num">${qty}</td><td>CJ대한통운</td><td class="num">${no || '받는 사람 이름 확인'}</td></tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</section>`;

// ---------- features 2x2 ----------
const mesh = (seed: number) =>
  `data-fx="gradient-mesh" data-fx-seed="${seed}" data-fx-params='{"drift":0}'`;

const features = `
<section class="section g2" id="features" aria-labelledby="features-h">
  <div class="wrap">
    <div class="group">
      <div class="section-head">
        <h2 id="features-h">엑셀 정리를 대신 해요. <span class="muted">양식 구분부터 확인할 주문까지 알아서 골라요.</span></h2>
      </div>
      <div class="grid">
        <article class="card card--row card--open span-6">
          <h3>쇼핑몰 양식을 알아서 구분해요</h3>
          <p>${SUPPORTED_SHOPS.length}곳의 주문 엑셀을 한꺼번에 올려도 파일마다 어느 쇼핑몰 양식인지 읽어 내요.</p>
          <div class="panel" ${mesh(21)}>
            <div class="stage stage--fade-b"><div class="at-rise fit" style="--fit-max:380px;--ax:max(24px, 50% - 190px);--ay:calc(100% - 180px);--ay-sm:calc(100% - 180px)" data-ui-loop>
              <div class="ui ui-notify" data-ui="notify">
                <ul class="ui-notify__list" data-notify-list>
                  <li class="ui-note"><span class="ui-note__ico">${XLSX}</span><span class="ui-note__text"><span class="ui-note__title">쿠팡 양식으로 읽었어요<time>방금</time></span><span class="ui-note__body">11월_쿠팡_주문.xlsx, 주문 98건</span></span></li>
                  <li class="ui-note"><span class="ui-note__ico">${XLSX}</span><span class="ui-note__text"><span class="ui-note__title">스마트스토어 양식이에요<time>방금</time></span><span class="ui-note__body">11월_스마트스토어_주문.xlsx, 72건</span></span></li>
                  <li class="ui-note"><span class="ui-note__ico">${XLSX}</span><span class="ui-note__text"><span class="ui-note__title">토스 양식으로 읽었어요<time>1분</time></span><span class="ui-note__body">11월_토스_주문.xlsx, 주문 14건</span></span></li>
                </ul>
              </div>
            </div></div>
          </div>
        </article>
        <article class="card card--row card--open span-6">
          <h3>같은 사람에게 갈 주문을 모아요</h3>
          <p>받는 사람과 주소가 같은 주문은 위쪽에 모으고, 품목별로 정렬해서 택배사 파일을 만들어요.</p>
          <div class="panel" ${mesh(34)}>
            <div class="stage stage--fade-b"><div class="at-rise fit" style="--fit-max:340px;--ax:max(24px, 50% - 170px);--ay:56px;--ay-sm:24px">
              <div class="ui ui-panel ui-checks" data-ui="checklist">
                <div class="ui-checks__head"><div class="ui-title">주문 정리</div><span class="ui-spacer"></span><div class="ui-meta" data-checks-count>2 / 5 완료</div></div>
                <div class="ui-checks__bar"><i data-checks-bar style="--k:0.4"></i></div>
                <ul class="ui-checks__list">
                  <li class="ui-check is-done"><span class="ui-check__box">${CHECK}</span><span class="ui-check__label">쇼핑몰 양식 구분하기</span></li>
                  <li class="ui-check is-done"><span class="ui-check__box">${CHECK}</span><span class="ui-check__label">상품명을 품목사전으로 바꾸기</span></li>
                  <li class="ui-check"><span class="ui-check__box">${CHECK}</span><span class="ui-check__label">합포장 주문 위로 모으기</span></li>
                  <li class="ui-check"><span class="ui-check__box">${CHECK}</span><span class="ui-check__label">품목별로 정렬하기</span></li>
                  <li class="ui-check"><span class="ui-check__box">${CHECK}</span><span class="ui-check__label">택배사 파일 만들기</span></li>
                </ul>
              </div>
            </div></div>
          </div>
        </article>
      </div>
    </div>
    <div class="grid">
      <article class="card card--row card--open span-6">
        <h3>확인할 주문을 먼저 보여 줘요</h3>
        <p>받는 사람 이름이 비었거나 전화번호가 10자리보다 짧은 주문을 송장을 뽑기 전에 골라 둬요.</p>
        <div class="panel panel--device">
          <div class="panel__bar"><span class="mark" data-mark="dots" aria-hidden="true"></span><span>${APP_NAME}</span><span class="muted">확인할 주문 3건</span><span class="sp"></span><span class="panel__status"><i></i>정리 중</span></div>
          <div class="panel__screen" ${mesh(47)}>
            <div class="stage stage--fade-b"><div class="at-corner fit" style="--ax:24px;--ay:28px;--fit-max:456px">
              <div class="ui ui-panel ui-win" data-ui="window" data-ui-opts='{"compact":true}' data-open="확인 필요" data-work="확인 중" data-done="고침">
                <div class="ui-win__bar"><span class="ui-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="ui-win__crumb">확인할 주문</span><span class="ui-spacer"></span></div>
                <div class="ui-win__body">
                  <div class="ui-win__main">
                    <ul class="ui-win__rows">
                      <li class="ui-win__row" data-row><span class="ui-avatar" data-tone="1">이</span><span class="ui-win__who">이○○</span><span class="ui-win__sub">받는 사람 이름이 송장과 달라요</span><span class="ui-win__st" data-st>확인 필요</span><span class="ui-win__age">1분</span></li>
                      <li class="ui-win__row" data-row><span class="ui-avatar" data-tone="3">?</span><span class="ui-win__who">이름 없음</span><span class="ui-win__sub">주문 2077, 받는 사람 칸이 비었어요</span><span class="ui-win__st" data-st>확인 필요</span><span class="ui-win__age">3분</span></li>
                      <li class="ui-win__row" data-row><span class="ui-avatar" data-tone="4">한</span><span class="ui-win__who">한○○</span><span class="ui-win__sub">전화번호가 9자리예요</span><span class="ui-win__st" data-st>확인 필요</span><span class="ui-win__age">5분</span></li>
                      <li class="ui-win__row" data-row><span class="ui-avatar" data-tone="2">윤</span><span class="ui-win__who">윤○○</span><span class="ui-win__sub">주소에 동·호수가 없어요</span><span class="ui-win__st is-done" data-st>고침</span><span class="ui-win__age">8분</span></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div></div>
          </div>
        </div>
      </article>
      <article class="card card--row card--open span-6">
        <h3>상품명을 품목사전으로 맞춰요</h3>
        <p>광고 문구가 붙은 긴 상품명을 내가 정한 짧은 이름으로 바꿔서 품목별로 셀 수 있게 해요.</p>
        <div class="panel" ${mesh(58)}>
          <div class="stage stage--fade-b"><div class="at-rise to-edge" style="--w:380px;--ax:max(24px, 50% - 190px);--ay:56px;--ay-sm:24px">
            <div class="ui ui-panel ui-search" data-ui="search">
              <div class="ui-search__field">
                <svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
                <span class="ui-search__q"><span data-search-q>꿀사과 5kg 선물용</span><i class="ui-search__caret"></i></span>
                <kbd class="ui-search__kbd">Ctrl K</kbd>
              </div>
              <div class="ui-search__group">품목사전</div>
              <ul class="ui-search__list" data-search-list>
                <li class="ui-search__row is-sel"><span class="ui-search__ico">${XLSX}</span><span class="ui-search__t"><b>사과 5kg</b> (선물용)</span><span class="ui-search__m">12건</span></li>
                <li class="ui-search__row"><span class="ui-search__ico">${XLSX}</span><span class="ui-search__t"><b>사과</b> 10kg</span><span class="ui-search__m">4건</span></li>
                <li class="ui-search__row"><span class="ui-search__ico">${XLSX}</span><span class="ui-search__t"><b>사과</b>즙 30포</span><span class="ui-search__m">2건</span></li>
              </ul>
              <div class="ui-search__foot"><span><kbd>&uarr;</kbd><kbd>&darr;</kbd> 이동</span><span><kbd>Enter</kbd> 바꾸기</span></div>
            </div>
          </div></div>
        </div>
      </article>
    </div>
  </div>
</section>`;

// ---------- pricing ----------
const pricing = `
<section class="section" id="price" aria-labelledby="price-h" style="--hm: 2">
  <div class="wrap">
    <div class="section-head">
      <h2 id="price-h">월 단위 요금</h2>
      <p>무료 플랜으로 월 ${FREE_MONTHLY_UPLOADS}회까지 써 보고, 주문이 늘면 바꾸세요.</p>
    </div>
    <div class="grid">
      ${PLANS.map((plan) => {
        const featured = plan.name === '기본';
        const label = `${plan.name} 플랜 시작하기`;
        return `<article class="card card--plan span-4 m-nolift${featured ? ' is-featured' : ''}">
          <h3>${plan.name}${featured ? ' <span class="badge">많이 써요</span>' : ''}</h3>
          <p>${plan.desc}</p>
          <p class="price"><span class="t-stat">${won(plan.price)}</span><span class="muted">/ 월</span></p>
          <a class="btn ${featured ? 'btn--primary' : 'btn--secondary'}" href="${APP_URL}">${label}</a>
          <ul class="checks">${plan.features.map((f) => `<li>${f}</li>`).join('')}</ul>
        </article>`;
      }).join('')}
    </div>
  </div>
</section>`;

// ---------- privacy: the dark band with its moment ----------
const privacy = `
<section class="section ground-inverse" id="privacy" aria-labelledby="privacy-h" data-moment="line-carries-colour" data-moment-opts='{"from":"base"}'>
  <div class="wrap">
    <div class="grid grid--top">
      <div class="span-5 stack-6">
        <h2 id="privacy-h">주문 파일은 이 브라우저 안에서만 다뤄요</h2>
        <p class="t-lead">받는 사람 이름, 주소, 연락처가 든 엑셀을 서버로 보내지 않아요. 비밀번호가 걸린 엑셀도 내 컴퓨터에서 풀어요.</p>
        <ul class="facts">
          <li><b>계정에 저장하는 것</b><span>품목사전과 쇼핑몰·택배사 설정</span></li>
          <li><b>새로고침하면</b><span>올린 주문 파일과 결과가 사라져요</span></li>
          <li><b>택배사</b><span>${SUPPORTED_COURIERS.join(', ')} 송장 엑셀</span></li>
        </ul>
      </div>
      <div class="frame frame--split span-6 start-7">
        <div class="stage stage--fade-br"><div class="at-corner to-edge" style="--ax:56px;--ay:56px">
          <div class="ui ui-panel unlock" role="img" aria-label="비밀번호가 걸린 스마트스토어 주문 엑셀을 브라우저에서 여는 창">
            <div class="unlock__head">${XLSX}<span class="unlock__name">11월_스마트스토어_주문.xlsx</span><span class="ui-spacer"></span><span class="unlock__lock">비밀번호 필요</span></div>
            <div class="unlock__body">
              <p class="unlock__label">비밀번호</p>
              <div class="unlock__field"><span>●●●●●●●●</span><i class="ui-search__caret"></i></div>
              <div class="unlock__row"><span class="unlock__note">파일은 이 브라우저 밖으로 나가지 않아요</span><span class="ui-spacer"></span><span class="ui-btn ui-btn--primary">열기</span></div>
              <ul class="unlock__list">
                <li><span>시트</span><b>주문목록</b></li>
                <li><span>읽은 주문</span><b>72건</b></li>
                <li><span>서버로 보낸 파일</span><b>0개</b></li>
              </ul>
            </div>
          </div>
        </div></div>
      </div>
    </div>
  </div>
</section>`;

// ---------- faq ----------
const faqItems = (items: Faq[]) =>
  items.map((f) => `<div class="faq__item"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join('');

const faq = `
<section class="section" id="faq" aria-labelledby="faq-h">
  <div class="wrap">
    <div class="grid grid--top">
      <div class="span-5 stack-4">
        <h2 id="faq-h">자주 묻는 질문</h2>
        <p class="muted">더 궁금한 점은 로그인한 뒤 왼쪽 메뉴의 문의하기로 보내 주세요.</p>
      </div>
      <div class="faq span-6 start-7" data-faq-list>${faqItems(DEFAULT_FAQS)}</div>
    </div>
  </div>
</section>`;

// ---------- close + footer ----------
const business = [
  BUSINESS_INFO.name && `상호 ${esc(BUSINESS_INFO.name)}`,
  BUSINESS_INFO.owner && `대표 ${esc(BUSINESS_INFO.owner)}`,
  BUSINESS_INFO.regNo && `사업자등록번호 ${esc(BUSINESS_INFO.regNo)}`,
  BUSINESS_INFO.email && esc(BUSINESS_INFO.email),
].filter(Boolean);

const footer = `
<footer class="footer closing footer--statement" id="contact" aria-labelledby="close-h">
  <div class="wrap">
    <div class="closing__cta close--word">
      <div class="section-head--split">
        <div><h2 id="close-h">무료 플랜으로 월 ${FREE_MONTHLY_UPLOADS}회 정리</h2><p class="t-lead">기본 플랜은 월 ${won(PLANS[1].price)}, 올리는 횟수에 제한이 없어요.</p></div>
        <a class="btn btn--primary" href="${APP_URL}">${MAIN_ACTION}${ARROW}</a>
      </div>
      <p class="close__word" aria-hidden="true">${APP_NAME}</p>
    </div>
    <div class="closing__links">
      <div class="grid">
        <div class="span-4 stack-4">
          <a class="nav__logo" href="#top"><span class="mark" data-mark="dots" aria-hidden="true"></span>${APP_NAME}</a>
          <p class="footer__lede">온라인 셀러의 주문 엑셀과 송장 파일을 정리하는 서비스예요.</p>
        </div>
        <div class="span-2 footer__col"><h3>서비스</h3><ul><li><a href="#app">화면</a></li><li><a href="#features">기능</a></li><li><a href="#price">가격</a></li></ul></div>
        <div class="span-2 footer__col"><h3>도움말</h3><ul><li><a href="#privacy">개인정보</a></li><li><a href="#faq">질문</a></li></ul></div>
        <div class="span-2 footer__col"><h3>계정</h3><ul><li><a href="${APP_URL}">로그인</a></li></ul></div>
      </div>
      <div class="footer__legal">
        <span>&copy; 2026 ${APP_NAME}${business.length ? ` &nbsp; ${business.join(' · ')}` : ''}</span>
        <div class="socials"></div>
        <span class="credits">쇼핑몰·택배사 이름은 각 회사의 상표예요. 파일 아이콘: vscode-icons (MIT)</span>
      </div>
    </div>
  </div>
</footer>`;

export function mountLanding(): void {
  document.getElementById('root')?.remove();
  document.body.insertAdjacentHTML(
    'afterbegin',
    `${nav}<main id="top">${hero}${app}${features}${pricing}${privacy}${faq}</main>${footer}`,
  );

  // 관리자가 바꾼 질문이 있으면 불러와서 바꿉니다
  loadFaqs().then((items) => {
    const list = document.querySelector('[data-faq-list]');
    if (list && items !== DEFAULT_FAQS) list.innerHTML = faqItems(items);
  });

  // kit의 동작(nav, 효과, 조각, 모먼트, hover)을 붙입니다. 순서는 starter.html과 같습니다.
  for (const src of ['/assets/system.js', '/assets/motion/motion.js', '/assets/layout/layout.js']) {
    const s = document.createElement('script');
    s.type = 'module';
    s.src = src;
    document.body.appendChild(s);
  }
}
