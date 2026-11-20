import React, { useState, useMemo } from 'react';
import { ProcessedOrder, AnomalousOrderIssue } from '../types';
import { AlertTriangle, CheckCircle2, Phone, MapPin, User, Package, AlertCircle } from 'lucide-react';
import Modal, { btn } from './ui/Modal';

interface AnomalousOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  issues: AnomalousOrderIssue[];
}

export default function AnomalousOrdersModal({
  isOpen,
  onClose,
  issues = []
}: AnomalousOrdersModalProps) {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'RECIPIENT' | 'PHONE' | 'ADDRESS' | 'QTY'>('ALL');

  const filteredIssues = useMemo(() => {
    if (activeFilter === 'ALL') return issues;
    if (activeFilter === 'RECIPIENT') return issues.filter(i => i.reasons.some(r => r.includes('수령인')));
    if (activeFilter === 'PHONE') return issues.filter(i => i.reasons.some(r => r.includes('연락처')));
    if (activeFilter === 'ADDRESS') return issues.filter(i => i.reasons.some(r => r.includes('주소')));
    if (activeFilter === 'QTY') return issues.filter(i => i.reasons.some(r => r.includes('수량')));
    return issues;
  }, [issues, activeFilter]);

  // ESC 및 Enter 키로 모달 닫기
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const count = (word: string) => issues.filter(i => i.reasons.some(r => r.includes(word))).length;
  const FILTERS: { key: typeof activeFilter; label: string; icon?: React.ReactNode; n: number }[] = [
    { key: 'ALL', label: '전체', n: issues.length },
    { key: 'PHONE', label: '전화번호', icon: <Phone className="w-3.5 h-3.5" />, n: count('연락처') },
    { key: 'ADDRESS', label: '주소', icon: <MapPin className="w-3.5 h-3.5" />, n: count('주소') },
    { key: 'RECIPIENT', label: '받는 사람', icon: <User className="w-3.5 h-3.5" />, n: count('수령인') },
    { key: 'QTY', label: '수량', icon: <Package className="w-3.5 h-3.5" />, n: count('수량') },
  ];
  const missing = <span className="text-rose-700">비어 있음</span>;

  return (
    <Modal
      onClose={onClose}
      title={`잘못 배송될 수 있는 주문 ${issues.length}건`}
      description="받는 사람이 비었거나, 전화번호 자리 수가 모자라거나, 주소가 짧은 주문을 골랐어요. 원래 엑셀을 고쳐 다시 올리거나, 그대로 진행해도 돼요."
      icon={<AlertTriangle className="w-4 h-4" />}
      iconTone="warn"
      size="xl"
      closeOnEsc={false}
      footer={<button type="button" onClick={onClose} className={btn.dark}>확인했어요</button>}
    >
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="문제 종류">
        {FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={activeFilter === f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-[13px] font-semibold transition cursor-pointer ${
              activeFilter === f.key ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {f.icon}{f.label} <span className={activeFilter === f.key ? 'text-slate-300' : 'text-slate-500'}>{f.n}</span>
          </button>
        ))}
      </div>

      {filteredIssues.length === 0 ? (
        <div className="py-12 text-center">
          <CheckCircle2 className="mx-auto w-9 h-9 text-brand-600" />
          <div className="mt-2 text-sm font-semibold text-slate-700">이 종류의 문제는 없어요</div>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {filteredIssues.map((issue, idx) => {
            const o = issue.order;
            return (
              <li key={idx} className="grid gap-1.5 px-4 py-3 text-[13px] sm:grid-cols-[1fr_auto] sm:items-start sm:gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <b className="text-sm font-semibold text-slate-900">{o.수령인 || o.주문자 || '받는 사람 비어 있음'}</b>
                    <span className="text-slate-500">{o.platformName || o.sourceFileName || '기본'} · 수량 {o.수량}</span>
                  </div>
                  <div className="mt-0.5 text-slate-700">
                    {o.연락처 || missing} · <span className="break-words">{o.주소 || missing}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 sm:justify-end">
                  {issue.reasons.map((r, rIdx) => (
                    <span key={rIdx} className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[12px] font-semibold text-rose-800">
                      <AlertCircle className="w-3 h-3" />{r}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
