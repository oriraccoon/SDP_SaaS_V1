import { useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { APP_NAME } from '../config/brand';

/**
 * AI 질문 창 틀. 지금은 모양만 있고, 대화 기능은 준비 중입니다.
 * - 버튼은 화면 오른쪽 아래에 떠 있고, 설정·문의 창보다 아래에 깔립니다.
 * - 나중에 연결할 때 send 로직만 채우면 됩니다 (서버 엔드포인트, 모델 설정).
 */
export default function AiAssistant() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="AI 도우미"
          className="ai-panel fixed bottom-4 left-4 right-4 z-30 flex h-[min(520px,70vh)] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:left-auto sm:w-[360px]"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white">
                <MessageCircle className="h-4 w-4" />
              </span>
              <span className="text-sm font-bold text-slate-900">{APP_NAME} 도우미</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="도우미 닫기"
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-[#F7F8FA] p-4">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm">
              안녕하세요. {APP_NAME} 도우미예요. 사용 방법이나 작업 순서를 물어보실 수 있어요.
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              도우미 기능은 준비 중입니다.
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-200 bg-white p-3">
            <div className="flex flex-wrap gap-2">
              {['주문 엑셀은 어떻게 올리나요?', '송장은 어디서 받나요?'].map((q) => (
                <span key={q} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-400">
                  {q}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                disabled
                placeholder="준비 중입니다"
                aria-label="질문 입력"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-400 outline-none"
              />
              <button
                type="button"
                disabled
                aria-label="보내기"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-white"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">개인정보(이름, 연락처, 주소)는 입력하지 마세요.</p>
          </div>
        </div>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="AI 도우미 열기 (준비 중)"
          title="AI 도우미 (준비 중)"
          className="pressable fixed bottom-4 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-brand-600 shadow-md hover:bg-brand-50"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}
    </>
  );
}
