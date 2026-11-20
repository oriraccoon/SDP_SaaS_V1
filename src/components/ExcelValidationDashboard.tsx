import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Info,
  Layers,
  Truck,
  X,
  ListFilter,
  ChevronRight,
  Sparkles,
  Edit2,
  Check,
  ArrowRight,
  Plus,
  PlusCircle
} from 'lucide-react';
import { InspectionCheckItem, StepValidationResult } from '../types';

interface ExcelValidationDashboardProps {
  validationResult?: StepValidationResult;
  stepFilter?: 1 | 2; // 1: 1단계 가공 검사만, 2: 2단계 발송엑셀 검사만
  totalOrderCount?: number;
  secondaryOptionColsInfo?: { index: number; letter: string; headerName: string }[];
  onUpdateMapping?: (rawName: string, newMappedName: string) => void;
  onAddMultipleMappings?: (mappings: { rawName: string; mappedName: string }[]) => void;
}

export default function ExcelValidationDashboard({
  validationResult,
  stepFilter,
  secondaryOptionColsInfo,
  onUpdateMapping,
  onAddMultipleMappings
}: ExcelValidationDashboardProps) {
  // 전체 검사 항목 팝업 모달 상태
  const [isFullListModalOpen, setIsFullListModalOpen] = useState(false);
  const [selectedDetailCheck, setSelectedDetailCheck] = useState<InspectionCheckItem | null>(null);

  // 지능형 매칭 개별 수정 상태 (rawName -> inputVal)
  const [editingRawName, setEditingRawName] = useState<string | null>(null);
  const [editingVal, setEditingVal] = useState<string>('');
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);

  // 대치 리스트에 추가 및 고치기 완료된 rawName -> mappedName 맵
  const [savedCustomEditedMap, setSavedCustomEditedMap] = useState<{ [rawName: string]: string }>({});
  const [addedToDictSet, setAddedToDictSet] = useState<Set<string>>(new Set());

  // validationResult 변경 시 selectedDetailCheck 모달의 내용을 실시간 보존 및 업데이트
  useEffect(() => {
    if (selectedDetailCheck && validationResult) {
      const allChecks = [...validationResult.step1, ...validationResult.step2];
      const updatedCheck = allChecks.find(c => c.id === selectedDetailCheck.id || c.code === selectedDetailCheck.code);

      setSelectedDetailCheck(prev => {
        if (!prev) return updatedCheck || null;

        // 이전 details 목록 및 신규 details 목록을 병합하여 기존 항목 완벽 보존
        const prevDetails = prev.details || [];
        const newDetails = updatedCheck?.details || [];

        const detailsSet = new Set<string>();
        prevDetails.forEach(d => detailsSet.add(d));
        newDetails.forEach(d => detailsSet.add(d));

        return {
          ...(updatedCheck || prev),
          // 모달이 열려있는 동안 카드가 사라지지 않도록 기존 details 항목 전체 보존
          details: Array.from(detailsSet)
        };
      });
    }
  }, [validationResult]);

  // ESC / Enter 키보드 단축키 핸들링 (검사항목 & 경고 매칭 수정)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingRawName !== null) {
          setEditingRawName(null);
          return;
        }
        if (selectedDetailCheck !== null) {
          setSelectedDetailCheck(null);
          return;
        }
        if (isFullListModalOpen) {
          setIsFullListModalOpen(false);
          return;
        }
      } else if (e.key === 'Enter') {
        const activeElem = document.activeElement;
        const isInput = activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA');
        if (!isInput) {
          if (selectedDetailCheck !== null) {
            setSelectedDetailCheck(null);
          } else if (isFullListModalOpen) {
            setIsFullListModalOpen(false);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingRawName, selectedDetailCheck, isFullListModalOpen]);

  if (!validationResult) {
    return null;
  }

  const { step1, step2, step1Status, step2Status } = validationResult;

  // 현재 stepFilter에 맞는 항목 및 상태 결정
  const currentStepChecks =
    stepFilter === 1 ? step1 : stepFilter === 2 ? step2 : [...step1, ...step2];

  const currentStepStatus =
    stepFilter === 1
      ? step1Status
      : stepFilter === 2
      ? step2Status
      : step1Status === 'FAIL' || step2Status === 'FAIL'
      ? 'FAIL'
      : step1Status === 'WARNING' || step2Status === 'WARNING'
      ? 'WARNING'
      : 'PASS';

  const failCount = currentStepChecks.filter((c) => c.status === 'FAIL').length;
  const warningCount = currentStepChecks.filter((c) => c.status === 'WARNING').length;

  // 이슈(ERROR, WARNING) 항목들만 필터링
  const issueChecks = currentStepChecks.filter((c) => c.status !== 'PASS');

  // 지능형 매칭 상세 스트링 파서
  const parseSmartMatchDetail = (detailStr: string) => {
    // 예: "[수령인: 홍길동] 원본 상품명: '여우마을 양념깻잎 1kg' ➔ 매칭 정제명: '양념깻잎' (유사도 92% 일치)"
    const regex = /\[수령인:\s*(.*?)\]\s*원본 상품명:\s*'(.*?)'\s*➔\s*매칭 정제명:\s*'(.*?)'\s*\(유사도\s*(\d+)%\s*일치\)/;
    const match = detailStr.match(regex);
    if (match) {
      return {
        recipient: match[1],
        rawName: match[2],
        mappedName: match[3],
        score: match[4]
      };
    }
    return null;
  };

  const handleSaveEdit = (rawName: string) => {
    if (!editingVal.trim()) return;
    const finalVal = editingVal.trim();

    // 화면 표기용 정제명만 임시 수정 (대치 사전에 자동 저장하지 않음)
    setSavedCustomEditedMap(prev => ({ ...prev, [rawName]: finalVal }));

    setEditSuccessMsg(`'${rawName}'의 정제명이 '${finalVal}'(으)로 수정되었습니다. [대치 리스트에 추가]를 눌러 사전에 등록할 수 있습니다.`);
    setTimeout(() => setEditSuccessMsg(null), 3500);
    setEditingRawName(null);
  };

  const handleAddToDict = (rawName: string, mappedName: string) => {
    const targetMappedName = savedCustomEditedMap[rawName] || mappedName;
    if (onUpdateMapping) {
      onUpdateMapping(rawName, targetMappedName);
    }

    setSavedCustomEditedMap(prev => ({ ...prev, [rawName]: targetMappedName }));
    setAddedToDictSet(prev => new Set(prev).add(rawName));

    setEditSuccessMsg(`'${rawName}' ➔ '${targetMappedName}' 규칙이 대치 사전에 추가되어 성공적으로 반영되었습니다!`);
    setTimeout(() => setEditSuccessMsg(null), 3500);
  };

  const handleAddAllToDict = (details: string[]) => {
    const validItems: { rawName: string; mappedName: string }[] = [];
    const newMap = { ...savedCustomEditedMap };
    const newSet = new Set(addedToDictSet);

    details.forEach(dt => {
      const parsed = parseSmartMatchDetail(dt);
      if (parsed && parsed.rawName) {
        const targetMappedName = savedCustomEditedMap[parsed.rawName] || parsed.mappedName;
        if (targetMappedName) {
          validItems.push({ rawName: parsed.rawName, mappedName: targetMappedName });
          newSet.add(parsed.rawName);
          newMap[parsed.rawName] = targetMappedName;
        }
      }
    });

    if (validItems.length === 0) return;

    if (onAddMultipleMappings) {
      onAddMultipleMappings(validItems);
    } else if (onUpdateMapping) {
      validItems.forEach(item => onUpdateMapping(item.rawName, item.mappedName));
    }

    setSavedCustomEditedMap(newMap);
    setAddedToDictSet(newSet);
    setEditSuccessMsg(`Warning 매칭 ${validItems.length}건 전체가 대치 사전에 추가되어 적용되었습니다!`);
    setTimeout(() => setEditSuccessMsg(null), 3500);
  };

  const getStatusBadge = (status: 'PASS' | 'FAIL' | 'WARNING') => {
    switch (status) {
      case 'PASS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300 flex-shrink-0">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            PASS
          </span>
        );
      case 'FAIL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-rose-100 text-rose-800 rounded-full border border-rose-300 flex-shrink-0">
            <XCircle className="w-3 h-3 text-rose-600" />
            ERROR
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded-full border border-amber-300 flex-shrink-0">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            WARNING
          </span>
        );
    }
  };

  const stepTitle =
    stepFilter === 1
      ? '1단계 주문 데이터 가공 품질 검사'
      : stepFilter === 2
      ? '2단계 최종 발송 엑셀 검증'
      : '엑셀 품질 및 무결성 종합 검사';

  const stepIcon = stepFilter === 2 ? <Truck className="w-5 h-5" /> : <Layers className="w-5 h-5" />;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
      {/* 1. 상단 요약 바 */}
      <div
        className={`px-4 py-3 flex flex-wrap items-center justify-between transition-colors ${
          failCount > 0
            ? 'bg-rose-50/80 border-b border-rose-100'
            : warningCount > 0
            ? 'bg-amber-50/80 border-b border-amber-100'
            : 'bg-emerald-50/80 border-b border-emerald-100'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {failCount > 0 ? (
            <div className="p-2 bg-rose-100 text-rose-700 rounded-lg border border-rose-200 flex-shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
          ) : warningCount > 0 ? (
            <div className="p-2 bg-amber-100 text-amber-700 rounded-lg border border-amber-200 flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
          ) : (
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                {stepIcon}
                <span>{stepTitle}</span>
              </h3>
              {failCount > 0 ? (
                <span className="px-2 py-0.5 text-xs font-bold bg-rose-600 text-white rounded-full">
                  오류 {failCount}건
                </span>
              ) : warningCount > 0 ? (
                <span className="px-2 py-0.5 text-xs font-bold bg-amber-500 text-white rounded-full">
                  경고 {warningCount}건
                </span>
              ) : (
                <span className="px-2 py-0.5 text-xs font-bold bg-emerald-600 text-white rounded-full">
                  정상 (PASS)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {currentStepChecks.length}개 항목 검사 완료 (진단 결과: {currentStepStatus})
            </p>
          </div>
        </div>

        {/* 전체 검사 리스트 팝업 버튼 */}
        <button
          onClick={() => setIsFullListModalOpen(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-[#184A3C] bg-[#F1F7F4] hover:bg-[#E9F3EE] border border-[#CFE3DA] rounded-lg transition-colors mt-2 sm:mt-0"
        >
          <ListFilter className="w-3.5 h-3.5 text-[#1E5B4A]" />
          <span>전체 검사 항목 ({currentStepChecks.length})</span>
        </button>
      </div>

      {/* 2. 평소 메인 영역: 에러/경고 한 줄 슬림 목록 */}
      <div className="p-3">
        {issueChecks.length > 0 ? (
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-500 px-1 mb-1">
              ※ 클릭하면 상세 오류 내역을 확인할 수 있습니다.
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
              {issueChecks.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedDetailCheck(item)}
                  className={`px-3 py-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors hover:bg-slate-50 ${
                    item.status === 'FAIL' ? 'bg-rose-50/20' : 'bg-amber-50/20'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-mono font-extrabold rounded flex-shrink-0 ${
                        item.category === 'ERROR' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                      }`}
                    >
                      {item.code}
                    </span>

                    <span className="text-xs font-bold text-slate-800 flex-shrink-0">
                      {item.title}
                    </span>

                    <span className="text-xs text-slate-500 truncate min-w-0">
                      - {item.description}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {getStatusBadge(item.status)}
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* 에러/경고가 전혀 없는 경우 */
          <div className="py-3 px-4 bg-emerald-50/50 rounded-lg border border-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="text-xs font-bold text-emerald-900">
                모든 검사를 완벽히 통과했습니다. (오류/경고 없음)
              </span>
            </div>
            <button
              onClick={() => setIsFullListModalOpen(true)}
              className="text-xs text-emerald-700 underline font-semibold hover:text-emerald-900"
            >
              전체 항목 보기
            </button>
          </div>
        )}
      </div>

      {/* 3. 전체 검사 리스트 팝업 모달 */}
      <AnimatePresence>
        {isFullListModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* 모달 헤더 */}
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <ListFilter className="w-4 h-4 text-[#1E5B4A]" />
                  <h3 className="text-sm font-bold text-slate-800">
                    {stepTitle} 전체 항목 ({currentStepChecks.length}개)
                  </h3>
                </div>

                <button
                  onClick={() => setIsFullListModalOpen(false)}
                  className="p-1 text-slate-500 hover:text-slate-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 모달 검사 리스트 테이블 */}
              <div className="p-4 overflow-y-auto flex-1">
                <div className="text-[11px] font-bold text-slate-500 mb-2">
                  ※ 각 검사 항목을 클릭하면 세부 규격 및 진단 기록을 확인할 수 있습니다.
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs text-left text-slate-700">
                    <thead className="bg-slate-100 text-slate-700 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 w-16 text-center">구분</th>
                        <th className="px-3 py-2 w-20 text-center">코드</th>
                        <th className="px-3 py-2 w-48">검사 항목명</th>
                        <th className="px-3 py-2">검사 세부 내용</th>
                        <th className="px-3 py-2 w-24 text-center">결과</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {currentStepChecks.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedDetailCheck(item)}
                          className={`hover:bg-[#F1F7F4]/50 cursor-pointer transition-colors ${
                            item.status === 'FAIL'
                              ? 'bg-rose-50/30'
                              : item.status === 'WARNING'
                              ? 'bg-amber-50/30'
                              : ''
                          }`}
                        >
                          <td className="px-3 py-2.5 text-center font-bold">
                            {item.category === 'ERROR' ? (
                              <span className="px-1.5 py-0.5 text-[10px] font-extrabold bg-rose-100 text-rose-700 rounded border border-rose-200">
                                ERROR
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 text-[10px] font-extrabold bg-amber-100 text-amber-800 rounded border border-amber-200">
                                WARN
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-600">
                            {item.code}
                          </td>

                          <td className="px-3 py-2.5 font-bold text-slate-800">
                            {item.title}
                          </td>

                          <td className="px-3 py-2.5 text-slate-600 truncate max-w-xs">
                            {item.description}
                          </td>

                          <td className="px-3 py-2.5 text-center">
                            {getStatusBadge(item.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 모달 푸터 */}
              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
                <button
                  onClick={() => setIsFullListModalOpen(false)}
                  className="px-4 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. 세부 로그 모달 팝업 */}
      <AnimatePresence>
        {selectedDetailCheck && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full overflow-hidden"
            >
              {/* 모달 헤더 */}
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-[#1E5B4A]" />
                  <h4 className="text-sm font-bold text-slate-800">
                    검사 항목 세부 진단 결과 [{selectedDetailCheck.code}]
                  </h4>
                </div>
                <button
                  onClick={() => setSelectedDetailCheck(null)}
                  className="p-1 text-slate-500 hover:text-slate-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 모달 바디 */}
              <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4">
                <div>
                  <div className="text-xs font-semibold text-slate-500">검사 항목명</div>
                  <div className="text-base font-bold text-slate-800 mt-0.5 flex items-center gap-2">
                    {selectedDetailCheck.code === 'STEP1_W2' && (
                      <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
                    )}
                    <span>[{selectedDetailCheck.step}단계] {selectedDetailCheck.title}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs font-medium text-slate-600">진단 상태</span>
                  <div>{getStatusBadge(selectedDetailCheck.status)}</div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1">검사 요구 조건 / 설명</div>
                  <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 leading-relaxed">
                    {selectedDetailCheck.description}
                  </p>
                </div>

                {/* 성공 알림 메세지 */}
                {editSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{editSuccessMsg}</span>
                  </div>
                )}

                {/* 지능형 매칭 (STEP1_W2) 시각적 카드 / 대조 리스트 */}
                {selectedDetailCheck.code === 'STEP1_W2' ? (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        자동 매칭 결과 전후 비교 ({selectedDetailCheck.details.length}건)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddAllToDict(selectedDetailCheck.details)}
                        className="px-3 py-1.5 bg-[#1E5B4A] hover:bg-[#184A3C] text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        Warning 매칭 전체 대치 리스트에 일괄 추가
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {selectedDetailCheck.details.map((dt, idx) => {
                        const parsed = parseSmartMatchDetail(dt);
                        if (!parsed) {
                          return (
                            <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
                              {dt}
                            </div>
                          );
                        }

                        const isEditingThis = editingRawName === parsed.rawName;
                        const savedMappedName = savedCustomEditedMap[parsed.rawName];
                        const isAdded = addedToDictSet.has(parsed.rawName);
                        const hasCustomText = !!savedMappedName;
                        const currentMappedName = savedMappedName || parsed.mappedName;

                        return (
                          <div
                            key={idx}
                            className={`p-3.5 border rounded-2xl shadow-2xs space-y-2 transition ${
                              isAdded
                                ? 'bg-emerald-50/60 border-emerald-200'
                                : hasCustomText
                                ? 'bg-[#F1F7F4]/40 border-[#CFE3DA] hover:border-[#9CC7B5]'
                                : 'bg-white border-slate-200 hover:border-[#9CC7B5]'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] text-slate-500 border-b border-slate-100 pb-2">
                              <span className="font-semibold text-slate-600">
                                수령인: <strong className="text-slate-800">{parsed.recipient}</strong>
                              </span>
                              {isAdded ? (
                                <span className="px-2.5 py-0.5 font-extrabold bg-emerald-600 text-white rounded-md text-[10px] flex items-center gap-1 shadow-2xs">
                                  <Check className="w-3 h-3 text-white" />
                                  대치 리스트 반영 완료
                                </span>
                              ) : hasCustomText ? (
                                <span className="px-2.5 py-0.5 font-extrabold bg-[#1E5B4A] text-white rounded-md text-[10px] flex items-center gap-1 shadow-2xs">
                                  글자 수정됨 (미반영)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 font-bold bg-amber-100 text-amber-800 rounded-md text-[10px]">
                                  유사도 {parsed.score}% 일치
                                </span>
                              )}
                            </div>

                            {/* 전후 비교 바 */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-0.5">
                              <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200">
                                <div className="text-[10px] font-bold text-slate-400 mb-0.5"> 원본 상품명</div>
                                <div className="font-semibold text-slate-800 break-words whitespace-normal leading-snug">
                                  {parsed.rawName}
                                </div>
                              </div>

                              <div className={`p-2.5 rounded-xl border ${
                                isAdded
                                  ? 'bg-emerald-100/60 border-emerald-300 text-emerald-950'
                                  : hasCustomText
                                  ? 'bg-[#E9F3EE]/80 border-[#9CC7B5] text-[#0A2A22] font-semibold'
                                  : 'bg-[#F1F7F4]/50 border-[#E0EFE8] text-[#0F3A2F]'
                              }`}>
                                <div className={`text-[10px] font-bold mb-0.5 flex items-center gap-1 ${
                                  isAdded
                                    ? 'text-emerald-700 font-extrabold'
                                    : hasCustomText
                                    ? 'text-[#184A3C] font-extrabold'
                                    : 'text-[#1E5B4A]'
                                }`}>
                                  <span>{isAdded ? ' 반영된 대치 정제명' : hasCustomText ? ' 수정한 정제명' : ' 매칭된 정제명'}</span>
                                </div>
                                <div className="font-bold break-words whitespace-normal leading-snug">
                                  {currentMappedName}
                                </div>
                              </div>
                            </div>

                            {/* 직접 수정 / 대치 사전 추가 영역 */}
                            {isEditingThis ? (
                              <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editingVal}
                                  onChange={(e) => setEditingVal(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleSaveEdit(parsed.rawName);
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setEditingRawName(null);
                                    }
                                  }}
                                  placeholder="새로운 올바른 정제명 입력... (Enter: 저장, ESC: 취소)"
                                  className="flex-1 text-xs border border-[#9CC7B5] rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1E5B4A]/20 bg-white font-medium"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(parsed.rawName)}
                                  className="px-3 py-1.5 bg-[#1E5B4A] hover:bg-[#184A3C] text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  저장
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingRawName(null)}
                                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition shrink-0 cursor-pointer"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <div className="pt-1.5 flex items-center justify-end gap-2">
                                {isAdded ? (
                                  <div className="flex items-center gap-2">
                                    <span className="px-2.5 py-1 bg-emerald-100/90 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-extrabold flex items-center gap-1">
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                      대치 리스트에 반영됨
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingRawName(parsed.rawName);
                                        setEditingVal(currentMappedName);
                                      }}
                                      className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                      다시 수정
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleAddToDict(parsed.rawName, currentMappedName)}
                                      className={`px-2.5 py-1 border rounded-lg text-xs font-bold transition shadow-2xs flex items-center gap-1 cursor-pointer ${
                                        hasCustomText
                                          ? 'bg-[#1E5B4A] hover:bg-[#184A3C] text-white border-[#1E5B4A]'
                                          : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 hover:border-amber-400'
                                      }`}
                                      title="이 매칭 결과를 대치 사전에 추가하여 반영합니다."
                                    >
                                      <Plus className={`w-3 h-3 ${hasCustomText ? 'text-white' : 'text-amber-600'}`} />
                                      대치 리스트에 추가
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingRawName(parsed.rawName);
                                        setEditingVal(currentMappedName);
                                      }}
                                      className="px-2.5 py-1 bg-white hover:bg-[#F1F7F4] text-[#1E5B4A] border border-[#CFE3DA] hover:border-[#4F8A75] rounded-lg text-xs font-bold transition shadow-2xs flex items-center gap-1 cursor-pointer"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                      직접 고치기
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* 일반 진단 및 세부 로깅 메시지 (라이트 카드 뷰) */
                  <div>
                    <div className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
                      <span>진단 및 세부 로깅 메시지</span>
                      <span className="text-[11px] text-slate-500 font-normal">
                        총 {selectedDetailCheck.details.length}건
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs leading-relaxed space-y-2 max-h-52 overflow-y-auto">
                      {selectedDetailCheck.details.map((dt, idx) => (
                        <div key={idx} className="flex items-start gap-2 p-2 bg-white rounded-lg border border-slate-150 shadow-2xs">
                          <span className="text-slate-400 font-mono text-[11px] select-none shrink-0 mt-0.5">[{idx + 1}]</span>
                          <span
                            className={`font-medium ${
                              selectedDetailCheck.status === 'FAIL'
                                ? 'text-rose-700'
                                : selectedDetailCheck.status === 'WARNING'
                                ? 'text-amber-800'
                                : 'text-emerald-700'
                            }`}
                          >
                            {dt}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 모달 푸터 */}
              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
                <button
                  onClick={() => setSelectedDetailCheck(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
