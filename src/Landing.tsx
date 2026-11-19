import { ArrowRight, FileSpreadsheet, ShieldCheck, BarChart3, Truck } from 'lucide-react';

const features = [
  {
    icon: FileSpreadsheet,
    title: '엑셀 주문 자동 정리',
    desc: '플랫폼별 주문 엑셀을 올리면 상품명을 표준 품목으로 매핑하고 한 번에 정리합니다.',
  },
  {
    icon: ShieldCheck,
    title: '검증과 이상 주문 탐지',
    desc: '누락, 중복, 매칭 실패를 단계별로 찾아 보여줘서 출고 전에 바로잡을 수 있습니다.',
  },
  {
    icon: Truck,
    title: '운송장 리포트',
    desc: '택배사별 운송장 데이터를 묶어 확인하고, 필요한 형식으로 내보냅니다.',
  },
  {
    icon: BarChart3,
    title: '배송 분석',
    desc: '기간과 플랫폼 기준으로 배송 현황을 한눈에 보는 리포트를 제공합니다.',
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="text-sm font-semibold tracking-tight text-slate-900">Smart Delivery</span>
          <a
            href="/app"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            시작하기
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="py-20 text-center sm:py-28">
          <p className="mb-4 inline-block rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            배송 주문 정산을 더 빠르게
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            엑셀 주문 정리와 배송 검증을<br className="hidden sm:block" /> 한 곳에서
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            흩어진 플랫폼 주문 파일을 올리면 품목 매핑, 검증, 운송장 리포트까지 자동으로 이어집니다.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/app"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              바로 사용해보기 <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2">
          {features.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-500">
        Smart Delivery
      </footer>
    </div>
  );
}
