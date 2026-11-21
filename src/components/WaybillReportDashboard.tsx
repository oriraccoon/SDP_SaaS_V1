import React, { useState } from 'react';
import { MatchingError, ProcessedOrder } from '../types';
import { compareOrdersByCleanName } from '../utils/excelProcessor';
import { AlertCircle, CheckCircle, HelpCircle, Layers, Package, Lightbulb, FileText } from 'lucide-react';

interface WaybillReportDashboardProps {
  matchCount: number;
  softMatchCount: number;
  bundledCount?: number;
  bundledGroupCount?: number;
  unfilledErrors: MatchingError[];
  unusedErrors: MatchingError[];
  totalInputRows: number;
  outputOrders?: ProcessedOrder[];
}

export default function WaybillReportDashboard({
  matchCount,
  softMatchCount,
  bundledCount: propBundledCount,
  bundledGroupCount: propBundledGroupCount,
  unfilledErrors,
  unusedErrors,
  totalInputRows,
  outputOrders = []
}: WaybillReportDashboardProps) {
  // 주문 분류 필터 및 탭
  const [activeTab, setActiveTab] = useState<'all' | 'exact' | 'soft' | 'bundled' | 'unfilled' | 'unused'>(
    softMatchCount > 0 ? 'soft' : unfilledErrors.length > 0 ? 'unfilled' : 'all'
  );

  const exactMatchOrders = [...outputOrders.filter(o => o.matchType === 'exact')].sort(compareOrdersByCleanName);
  const softMatchOrders = [...outputOrders.filter(o => o.matchType === 'soft')].sort(compareOrdersByCleanName);
  const bundledOrders = [...outputOrders.filter(o => o.isBundled || o.matchType === 'bundled')].sort(compareOrdersByCleanName);

  // 합포장 묶음(송장/고객 그룹) 수 산정
  const calculatedBundledGroupCount = new Set(
    bundledOrders.map(o => `${o.수령인}_${o.우편번호}_${o.trackingNumber || ''}`)
  ).size;

  const displayBundledGroupCount = propBundledGroupCount !== undefined ? propBundledGroupCount : calculatedBundledGroupCount;
  const displayBundledCount = propBundledCount !== undefined ? propBundledCount : bundledOrders.length;

  const displayExactCount = exactMatchOrders.length;
  const displaySoftCount = softMatchOrders.length;

  const totalSuccess = outputOrders.filter(o => o.trackingNumber && o.matchType !== 'unmatched').length;
  const successRate = totalInputRows > 0 ? Math.round((totalSuccess / totalInputRows) * 100) : 0;

  const getDisplayPlatform = (platformName?: string, fileName?: string) => {
    if (platformName && platformName.trim()) {
      return platformName.trim();
    }
    if (!fileName) return '플랫폼';
    const fn = fileName.toLowerCase();
    if (fn.includes('토스') || fn.includes('toss')) return '토스';
    if (fn.includes('스마트스토어') || fn.includes('네이버') || fn.includes('naver')) return '스마트스토어';
    if (fn.includes('쿠팡') || fn.includes('coupang')) return '쿠팡';
    if (fn.includes('11번가') || fn.includes('11st') || fn.includes('eleven')) return '11번가';
    if (fn.includes('옥션') || fn.includes('지마켓') || fn.includes('gmarket') || fn.includes('auction')) return 'G마켓/옥션';
    if (fn.includes('카카오') || fn.includes('kakao')) return '카카오스토어';
    if (fn.includes('자사몰') || fn.includes('카페24') || fn.includes('cafe24')) return '자사몰';

    const clean = fileName.replace(/\.[^/.]+$/, '').replace(/[\d\-_]/g, ' ').trim();
    return clean || '주문서';
  };

  return (
    <div id="waybill-report-dashboard" className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-6">
      
      {/* 6가지 요약 비주얼 카테고리 버튼 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        
        {/* 1. 전체 주문 & 성공률 */}
        <button
          onClick={() => setActiveTab('all')}
          className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
            activeTab === 'all'
              ? 'bg-slate-800 border-slate-900 text-white shadow-md ring-2 ring-slate-400/30'
              : 'bg-white border-slate-200 shadow-sm hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className={`text-xs font-semibold ${activeTab === 'all' ? 'text-slate-300' : 'text-slate-500'}`}>
              전체 주문
            </span>
            <div className={`p-1.5 rounded-md ${activeTab === 'all' ? 'bg-slate-700 text-emerald-400' : 'bg-slate-100 text-slate-600'}`}>
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className={`text-lg font-bold ${activeTab === 'all' ? 'text-white' : 'text-slate-800'}`}>
              {totalInputRows}건
            </div>
            <div className={`text-xs mt-0.5 ${activeTab === 'all' ? 'text-emerald-400 font-medium' : 'text-emerald-600 font-semibold'}`}>
              {totalSuccess}건 붙음 ({successRate}%)
            </div>
          </div>
        </button>

        {/* 2. 일반 완전 일치 */}
        <button
          onClick={() => setActiveTab('exact')}
          className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
            activeTab === 'exact'
              ? 'bg-brand-50/90 border-[#9CC7B5] shadow-sm ring-2 ring-brand-600/20'
              : 'bg-white border-slate-200 shadow-sm hover:border-brand-200'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-semibold text-slate-500">정확히 맞음</span>
            <div className="p-1.5 bg-brand-100 text-brand-600 rounded-md">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold text-slate-800">{displayExactCount}건</div>
            <div className="text-xs text-brand-600 font-medium mt-0.5">합포장 포함</div>
          </div>
        </button>

        {/* 3. 비슷한 주문 맞춤 */}
        <button
          onClick={() => setActiveTab('soft')}
          className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
            activeTab === 'soft'
              ? 'bg-amber-50/90 border-amber-300 shadow-sm ring-2 ring-amber-500/20'
              : 'bg-white border-slate-200 shadow-sm hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-semibold text-slate-500">비슷해서 맞춤</span>
            <div className="p-1.5 bg-amber-100 text-amber-600 rounded-md">
              <Lightbulb className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold text-slate-800">{displaySoftCount}건</div>
            <div className="text-xs text-amber-600 font-medium mt-0.5">이름이 조금 달라요</div>
          </div>
        </button>

        {/* 4. 합포장 (묶음배송) 카테고리 */}
        <button
          onClick={() => setActiveTab('bundled')}
          className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
            activeTab === 'bundled'
              ? 'bg-sky-50/90 border-sky-300 shadow-sm ring-2 ring-sky-500/20'
              : 'bg-white border-slate-200 shadow-sm hover:border-sky-200'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-semibold text-slate-500">합포장 묶음</span>
            <div className="p-1.5 bg-sky-100 text-sky-700 rounded-md">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold text-sky-900">{displayBundledGroupCount}묶음</div>
            <div className="text-xs text-sky-600 font-medium mt-0.5">총 {displayBundledCount}개 품목 통합</div>
          </div>
        </button>

        {/* 5. 못 채운 값 (송장 누락/에러) */}
        <button
          onClick={() => setActiveTab('unfilled')}
          className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
            activeTab === 'unfilled'
              ? 'bg-rose-50/90 border-rose-300 shadow-sm ring-2 ring-rose-500/20'
              : 'bg-white border-slate-200 shadow-sm hover:border-rose-200'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-semibold text-slate-500">송장 못 찾은 주문</span>
            <div className="p-1.5 bg-rose-100 text-rose-600 rounded-md">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold text-slate-800">{unfilledErrors.length}건</div>
            <div className="text-xs text-rose-600 font-medium mt-0.5">송장이 없어요</div>
          </div>
        </button>

        {/* 6. 못 넣은 값 (미사용 송장) */}
        <button
          onClick={() => setActiveTab('unused')}
          className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
            activeTab === 'unused'
              ? 'bg-purple-50/90 border-purple-300 shadow-sm ring-2 ring-purple-500/20'
              : 'bg-white border-slate-200 shadow-sm hover:border-purple-200'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-semibold text-slate-500">쓰이지 않은 송장</span>
            <div className="p-1.5 bg-purple-100 text-purple-600 rounded-md">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold text-slate-800">{unusedErrors.length}건</div>
            <div className="text-xs text-purple-600 font-medium mt-0.5">안 붙은 송장</div>
          </div>
        </button>

      </div>

      {/* 매칭 상세 리포트 메인 컨테이너 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        
        {/* 6가지 탭 메뉴 */}
        <div className="flex flex-wrap border-b border-slate-150 bg-slate-50/60">
          <button
            onClick={() => setActiveTab('all')}
            className={`py-3 px-4 text-xs font-semibold text-center border-b-2 transition ${
              activeTab === 'all'
                ? 'border-slate-800 text-slate-900 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            전체 주문 ({outputOrders.length}건)
          </button>
          <button
            onClick={() => setActiveTab('exact')}
            className={`py-3 px-4 text-xs font-semibold text-center border-b-2 transition ${
              activeTab === 'exact'
                ? 'border-brand-600 text-brand-700 bg-brand-50/40'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            완전 일치 ({exactMatchOrders.length}건)
          </button>
          <button
            onClick={() => setActiveTab('soft')}
            className={`py-3 px-4 text-xs font-semibold text-center border-b-2 transition ${
              activeTab === 'soft'
                ? 'border-amber-500 text-amber-700 bg-amber-50/40'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            비슷한 주문 ({softMatchOrders.length}건)
          </button>
          <button
            onClick={() => setActiveTab('bundled')}
            className={`py-3 px-4 text-xs font-semibold text-center border-b-2 transition ${
              activeTab === 'bundled'
                ? 'border-sky-600 text-sky-800 bg-sky-50/40'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            합포장 묶음 ({displayBundledGroupCount}묶음 / {displayBundledCount}개)
          </button>
          <button
            onClick={() => setActiveTab('unfilled')}
            className={`py-3 px-4 text-xs font-semibold text-center border-b-2 transition ${
              activeTab === 'unfilled'
                ? 'border-rose-500 text-rose-700 bg-rose-50/40'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            송장 못 찾은 주문 ({unfilledErrors.length}건)
          </button>
          <button
            onClick={() => setActiveTab('unused')}
            className={`py-3 px-4 text-xs font-semibold text-center border-b-2 transition ${
              activeTab === 'unused'
                ? 'border-purple-600 text-purple-700 bg-purple-50/40'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            쓰이지 않은 송장 ({unusedErrors.length}건)
          </button>
        </div>

        {/* 탭 테이블 콘텐츠 */}
        <div className="p-4">
          
          {/* 1. 전체 주문 탭 */}
          {activeTab === 'all' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 flex items-center gap-1.5 bg-slate-100 p-3 rounded-lg border border-slate-200">
                <CheckCircle className="w-4 h-4 text-slate-700 shrink-0" />
                <span>
                  주문 <strong>{outputOrders.length}건</strong>에 송장이 어떻게 붙었는지 보여 줘요.
                </span>
              </p>

              <div className="max-h-[520px] overflow-auto border border-slate-200 rounded-lg bg-white">
                <table className="w-full text-xs text-left text-slate-600 min-w-[980px]">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[100px]">쇼핑몰</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[120px]">받는 사람</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[90px]">우편번호</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[70px] text-center">수량</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[280px]">상품</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[160px]">송장 번호</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[200px]">맞춘 방법</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {outputOrders.map((ord, i) => {
                      const isExact = ord.matchType === 'exact';
                      const isSoft = ord.matchType === 'soft';
                      const isBundled = ord.matchType === 'bundled';
                      const platformLabel = getDisplayPlatform(ord.platformName, ord.sourceFileName);

                      return (
                        <tr key={i} className="hover:bg-slate-50 transition">
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200" title={ord.sourceFileName || ord.platformName}>
                              <FileText className="w-3 h-3 text-slate-500 shrink-0" />
                              {platformLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap font-bold text-slate-800">{ord.수령인}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap font-mono">{ord.우편번호}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-slate-700 text-center">{ord.수량}</td>
                          <td className="px-3 py-2.5 min-w-[280px] max-w-md truncate" title={ord.originalProductName || ord.상품명}>
                            {ord.originalProductName || ord.상품명}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap font-mono font-bold text-slate-800">
                            {ord.trackingNumber ? (
                              <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-200">
                                {ord.trackingNumber}
                              </span>
                            ) : (
                              <span className="text-rose-500 font-semibold">없음 (빠짐)</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {isExact && (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                <CheckCircle className="w-3 h-3" /> 완전 일치
                              </span>
                            )}
                            {isSoft && (
                              <span className="inline-flex items-center gap-1 text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                <Lightbulb className="w-3 h-3 text-amber-600" /> {ord.softMatchReason || "비슷한 주문"}
                              </span>
                            )}
                            {isBundled && (
                              <span className="inline-flex items-center gap-1 text-sky-800 font-semibold bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                                <Layers className="w-3 h-3 text-sky-600" /> {ord.softMatchReason || "합포장 묶음"}
                              </span>
                            )}
                            {!isExact && !isSoft && !isBundled && (
                              <span className="text-rose-600 font-medium">
                                {ord.unmatchedDetail ? "송장 파일에 맞는 송장이 없음" : "송장 번호 없음"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. 일반 완전 매칭 탭 */}
          {activeTab === 'exact' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 flex items-center gap-1.5 bg-brand-50/80 p-3 rounded-lg border border-[#E0EFE8]">
                <Package className="w-4 h-4 text-brand-600 shrink-0" />
                <span>
                  이름·우편번호·전화번호·상품이 모두 같아 확실히 붙은 주문이에요.
                </span>
              </p>

              <div className="max-h-[520px] overflow-auto border border-slate-200 rounded-lg bg-white">
                <table className="w-full text-xs text-left text-slate-600 min-w-[980px]">
                  <thead className="sticky top-0 z-10 bg-brand-50 text-[#0F3A2F] font-bold uppercase border-b border-brand-200">
                    <tr>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[100px]">쇼핑몰</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[120px]">받는 사람</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[90px]">우편번호</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[70px] text-center">수량</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[280px]">상품</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[160px]">송장 번호</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[150px]">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {exactMatchOrders.map((ord, i) => (
                      <tr key={i} className="hover:bg-brand-50/30 transition">
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200" title={ord.sourceFileName || ord.platformName}>
                            <FileText className="w-3 h-3 text-slate-500 shrink-0" />
                            {getDisplayPlatform(ord.platformName, ord.sourceFileName)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-bold text-slate-800">{ord.수령인}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono">{ord.우편번호}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-slate-700 text-center">{ord.수량}</td>
                        <td className="px-3 py-2.5 min-w-[280px] max-w-md truncate" title={ord.originalProductName || ord.상품명}>
                          {ord.originalProductName || ord.상품명}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono font-bold text-brand-800 bg-brand-50/50 rounded">
                          {ord.trackingNumber || "-"}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-emerald-600 font-semibold flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          완전 일치
                        </td>
                      </tr>
                    ))}
                    {exactMatchOrders.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                          정확히 맞은 주문이 없어요.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. 비슷한 주문 맞춤 탭 */}
          {activeTab === 'soft' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 flex items-center gap-1.5 bg-amber-50/80 p-3 rounded-lg border border-amber-150">
                <Lightbulb className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  이름이나 상품명이 조금 달라도 같은 주문으로 보고 붙였어요. 한 번 확인해 주세요.
                </span>
              </p>

              <div className="max-h-[520px] overflow-auto border border-slate-200 rounded-lg bg-white">
                <table className="w-full text-xs text-left text-slate-600 min-w-[980px]">
                  <thead className="sticky top-0 z-10 bg-amber-100/80 text-amber-950 font-bold uppercase border-b border-amber-200">
                    <tr>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[100px]">쇼핑몰</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[120px]">받는 사람</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[90px]">우편번호</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[70px] text-center">수량</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[280px]">상품</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[160px]">송장 번호</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[220px]">맞춘 근거</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {softMatchOrders.map((ord, i) => (
                      <tr key={i} className="hover:bg-amber-50/30 transition">
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200" title={ord.sourceFileName || ord.platformName}>
                            <FileText className="w-3 h-3 text-slate-500 shrink-0" />
                            {getDisplayPlatform(ord.platformName, ord.sourceFileName)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-bold text-slate-800">{ord.수령인}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono">{ord.우편번호}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-slate-700 text-center">{ord.수량}</td>
                        <td className="px-3 py-2.5 min-w-[280px] max-w-md truncate" title={ord.originalProductName || ord.상품명}>
                          {ord.originalProductName || ord.상품명}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono font-bold text-amber-800 bg-amber-50/50 rounded">
                          {ord.trackingNumber || "-"}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-amber-800 font-medium">
                          {ord.softMatchReason || "이름이 비슷하게 적혀 있어 같은 주문으로 판단"}
                        </td>
                      </tr>
                    ))}
                    {softMatchOrders.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                          비슷해서 맞춘 주문이 없어요.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. 합포장 (묶음배송) 탭 */}
          {activeTab === 'bundled' && (
            <div className="space-y-4">
              <p className="text-xs text-sky-900 flex items-center gap-2 bg-sky-50 p-3 rounded-lg border border-sky-200">
                <Layers className="w-4 h-4 text-sky-600 shrink-0" />
                <span>
                  같은 사람·주소로 간 여러 상품을 송장 하나로 함께 보내요.
                  <strong>{displayBundledGroupCount}명</strong>에게 <strong>{displayBundledCount}개 상품</strong>을 묶어 보내요.
                </span>
              </p>

              <div className="max-h-[520px] overflow-auto border border-sky-200 rounded-lg bg-white">
                <table className="w-full text-xs text-left text-slate-600 min-w-[980px]">
                  <thead className="sticky top-0 z-10 bg-sky-100 text-sky-950 font-bold uppercase border-b border-sky-200">
                    <tr>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[100px]">쇼핑몰</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[120px]">받는 사람</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[90px]">우편번호</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[70px] text-center">수량</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[280px]">상품</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[160px]">함께 쓰는 송장 번호</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[220px]">안내</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-100">
                    {bundledOrders.map((ord, i) => (
                      <tr key={i} className="hover:bg-sky-50/50 transition">
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200" title={ord.sourceFileName || ord.platformName}>
                            <FileText className="w-3 h-3 text-slate-500 shrink-0" />
                            {getDisplayPlatform(ord.platformName, ord.sourceFileName)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-bold text-slate-800">{ord.수령인}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono">{ord.우편번호}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-slate-700 text-center">{ord.수량}</td>
                        <td className="px-3 py-2.5 min-w-[280px] max-w-md truncate font-medium text-slate-800" title={ord.originalProductName || ord.상품명}>
                          {ord.originalProductName || ord.상품명}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono font-bold text-sky-900 bg-sky-100/80 rounded">
                          {ord.trackingNumber || "-"}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-sky-800 font-medium">
                          {ord.softMatchReason || "같은 받는 사람의 다른 주문과 대표 송장으로 함께 보냄"}
                        </td>
                      </tr>
                    ))}
                    {bundledOrders.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                          합포장 주문이 없어요.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. 못 채운 값 (송장 누락) 탭 */}
          {activeTab === 'unfilled' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 flex items-center gap-1.5 bg-rose-50/80 p-3 rounded-lg border border-rose-150">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>
                  송장 파일에서 맞는 송장을 못 찾은 주문이에요.
                </span>
              </p>

              <div className="max-h-[520px] overflow-auto border border-slate-200 rounded-lg bg-white">
                <table className="w-full text-xs text-left text-slate-600 min-w-[980px]">
                  <thead className="sticky top-0 z-10 bg-rose-100/80 text-rose-950 font-bold uppercase border-b border-rose-200">
                    <tr>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[100px]">쇼핑몰</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[120px]">받는 사람</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[90px]">우편번호</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[70px] text-center">수량</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[280px]">상품</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[280px]">못 찾은 이유</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {unfilledErrors.map((err, i) => (
                      <tr key={i} className="hover:bg-rose-50/30">
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-800 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200" title={err.sourceFileName || err.platformName}>
                            <FileText className="w-3 h-3 text-rose-500 shrink-0" />
                            {getDisplayPlatform(err.platformName, err.sourceFileName)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-bold text-slate-800">{err.name}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono">{err.zipCode}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-slate-700 text-center">{err.qty}</td>
                        <td className="px-3 py-2.5 min-w-[280px] max-w-md truncate" title={err.prod}>{err.prod}</td>
                        <td className="px-3 py-2.5 min-w-[280px]">
                          <div className="text-rose-600 font-semibold">{err.reason}</div>
                          {err.debugDetail && (
                            <div className="mt-1 text-xs p-2 rounded border border-rose-100 bg-rose-50/70 text-slate-700 whitespace-pre-wrap font-mono leading-normal">
                              {err.debugDetail}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {unfilledErrors.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                          모든 주문에 송장이 붙었어요.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. 못 넣은 값 (미사용 송장) 탭 */}
          {activeTab === 'unused' && (
            <div className="space-y-4">
              <p className="text-xs text-purple-900 flex items-center gap-1.5 bg-purple-50 p-3 rounded-lg border border-purple-200">
                <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                <span>
                  송장 파일에는 있지만 어느 주문에도 안 붙은 송장이에요.
                </span>
              </p>

              <div className="max-h-[520px] overflow-auto border border-purple-200 rounded-lg bg-white">
                <table className="w-full text-xs text-left text-slate-600 min-w-[980px]">
                  <thead className="sticky top-0 z-10 bg-purple-100 text-purple-950 font-bold uppercase border-b border-purple-200">
                    <tr>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[100px]">나온 파일</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[120px]">받는 사람</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[90px]">우편번호</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[70px] text-center">수량</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[280px]">상품</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[200px]">안 쓰인 이유</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-100">
                    {unusedErrors.map((err, i) => (
                      <tr key={i} className="hover:bg-purple-50/40">
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-800 bg-purple-50 px-2.5 py-1 rounded-md border border-purple-200" title={err.sourceFileName}>
                            <FileText className="w-3 h-3 text-purple-500 shrink-0" />
                            {getDisplayPlatform(err.platformName, err.sourceFileName)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-bold text-slate-800">{err.name}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono">{err.zipCode}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-center">{err.qty}</td>
                        <td className="px-3 py-2.5 min-w-[280px] max-w-md truncate" title={err.prod}>{err.prod}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-purple-700 font-medium">{err.reason}</td>
                      </tr>
                    ))}
                    {unusedErrors.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                          안 붙은 송장이 없어요.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}

// 미려한 회전 새로고침 아이콘 컴포넌트
function RefreshCwIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}
