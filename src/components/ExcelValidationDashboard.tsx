import React, { useState, useEffect } from 'react';
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
  Lightbulb,
  Edit2,
  Check,
  ArrowRight,
  Plus,
  PlusCircle
} from 'lucide-react';
import { InspectionCheckItem, StepValidationResult } from '../types';
import Modal, { btn } from './ui/Modal';

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
  const [showCodes, setShowCodes] = useState(false);

  // 자동 맞춤 개별 수정 상태 (rawName -> inputVal)
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

  // 자동 맞춤 상세 스트링 파서
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

    setEditSuccessMsg(`'${finalVal}'(으)로 고쳤어요. '품목사전에 넣기'를 누르면 앞으로도 이 이름으로 나와요.`);
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

    setEditSuccessMsg(`'${rawName}' ➔ '${targetMappedName}'(으)로 품목사전에 넣었어요.`);
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
    setEditSuccessMsg(`자동으로 맞춘 상품 ${validItems.length}개를 모두 품목사전에 넣었어요.`);
    setTimeout(() => setEditSuccessMsg(null), 3500);
  };

  // 검사 코드별 쉬운 이름 (화면 표시용). 검사 내용 자체는 validationEngine 그대로입니다.
  const PLAIN_TITLE: Record<string, string> = {
    STEP1_E1: "요약 보고서 '상세내역' 시트의 칸 순서",
    STEP1_E2: "요약 보고서 '상세내역'에 빠진 내용이 없는지",
    STEP1_E3: "원래 주문과 '상세내역'의 주문 수·수량",
    STEP1_E4: "원래 주문과 '상품준비요약'의 수량",
    STEP1_E6: '택배사에 넣을 파일(품목별정렬)의 칸 순서',
    STEP1_E7: "택배사에 넣을 파일의 '수량(고정)' 칸이 모두 1인지",
    STEP1_E8: '택배사에 넣을 파일에 빠진 내용이 없는지',
    STEP1_E9: '택배사에 넣을 파일의 상품명이 원래 이름 그대로인지',
    STEP1_E10: '받는 사람·전화번호·주소가 이상한 주문',
    STEP1_E11: '원래 주문과 택배사에 넣을 파일의 주문 수·수량',
    STEP1_E12: '같은 주문이 두 번 들어갔는지',
    STEP1_W1: '품목사전에 없는 상품',
    STEP1_W2: '비슷한 이름으로 자동으로 맞춘 상품',
    STEP2_E1: '송장 붙인 파일의 총 주문 수량',
    STEP2_E2: '송장 붙인 파일이 쇼핑몰 원래 양식과 같은지',
    STEP2_E3: '송장 번호가 빠진 주문',
    STEP2_E4: '쿠팡 묶음배송 주문이 두 번 들어가지 않았는지',
    STEP2_E5: '쿠팡 묶음배송 품목 수',
    STEP2_W1: '택배사 이름이 들어갔는지',
  };
  const plainTitle = (item: InspectionCheckItem) => PLAIN_TITLE[item.code] || item.title;

  const getStatusBadge = (status: 'PASS' | 'FAIL' | 'WARNING') => {
    switch (status) {
      case 'PASS':
        return <span className="shrink-0 rounded-md bg-brand-50 px-2 py-0.5 text-[12px] font-semibold text-brand-700">문제없음</span>;
      case 'FAIL':
        return <span className="shrink-0 rounded-md bg-rose-50 px-2 py-0.5 text-[12px] font-semibold text-rose-700">고쳐야 해요</span>;
      case 'WARNING':
        return <span className="shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-800">확인해 주세요</span>;
    }
  };

  const stepTitle =
    stepFilter === 1
      ? '주문 정리 품질 검사'
      : stepFilter === 2
      ? '송장 붙인 파일 검사'
      : '엑셀 품질 검사';

  const stepIcon = stepFilter === 2 ? <Truck className="w-4 h-4" /> : <Layers className="w-4 h-4" />;
  const passCount = currentStepChecks.length - failCount - warningCount;
  const passChecks = currentStepChecks.filter((c) => c.status === 'PASS');

  const summaryText =
    failCount > 0
      ? `${failCount}가지는 고쳐야 해요.${warningCount > 0 ? ` ${warningCount}가지는 확인해 주세요.` : ''}`
      : warningCount > 0
      ? `${passCount}가지는 문제없어요. ${warningCount}가지만 확인해 주세요.`
      : `${currentStepChecks.length}가지 모두 문제없어요.`;

  const renderCheckRow = (item: InspectionCheckItem) => (
    <li key={item.id}>
      <button
        type="button"
        onClick={() => setSelectedDetailCheck(item)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 cursor-pointer"
      >
        <span className="min-w-0 text-sm text-slate-800">
          {plainTitle(item)}
          {showCodes && <span className="ml-2 font-mono text-[11px] text-slate-400">{item.code}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {getStatusBadge(item.status)}
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </span>
      </button>
    </li>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
      {/* 1. 요약 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
            failCount > 0 ? 'bg-rose-50 text-rose-700' : warningCount > 0 ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-700'
          }`}>
            {failCount > 0 ? <ShieldAlert className="w-4 h-4" /> : warningCount > 0 ? <AlertTriangle className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
          </span>
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              {stepIcon}
              <span>{stepTitle}</span>
            </h3>
            <p className="text-[13px] text-slate-600">{summaryText}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsFullListModalOpen(true)}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-800 transition hover:bg-slate-50 cursor-pointer"
        >
          <ListFilter className="w-3.5 h-3.5" />
          <span>검사 {currentStepChecks.length}가지 보기</span>
        </button>
      </div>

      {/* 2. 확인할 것만 짧게 */}
      {issueChecks.length > 0 && (
        <div className="p-3">
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40">
            {issueChecks.map(renderCheckRow)}
          </ul>
        </div>
      )}

      {/* 3. 전체 검사 목록 */}
      {isFullListModalOpen && (
        <Modal
          onClose={() => setIsFullListModalOpen(false)}
          title={stepTitle}
          description={`정리된 파일이 원래 주문과 맞는지 ${currentStepChecks.length}가지를 확인했어요. 눌러서 자세히 볼 수 있어요.`}
          size="lg"
          closeOnEsc={false}
          footerStart={
            <button type="button" onClick={() => setShowCodes(v => !v)} className="text-[13px] font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700 cursor-pointer">
              {showCodes ? '검사 코드 숨기기' : '검사 코드 보기 (문의할 때 필요해요)'}
            </button>
          }
          footer={<button type="button" onClick={() => setIsFullListModalOpen(false)} className={btn.dark}>닫기</button>}
        >
          <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
            failCount > 0 ? 'border-rose-200 bg-rose-50' : warningCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-brand-200 bg-brand-50'
          }`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-white ${failCount > 0 ? 'bg-rose-700' : warningCount > 0 ? 'bg-amber-600' : 'bg-brand-600'}`}>
              {failCount > 0 ? <XCircle className="w-5 h-5" /> : warningCount > 0 ? <AlertTriangle className="w-5 h-5" /> : <Check className="w-5 h-5" />}
            </span>
            <div className="text-sm font-semibold text-slate-900">{summaryText}</div>
          </div>

          {issueChecks.length > 0 && (
            <>
              <div className="mt-4 mb-1.5 text-[13px] font-semibold text-amber-800">확인해 주세요 {issueChecks.length}</div>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40">
                {issueChecks.map(renderCheckRow)}
              </ul>
            </>
          )}

          {passChecks.length > 0 && (
            <>
              <div className="mt-4 mb-1.5 text-[13px] font-semibold text-slate-600">문제없음 {passChecks.length}</div>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {passChecks.map(renderCheckRow)}
              </ul>
            </>
          )}
        </Modal>
      )}

      {/* 4. 검사 하나 자세히 */}
      {selectedDetailCheck && (
        <Modal
          onClose={() => setSelectedDetailCheck(null)}
          title={plainTitle(selectedDetailCheck)}
          description={<span className="inline-flex items-center gap-2">{getStatusBadge(selectedDetailCheck.status)}{showCodes && <span className="font-mono text-[11px] text-slate-400">{selectedDetailCheck.code}</span>}</span>}
          size="lg"
          zIndex={60}
          closeOnEsc={false}
          footer={<button type="button" onClick={() => setSelectedDetailCheck(null)} className={btn.dark}>닫기</button>}
        >
          <div className="space-y-4">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-600">
              {selectedDetailCheck.description}
            </p>

            {editSuccessMsg && (
              <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-[13px] font-semibold text-brand-900">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-brand-700" />
                <span>{editSuccessMsg}</span>
              </div>
            )}

            {selectedDetailCheck.code === 'STEP1_W2' ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <Lightbulb className="w-4 h-4 text-amber-600" />
                    자동으로 맞춘 상품 {selectedDetailCheck.details.length}개
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAddAllToDict(selectedDetailCheck.details)}
                    className={btn.primary}
                  >
                    <PlusCircle className="w-4 h-4" />
                    모두 품목사전에 넣기
                  </button>
                </div>

                <div className="space-y-2.5">
                  {selectedDetailCheck.details.map((dt, idx) => {
                    const parsed = parseSmartMatchDetail(dt);
                    if (!parsed) {
                      return (
                        <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-700">{dt}</div>
                      );
                    }

                    const isEditingThis = editingRawName === parsed.rawName;
                    const savedMappedName = savedCustomEditedMap[parsed.rawName];
                    const isAdded = addedToDictSet.has(parsed.rawName);
                    const hasCustomText = !!savedMappedName;
                    const currentMappedName = savedMappedName || parsed.mappedName;

                    return (
                      <div key={idx} className={`space-y-2 rounded-xl border p-3.5 ${isAdded ? 'border-brand-200 bg-brand-50/50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center justify-between gap-2 text-[13px] text-slate-600">
                          <span>받는 사람 <b className="font-semibold text-slate-900">{parsed.recipient}</b></span>
                          {isAdded ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2 py-0.5 text-[12px] font-semibold text-white"><Check className="w-3 h-3" />품목사전에 넣었어요</span>
                          ) : hasCustomText ? (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-semibold text-slate-700">고침 (아직 안 넣음)</span>
                          ) : (
                            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-800">{parsed.score}% 비슷함</span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                            <div className="text-[12px] text-slate-500">원래 상품명</div>
                            <div className="break-words font-medium text-slate-800">{parsed.rawName}</div>
                          </div>
                          <ArrowRight className="hidden w-4 h-4 text-slate-400 sm:block" />
                          <div className={`rounded-lg border p-2.5 ${isAdded || hasCustomText ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'}`}>
                            <div className="text-[12px] text-slate-500">{isAdded ? '품목사전에 넣은 이름' : hasCustomText ? '고친 이름' : '자동으로 맞춘 이름'}</div>
                            <div className="break-words font-semibold text-slate-900">{currentMappedName}</div>
                          </div>
                        </div>

                        {isEditingThis ? (
                          <div className="flex items-center gap-2 border-t border-slate-100 pt-2">
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
                              placeholder="바꿀 이름 (Enter 저장, Esc 취소)"
                              aria-label="바꿀 이름"
                              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
                              autoFocus
                            />
                            <button type="button" onClick={() => handleSaveEdit(parsed.rawName)} className={`${btn.primary} min-h-9 px-3`}>
                              <Check className="w-4 h-4" />저장
                            </button>
                            <button type="button" onClick={() => setEditingRawName(null)} className={`${btn.secondary} min-h-9 px-3`}>
                              취소
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2 pt-0.5">
                            {isAdded ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRawName(parsed.rawName);
                                  setEditingVal(currentMappedName);
                                }}
                                className={`${btn.ghost} min-h-8 px-3 text-[13px]`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />다시 고치기
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRawName(parsed.rawName);
                                    setEditingVal(currentMappedName);
                                  }}
                                  className={`${btn.ghost} min-h-8 px-3 text-[13px]`}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />이름 고치기
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAddToDict(parsed.rawName, currentMappedName)}
                                  className={`${btn.secondary} min-h-8 px-3 text-[13px]`}
                                >
                                  <Plus className="w-3.5 h-3.5" />품목사전에 넣기
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
              <div>
                <div className="mb-2 flex items-center justify-between text-[13px]">
                  <span className="font-semibold text-slate-800">자세한 내용</span>
                  <span className="text-slate-500">{selectedDetailCheck.details.length}건</span>
                </div>
                <ul className="space-y-1.5">
                  {selectedDetailCheck.details.map((dt, idx) => (
                    <li key={idx} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] leading-relaxed">
                      <span className="mt-0.5 shrink-0 font-mono text-[11px] text-slate-400">{idx + 1}</span>
                      <span className={selectedDetailCheck.status === 'FAIL' ? 'text-rose-800' : selectedDetailCheck.status === 'WARNING' ? 'text-amber-900' : 'text-slate-700'}>
                        {dt}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
