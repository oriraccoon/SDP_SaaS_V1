import { useEffect, useState } from 'react';
import { motion, useScroll } from 'motion/react';
import { APP_NAME, MONTHLY_PRICE_KRW } from './config/brand';
import { DEFAULT_FAQS, loadFaqs, type Faq } from './lib/siteContent';

// 섹션이 화면에 들어올 때 아래에서 올라오며 나타나는 공통 설정
const reveal = {
  initial: { opacity: 0, y: 48 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

const listContainer = {
  initial: {},
  whileInView: { transition: { staggerChildren: 0.14 } },
  viewport: { once: true, amount: 0.3 },
};

const listItem = {
  initial: { opacity: 0, x: -24 },
  whileInView: { opacity: 1, x: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
};

const toc = [
  { id: 'intro', label: '소개' },
  { id: 'pain', label: '불편함' },
  { id: 'steps', label: '사용 순서' },
  { id: 'audience', label: '대상' },
  { id: 'price', label: '가격' },
  { id: 'faq', label: '질문' },
];

const steps = [
  { no: '01', title: '주문 엑셀을 올려요', desc: '쇼핑몰에서 받은 주문 엑셀을 올리면 택배사에 넣을 파일이 나와요.' },
  { no: '02', title: '택배사에서 송장을 받아요', desc: '택배사 사이트에 파일을 올리고, 송장이 들어 있는 엑셀을 받아요.' },
  { no: '03', title: '송장을 붙이고 다시 올려요', desc: '송장을 붙인 뒤 주문서와 송장 엑셀을 함께 올리면 맞춰 드려요.' },
  { no: '04', title: '쇼핑몰에 올리면 끝이에요', desc: '쇼핑몰별로 나눠진 파일을 각 쇼핑몰에 올리면 발송 준비가 끝나요.' },
];

const audiences = [
  { title: '처음 셀러라면', desc: '엑셀이 복잡해도 화면 순서대로 따라 하면 돼요.' },
  { title: '수작업이 많다면', desc: '주문을 하나씩 옮기던 시간을 줄여 드려요.' },
  { title: '엑셀이 익숙하지 않다면', desc: '어려운 함수나 정렬 없이 버튼만 누르면 돼요.' },
];

const faqs = [
  { q: '주문 정보가 저장되나요?', a: '주문 엑셀 내용은 서버에 저장하지 않아요. 새로고침하면 사라집니다. 상품 이름 사전이나 설정처럼 자주 쓰는 내용만 내 계정에 저장돼요.' },
  { q: '어떤 쇼핑몰을 지원하나요?', a: '주문 엑셀을 내려받을 수 있는 주요 쇼핑몰이 대부분 지원돼요. 양식이 다르면 플랫폼 설정에서 추가할 수 있어요.' },
  { q: '엑셀이 어려워요. 쓸 수 있을까요?', a: '화면에 나오는 순서대로 누르면 돼요. 주문서 올리기, 송장 올리기, 결과 받기 세 가지만 기억하시면 됩니다.' },
  { q: '암호가 걸린 엑셀도 되나요?', a: '네. 파일을 서버로 보내지 않고 내 컴퓨터에서 암호를 풀어요.' },
  { q: '구독을 그만두면 어떻게 되나요?', a: '구독 기간이 끝나면 작업은 할 수 없지만, 설정은 그대로 남아 있어요. 다시 구독하면 이어서 쓸 수 있어요.' },
];

// 목차 선 길이: 마우스 위치(i)에서 멀어질수록 완만하게 줄어든다
function tocWidth(index: number, hover: number | null): number {
  const base = 14;
  if (hover === null) return base;
  const d = index - hover;
  return base + 30 * Math.exp(-(d * d) / 1.6);
}

export default function Landing() {
  const { scrollYProgress } = useScroll();
  const [faqs, setFaqs] = useState<Faq[]>(DEFAULT_FAQS);
  const [active, setActive] = useState<string>('intro');
  const [hover, setHover] = useState<number | null>(null);

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

  return (
    <div className="min-h-screen bg-white text-[#191F28]" style={{ fontFamily: "'Inter', 'Noto Sans KR', system-ui, sans-serif" }}>
      {/* 스크롤 진행 막대 */}
      <motion.div
        className="fixed inset-x-0 top-0 z-30 h-1 origin-left bg-[#1E5B4A]"
        style={{ scaleX: scrollYProgress }}
      />

      <header className="fixed inset-x-0 top-1 z-20 border-b border-[#F2F4F6] bg-white/90 backdrop-blur">
        <div className="flex w-full items-center justify-between px-6 py-5 sm:px-10">
          <span className="text-lg font-bold text-[#1E5B4A]">{APP_NAME}</span>
          <a href="/app" className="text-sm font-semibold text-[#1E5B4A] hover:underline">로그인</a>
        </div>
      </header>

      {/* 작은 화면용 목차: 상단 헤더 아래에 두고, 페이지와 함께 스크롤됩니다 */}
      <nav className="relative mt-[76px] border-b border-[#F2F4F6] bg-white lg:hidden">
        <ul className="flex gap-6 overflow-x-auto whitespace-nowrap px-6 py-3 text-sm">
          {toc.map((t) => {
            const on = active === t.id;
            return (
              <li key={t.id}>
                <a
                  href={`#${t.id}`}
                  className={`block py-1 transition-colors duration-300 ${
                    on ? 'border-b-2 border-[#1E5B4A] font-bold text-[#1E5B4A]' : 'border-b-2 border-transparent text-[#8B95A1]'
                  }`}
                >
                  {t.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex w-full">
        {/* 왼쪽 목차 */}
        <nav
          className="fixed left-0 top-0 z-10 hidden h-screen w-56 flex-col justify-center pl-10 lg:flex"
          onMouseLeave={() => setHover(null)}
        >
          <ul className="space-y-2">
            {toc.map((t, i) => {
              const on = active === t.id;
              const isHover = hover === i;
              return (
                <li key={t.id} onMouseEnter={() => setHover(i)}>
                  <a href={`#${t.id}`} className="flex items-center gap-3 py-0.5">
                    {/* 짧은 선: 마우스 위치에서 멀어질수록 완만하게 줄어드는 길이 */}
                    <span
                      style={{ width: `${tocWidth(i, hover)}px` }}
                      className={`h-[2px] shrink-0 rounded-full transition-[width,background-color] duration-300 ease-out ${
                        on ? 'bg-[#1E5B4A]' : 'bg-[#C9CFD6]'
                      }`}
                    />
                    {/* 이름: 마우스를 올린 항목만 나타남 */}
                    <span
                      className={`whitespace-nowrap text-xs font-semibold text-[#1E5B4A] transition-all duration-200 ease-out ${
                        isHover ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0'
                      }`}
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
          <section id="intro" className="scroll-mt-40 lg:scroll-mt-40 lg:scroll-mt-24 flex min-h-screen flex-col justify-center pt-10 lg:pt-24">
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-base font-semibold text-[#1E5B4A]">
              주문 정리는 {APP_NAME}에 맡기세요
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 text-5xl font-bold leading-tight tracking-tight sm:text-7xl"
            >
              엑셀 정리,<br />이제 한 번이면 끝나요
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.4 }} className="mt-8 max-w-xl text-lg leading-relaxed text-[#6B7684]">
              주문 엑셀을 올리면 송장 맞추기부터 쇼핑몰 업로드 파일까지 순서대로 만들어 드려요.
            </motion.p>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.7 }} className="mt-12">
              <a href="/app" className="inline-block rounded-2xl bg-[#1E5B4A] px-10 py-4 text-lg font-bold text-white hover:bg-[#174a3c]">
                시작하기
              </a>
            </motion.div>
          </section>

          {/* 2. 불편함 */}
          <motion.section id="pain" {...reveal} className="scroll-mt-40 lg:scroll-mt-24 flex min-h-screen flex-col justify-center border-t border-[#F2F4F6] py-24">
            <p className="text-2xl font-bold leading-snug sm:text-4xl">
              수수료 떼고, 광고비 나가고,<br />남는 게 줄어드는 게 지치시죠?
            </p>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-[#6B7684]">
              그래서 {APP_NAME}은 부담 없는 가격에, 셀러님께 꼭 필요한 기능만 드리려고 해요.
            </p>
          </motion.section>

          {/* 3. 사용 순서 */}
          <motion.section id="steps" {...reveal} className="scroll-mt-40 lg:scroll-mt-24 flex min-h-screen flex-col justify-center border-t border-[#F2F4F6] py-24">
            <p className="text-sm font-semibold text-[#1E5B4A]">사용 순서</p>
            <h2 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">딱 네 단계면 돼요</h2>
            <motion.div {...listContainer} className="mt-14 divide-y divide-[#F2F4F6]">
              {steps.map((s) => (
                <motion.div key={s.no} variants={listItem} className="flex gap-8 py-8">
                  <span className="w-16 shrink-0 text-3xl font-bold text-[#1E5B4A]">{s.no}</span>
                  <div>
                    <h3 className="text-2xl font-bold">{s.title}</h3>
                    <p className="mt-2 text-base leading-relaxed text-[#6B7684]">{s.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.section>

          {/* 4. 대상 */}
          <motion.section id="audience" {...reveal} className="scroll-mt-40 lg:scroll-mt-24 flex min-h-screen flex-col justify-center border-t border-[#F2F4F6] py-24">
            <p className="text-sm font-semibold text-[#1E5B4A]">이런 분들께</p>
            <h2 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">이런 분들께 맞아요</h2>
            <motion.ul {...listContainer} className="mt-14 space-y-10">
              {audiences.map((a) => (
                <motion.li key={a.title} variants={listItem}>
                  <p className="text-2xl font-bold">{a.title}</p>
                  <p className="mt-2 text-lg text-[#6B7684]">{a.desc}</p>
                </motion.li>
              ))}
            </motion.ul>
          </motion.section>

          {/* 5. 가격 */}
          <motion.section id="price" {...reveal} className="scroll-mt-40 lg:scroll-mt-24 flex min-h-screen flex-col items-start justify-center border-t border-[#F2F4F6] py-24">
            <p className="text-lg text-[#6B7684]">월 구독</p>
            <p className="mt-4 text-6xl font-bold text-[#1E5B4A] sm:text-8xl">
              {MONTHLY_PRICE_KRW.toLocaleString('ko-KR')}원
            </p>
            <a href="/app" className="mt-12 inline-block rounded-2xl bg-[#1E5B4A] px-10 py-4 text-lg font-bold text-white hover:bg-[#174a3c]">
              시작하기
            </a>
          </motion.section>

          {/* 6. 질문 */}
          <motion.section id="faq" {...reveal} className="scroll-mt-40 lg:scroll-mt-24 py-24">
            <h2 className="text-4xl font-bold leading-tight sm:text-5xl">자주 묻는 질문</h2>
            <div className="mt-12 divide-y divide-[#F2F4F6] border-y border-[#F2F4F6]">
              {faqs.map((f) => (
                <details key={f.q} className="group py-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-xl font-semibold">
                    {f.q}
                    <span className="ml-4 text-[#8B95A1] group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-4 text-base leading-relaxed text-[#6B7684]">{f.a}</p>
                </details>
              ))}
            </div>
          </motion.section>

          <footer className="border-t border-[#F2F4F6] py-10 text-center text-xs text-[#8B95A1]">{APP_NAME}</footer>
        </main>
      </div>
    </div>
  );
}
