/*
 * 랜딩("/")을 taste 디자인 시스템(public/assets)으로 그립니다. React를 쓰지 않습니다.
 * 앱(/app, /admin)은 main.tsx가 지금처럼 React로 엽니다.
 *
 * type: software
 * deal: hero collage, nav nav-centre, close close-word, footer footer-statement, rhythm dark-band,
 *       buttons pill, mark dots, palette: the client's own green (#1e5b4a) through start.mjs brand,
 *       type instrument (Instrument Sans + DM Mono; Hangul in Noto Sans KR)
 * effect: none. 초록 그라데이션 배경(히어로 grain-gradient, 기능 gradient-mesh)은 사용자 요청으로 뺐고, 히어로 액자와 기능 카드는 평면 surface색
 * moment: line-carries-colour on the privacy section (the dark band): the page turns dark where it talks
 *         about keeping order files in the browser
 */
import { APP_NAME, BUSINESS_INFO, FREE_MONTHLY_UPLOADS, PLANS, PLAN_FEATURE_ROWS } from '../config/brand';
import { DEFAULT_FAQS, loadFaqs, type Faq } from '../lib/siteContent';
import { SUPPORTED_COURIERS, SUPPORTED_SHOPS } from '../lib/supported';
import { isMarkedSignedIn, markSignedIn } from '../lib/signedInFlag';
import { isFirebaseConfigured, logout, watchUser } from '../firebaseAuth';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const MAIN_ACTION = '무료로 시작하기';
const APP_URL = '/app';
// 앱에서 로그인했던 브라우저면 메뉴를 '로그아웃 · 시작하기'로 보여 줍니다 (Firebase는 불러오지 않음)
const SIGNED_IN = isMarkedSignedIn();
// 로그인한 사람에게는 '무료로'를 빼고 '시작하기'만 보여 줍니다
const mainAction = (signedIn: boolean) => (signedIn ? '시작하기' : MAIN_ACTION);
const navActions = (signedIn: boolean) =>
  signedIn
    ? `<button type="button" class="nav__link nav__logout" data-logout>로그아웃</button><a class="btn btn--primary" href="${APP_URL}">${mainAction(true)}</a>`
    : `<a class="nav__link" href="${APP_URL}">로그인</a><a class="btn btn--primary" href="${APP_URL}">${MAIN_ACTION}</a>`;
const ARROW =
  '<svg class="m-arrow" viewBox="0 0 12 12" aria-hidden="true"><path class="m-arrow__stem" d="M1 6h8"/><path class="m-arrow__head" d="M4.5 2.5 8 6l-3.5 3.5"/></svg>';

// 실제 앱 화면 캡처 (public/assets/shots, 예시 데이터로 찍음)
const shot = (name: string, w: number, h: number, alt: string, extra = '') =>
  `<img class="shot" src="/assets/shots/${name}.webp" width="${w}" height="${h}" alt="${alt}" decoding="async" ${extra}>`;

// ---------- nav and the side table of contents ----------
const TOC: [string, string][] = [
  ['intro', '소개'],
  ['app', '화면'],
  ['features', '기능'],
  ['price', '가격'],
  ['privacy', '개인정보'],
  ['faq', '질문'],
];

// 목차: 화면 가운데에 걸린 섹션을 지금 섹션으로 보고, 마우스 근처의 선일수록 길게 늘입니다
function wireToc(): void {
  const toc = document.querySelector<HTMLElement>('.toc');
  if (!toc) return;
  const links = [...toc.querySelectorAll<HTMLAnchorElement>('a[data-toc]')];
  const setActive = (id: string) => {
    links.forEach((a) => (a.dataset.toc === id ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
    toc.dataset.tone = id === 'privacy' ? 'dark' : '';
  };
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
    { rootMargin: '-45% 0px -45% 0px' },
  );
  TOC.forEach(([id]) => {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  });
  setActive('intro');
  links.forEach((a, i) =>
    a.addEventListener('pointerenter', () =>
      links.forEach((b, j) => b.style.setProperty('--grow', String(Math.exp(-((i - j) ** 2) / 1.6)))),
    ),
  );
  toc.addEventListener('pointerleave', () => links.forEach((b) => b.style.removeProperty('--grow')));
}

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
      ${navActions(SIGNED_IN)}
    </div>
    <button class="nav__toggle" type="button" aria-expanded="false" aria-label="메뉴">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 5h14M2 13h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>
  </div>
  <nav class="toc" aria-label="페이지 목차">
    <ol>
      ${TOC.map(([id, label]) => `<li><a href="#${id}" data-toc="${id}"><span class="toc__line" aria-hidden="true"></span><span class="toc__label">${label}</span></a></li>`).join('')}
    </ol>
  </nav>
</header>`;

// ---------- hero: collage ----------
const hero = `
<section class="hero hero--collage" id="intro" data-enter aria-labelledby="hero-h">
  <div class="wrap"><div class="hero-text grid hero__grid">
    <div class="hero__text span-5">
      <h1 id="hero-h">주문·송장 엑셀, 한 번에 정리</h1>
      <p class="hero__fact">매달 ${FREE_MONTHLY_UPLOADS}회 무료, 무제한은 ${won(PLANS[1].price)}부터</p>
      <p class="hero__lead">주문 엑셀을 올리면 택배사 파일과 송장 파일까지 만들어요.</p>
      <div class="btn-row"><a class="btn btn--primary" href="${APP_URL}" data-main-action>${mainAction(SIGNED_IN)}${ARROW}</a><a class="btn btn--secondary" href="#price">가격 보기</a></div>
      <ul class="shop-chips" aria-label="바로 읽는 쇼핑몰">${SUPPORTED_SHOPS.map((n) => `<li>${n}</li>`).join('')}</ul>
    </div>
    <div class="hero__art span-6 start-7">
      <div class="ly-piece ly-piece--main shot-win">${shot('app-overview', 1400, 1050, `${APP_NAME} 주문정리 화면: 주문서 올리기부터 송장 맞추기까지 끝난 모습`, 'fetchpriority="high"')}</div>
      <div class="ly-piece ly-piece--note shot-win" aria-hidden="true">${shot('app-todo', 597, 440, '')}</div>
    </div>
  </div></div>
</section>`;

// ---------- app-frame: 쓰는 순서 4단계 (아이콘 + 짧은 말) ----------
const ICO = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const STEPS: [string, string][] = [
  [ICO('<path d="M12 15V4m0 0-4 4m4-4 4 4"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>'), '주문 엑셀 올리기'],
  [ICO('<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>'), '택배사에서 송장 받기'],
  [ICO('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="m9 14 2 2 4-4"/>'), '송장 엑셀 올리기'],
  [ICO('<path d="M12 4v11m0 0-4-4m4 4 4-4"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>'), '쇼핑몰 파일 받기'],
];
// 단계마다 보여 줄 실제 앱 화면 (public/assets/shots/step1~4, 휴대폰은 -m)
const STEP_ALTS = [
  '주문 엑셀 두 개를 올리자 쿠팡·스마트스토어 양식으로 알아보고 정리한 화면',
  '택배사 사이트에 올릴 택배사 파일 미리 보기',
  '택배사에서 받은 송장 엑셀을 올려 주문 14건 모두에 송장 번호를 붙인 화면',
  '송장 번호를 붙인 쇼핑몰별 파일 미리 보기',
];

// 4단계 탭과 화면 전환은 디자인 키트(system.js)의 탭 기능이 맡습니다 ([role=tablist] + aria-controls).
// 숨겨 둔 단계 사진은 페이지를 다 연 뒤 미리 받아 둡니다 (처음 누를 때 빈 화면이 안 보이게).
function preloadStepShots(): void {
  const run = () => document.querySelectorAll<HTMLImageElement>('#app [data-step-shot] img').forEach((img) => { img.loading = 'eager'; });
  if (document.readyState === 'complete') run(); else window.addEventListener('load', run, { once: true });
}

// ---------- app-frame ----------
const app = `
<section class="section" id="app" aria-labelledby="app-h">
  <div class="wrap">
    <div class="grid grid--top">
      <h2 id="app-h" class="span-12">4단계면 끝나요</h2>
    </div>
    <div class="steps" role="tablist" aria-label="쓰는 순서">
      ${STEPS.map(([icon, label], i) => `<button type="button" role="tab" id="step-tab-${i}" aria-controls="step-shot-${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="steps__ico" aria-hidden="true">${icon}</span><span><small>${i + 1}단계</small>${label}</span></button>`).join('')}
    </div>
    <figure class="shot-frame step-frame">
      ${STEP_ALTS.map((alt, i) => `<div id="step-shot-${i}" role="tabpanel" aria-labelledby="step-tab-${i}" data-step-shot${i === 0 ? '' : ' hidden'}><picture>
        <source media="(max-width: 639px)" srcset="/assets/shots/step${i + 1}-m.webp" width="780" height="1440">
        ${shot(`step${i + 1}`, 2000, 889, alt, 'loading="lazy"')}
      </picture></div>`).join('')}
    </figure>
  </div>
</section>`;

// ---------- features: 두 화면, 카드마다 앱 화면 한 조각 ----------
// 앱 캡처를 줄여 넣지 않고, 앱과 같은 말·모양으로 그 기능이 보이는 몇 줄만 HTML로 그립니다(글씨는 실제 크기).
// 조각은 카드 왼쪽 위에 붙고 오른쪽·아래로 흘러 잘립니다. 강조는 카드마다 하나.
const DOC_ICO = '<svg class="frag__doc" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.5 1.5V5H13M5.5 8.5h5M5.5 11h5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
const WARN_ICO = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 1.8 13h12.4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 6.5v3M8 11.3v.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
const INFO_ICO = '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.8" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M6 3.6v2.8M6 8.2v.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';

// 엑셀 미리 보기 모양 표: 열 글자(A, B, …), 행 번호, 회색 머리줄. opt: 좁은 화면에서 숨기는 열
type Col = { h: string; cls?: string; opt?: boolean };
const sheet = (cols: Col[], rows: string[][], mark: (r: string[], i: number) => boolean) => {
  const td = (c: Col, v: string) => `<td class="${[c.cls, c.opt && 'is-opt'].filter(Boolean).join(' ')}">${v}</td>`;
  return `<table class="frag__sheet">
    <thead>
      <tr class="frag__letters"><td></td>${cols.map((c, i) => td(c, String.fromCharCode(65 + i))).join('')}</tr>
      <tr class="frag__head"><td>1</td>${cols.map((c) => td(c, c.h)).join('')}</tr>
    </thead>
    <tbody>${rows.map((r, i) => `<tr${mark(r, i) ? ' class="is-mark"' : ''}><td>${i + 2}</td>${cols.map((c, j) => td(c, r[j])).join('')}</tr>`).join('')}</tbody>
  </table>`;
};
const PEOPLE: Record<string, [string]> = {
  가상김도윤: ['01012345678'], 가상이서연: ['01055555555'], 가상박지호: ['01099999999'],
  가상최유진: ['01077777777'], 가상정하늘: ['01088888888'],
};
const COURIER_ROWS = [
  ['가상 선크림 SPF50', '1', '가상김도윤'], ['가상 세럼 50ml', '1', '가상김도윤'], ['가상 토너 120ml', '2', '가상김도윤'],
  ['가상 선크림 SPF50', '1', '가상이서연'], ['가상 세럼 50ml', '1', '가상이서연'],
  ['가상 토너 120ml', '1', '가상박지호'], ['가상 선크림 SPF50', '1', '가상박지호'], ['가상 세럼 50ml', '2', '가상박지호'],
  ['가상 앰플 30ml', '1', '가상최유진'], ['가상 토너 120ml', '1', '가상최유진'], ['가상 선크림 SPF50', '3', '가상정하늘'],
  ['가상 세럼 50ml', '1', '가상정하늘'], ['가상 앰플 30ml', '1', '가상정하늘'],
].map(([p, q, n]) => [p, q, n, PEOPLE[n][0]]);
// 앱의 '품목별 정렬' 파일 그대로 (가상 데이터로 찍은 결과): 같은 상품 주문이 위아래로 붙어 나옵니다
const SORTED_ROWS = [
  ['3kg', '나주 신고배 3kg 명절 선물세트', '1', '가상김도윤', '쿠팡'],
  ['5kg', '경북 청송 꿀사과 부사 5kg 선물용 특대과', '1', '가상김도윤', '쿠팡'],
  ['2kg', '캠벨 포도 2kg 당일수확 산지직송', '1', '가상김도윤', '네이버 스마트스토어'],
  ['5kg', '산지직송 꿀맛 제주 감귤 로열과 5kg 가정용', '1', '가상이서연', '네이버 스마트스토어'],
  ['5kg', '경북 청송 꿀사과 부사 5kg 선물용 특대과', '2', '가상이서연', '네이버 스마트스토어'],
  ['5kg', '산지직송 꿀맛 제주 감귤 로열과 5kg 가정용', '1', '가상문하린', '쿠팡'],
  ['5kg', '산지직송 꿀맛 제주 감귤 로열과 5kg 가정용', '2', '가상박지호', '쿠팡'],
  ['5kg', '산지직송 꿀맛 제주 감귤 로열과 5kg 가정용', '1', '가상윤도현', '네이버 스마트스토어'],
  ['5kg', '상주 단감 5kg 아삭한 부유 단감', '2', '가상최유진', '쿠팡'],
  ['3kg', '나주 신고배 3kg 명절 선물세트', '1', '가상강태오', '네이버 스마트스토어'],
  ['5kg', '경북 청송 꿀사과 부사 5kg 선물용 특대과', '2', '가상서지훈', '쿠팡'],
  ['5kg', '경북 청송 꿀사과 부사 5kg 선물용 특대과', '1', '가상오세린', '쿠팡'],
  ['5kg', '경북 청송 꿀사과 부사 5kg 선물용 특대과', '1', '가상조은비', '쿠팡'],
];
const SORTED_MARK = new Set([5, 6, 7, 10, 11, 12]);
const FILES: [string, string, number, string][] = [
  ['DeliveryList_가상쿠팡_주문.xlsx', '5.4 KB', 6, '쿠팡'],
  ['스마트스토어_주문_1120.xlsx', '28.1 KB', 8, '네이버 스마트스토어'],
  ['토스_가상주문.xlsx', '9.8 KB', 3, '토스'],
  ['올웨이즈_가상주문.xlsx', '7.2 KB', 4, '올웨이즈'],
  ['식봄_가상주문.xlsx', '6.5 KB', 5, '식봄'],
  ['ESM_가상주문.xlsx', '11.3 KB', 7, 'G마켓(옥션ESM)'],
];
const ODD: [string, string, string][] = [
  ['가상최유진', '01000000000 · 부산', '주소가 너무 짧아요'],
  ['가상박지호', '01099999999 · 경기가상', '주소가 너무 짧아요'],
  ['가상정하늘', '0101234 · 서울시 가상구 예시로', '전화번호가 7자리예요'],
  ['가상윤바다', '01000000000 · 서울시 가상구 샘플길', '수량이 0개예요'],
  ['가상오세린', '비어 있음 · 경기도 가상시 테스트로', '전화번호가 비었어요'],
];
const DICT: [string, string][] = [
  ['경북 청송 꿀사과 부사 5kg 선물용 특대과', '사과 5kg'],
  ['나주 신고배 3kg 명절 선물세트', '배 3kg'],
  ['산지직송 꿀맛 제주 감귤 로열과 5kg 가정용', '감귤 5kg'],
  ['캠벨 포도 2kg 당일수확 산지직송', '포도 2kg'],
  ['100% 착즙 사과즙 30포 실속형', '사과즙 30포'],
  ['상주 단감 5kg 아삭한 부유 단감', '단감 5kg'],
  ['그린 웰빙 업소용 국산 반달 슬라이스 단무지', '반달단무지'],
  ['국내제조 비린맛 없는 절단 돌산 간장 꽃게장', '게장'],
  ['제주 한라봉 3kg 선물용 고당도 산지직송', '한라봉 3kg'],
];

const FRAGS: Record<string, string> = {
  detect: `<p class="frag__drop">+ 주문 엑셀 더 올리기</p><p class="frag__title">올린 주문 파일 ${FILES.length}개</p>
    <ul class="frag__files">${FILES.map(([n, kb, c, shop]) => `<li>${DOC_ICO}<span class="frag__file"><b>${n}</b><small>${kb} · 주문 ${c}건 <em class="frag__chip">${shop} 양식</em></small></span><span class="frag__select is-opt"><small>읽을 양식</small><span>${shop}</span></span></li>`).join('')}</ul>`,
  pack: sheet(
    [{ h: '상품명' }, { h: '수량', cls: 'num' }, { h: '수령인', cls: 'name' }, { h: '연락처', opt: true }],
    COURIER_ROWS, (r) => r[2] === '가상김도윤'),
  sort: sheet(
    [{ h: '용량', cls: 'opt-wide' }, { h: '상품명' }, { h: '수량', cls: 'num' }, { h: '주문자', cls: 'opt-narrow' }, { h: '쇼핑몰/플랫폼', cls: 'opt-wide' }],
    SORTED_ROWS, (_r, i) => SORTED_MARK.has(i)),
  check: `<div class="frag__alert"><span class="frag__alert-ico">${WARN_ICO}</span><span><b>잘못 배송될 수 있는 주문 ${ODD.length}건</b><small>이름·전화번호·주소가 이상한 주문이에요.</small></span></div>
    <ul class="frag__odd">${ODD.map(([n, line, why]) => `<li><span><b>${n}</b><small>${line}</small></span><em class="frag__flag">${INFO_ICO}${why}</em></li>`).join('')}</ul>`,
  dict: `<table class="frag__dict"><thead><tr><td>상품명에 들어 있는 말</td><td>바꿀 이름</td></tr></thead>
    <tbody>${DICT.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table>`,
};
const FEATS: [key: string, title: string, line: string, label: string][] = [
  ['detect', '쇼핑몰 양식 자동 구분', '양식이 달라도 파일만 올리면 돼요', '올린 주문 파일 여섯 개에 쿠팡 양식, 네이버 스마트스토어 양식, 토스 양식 같은 쇼핑몰 양식 표시가 붙은 목록'],
  ['pack', '같은 사람 주문은 한데 모아', '합포장할 주문이 바로 보여요', '택배사 파일 미리 보기: 가상김도윤의 주문 세 줄이 위아래로 붙어 있는 표'],
  ['sort', '같은 상품끼리 묶어서 정리해요', '상품 이름순이라 같은 상품이 한데 모여요', '품목별 정렬 파일 미리 보기: 제주 감귤 주문 세 줄, 청송 꿀사과 주문 세 줄이 각각 위아래로 붙어 있는 표'],
  ['check', '이상한 주문은 먼저 알려 줘요', '이름·전화번호·주소 점검', '잘못 배송될 수 있는 주문 5건: 주소가 너무 짧은 주문, 전화번호가 7자리인 주문 같은 문제마다 붉은 표시가 붙은 목록'],
  ['dict', '긴 상품명은 짧게', '한 번 정하면 계속 써요', '품목사전: 경북 청송 꿀사과 부사 5kg 선물용 특대과를 사과 5kg으로 바꾸는 것처럼 긴 상품명마다 짧은 이름이 적힌 목록'],
];
const featCard = ([key, title, line, label]: (typeof FEATS)[number]) => `
        <article class="feat feat--${key}">
          <div class="feat__text"><h3>${title}</h3><p>${line}</p></div>
          <div class="frag frag--${key}" role="img" aria-label="${label}">${FRAGS[key]}</div>
        </article>`;

const features = `
<section class="section g2 g2m" id="features" aria-labelledby="features-h">
  <div class="wrap">
    <div class="group">
      <div class="section-head">
        <h2 id="features-h">엑셀 정리는 맡기세요</h2>
      </div>
      <div class="feat-row feat-row--2" role="group" aria-label="기능 카드 1~2">${FEATS.slice(0, 2).map(featCard).join('')}</div>
    </div>
    <div class="group">
      <div class="feat-row feat-row--3" role="group" aria-label="기능 카드 3~5">${FEATS.slice(2).map(featCard).join('')}</div>
    </div>
  </div>
</section>`;

// ---------- pricing ----------
const pricing = `
<section class="section" id="price" aria-labelledby="price-h">
  <div class="wrap">
    <div class="section-head">
      <h2 id="price-h">요금</h2>
      <p>무료는 매달 ${FREE_MONTHLY_UPLOADS}회, 기본은 월 ${won(PLANS[1].price)}</p>
    </div>
    <div class="grid">
      ${PLANS.map((plan) => {
        const featured = plan.name === 'Basic';
        const label = plan.price === 0 ? '무료로 시작하기' : `${plan.name} 플랜 시작하기`;
        return `<article class="card card--plan span-4 m-nolift${featured ? ' is-featured' : ''}">
          <h3>${plan.name}${featured ? ' <span class="badge">많이 써요</span>' : ''}</h3>
          <p>${plan.desc}</p>
          <p class="price"><span class="t-stat">${won(plan.price)}</span><span class="muted">/ ${plan.price === 0 ? `월 ${FREE_MONTHLY_UPLOADS}회` : '월'}</span></p>
          <a class="btn ${featured ? 'btn--primary' : 'btn--secondary'}" href="${APP_URL}">${label}</a>
        </article>`;
      }).join('')}
    </div>
    <table class="plan-compare">
      <thead><tr><th scope="col">기능</th>${PLANS.map((p) => `<th scope="col">${p.name}</th>`).join('')}</tr></thead>
      <tbody>${PLAN_FEATURE_ROWS.map((row) => `<tr><th scope="row">${row.label}</th>${row.included.map((v) => typeof v === 'string' ? `<td class="yes"><span>${v}</span></td>` : `<td class="${v ? 'yes' : 'no'}"><span aria-label="${v ? '포함' : '없음'}">${v ? '✓' : '–'}</span></td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  </div>
</section>`;

// ---------- privacy: the dark band with its moment ----------
const privacy = `
<section class="section ground-inverse" id="privacy" aria-labelledby="privacy-h" data-moment="line-carries-colour" data-moment-opts='{"from":"base"}'>
  <div class="wrap">
    <div class="grid grid--top fill">
      <div class="span-5 stack-6">
        <h2 id="privacy-h">주문 파일은 내 컴퓨터에서만</h2>
        <p class="t-lead">고객 이름·주소·전화번호를 서버로 보내지 않아요.</p>
        <ul class="facts">
          <li><b>계정에 남는 것</b><span>품목사전, 양식 설정</span></li>
          <li><b>새로고침하면</b><span>주문 파일은 지워져요</span></li>
          <li><b>택배사</b><span>${SUPPORTED_COURIERS.join(' · ')}</span></li>
        </ul>
      </div>
      <div class="frame frame--split frame--fill span-6 start-7">
        <div class="stage stage--fade-br"><div class="at-corner to-edge" style="--ax:56px;--ay:56px">
          ${shot('unlock', 840, 508, '비밀번호가 걸린 스마트스토어 주문 엑셀을 여는 창', 'loading="lazy" style="width:520px"')}
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
        <p>더 궁금하면 앱의 '문의하기'로 보내 주세요.</p>
        <figure class="shot-ask">${shot('contact', 1040, 948, `${APP_NAME} 앱의 문의하기 창`, 'loading="lazy"')}</figure>
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
        <div><h2 id="close-h">무료로 정리해 보세요</h2><p class="t-lead">무료는 매달 ${FREE_MONTHLY_UPLOADS}회, 기본은 월 ${won(PLANS[1].price)}</p></div>
        <a class="btn btn--primary" href="${APP_URL}" data-main-action>${mainAction(SIGNED_IN)}${ARROW}</a>
      </div>
      <p class="close__word" aria-hidden="true">${APP_NAME}</p>
    </div>
    <div class="closing__links">
      <div class="grid">
        <div class="span-4 stack-4">
          <a class="nav__logo" href="#top"><span class="mark" data-mark="dots" aria-hidden="true"></span>${APP_NAME}</a>
          <p class="footer__lede">온라인 셀러의 주문 엑셀과 송장 파일을 정리하는 서비스예요.</p>
        </div>
        <div class="span-3 footer__col"><h3>서비스</h3><ul><li><a href="#app">화면</a></li><li><a href="#features">기능</a></li><li><a href="#price">가격</a></li></ul></div>
        <div class="span-3 footer__col"><h3>도움말</h3><ul><li><a href="#privacy">개인정보</a></li><li><a href="#faq">질문</a></li></ul></div>
        <div class="span-2 footer__col"><h3>계정</h3><ul><li><a href="${APP_URL}" data-account-link>${SIGNED_IN ? '앱 열기' : '로그인'}</a></li></ul></div>
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

  wireToc();
  preloadStepShots();

  // 로그인 상태: 첫 화면은 브라우저에 남긴 표시로 그리고(깜빡임 없음), Firebase의 실제 상태로 한 번 더 맞춥니다.
  // (랜딩은 관리자가 고친 질문을 불러오려고 이미 Firebase를 쓰고 있어서 더 무거워지지 않습니다)
  const setSignedIn = (signedIn: boolean) => {
    const box = document.querySelector('.nav__actions');
    if (box) box.innerHTML = navActions(signedIn);
    const acc = document.querySelector('[data-account-link]');
    if (acc) acc.textContent = signedIn ? '앱 열기' : '로그인';
    document.querySelectorAll('[data-main-action]').forEach((a) => { if (a.firstChild) a.firstChild.nodeValue = mainAction(signedIn); });
    document.querySelectorAll<HTMLButtonElement>('[data-logout]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '로그아웃 중…';
        try {
          await logout();
        } finally {
          markSignedIn(false);
          setSignedIn(false);
        }
      });
    });
  };
  setSignedIn(SIGNED_IN);
  if (isFirebaseConfigured) {
    watchUser((user) => {
      if (Boolean(user) !== SIGNED_IN) setSignedIn(Boolean(user));
    });
  }

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
