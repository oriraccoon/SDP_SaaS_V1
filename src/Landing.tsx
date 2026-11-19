import { APP_NAME, MONTHLY_PRICE_KRW } from './config/brand';

const steps = [
  { no: '1', title: '주문 엑셀 올리기', desc: '쇼핑몰에서 받은 주문 엑셀을 올리면, 택배사에 넣을 파일이 나와요.' },
  { no: '2', title: '택배사에서 송장 받기', desc: '택배사 사이트에 파일을 올리고, 송장이 들어 있는 엑셀을 받아요.' },
  { no: '3', title: '송장 엑셀 올리기', desc: '송장을 붙인 뒤 주문서와 송장 엑셀을 함께 올려 주세요.' },
  { no: '4', title: '쇼핑몰에 올리기', desc: '쇼핑몰별로 나눠진 파일을 각 쇼핑몰에 올리면 끝이에요.' },
];

const audiences = [
  { title: '처음 셀러라면', desc: '엑셀이 복잡하게 느껴져도 순서대로 따라 하면 돼요.' },
  { title: '수작업이 많다면', desc: '주문을 하나씩 옮기던 시간을 줄여 드려요.' },
  { title: '엑셀이 익숙하지 않다면', desc: '어려운 함수나 정렬 없이 버튼만 누르면 돼요.' },
];

const faqs = [
  {
    q: '주문 정보가 저장되나요?',
    a: '주문 엑셀 내용은 서버에 저장하지 않아요. 화면을 새로고침하면 사라집니다. 상품 이름 사전이나 설정처럼 자주 쓰는 내용만 내 계정에 저장돼요.',
  },
  {
    q: '어떤 쇼핑몰을 지원하나요?',
    a: '주문 엑셀을 내려받을 수 있는 주요 쇼핑몰이 대부분 지원돼요. 쇼핑몰 양식이 다르면 플랫폼 설정에서 추가할 수 있어요.',
  },
  {
    q: '엑셀이 어려워요. 쓸 수 있을까요?',
    a: '화면에 나오는 순서대로 누르면 돼요. 주문서 올리기, 송장 올리기, 결과 받기 세 가지만 기억하시면 됩니다.',
  },
  {
    q: '암호가 걸린 엑셀도 되나요?',
    a: '네. 파일을 서버로 보내지 않고 내 컴퓨터에서 암호를 풀어요. 암호를 모르면 쇼핑몰에서 다시 받아 주세요.',
  },
  {
    q: '구독을 그만두면 어떻게 되나요?',
    a: '구독 기간이 끝나면 작업은 할 수 없지만, 설정은 그대로 남아 있어요. 다시 구독하면 이어서 쓸 수 있어요.',
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-[#191F28]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-lg font-bold text-[#1E5B4A]">{APP_NAME}</span>
        <a href="/app" className="text-sm font-semibold text-[#1E5B4A] hover:underline">
          로그인
        </a>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        {/* 1. 한 문장 소개 */}
        <section className="pb-24 pt-16 text-center">
          <h1 className="text-4xl font-bold leading-snug tracking-tight sm:text-5xl">
            엑셀 정리, 이제 한 번이면 끝나요
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#6B7684] sm:text-lg">
            주문 엑셀을 올리면 송장 맞추기부터 쇼핑몰 업로드 파일까지 순서대로 만들어 드려요.
          </p>
          <a
            href="/app"
            className="mt-10 inline-block rounded-2xl bg-[#1E5B4A] px-10 py-4 text-lg font-bold text-white hover:bg-[#174a3c]"
          >
            시작하기
          </a>
        </section>

        {/* 2. 동작 방식 */}
        <section className="pb-24">
          <h2 className="text-2xl font-bold sm:text-3xl">이렇게 쓰면 돼요</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {steps.map((s) => (
              <div key={s.no} className="rounded-2xl bg-[#F1F7F4] p-7">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1E5B4A] text-base font-bold text-white">
                  {s.no}
                </div>
                <h3 className="mt-5 text-xl font-bold">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[#6B7684]">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 3. 대상 */}
        <section className="pb-24">
          <h2 className="text-2xl font-bold sm:text-3xl">이런 분들께 맞아요</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {audiences.map((a) => (
              <div key={a.title} className="rounded-2xl border border-[#E5E8EB] p-7">
                <h3 className="text-lg font-bold">{a.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[#6B7684]">{a.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 4. 가격 */}
        <section className="pb-24">
          <div className="rounded-3xl bg-[#1E5B4A] px-8 py-14 text-center text-white">
            <p className="text-base text-[#CFE3DA]">월 구독</p>
            <p className="mt-3 text-5xl font-bold">
              {MONTHLY_PRICE_KRW.toLocaleString('ko-KR')}원
            </p>
            <a
              href="/app"
              className="mt-10 inline-block rounded-2xl bg-white px-10 py-4 text-lg font-bold text-[#1E5B4A] hover:bg-[#F1F7F4]"
            >
              시작하기
            </a>
          </div>
        </section>

        {/* 5. FAQ */}
        <section className="pb-28">
          <h2 className="text-2xl font-bold sm:text-3xl">자주 묻는 질문</h2>
          <div className="mt-8 divide-y divide-[#E5E8EB] border-y border-[#E5E8EB]">
            {faqs.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-semibold">
                  {f.q}
                  <span className="ml-4 text-[#8B95A1] group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-[#6B7684]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E5E8EB] py-8 text-center text-xs text-[#8B95A1]">
        {APP_NAME}
      </footer>
    </div>
  );
}
