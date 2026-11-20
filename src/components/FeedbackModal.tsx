import { useState } from 'react';
import Modal, { btn } from './ui/Modal';
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
    <Modal
      onClose={onClose}
      title="문의하기"
      description="버그, 궁금한 점, 바라는 점을 적어 주세요. 개발자가 직접 읽어요."
      size="md"
      zIndex={60}
      closeOnEsc={false}
      footer={
        <>
          <button type="button" onClick={onClose} className={btn.secondary}>취소</button>
          <button type="button" onClick={handleSubmit} disabled={isSending || !message.trim()} className={btn.primary}>
            {isSending ? '보내는 중…' : '보내기'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-slate-800">어떤 내용인가요?</legend>
          <div className="inline-flex w-full rounded-xl bg-slate-100 p-1 text-sm">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={`min-h-9 flex-1 rounded-lg transition cursor-pointer ${
                  category === c ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-slate-800">내용</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, FEEDBACK_MAX_LENGTH))}
            rows={6}
            placeholder="어떤 상황에서 무엇이 잘 안 됐는지 적어 주세요. 예: 택배사 엑셀을 올렸는데 송장 번호가 안 나왔어요."
            className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
          />
          <span className="mt-1 flex justify-between gap-3 text-[13px] text-slate-500">
            <span>고객 이름, 전화번호, 주소 같은 개인정보는 적지 마세요.</span>
            <span className="shrink-0 tabular-nums">{message.length} / {FEEDBACK_MAX_LENGTH}</span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
