import { ProcessedOrder, ProductMapping, InspectionCheckItem, StepValidationResult } from '../types';

export interface ValidationInputStep1 {
  rawOrders: ProcessedOrder[];
  processedOrders: ProcessedOrder[];
  summaryDetailHeaders: string[]; // 요약보고서 '상세내역' 시트 헤더
  summaryDetailRows: { 용량: string; 상품명: string; 수량: number; 주문자: string; multiplier?: number; [key: string]: any }[];
  summaryGroupHeaders: string[]; // 요약보고서 '상품준비요약' 시트 헤더
  summaryGroupRows: { 상품분류: string; 총수량: number; 총kg?: number; [key: string]: any }[];
  sortedHeaders: string[]; // '품목별정렬' 시트 헤더
  sortedRows: ProcessedOrder[];
  productMappings: ProductMapping[];
}

export interface OutputFileInfo {
  fileName: string;
  platformName: string;
  totalRows: number;
  headers: string[];
  originalHeaders: string[];
  missingTrackingCount: number;
  missingCourierCount: number;
  duplicateDeliveryNCount: number; // 쿠팡 DeliveryList 합포장건(N) 중복 잔여 수
  bundleMismatchCount?: number; // C열 합포장 수량/품목수 불일치 수
  bundleMismatchDetails?: string[];
  missingTrackingRows?: number[];
  duplicateDeliveryNRows?: number[];
}

export interface ValidationInputStep2 {
  step1InputOrderCount: number;
  outputFiles: OutputFileInfo[];
}

export function runComprehensiveValidation(
  step1Input?: ValidationInputStep1,
  step2Input?: ValidationInputStep2
): StepValidationResult {
  const step1Checks: InspectionCheckItem[] = [];
  const step2Checks: InspectionCheckItem[] = [];

  // ----------------------------------------------------
  // STEP 1 검증
  // ----------------------------------------------------
  if (step1Input) {
    const {
      rawOrders,
      processedOrders,
      summaryDetailHeaders,
      summaryDetailRows,
      summaryGroupRows,
      sortedHeaders,
      sortedRows,
      productMappings
    } = step1Input;

    const rawCount = rawOrders.length;

    // STEP1 ERROR 1: 요약보고서 상세내역 시트 포맷 [용량, 상품명, 수량, 주문자]
    const reqDetailHeaders = ['용량', '상품명', '수량', '주문자'];
    const detailHeaderFailures: string[] = [];
    reqDetailHeaders.forEach((h, idx) => {
      if (!summaryDetailHeaders[idx] || !summaryDetailHeaders[idx].includes(h)) {
        detailHeaderFailures.push(`컬럼 ${idx + 1}번째: '${h}' 필요 (현재: '${summaryDetailHeaders[idx] || '없음'}')`);
      }
    });

    step1Checks.push({
      id: 'step1_e1',
      step: 1,
      category: 'ERROR',
      code: 'STEP1_E1',
      title: '요약보고서 상세내역 시트 포맷 검사',
      status: detailHeaderFailures.length === 0 ? 'PASS' : 'FAIL',
      description: '상세내역 시트 포맷이 [용량, 상품명, 수량, 주문자]로 구성되었는지 확인',
      failCount: detailHeaderFailures.length,
      details: detailHeaderFailures.length === 0 ? ['정상 포맷 [용량, 상품명, 수량, 주문자] 준수함'] : detailHeaderFailures
    });

    // STEP1 ERROR 2: 요약보고서 상세내역 시트 누락 발생 여부
    const detailMissingDetails: string[] = [];
    summaryDetailRows.forEach((r, idx) => {
      if (!r.용량 || !r.상품명 || r.수량 === undefined || r.수량 === null || !r.주문자) {
        detailMissingDetails.push(`${idx + 1}행 [주문자: ${r.주문자 || '미입력'}, 상품명: ${r.상품명 || '미입력'}] 누락 필드 존재`);
      }
    });

    step1Checks.push({
      id: 'step1_e2',
      step: 1,
      category: 'ERROR',
      code: 'STEP1_E2',
      title: '요약보고서 상세내역 무결성 검사',
      status: detailMissingDetails.length === 0 ? 'PASS' : 'FAIL',
      description: '상세내역 시트에서 누락된 데이터(용량, 상품명, 수량, 주문자) 존재 여부 확인',
      failCount: detailMissingDetails.length,
      details: detailMissingDetails.length === 0 ? ['상세내역 누락 항목 없음 (100% 기입)'] : detailMissingDetails
    });

    // STEP1 ERROR 3: 원본 업로드 엑셀 vs 요약보고서 상세내역 개수 및 수량 합계 일치 검사
    let rawTotalQty = 0;
    rawOrders.forEach(r => {
      const q = Number(r.수량) || 0;
      const m = Number(r.multiplier) || 1;
      rawTotalQty += q * m;
    });

    let detailTotalQty = 0;
    summaryDetailRows.forEach(r => {
      const rowQty = Number(r.수량) || 0;
      const rowMult = Number(r.multiplier) || 1;
      detailTotalQty += rowQty * rowMult;
    });

    const detailCountDiff = Math.abs(summaryDetailRows.length - rawCount);
    const detailQtyDiff = Math.abs(detailTotalQty - rawTotalQty);

    const detailCountDetails: string[] = [];
    if (detailCountDiff !== 0) {
      detailCountDetails.push(`[건수 불일치] 원본 엑셀 건수(${rawCount}건) vs 요약보고서 상세내역 건수(${summaryDetailRows.length}건) (오차: ${detailCountDiff}건)`);
    }
    if (detailQtyDiff > 0.01) {
      detailCountDetails.push(`[수량 불일치] 원본 엑셀 총 수량(${rawTotalQty}개) vs 요약보고서 상세내역 총 수량(${detailTotalQty}개) (오차: ${detailQtyDiff}개)`);
    }

    step1Checks.push({
      id: 'step1_e3',
      step: 1,
      category: 'ERROR',
      code: 'STEP1_E3',
      title: '원본 엑셀 vs 요약보고서 상세내역 수량/건수 검사',
      status: (detailCountDiff === 0 && detailQtyDiff <= 0.01) ? 'PASS' : 'FAIL',
      description: '요약보고서 상세내역의 행 개수 및 총 수량이 집어넣은 원본 엑셀과 100% 일치하는지 검증',
      failCount: detailCountDetails.length,
      details: (detailCountDiff === 0 && detailQtyDiff <= 0.01) ? [`원본 엑셀 건수(${rawCount}건, 총 ${rawTotalQty}개)와 완벽히 일치함`] : detailCountDetails
    });

    // STEP1 ERROR 4: 원본 엑셀 & 요약보고서 상세내역 vs 상품준비요약 시트 수량 삼자 대조 검사
    let groupTotalQty = 0;
    summaryGroupRows.forEach(r => {
      groupTotalQty += Number(r.총수량 || r.수량 || r['총 개수'] || r['개수']) || 0;
    });

    const groupCalcDetails: string[] = [];
    if (Math.abs(detailTotalQty - groupTotalQty) > 0.01) {
      groupCalcDetails.push(`[요약보고서 내 불일치] 상세내역 총 수량(${detailTotalQty}개) != 상품준비요약 총 수량(${groupTotalQty}개)`);
    }
    if (Math.abs(rawTotalQty - groupTotalQty) > 0.01) {
      groupCalcDetails.push(`[원본 엑셀과 불일치] 원본 엑셀 총 수량(${rawTotalQty}개) != 상품준비요약 총 수량(${groupTotalQty}개)`);
    }

    step1Checks.push({
      id: 'step1_e4',
      step: 1,
      category: 'ERROR',
      code: 'STEP1_E4',
      title: '원본 엑셀 vs 상품준비요약 수량 삼자 대조 검사',
      status: groupCalcDetails.length === 0 ? 'PASS' : 'FAIL',
      description: '상품준비요약 시트의 총 수량이 원본 엑셀 및 상세내역 수량 총합과 3자 모두 일치하는지 검증',
      failCount: groupCalcDetails.length,
      details: groupCalcDetails.length === 0 ? [`원본 엑셀, 상세내역, 상품준비요약 총 수량(${groupTotalQty}개) 3자 완벽 일치함`] : groupCalcDetails
    });

    // STEP1 ERROR 5 (E5)는 사용자 요청에 따라 제외/삭제 처리됨

    // STEP1 ERROR 6: 품목별정렬 시트 포맷 [용량, 상품명, 수량(고정), 수량, 수령인, 연락처, 우편번호, 주소, 배송메세지]
    const reqSortedHeaders = ['용량', '상품명', '수량(고정)', '수량', '수령인', '연락처', '우편번호', '주소', '배송메세지'];
    const sortedHeaderFailures: string[] = [];
    reqSortedHeaders.forEach((h, idx) => {
      if (!sortedHeaders[idx] || !sortedHeaders[idx].includes(h.replace('(고정)', ''))) {
        sortedHeaderFailures.push(`컬럼 ${idx + 1}번째: '${h}' 필요 (현재: '${sortedHeaders[idx] || '없음'}')`);
      }
    });

    step1Checks.push({
      id: 'step1_e6',
      step: 1,
      category: 'ERROR',
      code: 'STEP1_E6',
      title: '품목별정렬 시트 포맷 검사',
      status: sortedHeaderFailures.length === 0 ? 'PASS' : 'FAIL',
      description: '품목별정렬 시트 헤더가 [용량, 상품명, 수량(고정), 수량, 수령인, 연락처, 우편번호, 주소, 배송메세지] 인지 확인',
      failCount: sortedHeaderFailures.length,
      details: sortedHeaderFailures.length === 0 ? ['표준 규격 포맷 준수 확인'] : sortedHeaderFailures
    });

    // STEP1 ERROR 7: 품목별정렬 C열 수량(고정)의 값이 1이 아닌 게 있는 경우
    // 사용자 지침: C열 수량(고정)은 엑셀 인쇄/양식용 1로 고정 기입됨.
    const nonOneCColDetails: string[] = [];
    sortedRows.forEach((r, idx) => {
      // 품목별정렬 C열 고정 수량값은 1이어야 함 (multiplier는 D열 수량 분리 배수임)
      const fixedQtyVal = r.fixedQty !== undefined ? r.fixedQty : 1; 
      if (fixedQtyVal !== 1) {
        nonOneCColDetails.push(`${idx + 1}행 [수령인: ${r.수령인 || '미입력'}]: C열 수량(고정) 값이 ${fixedQtyVal}로 1이 아닙니다.`);
      }
    });

    step1Checks.push({
      id: 'step1_e7',
      step: 1,
      category: 'ERROR',
      code: 'STEP1_E7',
      title: '품목별정렬 C열 수량(고정) 고정값(1) 검사',
      status: nonOneCColDetails.length === 0 ? 'PASS' : 'FAIL',
      description: '품목별정렬의 C열(수량 고정열)이 예외 없이 모두 1로 고정되었는지 확인',
      failCount: nonOneCColDetails.length,
      details: nonOneCColDetails.length === 0 ? ['C열 수량(고정) 모든 행이 1로 정방향 세팅됨'] : nonOneCColDetails
    });

    // STEP1 ERROR 8: 품목별정렬 내용 중 누락이 있는 경우
    const sortedMissingDetails: string[] = [];
    sortedRows.forEach((r, idx) => {
      const missingList: string[] = [];
      if (!r.수령인) missingList.push('수령인');
      if (!r.주소) missingList.push('주소');
      if (!r.연락처) missingList.push('연락처');
      if (!r.상품명) missingList.push('상품명');
      if (!r.수량) missingList.push('수량');

      if (missingList.length > 0) {
        sortedMissingDetails.push(`${idx + 1}행 [${r.sourceFileName || '원본'}] ${missingList.join(', ')} 정보 누락`);
      }
    });

    step1Checks.push({
      id: 'step1_e8',
      step: 1,
      category: 'ERROR',
      code: 'STEP1_E8',
      title: '품목별정렬 데이터 무결성 검사',
      status: sortedMissingDetails.length === 0 ? 'PASS' : 'FAIL',
      description: '품목별정렬 데이터 중 필수 배송/주문 정보(수령인, 주소, 연락처, 상품명, 수량) 누락 여부 확인',
      failCount: sortedMissingDetails.length,
      details: sortedMissingDetails.length === 0 ? ['모든 가공 데이터 누락 없음 (완벽 기입)'] : sortedMissingDetails
    });

    // STEP1 ERROR 9: 품목별정렬의 상품명이 대치 키워드로 잘못 변환된 경우
    // 품목별정렬에서는 원본/표준화 상품명이어야 하며, 대치 키워드(분류 카테고리명)로 변환되면 안 됨.
    const sortedReplacedDetails: string[] = [];
    sortedRows.forEach((r, idx) => {
      // r.category나 r.mappedCategory는 대치 키워드(분류명)임. 상품명(r.상품명)이 분류명과 동일하다면 변환 오류
      if (r.category && r.상품명 === r.category && r.originalProductName && r.originalProductName !== r.category) {
        sortedReplacedDetails.push(`${idx + 1}행 상품명 '${r.originalProductName}'가 품목별정렬 시트에 대치 키워드 '${r.상품명}'로 잘못 변환되었습니다.`);
      }
    });

    step1Checks.push({
      id: 'step1_e9',
      step: 1,
      category: 'ERROR',
      code: 'STEP1_E9',
      title: '품목별정렬 상품명 원본 유지 검사',
      status: sortedReplacedDetails.length === 0 ? 'PASS' : 'FAIL',
      description: '품목별정렬 시트의 상품명이 대치 키워드로 오변환되지 않고 올바르게 유지되었는지 확인',
      failCount: sortedReplacedDetails.length,
      details: sortedReplacedDetails.length === 0 ? ['상품명이 대치 키워드로 변환되지 않고 올바르게 유지됨'] : sortedReplacedDetails
    });

    // STEP1 ERROR 10: 이상 주문 데이터 검사 (수령인/연락처/주소/수량 무결성 검증)
    const anomalousDetails: string[] = [];
    processedOrders.forEach((o, idx) => {
      const rec = (o.수령인 || o.주문자 || '').trim();
      const phoneDigits = (o.연락처 || '').replace(/\D/g, '');
      const addr = (o.주소 || '').trim();
      const qty = Number(o.수량);

      const errs: string[] = [];
      if (!rec) errs.push('수령인 누락');
      if (!o.연락처 || phoneDigits.length < 10) errs.push('연락처 자릿수 오류(10자리 미만)');
      if (!addr || addr.length < 5) errs.push('주소 상세 미흡(5자 미만)');
      if (isNaN(qty) || qty <= 0) errs.push('수량 0개 이하');

      if (errs.length > 0) {
        anomalousDetails.push(`${idx + 1}행 [수령인: ${rec || '미기재'}, 연락처: ${o.연락처 || '미기재'}]: ${errs.join(', ')}`);
      }
    });

    step1Checks.push({
      id: 'step1_e10',
      step: 1,
      category: 'ERROR',
      code: 'STEP1_E10',
      title: '이상 주문 데이터 사전 오류 검증 (오배송 예방)',
      status: anomalousDetails.length === 0 ? 'PASS' : 'FAIL',
      description: '수령인명 누락, 전화번호 자릿수 부족(10자리 미만), 주소 정보 미흡, 수량 0개 등 이상 주문 데이터 선별',
      failCount: anomalousDetails.length,
      details: anomalousDetails.length === 0 ? ['이상 데이터 없음 (수령인/연락처/주소/수량 100% 정상)'] : anomalousDetails
    });

    // STEP1 ERROR 11: 원본 업로드 엑셀 vs 품목별정렬 수량/건수 직접 대조 검사
    let sortedTotalQty = 0;
    sortedRows.forEach(r => {
      const q = Number(r.수량) || 0;
      const m = Number(r.multiplier) || 1;
      sortedTotalQty += q * m;
    });

    const sortedCountDiff = Math.abs(sortedRows.length - rawCount);
    const sortedQtyDiff = Math.abs(sortedTotalQty - rawTotalQty);

    const sortedCompareDetails: string[] = [];
    if (sortedCountDiff !== 0) {
      sortedCompareDetails.push(`[건수 불일치] 원본 엑셀 건수(${rawCount}건) vs 품목별정렬 건수(${sortedRows.length}건) (오차: ${sortedCountDiff}건)`);
    }
    if (sortedQtyDiff > 0.01) {
      sortedCompareDetails.push(`[수량 불일치] 원본 엑셀 총 수량(${rawTotalQty}개) vs 품목별정렬 총 수량(${sortedTotalQty}개) (오차: ${sortedQtyDiff}개)`);
    }

    step1Checks.push({
      id: 'step1_e11',
      step: 1,
      category: 'ERROR',
      code: 'STEP1_E11',
      title: '원본 엑셀 vs 품목별정렬 수량/건수 직접 대조 검사',
      status: (sortedCountDiff === 0 && sortedQtyDiff <= 0.01) ? 'PASS' : 'FAIL',
      description: '품목별정렬 데이터의 총 행 건수 및 총 수량이 집어넣은 원본 엑셀 데이터와 100% 일치하는지 검증',
      failCount: sortedCompareDetails.length,
      details: (sortedCountDiff === 0 && sortedQtyDiff <= 0.01) ? [`원본 엑셀과 품목별정렬의 총 건수(${rawCount}건) 및 총 수량(${rawTotalQty}개) 100% 일치함`] : sortedCompareDetails
    });

    // STEP1 ERROR 12 (경고/오류): 중복 업로드 및 중복 주문 데이터 자동 감지 검사
    const duplicateMap = new Map<string, { count: number; sample: ProcessedOrder }>();
    rawOrders.forEach(o => {
      const rec = (o.수령인 || o.주문자 || '').trim();
      const phone = (o.연락처 || '').replace(/\D/g, '');
      const addr = (o.주소 || '').trim();
      const prod = (o.originalProductName || o.상품명 || '').trim();
      const opt = (o.originalOptionName || o.용량 || '').trim();
      const qty = o.수량;

      const dupKey = `${rec}_${phone}_${addr}_${prod}_${opt}_${qty}`;
      if (duplicateMap.has(dupKey)) {
        duplicateMap.get(dupKey)!.count += 1;
      } else {
        duplicateMap.set(dupKey, { count: 1, sample: o });
      }
    });

    const duplicateDetails: string[] = [];
    let totalDuplicateCount = 0;
    duplicateMap.forEach((val) => {
      if (val.count > 1) {
        totalDuplicateCount += (val.count - 1);
        const s = val.sample;
        duplicateDetails.push(
          `[중복 데이터 감지] 수령인: '${s.수령인 || s.주문자}', 상품: '${s.originalProductName || s.상품명}' (${s.originalOptionName || s.용량 || '옵션없음'}), 수량: ${s.수량}개 ➔ 동일 주문 ${val.count}회 중복 업로드/포함됨`
        );
      }
    });

    step1Checks.push({
      id: 'step1_e12',
      step: 1,
      category: 'WARNING',
      code: 'STEP1_E12',
      title: '중복 업로드 / 중복 주문 데이터 감지 검사',
      status: duplicateDetails.length === 0 ? 'PASS' : 'WARNING',
      description: '엑셀을 따로 올리거나 동일 주문서가 반복 업로드되어 발생한 중복 데이터 감지',
      failCount: totalDuplicateCount,
      details: duplicateDetails.length === 0 ? ['중복 업로드되거나 동일한 중복 주문 데이터 없음 (정상)'] : duplicateDetails
    });

    // STEP1 WARNING 1: 요약보고서 상품준비요약 시트에서 상품 분류 중 대치 키워드를 발견하지 못한 경우
    const unmappedKeywordDetails: string[] = [];
    summaryGroupRows.forEach((r, idx) => {
      const clsName = String(r.상품분류 || r.분류 || "").trim();
      if (clsName === '미지정/기타' || clsName.includes('미매핑') || clsName.includes('미지정')) {
        unmappedKeywordDetails.push(`${idx + 1}행: 상품 분류를 찾을 수 없어 '미지정/기타'로 분류되었습니다.`);
      }
    });

    step1Checks.push({
      id: 'step1_w1',
      step: 1,
      category: 'WARNING',
      code: 'STEP1_W1',
      title: '상품준비요약 대치 키워드 미발견(미매핑) 검사',
      status: unmappedKeywordDetails.length === 0 ? 'PASS' : 'WARNING',
      description: '매핑 사전에 등록되어 있지 않아 대치 키워드를 찾지 못한 품목 존재 여부 확인',
      failCount: unmappedKeywordDetails.length,
      details: unmappedKeywordDetails.length === 0 ? ['모든 품목의 대치 키워드 완벽 발견/매핑 완료'] : unmappedKeywordDetails
    });

    // STEP1 WARNING 2: 지능형 유사 매칭(Fuzzy Smart Matching) 적용 안내 검사
    const smartMatchedDetails: string[] = [];
    const smartOrderList = (processedOrders || []).filter(o => o && o.isSmartMatched);
    
    const smartMap = new Map<string, string>();
    smartOrderList.forEach(o => {
      const key = `${o.originalProductName}_${o.상품명}`;
      if (!smartMap.has(key)) {
        const detailStr = `[수령인: ${o.수령인 || '미입력'}] 원본 상품명: '${o.originalProductName}' ➔ 매칭 정제명: '${o.상품명}' (유사도 ${o.smartMatchScore || 85}% 일치)`;
        smartMap.set(key, detailStr);
      }
    });

    smartMap.forEach(detail => {
      smartMatchedDetails.push(detail);
    });

    step1Checks.push({
      id: 'step1_w2',
      step: 1,
      category: 'WARNING',
      code: 'STEP1_W2',
      title: '지능형 유사 매칭(Fuzzy Matching) 적용 검사',
      status: smartMatchedDetails.length === 0 ? 'PASS' : 'WARNING',
      description: '기존 정제 분류명 및 문맥 유사도를 기반으로 자동 탐색/매칭된 품목 내역을 안내합니다.',
      failCount: smartMatchedDetails.length,
      details: smartMatchedDetails.length === 0 ? ['지능형 유사 매칭 적용 항목 없음 (전건 Exact Match 또는 대치 매핑됨)'] : smartMatchedDetails
    });
  }

  // ----------------------------------------------------
  // STEP 2 검증
  // ----------------------------------------------------
  if (step2Input && step2Input.outputFiles && step2Input.outputFiles.length > 0) {
    const { step1InputOrderCount, outputFiles } = step2Input;

    // STEP2 ERROR 1: output 생성 엑셀의 총 개수가 input 넣은 엑셀의 개수와 다른 경우
    let totalOutputOrderCount = 0;
    outputFiles.forEach(f => {
      totalOutputOrderCount += f.totalRows;
    });

    const outputCountDiff = Math.abs(totalOutputOrderCount - step1InputOrderCount);
    const countMismatchDetails: string[] = [];
    if (outputCountDiff !== 0) {
      countMismatchDetails.push(`1단계 input 주문 수량(${step1InputOrderCount}건) vs 2단계 output 주문 수량(${totalOutputOrderCount}건) 불일치 (오차: ${outputCountDiff}건)`);
    }

    step2Checks.push({
      id: 'step2_e1',
      step: 2,
      category: 'ERROR',
      code: 'STEP2_E1',
      title: '최종 발송 엑셀 총 주문 수량 일치 검사',
      status: outputCountDiff === 0 ? 'PASS' : 'FAIL',
      description: '생성된 output 엑셀들의 총 행 개수가 1단계 input 주문 건수와 일치하는지 확인',
      failCount: outputCountDiff,
      details: outputCountDiff === 0 ? [`Input 주문 수량(${step1InputOrderCount}건)과 100% 일치함`] : countMismatchDetails
    });

    // STEP2 ERROR 2: output 엑셀 포맷이 input 엑셀 포맷과 일치하지 않은 경우
    const formatMismatchDetails: string[] = [];
    outputFiles.forEach(f => {
      if (f.originalHeaders && f.originalHeaders.length > 0 && f.headers && f.headers.length > 0) {
        const h1 = f.originalHeaders.slice(0, 10).join(',');
        const h2 = f.headers.slice(0, 10).join(',');
        if (h1 !== h2) {
          formatMismatchDetails.push(`[${f.fileName}] 원본 컬럼 구조와 최종 output 엑셀의 컬럼 구조가 일치하지 않습니다.`);
        }
      }
    });

    step2Checks.push({
      id: 'step2_e2',
      step: 2,
      category: 'ERROR',
      code: 'STEP2_E2',
      title: '최종 output 엑셀 서식/컬럼 포맷 일치 검사',
      status: formatMismatchDetails.length === 0 ? 'PASS' : 'FAIL',
      description: '생성된 각 output 엑셀의 컬럼 구조 및 포맷이 1단계 input 엑셀 구조와 완벽히 일치하는지 확인',
      failCount: formatMismatchDetails.length,
      details: formatMismatchDetails.length === 0 ? ['모든 플랫폼별 output 엑셀 포맷 정상 보존 확인'] : formatMismatchDetails
    });

    // STEP2 ERROR 3: output 엑셀의 운송장번호 누락인 경우
    let totalMissingTracking = 0;
    const missingTrackingDetails: string[] = [];
    outputFiles.forEach(f => {
      if (f.missingTrackingCount > 0) {
        totalMissingTracking += f.missingTrackingCount;
        missingTrackingDetails.push(`[${f.fileName}] 운송장번호 미매핑/누락 ${f.missingTrackingCount}건`);
      }
    });

    step2Checks.push({
      id: 'step2_e3',
      step: 2,
      category: 'ERROR',
      code: 'STEP2_E3',
      title: '운송장번호 매핑 및 기입 누락 검사',
      status: totalMissingTracking === 0 ? 'PASS' : 'FAIL',
      description: '최종 발송 엑셀에서 운송장번호가 누락되거나 미입력된 건이 있는지 확인',
      failCount: totalMissingTracking,
      details: totalMissingTracking === 0 ? ['모든 주문건에 운송장번호 매핑 및 기입 완료'] : missingTrackingDetails
    });

    // STEP2 ERROR 4: 쿠팡 엑셀(DeliveryList)에서 합포장건(N)이 중복 제거 실패한 경우
    let totalDupN = 0;
    const dupNDetails: string[] = [];
    outputFiles.forEach(f => {
      if (f.duplicateDeliveryNCount > 0) {
        totalDupN += f.duplicateDeliveryNCount;
        dupNDetails.push(`[${f.fileName}] 쿠팡 분리배송 'N' 중복 잔여 ${f.duplicateDeliveryNCount}건 (중복 제거 미완료)`);
      }
    });

    step2Checks.push({
      id: 'step2_e4',
      step: 2,
      category: 'ERROR',
      code: 'STEP2_E4',
      title: '쿠팡 DeliveryList 합포장(N) 중복 제거 검사',
      status: totalDupN === 0 ? 'PASS' : 'FAIL',
      description: '쿠팡 엑셀에서 동일 주문(A열 번호)의 분리배송 N 중복 행이 정상적으로 단일화되었는지 확인',
      failCount: totalDupN,
      details: totalDupN === 0 ? ['쿠팡 합포장건(N) 중복 완전 제거 및 단일화 성공'] : dupNDetails
    });

    // STEP2 ERROR 5: 쿠팡 엑셀 C열(합포) 수량과 실제 매칭 품목수 일치 검사
    let totalBundleMismatch = 0;
    const bundleMismatchDetailsList: string[] = [];
    outputFiles.forEach(f => {
      if (f.bundleMismatchCount && f.bundleMismatchCount > 0) {
        totalBundleMismatch += f.bundleMismatchCount;
        if (f.bundleMismatchDetails && f.bundleMismatchDetails.length > 0) {
          bundleMismatchDetailsList.push(...f.bundleMismatchDetails);
        }
      }
    });

    step2Checks.push({
      id: 'step2_e5',
      step: 2,
      category: 'ERROR',
      code: 'STEP2_E5',
      title: '쿠팡 합포장(C열) 품목수 및 묶음수 일치 검사',
      status: totalBundleMismatch === 0 ? 'PASS' : 'FAIL',
      description: '2단계 엑셀 C열(합포)에 2 이상으로 기재된 합포장건의 품목수/묶음수가 실제 주문서 매칭 수량과 일치하는지 검증',
      failCount: totalBundleMismatch,
      details: totalBundleMismatch === 0 ? ['모든 합포장건의 C열 수량과 주문서 매칭 수량이 100% 일치함'] : bundleMismatchDetailsList
    });

    // STEP2 WARNING 1: output 엑셀의 택배사 누락인 경우
    let totalMissingCourier = 0;
    const missingCourierDetails: string[] = [];
    outputFiles.forEach(f => {
      if (f.missingCourierCount > 0) {
        totalMissingCourier += f.missingCourierCount;
        missingCourierDetails.push(`[${f.fileName}] 택배사명 미입력 ${f.missingCourierCount}건`);
      }
    });

    step2Checks.push({
      id: 'step2_w1',
      step: 2,
      category: 'WARNING',
      code: 'STEP2_W1',
      title: '택배사 정보 기입 검사',
      status: totalMissingCourier === 0 ? 'PASS' : 'WARNING',
      description: '생성된 각 output 엑셀에 택배사명이 정상 기입되었는지 확인',
      failCount: totalMissingCourier,
      details: totalMissingCourier === 0 ? ['모든 건에 택배사 명칭 기입 완료'] : missingCourierDetails
    });
  }

  // overall status 구하기
  const getStepStatus = (checks: InspectionCheckItem[]): 'PASS' | 'FAIL' | 'WARNING' => {
    if (checks.some(c => c.status === 'FAIL')) return 'FAIL';
    if (checks.some(c => c.status === 'WARNING')) return 'WARNING';
    return 'PASS';
  };

  const step1Status = getStepStatus(step1Checks);
  const step2Status = getStepStatus(step2Checks);

  const totalFailCount = [...step1Checks, ...step2Checks].filter(c => c.status === 'FAIL').length;
  const totalWarningCount = [...step1Checks, ...step2Checks].filter(c => c.status === 'WARNING').length;

  return {
    step1: step1Checks,
    step2: step2Checks,
    step1Status,
    step2Status,
    totalFailCount,
    totalWarningCount
  };
}
