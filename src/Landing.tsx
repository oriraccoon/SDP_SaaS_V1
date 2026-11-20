import { useEffect, useState } from 'react';
import { motion, useReducedMotion, useScroll } from 'motion/react';
import { APP_NAME, BUSINESS_INFO, FREE_MONTHLY_UPLOADS, PLANS } from './config/brand';
import { DEFAULT_FAQS, loadFaqs, type Faq } from './lib/siteContent';
import { SUPPORTED_COURIERS, SUPPORTED_SHOPS } from './lib/supported';

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const toc = [
  { id: 'intro', label: '소개' },
  { id: 'pain', label: '왜 만들었나' },
  { id: 'steps', label: '사용 순서' },
  { id: 'audience', label: '맞는 분' },
  { id: 'price', label: '가격' },
  { id: 'faq', label: '질문' },
];

const steps = [
  { no: '1', title: '주문 엑셀을 올려요', desc: '쇼핑몰에서 받은 주문 엑셀을 올리면 택배사에 넣을 파일이 나와요.' },
  { no: '2', title: '택배사에서 송장을 받아요', desc: '택배사 사이트에 그 파일을 올리고, 송장 번호가 들어 있는 엑셀을 받아요.' },
  { no: '3', title: '송장을 맞춰요', desc: '송장 엑셀을 올리면 받는 사람과 상품을 대조해서 주문마다 송장 번호를 붙여요.' },
  { no: '4', title: '쇼핑몰에 올려요', desc: '쇼핑몰별로 나뉜 파일을 각 쇼핑몰 관리자 화면에 올리면 발송 처리가 끝나요.' },
];

const audiences = [
  { title: '셀러를 막 시작했다면', desc: '엑셀이 복잡해도 화면 위 단계 표시를 따라 누르면 돼요.' },
  { title: '주문을 손으로 옮기고 있다면', desc: '송장 번호를 한 줄씩 붙여 넣던 일을 파일 두 번 올리는 일로 바꿔요.' },
  { title: '쇼핑몰을 여러 곳 쓴다면', desc: '쇼핑몰마다 다른 주문 양식을 알아서 구분하고, 올릴 파일도 쇼핑몰별로 나눠 드려요.' },
];

const facts = [
  { lead: `쇼핑몰 ${SUPPORTED_SHOPS.length}곳`, body: `${SUPPORTED_SHOPS.join(', ')} 양식이 들어 있어요. 다른 쇼핑몰은 설정에서 열 위치만 맞추면 돼요.` },
  { lead: `택배사 ${SUPPORTED_COURIERS.length}곳`, body: `${SUPPORTED_COURIERS.join(', ')} 송장 엑셀을 바로 읽어요.` },
  { lead: '주문 파일은 저장하지 않아요', body: '받는 사람 이름과 주소는 이 브라우저 안에서만 다루고, 새로고침하면 사라져요.' },
  { lead: '암호 걸린 엑셀도 돼요', body: '비밀번호를 넣으면 파일을 서버로 보내지 않고 내 컴퓨터에서 풀어요.' },
];

const demoSteps = ['주문 올리기', '송장 받기', '송장 맞추기', '쇼핑몰에 올리기'];

// 목차 선 길이: 마우스 위치(i)에서 멀어질수록 완만하게 줄어든다
function tocWidth(index: number, hover: number | null, active: boolean): number {
  const base = active ? 24 : 14;
  if (hover === null) return base;
  const d = index - hover;
  return Math.max(base, 14 + 30 * Math.exp(-(d * d) / 1.6));
}

const won = (n: number) => (n === 0 ? '0원' : `${n.toLocaleString('ko-KR')}원`);

const btnPrimary =
  'pressable inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand-600 px-8 text-base font-bold text-white hover:bg-brand-700';

export default function Landing() {
  const { scrollYProgress } = useScroll();
  const reduce = useReducedMotion();
  const [faqs, setFaqs] = useState<Faq[]>(DEFAULT_FAQS);
  const [active, setActive] = useState<string>('intro');
  const [demoStep, setDemoStep] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  // 첫 화면에만 한 번 들어오는 움직임
  const enter = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay, ease: EASE_OUT },
        };

  useEffect(() => {
    loadFaqs().then(setFaqs);
  }, []);

  // 화면 가운데 근처에 걸린 섹션을 현재 섹션으로 본다
  useEffect(() => {
    const els = toc
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => el !== null);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const business = [
    BUSINESS_INFO.name && `상호 ${BUSINESS_INFO.name}`,
    BUSINESS_INFO.owner && `대표 ${BUSINESS_INFO.owner}`,
    BUSINESS_INFO.regNo && `사업자등록번호 ${BUSINESS_INFO.regNo}`,
    BUSINESS_INFO.email && BUSINESS_INFO.email,
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* 스크롤 진행 막대 */}
      <motion.div
        className="fixed inset-x-0 top-0 z-30 h-1 origin-left bg-brand-600"
        style={{ scaleX: scrollYProgress }}
      />

      <header className="relative z-20 border-b border-slate-100 bg-white/90 backdrop-blur lg:fixed lg:inset-x-0 lg:top-1">
        <div className="flex w-full items-center justify-between px-6 py-4 sm:px-12 lg:pl-[19rem] lg:pr-20 xl:pl-[21rem] xl:pr-28">
          <span className="text-lg font-bold text-brand-600">{APP_NAME}</span>
          <a href="/app" className="inline-flex min-h-[44px] items-center px-2 text-sm font-semibold text-brand-600 underline-offset-4 hover:underline">
            로그인
          </a>
        </div>
      </header>

      <div className="flex w-full">
        {/* 왼쪽 목차: 지금 섹션 이름은 늘 보이고, 마우스를 올리면 나머지도 보인다 */}
        <nav
          aria-label="페이지 목차"
          className="fixed left-0 top-0 z-10 hidden h-screen w-56 flex-col justify-center pl-10 lg:flex"
          onMouseLeave={() => setHover(null)}
        >
          <ul className="space-y-2">
            {toc.map((t, i) => {
              const on = active === t.id;
              const show = on || hover !== null;
              return (
                <li key={t.id} onMouseEnter={() => setHover(i)}>
                  <a href={`#${t.id}`} className="flex items-center gap-3 py-1" aria-current={on ? 'location' : undefined}>
                    <span
                      style={{ width: `${tocWidth(i, hover, on)}px` }}
                      className={`h-[2px] shrink-0 rounded-full transition-[width,background-color] duration-300 ease-out ${
                        on ? 'bg-brand-600' : 'bg-slate-300'
                      }`}
                    />
                    <span
                      className={`whitespace-nowrap text-xs font-semibold transition-[opacity,transform] duration-200 ease-out ${
                        on ? 'text-brand-600' : 'text-slate-500'
                      } ${show ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0'}`}
                    >
                      {t.label}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 px-6 sm:px-12 lg:ml-56 lg:px-20 xl:px-28">
          {/* 1. 소개 */}
          <section id="intro" className="flex min-h-screen scroll-mt-24 flex-col justify-center pb-16 pt-10 lg:pt-24">
            <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-[1fr_1.15fr] [&>*]:min-w-0">
              <div>
                <motion.h1
                  {...enter(0)}
                  className="text-5xl font-bold leading-[1.15] tracking-[-0.03em] text-balance sm:text-7xl"
                >
                  엑셀 정리,<br />한 번에 끝
                </motion.h1>
                <motion.p {...enter(0.1)} className="mt-8 max-w-xl text-lg leading-relaxed text-slate-600">
                  쇼핑몰 주문 엑셀을 올리면 택배사에 넣을 파일을 만들고, 받아 온 송장 번호를 주문마다 붙여 쇼핑몰별 업로드 파일까지 만들어 드려요.
                </motion.p>
                <motion.div {...enter(0.2)} className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <a href="/app" className={btnPrimary}>
                    무료로 시작하기
                  </a>
                  <span className="text-sm text-slate-500">무료 플랜은 월 {FREE_MONTHLY_UPLOADS}회까지 올릴 수 있어요</span>
                </motion.div>
                <motion.p {...enter(0.25)} className="mt-12 text-sm leading-relaxed text-slate-500">
                  <span className="font-semibold text-slate-700">바로 읽는 쇼핑몰 양식</span>
                  <span className="mx-2 text-slate-300">|</span>
                  {SUPPORTED_SHOPS.join(' · ')}
                </motion.p>
              </div>

              {/* 실제 작업 화면 미리보기: 단계를 누르면 그 화면으로 바뀐다 */}
              <motion.div {...enter(0.15)} className="rounded-3xl bg-brand-50 p-5 sm:p-7">
                <div className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_28px_rgba(25,31,40,0.08)]">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                    <span className="text-sm font-bold text-brand-600">{APP_NAME}</span>
                    <span className="text-xs font-semibold text-slate-500">주문 정리</span>
                  </div>
                  <div className="space-y-4 p-5">
                    <div role="tablist" aria-label="작업 단계" className="grid grid-cols-2 gap-2 text-xs font-semibold xl:grid-cols-4">
                      {demoSteps.map((label, i) => (
                        <button
                          key={label}
                          type="button"
                          role="tab"
                          aria-selected={demoStep === i}
                          onClick={() => setDemoStep(i)}
                          className={`pressable min-h-[40px] rounded-lg px-2 xl:whitespace-nowrap ${
                            demoStep === i ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          <span className="tabular-nums">{i + 1}</span> {label}
                        </button>
                      ))}
                    </div>

                    <div className="min-h-[188px]">
                      {demoStep === 0 && (
                        <div className="space-y-4">
                          <div className="rounded-xl border border-dashed border-brand-600 bg-brand-50 px-5 py-6 text-center">
                            <p className="text-sm font-bold">주문 엑셀을 여기에 놓으세요</p>
                            <p className="mt-1 text-xs text-slate-500">여러 파일을 한 번에 올려도 돼요</p>
                          </div>
                          <DemoTable head={['파일', '주문 수']} rows={[['11월_쿠팡_주문.xlsx', '98'], ['11월_스마트스토어_주문.xlsx', '72']]} />
                        </div>
                      )}

                      {demoStep === 1 && (
                        <div className="space-y-4">
                          <p className="text-sm leading-relaxed text-slate-600">
                            택배사 사이트에 정리된 파일을 올리고, 송장 번호가 들어 있는 엑셀을 받아 오세요.
                          </p>
                          <DemoTable head={['택배사 파일', '송장 수']} rows={[['CJ대한통운_송장.xlsx', '170']]} />
                        </div>
                      )}

                      {demoStep === 2 && (
                        <div className="space-y-4">
                          <div className="rounded-xl bg-brand-50 px-5 py-5">
                            <p className="text-xs font-semibold text-brand-600">송장 맞추기 결과</p>
                            <p className="mt-1 text-2xl font-bold tabular-nums">170건 중 168건 맞췄어요</p>
                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                              <div className="h-full w-[99%] rounded-full bg-brand-600" />
                            </div>
                          </div>
                          <DemoTable head={['확인할 주문', '']} rows={[['받는 사람 이름이 다른 주문', '2건']]} />
                        </div>
                      )}

                      {demoStep === 3 && (
                        <div className="space-y-4">
                          <p className="text-sm leading-relaxed text-slate-600">쇼핑몰별 파일을 받아 각 쇼핑몰 관리자 화면에 올리세요.</p>
                          <DemoTable head={['올릴 파일', '주문 수']} rows={[['쿠팡_발송처리.xlsx', '97'], ['스마트스토어_발송처리.xlsx', '71']]} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </section>

          {/* 2. 왜 만들었나 + 확인할 수 있는 사실 */}
          <section id="pain" className="scroll-mt-24 border-t border-slate-100 py-28">
            <p className="text-2xl font-bold leading-snug tracking-[-0.02em] sm:text-4xl">
              수수료 떼고, 광고비 나가고,<br />남는 게 줄어드는 게 지치시죠?
            </p>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              그래서 {APP_NAME}은 부담 없는 가격에, 셀러님께 꼭 필요한 기능만 드리려고 해요.
            </p>
            <dl className="mt-16 grid gap-x-16 gap-y-10 border-t border-slate-100 pt-12 md:grid-cols-2">
              {facts.map((f) => (
                <div key={f.lead}>
                  <dt className="text-lg font-bold text-slate-900">{f.lead}</dt>
                  <dd className="mt-2 max-w-md text-base leading-relaxed text-slate-600">{f.body}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* 3. 사용 순서: 순서 자체가 정보라 번호를 붙인다 */}
          <section id="steps" className="scroll-mt-24 border-t border-slate-100 py-28">
            <h2 className="text-4xl font-bold leading-tight tracking-[-0.02em] sm:text-5xl">네 단계면 발송 준비가 끝나요</h2>
            <ol className="mt-14 divide-y divide-slate-100">
              {steps.map((s) => (
                <li key={s.no} className="flex gap-8 py-8">
                  <span className="w-10 shrink-0 text-3xl font-bold tabular-nums text-brand-600">{s.no}</span>
                  <div>
                    <h3 className="text-2xl font-bold">{s.title}</h3>
                    <p className="mt-2 max-w-xl text-base leading-relaxed text-slate-600">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-sm text-slate-500">2단계와 4단계는 택배사와 쇼핑몰 사이트에서 하는 일이에요.</p>
          </section>

          {/* 4. 맞는 분 */}
          <section id="audience" className="scroll-mt-24 border-t border-slate-100 py-28">
            <h2 className="text-4xl font-bold leading-tight tracking-[-0.02em] sm:text-5xl">이런 분께 맞아요</h2>
            <ul className="mt-14 max-w-2xl space-y-10">
              {audiences.map((a) => (
                <li key={a.title}>
                  <p className="text-2xl font-bold">{a.title}</p>
                  <p className="mt-2 text-lg leading-relaxed text-slate-600">{a.desc}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* 5. 가격: 세 플랜을 한 줄 표처럼 */}
          <section id="price" className="scroll-mt-24 border-t border-slate-100 py-28">
            <h2 className="text-4xl font-bold leading-tight tracking-[-0.02em] sm:text-5xl">가격</h2>
            <p className="mt-4 text-lg text-slate-600">무료로 써 보고, 주문이 늘면 바꾸세요. 모든 플랜은 월 단위예요.</p>
            <div className="mt-14 grid overflow-hidden rounded-2xl border border-slate-200 md:grid-cols-3">
              {PLANS.map((plan, i) => {
                const featured = plan.name === '기본';
                return (
                  <div
                    key={plan.name}
                    className={`flex flex-col p-8 ${i > 0 ? 'border-t border-slate-200 md:border-l md:border-t-0' : ''} ${
                      featured ? 'bg-brand-50' : 'bg-white'
                    }`}
                  >
                    <p className="text-lg font-bold">
                      {plan.name}
                      {featured && <span className="ml-2 align-middle text-sm font-semibold text-brand-600">많이 써요</span>}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{plan.desc}</p>
                    <p className="mt-6 text-4xl font-bold tabular-nums tracking-[-0.02em] text-slate-900">
                      {won(plan.price)}
                      <span className="ml-1 text-base font-medium text-slate-500">/ 월</span>
                    </p>
                    <ul className="mt-6 flex-1 space-y-2 text-base text-slate-700">
                      {plan.features.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                    <a
                      href="/app"
                      className={
                        featured
                          ? `${btnPrimary} mt-8`
                          : 'pressable mt-8 inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-8 text-base font-bold text-slate-800 hover:border-slate-400'
                      }
                    >
                      {plan.price === 0 ? '무료로 시작하기' : `${plan.name} 플랜 시작하기`}
                    </a>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 6. 질문 */}
          <section id="faq" className="scroll-mt-24 border-t border-slate-100 py-28">
            <h2 className="text-4xl font-bold leading-tight tracking-[-0.02em] sm:text-5xl">자주 묻는 질문</h2>
            <div className="mt-12 divide-y divide-slate-100 border-y border-slate-100">
              {faqs.map((f) => (
                <details key={f.q} className="group py-6">
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-xl font-semibold">
                    {f.q}
                    <span
                      aria-hidden="true"
                      className="ml-4 text-2xl font-normal text-slate-400 transition-transform duration-200 ease-out group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="faq-answer mt-3 max-w-2xl text-base leading-relaxed text-slate-600">{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <footer className="flex flex-col gap-2 border-t border-slate-100 py-10 text-sm text-slate-500 sm:flex-row sm:items-start sm:justify-between">
            <span className="font-bold text-brand-600">{APP_NAME}</span>
            {business.length > 0 && <p className="text-xs leading-relaxed sm:text-right">{business.join(' · ')}</p>}
          </footer>
        </main>
      </div>
    </div>
  );
}

function DemoTable({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 text-xs">
      <div className="flex bg-slate-50 px-4 py-2.5 font-semibold text-slate-500">
        <span className="flex-1">{head[0]}</span>
        <span className="w-20 text-right">{head[1]}</span>
      </div>
      {rows.map(([a, b]) => (
        <div key={a} className="flex items-center border-t border-slate-100 px-4 py-3">
          <span className="flex-1 truncate">{a}</span>
          <span className="w-20 text-right font-semibold tabular-nums">{b}</span>
        </div>
      ))}
    </div>
  );
}
