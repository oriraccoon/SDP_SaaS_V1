import React, { useState, useMemo } from 'react';
import { ProcessedOrder, AnomalousOrderIssue } from '../types';
import { X, AlertTriangle, Filter, CheckCircle2, Phone, MapPin, User, Package, AlertCircle } from 'lucide-react';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        
        {/* 모달 헤더 */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                배송 사고 예방: 이상 주문 데이터 자동 검증
                <span className="text-xs bg-rose-500 text-white font-bold px-2 py-0.5 rounded-full">
                  총 {issues.length}건 선별됨
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                수령인 누락, 연락처 자릿수 미달, 주소 정보 미흡 등 송장 출력 및 오배송 위험 건을 선별했습니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 필터 바 */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-slate-600 flex items-center gap-1 mr-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            오류 유형 필터:
          </span>

          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeFilter === 'ALL'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            전체 ({issues.length}건)
          </button>

          <button
            onClick={() => setActiveFilter('PHONE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
              activeFilter === 'PHONE'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Phone className="w-3 h-3" />
            연락처 오류 ({issues.filter(i => i.reasons.some(r => r.includes('연락처'))).length}건)
          </button>

          <button
            onClick={() => setActiveFilter('ADDRESS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
              activeFilter === 'ADDRESS'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <MapPin className="w-3 h-3" />
            주소 미흡 ({issues.filter(i => i.reasons.some(r => r.includes('주소'))).length}건)
          </button>

          <button
            onClick={() => setActiveFilter('RECIPIENT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
              activeFilter === 'RECIPIENT'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <User className="w-3 h-3" />
            수령인 누락 ({issues.filter(i => i.reasons.some(r => r.includes('수령인'))).length}건)
          </button>

          <button
            onClick={() => setActiveFilter('QTY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
              activeFilter === 'QTY'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Package className="w-3 h-3" />
            수량 오류 ({issues.filter(i => i.reasons.some(r => r.includes('수량'))).length}건)
          </button>
        </div>

        {/* 테이블 본문 */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredIssues.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <div className="text-sm font-bold text-slate-700">해당 필터에 속한 이상 주문이 없습니다</div>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3 w-12 text-center">NO</th>
                    <th className="p-3 w-28">출처 플랫폼/파일</th>
                    <th className="p-3 w-24">수령인명</th>
                    <th className="p-3 w-28">연락처</th>
                    <th className="p-3">배송지 주소</th>
                    <th className="p-3 w-16 text-center">수량</th>
                    <th className="p-3 w-56">오류 원인 선별 (검증)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredIssues.map((issue, idx) => {
                    const o = issue.order;
                    return (
                      <tr key={idx} className="hover:bg-rose-50/40 transition">
                        <td className="p-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                        <td className="p-3 text-slate-600 truncate max-w-[110px]" title={o.sourceFileName}>
                          {o.platformName || o.sourceFileName || '기본'}
                        </td>
                        <td className="p-3 font-bold text-slate-800">
                          {o.수령인 || o.주문자 || <span className="text-rose-500 italic">미입력</span>}
                        </td>
                        <td className="p-3 font-mono text-slate-700">
                          {o.연락처 || <span className="text-rose-500 italic">미입력</span>}
                        </td>
                        <td className="p-3 text-slate-700 truncate max-w-[200px]" title={o.주소}>
                          {o.주소 || <span className="text-rose-500 italic">미입력</span>}
                        </td>
                        <td className="p-3 text-center font-bold text-slate-800">
                          {o.수량}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {issue.reasons.map((r, rIdx) => (
                              <span
                                key={rIdx}
                                className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1"
                              >
                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                {r}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 모달 푸터 */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            엑셀 원본 파일을 수정 후 재업로드하시거나 현 상태로 가공을 진행하실 수 있습니다.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition shadow-sm"
          >
            확인 및 창 닫기
          </button>
        </div>

      </div>
    </div>
  );
}
