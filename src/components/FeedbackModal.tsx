import { useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { FEEDBACK_MAX_LENGTH, sendFeedback, type FeedbackCategory } from '../lib/feedback';

const CATEGORIES: FeedbackCategory[] = ['버그', '문의', '제안'];

interface FeedbackModalProps {
  onClose: () => void;
  onSent: () => void;
  onError: (message: string) => void;
}

export default function FeedbackModal({ onClose, onSent, onError }: FeedbackModalProps) {
  const [category, setCategory] = useState<FeedbackCategory>('버그');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async () => {
    setIsSending(true);
    try {
      await sendFeedback(category, message);
      onSent();
      onClose();
    } catch (err: any) {
      onError(err?.message || '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <MessageSquare className="w-4 h-4 text-indigo-600" />
            문의 / 버그 신고
          </h2>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-800" aria-label="닫기">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600">어떤 내용인가요?</p>
          <div className="flex gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                  category === c
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, FEEDBACK_MAX_LENGTH))}
            rows={6}
            placeholder="어떤 상황에서 무엇이 잘 안 됐는지 적어 주세요. 예: 택배사 엑셀을 올렸는데 송장번호가 안 나왔어요."
            className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
          />
          <p className="text-[11px] leading-relaxed text-slate-500">
            고객 이름, 연락처, 주소 같은 개인정보는 적지 마세요. 보내 주신 내용은 개발자만 확인합니다.
          </p>
          <p className="text-right text-[11px] text-slate-400">
            {message.length} / {FEEDBACK_MAX_LENGTH}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSending || !message.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? '보내는 중...' : '보내기'}
          </button>
        </div>
      </div>
    </div>
  );
}
