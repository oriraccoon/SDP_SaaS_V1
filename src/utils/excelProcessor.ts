import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { PlatformConfig, ProductMapping, ProcessedOrder, MatchingError, ColumnMapping, ValidationIssue, CourierConfig, AnomalousOrderIssue } from '../types';
import { DEFAULT_COURIERS } from './defaultData';

// ==========================================
// 1. 텍스트 정제 및 정규화 유틸리티
// ==========================================

export function colNumToLetter(colNum: number): string {
  let temp = colNum;
  let letter = '';
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter || 'A';
}

export function normalizeTextForMapping(text: string): string {
  if (!text) return "";
  let raw = String(text);
  // 대괄호 및 소괄호 내용 제거
  raw = raw.replace(/\[.*?\]|\(.*?\)/g, '');
  // 숫자 + 용량/수량 단위 제거 (대소문자 구분 없음)
  raw = raw.replace(/\d+\.?\d*\s*(kg|g|k|개|세트|팩|입|통|봉)/gi, '');
  // 문자와 숫자 이외의 특수문자 및 공백 제거
  raw = raw.replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣]/g, '');
  return raw.trim();
}

// ==========================================
// 지능형 매칭 유틸리티 (Fuzzy & Smart Similarity)
// ==========================================

// 미리 컴파일된 노이즈 및 마케팅/원산지/맛/가공 수식어 통합 정규식 (성능 극대화)
// Note: '국산', '국내산' 등은 '국산된고' vs '된장고추' 등 대치어 매칭 구분에 필수적인 키워드이므로 소거 대상에서 제외
const NOISE_KEYWORDS_LIST = [
  '국내제조', '수입산', '수입', '돌산', '울릉도', '제주산', '제주', '강원도', '남해', '통영', '신안',
  '영덕', '보성', '안동', '나주', '의성', '창녕', '해남', '광천', '산지직송', '직송', '산지', '원산지', '현지',
  '비린맛없는', '비린맛 없는', '비린맛없', '비린맛', '맛없는', '맛있는', '깔끔한', '고소한', '감칠맛', '달콤한', '달달한',
  '매콤한', '매콤', '새콤한', '새콤', '담백한', '얼큰한', '진한', '싱싱한', '신선한', '아삭한', '아삭아삭', '쫄깃한', '쫄깃쫄깃',
  '촉촉한', '바삭한', '시원한', '원조', '전통', '명품', '명가', '정성', '엄선', '극찬', '비법', '비법양념',
  '절단', '손질', '생물', '냉동', '냉장', '자연산', '양식', '급랭', '급냉', '건조', '반건조', '훈제', '자숙', '슬라이스',
  '통째로', '원형', '순살', '뼈없는', '무뼈', '완조리', '초간단', '밀키트', '간편식', '즉석식품', '수제', '직접구운',
  '당일제조', '당일생산', '당일가공', '한장씩', '한 장씩',
  '특가', '초특가', '기획', '행사', '인기', '추천', '무료배송', '무료', '당일발송', '오늘출발', '프리미엄', '여우마을',
  '1\\+1', '2\\+1', '3\\+1', '묶음배송', '세트상품', '세트', '대용량식자재', '대용량', '업소용', '식자재', '할인', '초할인',
  '착한가격', '즉시할인', '베스트', 'BEST', 'NEW', '신상품', '신제품', '강추', 'MD추천', '히트', '품절임박'
];

// 정규식 사전 컴파일 (문자열 길이가 긴 순서대로 배치하여 치환 우선순위 보장)
const SORTED_NOISE_KEYWORDS = [...NOISE_KEYWORDS_LIST].sort((a, b) => b.length - a.length);
const COMPILED_NOISE_REGEX = new RegExp(
  SORTED_NOISE_KEYWORDS.map(kw => kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|'),
  'gi'
);

// 노이즈 키워드 및 수식어/광고문구/원산지/맛/상태 수식어 대폭 제거 (고속 처리)
export function cleanMarketingAndNoise(text: string): string {
  if (!text) return "";
  let s = String(text);
  
  // 1. 괄호 내용 및 대괄호/HTML 태그 내용 제거
  s = s.replace(/\[.*?\]|\(.*?\)|<.*?>|\{.*?\}|【.*?】/g, ' ');
  
  // 2. 특수기호 및 100% 등 비율 표현 제거
  s = s.replace(/[★▲▶●■◆✔⚡🔥☆◇◈◇★!] /g, ' ').replace(/\d+%/g, ' ');
  
  // 3. 컴파일된 정규식으로 수식어 일괄 치환 (단일 패스로 속도 극대화)
  s = s.replace(COMPILED_NOISE_REGEX, ' ');

  // 4. 용량/수량 단위 및 숫자 표현 소거
  s = s.replace(/\d+(?:\.\d+)?\s*(?:kg|g|k|L|ml|봉|팩|입|통|세트|개|p|P|짜리|묶음|박스|마리|미|줄)/gi, ' ');
  
  // 5. 특수문자 제거 후 공백 정제
  s = s.replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ').replace(/\s+/g, ' ').trim();

  // 6. 띄어쓰기된 핵심 요리/음식 단어 결합 정제
  s = s.replace(/된장\s*청양\s*고추\s*장아찌/g, '된장청양고추장아찌')
       .replace(/된장\s*청양\s*고추/g, '된장청양고추')
       .replace(/된장\s*고추\s*장아찌/g, '된장고추장아찌')
       .replace(/된장\s*고추\s*무침/g, '된장고추무침')
       .replace(/양념\s*청양\s*고추\s*장아찌/g, '양념청양고추장아찌')
       .replace(/양념\s*청양\s*고추/g, '양념청양고추')
       .replace(/양념\s*고추\s*장아찌/g, '양념고추장아찌')
       .replace(/양념\s*고추\s*무침/g, '양념고추무침')
       .replace(/간장\s*꽃게장/g, '간장꽃게장')
       .replace(/양념\s*꽃게장/g, '양념꽃게장')
       .replace(/간장\s*게장/g, '간장게장')
       .replace(/양념\s*게장/g, '양념게장')
       .replace(/포기\s*김치/g, '포기김치')
       .replace(/배추\s*김치/g, '배추김치')
       .replace(/열무\s*김치/g, '열무김치')
       .replace(/파\s*김치/g, '파김치')
       .replace(/갓\s*김치/g, '갓김치')
       .replace(/소\s*갈비/g, '소갈비')
       .replace(/돼지\s*갈비/g, '돼지갈비');

  // 7. 상위/하위/중복 품목어 단일화 (예: "간장꽃게장 간장게장" -> "간장꽃게장")
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const uniqueWords = Array.from(new Set(words));
    if (uniqueWords.length === 1) return uniqueWords[0];

    const filtered: string[] = [];
    for (let i = 0; i < uniqueWords.length; i++) {
      const wordA = uniqueWords[i];
      let isDuplicate = false;

      for (let j = 0; j < uniqueWords.length; j++) {
        if (i === j) continue;
        const wordB = uniqueWords[j];

        if (wordB.includes(wordA) && wordB.length > wordA.length) {
          isDuplicate = true;
          break;
        }

        if (
          (wordA.endsWith('게장') && wordB.endsWith('게장')) ||
          (wordA.endsWith('김치') && wordB.endsWith('김치')) ||
          (wordA.endsWith('갈비') && wordB.endsWith('갈비'))
        ) {
          if (wordA.length < wordB.length) {
            isDuplicate = true;
            break;
          }
        }
      }

      if (!isDuplicate) {
        filtered.push(wordA);
      }
    }

    s = filtered.join(" ");
  }

  return s.trim();
}

// 4번 요구사항: 원본 상품명에서 핵심 음식/품목 명칭 자동 추출 추천
export function extractCleanProductRecommendation(rawName: string): string {
  if (!rawName) return '';
  const cleaned = cleanMarketingAndNoise(rawName);
  if (cleaned && cleaned.length >= 2) {
    return cleaned;
  }
  
  // 단어 단위 분할 후 대표 명사 추출 시도
  let fallback = rawName.replace(/\[.*?\]|\(.*?\)|<.*?>|\{.*?\}/g, '').replace(/[★▲▶●■◆✔⚡🔥☆◇◈]/g, '').trim();
  const words = fallback.split(/\s+/).filter(w => w.length >= 2);
  if (words.length > 0) {
    return words[words.length - 1]; // 보통 한국어 상품명에서 가장 뒤에 나오는 단어가 핵심 품목명
  }

  return fallback || rawName.trim();
}

// 정렬 시 괄호/수식어 특수문자를 배제하고 정제된 단어를 추출하는 정렬 전용 헬퍼
export function getCleanNameForSort(text: string): string {
  if (!text) return "";
  const raw = String(text).trim();
  const cleaned = cleanMarketingAndNoise(raw);
  if (cleaned && cleaned.trim().length > 0) {
    return cleaned.trim();
  }
  const fallback = raw
    .replace(/\[.*?\]|\(.*?\)|<.*?>|\{.*?\}|【.*?】/g, ' ')
    .replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return fallback || raw;
}

// 주문 목록 정렬용 커스텀 비교 함수:
// 1) 합포장건(isMulti) 상단 배치
// 2) 합포장 묶음 그룹(combinedId) 보존
// 3) 대치된 단어(a.상품명 / b.상품명) 기준 가나다순 정렬 (표기는 원본 유지)
// 4) 대치 단어가 같을 시 원본 상품명 기준 사전순 정렬
// 5) 수령인 기준 사전순 정렬
export function compareOrdersByCleanName(a: ProcessedOrder, b: ProcessedOrder): number {
  if (a.isMulti && !b.isMulti) return -1;
  if (!a.isMulti && b.isMulti) return 1;

  if (a.isMulti && b.isMulti && a.combinedId && b.combinedId && a.combinedId !== b.combinedId) {
    return a.combinedId.localeCompare(b.combinedId);
  }

  // 1) 대치/매칭된 단어(a.상품명) 기준 가나다순 정렬
  const mappedA = a.상품명 || a.originalProductName || '';
  const mappedB = b.상품명 || b.originalProductName || '';
  const compMapped = mappedA.localeCompare(mappedB, 'ko');
  if (compMapped !== 0) return compMapped;

  // 2) 원본 상품명 기준 사전순 정렬
  const origA = a.originalProductName || a.상품명 || '';
  const origB = b.originalProductName || b.상품명 || '';
  const compOrig = origA.localeCompare(origB, 'ko');
  if (compOrig !== 0) return compOrig;

  // 3) 수령인 성명 기준 정렬
  const recA = a.수령인 || a.주문자 || '';
  const recB = b.수령인 || b.주문자 || '';
  return recA.localeCompare(recB, 'ko');
}

// 2번 요구사항: 이상 주문 데이터 자동 검증 (오류 주문 선별 Filter)
export function detectAnomalousOrders(orders: ProcessedOrder[]): AnomalousOrderIssue[] {
  const issues: AnomalousOrderIssue[] = [];

  orders.forEach(o => {
    const reasons: string[] = [];

    // 1. 수령인/주문자 성명 누락
    const recipient = (o.수령인 || o.주문자 || '').trim();
    if (!recipient) {
      reasons.push('수령인/주문자 성명 누락');
    }

    // 2. 전화번호 자릿수 오류 (숫자만 10자리 미만)
    const rawPhone = (o.연락처 || '').trim();
    const digitsOnly = rawPhone.replace(/\D/g, '');
    if (!rawPhone) {
      reasons.push('연락처(전화번호) 누락');
    } else if (digitsOnly.length < 10) {
      reasons.push(`연락처 자릿수 오류 ('${rawPhone}' - 최소 10자리 필요)`);
    }

    // 3. 주소 상세정보 미흡 (5자 미만 또는 누락)
    const addr = (o.주소 || '').trim();
    if (!addr) {
      reasons.push('배송지 주소 누락');
    } else if (addr.length < 5) {
      reasons.push(`주소 상세정보 미흡 ('${addr}' - 최소 5자 필요)`);
    }

    // 4. 수량 0개 이하 또는 숫자 오류
    const qty = Number(o.수량);
    if (isNaN(qty) || qty <= 0) {
      reasons.push(`주문 수량 오류 (${o.수량}개 - 1개 이상 필요)`);
    }

    if (reasons.length > 0) {
      issues.push({ order: o, reasons });
    }
  });

  return issues;
}

// Sørensen–Dice 계수 기반 2-gram 글자 유사도 (0 ~ 1)
export function getDiceSimilarity(str1: string, str2: string): number {
  const s1 = cleanStr(str1).replace(/\s+/g, '').toLowerCase();
  const s2 = cleanStr(str2).replace(/\s+/g, '').toLowerCase();
  if (!s1 && !s2) return 1.0;
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;

  if (s1.length < 2 || s2.length < 2) {
    return s1.includes(s2) || s2.includes(s1) ? 0.8 : 0;
  }

  const getBigrams = (str: string) => {
    const bg: string[] = [];
    for (let i = 0; i < str.length - 1; i++) {
      bg.push(str.slice(i, i + 2));
    }
    return bg;
  };

  const bg1 = getBigrams(s1);
  const bg2 = getBigrams(s2);
  let intersection = 0;

  const bg2Copy = [...bg2];
  for (const b of bg1) {
    const idx = bg2Copy.indexOf(b);
    if (idx !== -1) {
      intersection++;
      bg2Copy.splice(idx, 1);
    }
  }

  return (2.0 * intersection) / (bg1.length + bg2.length);
}

// Levenshtein 편집 거리 기반 유사도 (0 ~ 1)
export function getLevenshteinSimilarity(str1: string, str2: string): number {
  const a = cleanStr(str1).replace(/\s+/g, '').toLowerCase();
  const b = cleanStr(str2).replace(/\s+/g, '').toLowerCase();
  if (a === b) return 1.0;
  if (!a || !b) return 0;

  const lenA = a.length;
  const lenB = b.length;
  const maxLen = Math.max(lenA, lenB);
  const diff = Math.abs(lenA - lenB);

  // 길이 차이가 35% 이상 나는 경우 유사도 0.8 미달이 확실하므로 연산 생략
  if (diff / maxLen > 0.35) {
    return Math.max(0, 1 - diff / maxLen);
  }

  // 1D 배회 배열을 사용해 GC 메모리 할당 절약 및 연산 고속화
  let prevRow = new Array(lenA + 1);
  let currRow = new Array(lenA + 1);

  for (let j = 0; j <= lenA; j++) prevRow[j] = j;

  for (let i = 1; i <= lenB; i++) {
    currRow[0] = i;
    const bChar = b.charAt(i - 1);
    for (let j = 1; j <= lenA; j++) {
      const cost = bChar === a.charAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,
        currRow[j - 1] + 1,
        prevRow[j - 1] + cost
      );
    }
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  const distance = prevRow[lenA];
  return Math.max(0, 1 - distance / maxLen);
}

// 복합 지능형 유사도 스코어 산출
export function calculateSmartSimilarity(rawCandidate: string, targetName: string): number {
  if (!rawCandidate || !targetName) return 0;

  const normCandidate = cleanMarketingAndNoise(rawCandidate);
  const normTarget = cleanMarketingAndNoise(targetName);

  const rawPure = rawCandidate.replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣]/g, '');
  const targetPure = targetName.replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣]/g, '');

  if (!rawPure || !targetPure) return 0;
  if (rawPure === targetPure) return 1.0;

  // 1. 단순 포함 관계 체크
  if (rawPure.includes(targetPure) || targetPure.includes(rawPure)) {
    const minL = Math.min(rawPure.length, targetPure.length);
    const maxL = Math.max(rawPure.length, targetPure.length);
    return Math.max(0.85, minL / maxL);
  }

  // 2. 노이즈 제거 후 포함 관계
  if (normCandidate && normTarget) {
    const normCandPure = normCandidate.replace(/\s+/g, '');
    const normTgtPure = normTarget.replace(/\s+/g, '');
    if (normCandPure === normTgtPure) return 0.95;
    if (normCandPure.includes(normTgtPure) || normTgtPure.includes(normCandPure)) {
      return 0.88;
    }
  }

  // 3. Dice Bigram & Levenshtein 유사도 조합
  const dice = getDiceSimilarity(normCandidate || rawCandidate, normTarget || targetName);
  const lev = getLevenshteinSimilarity(normCandidate || rawCandidate, normTarget || targetName);

  return dice * 0.6 + lev * 0.4;
}

// ===================================================
// 고속 매칭을 위한 인덱싱 및 메모이제이션 캐시 구조
// ===================================================
interface PreparedMappingItem {
  mapping: ProductMapping;
  raw: string;
  mapped: string;
  normRaw: string;
  cleanRuleRaw: string;
  pureRuleRaw: string;
  cleanPureRule: string;
  ruleTokens: string[];
}

let cachedProductMapRef: ProductMapping[] | null = null;
let preparedMapCache: PreparedMappingItem[] = [];
let mappedCategoriesCache: string[] = [];

let extractOptionCache = new Map<string, ReturnType<typeof extractOptionAndCleanName>>();
let intelligentMatchCache = new Map<string, ReturnType<typeof findBestIntelligentMatch>>();

export function clearMappingCache() {
  cachedProductMapRef = null;
  preparedMapCache = [];
  mappedCategoriesCache = [];
  extractOptionCache.clear();
  intelligentMatchCache.clear();
}

function getPreparedProductMap(productMap: ProductMapping[]) {
  if (cachedProductMapRef === productMap && preparedMapCache.length > 0) {
    return { preparedMap: preparedMapCache, categories: mappedCategoriesCache };
  }

  cachedProductMapRef = productMap;
  extractOptionCache.clear();
  intelligentMatchCache.clear();

  // 길이 내림차순 + 사전순 정렬
  const sortedMap = [...productMap].sort((a, b) => {
    const lenDiff = (b.rawName || "").length - (a.rawName || "").length;
    if (lenDiff !== 0) return lenDiff;
    return (a.rawName || "").localeCompare(b.rawName || "");
  });

  preparedMapCache = sortedMap.map(m => {
    const raw = (m.rawName || "").trim();
    const mapped = (m.mappedName || "").trim();
    const normRaw = normalizeTextForMapping(raw);
    const cleanRuleRaw = cleanMarketingAndNoise(raw);
    const pureRuleRaw = raw.replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣]/g, '');
    const cleanPureRule = cleanRuleRaw.replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣]/g, '');
    const ruleTokens = cleanRuleRaw.split(/\s+/).filter(t => t.length >= 2);

    return {
      mapping: m,
      raw,
      mapped,
      normRaw,
      cleanRuleRaw,
      pureRuleRaw,
      cleanPureRule,
      ruleTokens
    };
  });

  mappedCategoriesCache = Array.from(
    new Set(productMap.map(m => m.mappedName).filter(Boolean))
  );

  return { preparedMap: preparedMapCache, categories: mappedCategoriesCache };
}

// 지능형 최적 매칭 검색 유틸리티 (이미 정제된 mappedName 및 rawName 리스트 대상)
export function findBestIntelligentMatch(
  rawProdName: string,
  productMap: ProductMapping[]
): { bestMapping: ProductMapping | null; score: number; matchType: 'exact' | 'smart_mapped' | 'smart_raw' | 'none' } {
  if (!rawProdName || !productMap || productMap.length === 0) {
    return { bestMapping: null, score: 0, matchType: 'none' };
  }

  const cacheKey = rawProdName.trim();
  if (cachedProductMapRef === productMap && intelligentMatchCache.has(cacheKey)) {
    return intelligentMatchCache.get(cacheKey)!;
  }

  const { preparedMap, categories } = getPreparedProductMap(productMap);

  const trimmedRaw = rawProdName.trim();
  const cleanedRaw = cleanMarketingAndNoise(trimmedRaw);
  const pureRaw = trimmedRaw.replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣]/g, '');

  // Step 1: [원칙 1] 원본 상품명 완전 일치 또는 특수문자/공백 정규화 후 일치
  for (const item of preparedMap) {
    if (!item.raw) continue;
    if (item.raw === trimmedRaw || item.normRaw === normalizeTextForMapping(trimmedRaw)) {
      const res = { bestMapping: item.mapping, score: 1.0, matchType: 'exact' as const };
      if (cachedProductMapRef === productMap) intelligentMatchCache.set(cacheKey, res);
      return res;
    }
  }

  // Step 2: [원칙 2] 정제명(cleanMarketingAndNoise) 완전 일치
  if (cleanedRaw) {
    for (const item of preparedMap) {
      if (!item.raw) continue;
      if (item.cleanRuleRaw && item.cleanRuleRaw === cleanedRaw) {
        const res = { bestMapping: item.mapping, score: 0.99, matchType: 'exact' as const };
        if (cachedProductMapRef === productMap) intelligentMatchCache.set(cacheKey, res);
        return res;
      }
    }
  }

  // Step 3: 사전의 rawName 과의 키워드 포함 및 지능형 유사도 매칭
  let bestRawMapping: ProductMapping | null = null;
  let maxRawScore = 0;

  const cleanPureRaw = cleanedRaw.replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣]/g, '');

  for (const item of preparedMap) {
    if (!item.raw) continue;

    // 정제 후 공백 제외 완전 일치
    if (cleanPureRaw && item.cleanPureRule && cleanPureRaw === item.cleanPureRule) {
      const res = { bestMapping: item.mapping, score: 0.98, matchType: 'exact' as const };
      if (cachedProductMapRef === productMap) intelligentMatchCache.set(cacheKey, res);
      return res;
    }

    // 정제명이 상호 포함되는 경우
    if (item.cleanPureRule && item.cleanPureRule.length >= 3) {
      if (cleanPureRaw.includes(item.cleanPureRule) || item.cleanPureRule.includes(cleanPureRaw)) {
        const score = 0.92 + (Math.min(item.cleanPureRule.length, cleanPureRaw.length) / Math.max(item.cleanPureRule.length, cleanPureRaw.length)) * 0.05;
        if (score > maxRawScore) {
          maxRawScore = score;
          bestRawMapping = item.mapping;
        }
      }
    }

    // 원본 pureRuleRaw 가 원본 pureRaw 에 포함되는 경우
    if (item.pureRuleRaw && item.pureRuleRaw.length >= 3 && pureRaw.includes(item.pureRuleRaw)) {
      const score = 0.88 + (item.pureRuleRaw.length / Math.max(pureRaw.length, 1)) * 0.1;
      if (score > maxRawScore) {
        maxRawScore = score;
        bestRawMapping = item.mapping;
      }
    }

    // 복합 지능형 유사도
    const sim = calculateSmartSimilarity(trimmedRaw, item.raw);
    if (sim > maxRawScore) {
      maxRawScore = sim;
      bestRawMapping = item.mapping;
    }
  }

  // Step 4: mappedName(대치어 단어) 직접 매칭
  let bestMappedCat = "";
  let maxCatScore = 0;

  for (const cat of categories) {
    const catPure = cat.replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣]/g, '');
    if (!catPure) continue;

    if (pureRaw.includes(catPure) || (cleanedRaw && cleanedRaw.includes(cat))) {
      const score = 0.90 + (catPure.length / Math.max(pureRaw.length, 1)) * 0.08;
      if (score > maxCatScore) {
        maxCatScore = score;
        bestMappedCat = cat;
      }
    }
  }

  // 최종 결과 비교 및 반환 (rawName 기반 사전 매칭 우선 채택)
  if (maxRawScore >= 0.65 && bestRawMapping) {
    const res = {
      bestMapping: bestRawMapping,
      score: maxRawScore,
      matchType: 'smart_raw' as const
    };
    if (cachedProductMapRef === productMap) intelligentMatchCache.set(cacheKey, res);
    return res;
  }

  if (maxCatScore >= 0.70) {
    const matchedRule = productMap.find(m => m.mappedName === bestMappedCat) || {
      rawName: trimmedRaw,
      mappedName: bestMappedCat
    };
    const res = {
      bestMapping: { rawName: matchedRule.rawName || trimmedRaw, mappedName: bestMappedCat },
      score: maxCatScore,
      matchType: 'smart_mapped' as const
    };
    if (cachedProductMapRef === productMap) intelligentMatchCache.set(cacheKey, res);
    return res;
  }

  const res = { bestMapping: null, score: 0, matchType: 'none' as const };
  if (cachedProductMapRef === productMap) intelligentMatchCache.set(cacheKey, res);
  return res;
}

export function normalizeValueForMatching(val: any): string {
  if (val === null || val === undefined) return "";
  let s = String(val).trim();
  if (s.endsWith('.0')) {
    s = s.slice(0, -2);
  }
  return s;
}

export function cleanStr(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

export function cleanZip(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val).replace(/[^\d]/g, '').trim();
}

// 상품 정보에서 중량(Unit)과 배수(Multiplier)를 완벽히 정밀 추출하는 스마트 가공 함수
export function extractWeightAndMultiplier(
  rawProdName: string,
  originalUnitText: string,
  mappedName: string
): { unitWeight: string; multiplier: number } {
  const combinedText = `${rawProdName} ${originalUnitText}`.trim();
  
  // 1. 용량/중량(Weight) 파싱
  // 주요 타겟 용량 패턴: kg, g, ml, k, l 등
  const weightRegex = /(\d+(?:\.\d+)?)\s*(kg|g|ml|k|l)/i;
  const weightMatches = combinedText.match(weightRegex);
  
  let unitWeight = "1kg"; // 기본 디폴트
  if (weightMatches) {
    const val = weightMatches[1];
    const unit = weightMatches[2].toLowerCase();
    
    let standardUnit = unit;
    if (unit === 'k') standardUnit = 'kg';
    if (unit === 'l') standardUnit = 'L';
    
    unitWeight = `${val}${standardUnit}`;
  } else {
    // 텍스트에 명시적인 중량이 없다면 품목명(mappedName)별 기본 중량을 스마트하게 매핑해 줍니다.
    const defaultWeights: { [key: string]: string } = {
      "간장연탄": "200g",
      "고추장연탄": "200g",
      "육전": "150g",
      "진미채": "150g",
      "우엉": "200g",
      "도라지": "300g",
      "아삭이고추": "500g",
      "순태": "500g",
      "양념조개": "500g",
      "연근": "700g",
      "통마늘": "2kg",
      "반달단무지": "2.68kg",
      "실채": "150g",
      "더덕": "200g",
      "고추채": "10kg",
      "락교": "1kg",
      "알밥단무지": "1kg",
      "대두조림": "1kg",
      "서리태조림": "1kg",
      "곡물강낭콩": "1kg",
      "곡물서리태": "1kg",
      "단풍콩잎": "1kg",
      "된장고추": "1kg",
      "땅콩": "1kg",
      "땅콩진미": "1kg",
      "양념고추": "1kg",
      "양념깻잎": "1kg",
      "양념창란": "1kg",
      "양대조림": "1kg",
      "여러콩": "1kg",
      "오이피클": "1kg",
      "오징어": "10kg",
      "게장": "1kg",
      "무말랭이": "1kg"
    };
    
    if (defaultWeights[mappedName]) {
      unitWeight = defaultWeights[mappedName];
    }
  }

  // 2. 배수(Multiplier) 파싱
  // 중량 단위(예: "1kg")는 배수로 혼동되지 않도록 먼저 공백으로 소거합니다.
  let textForQty = combinedText;
  if (weightMatches) {
    textForQty = textForQty.replace(weightMatches[0], " ");
  }

  let multiplier = 1;

  // 수량 배수 정규식: "숫자 + (개|팩|봉|입|통|세트|묶음|박스|p)"
  const qtyRegex = /(\d+)\s*(개|팩|봉|입|통|세트|묶음|박스|p)/gi;
  let qtyMatch;
  const qtyMatches: number[] = [];
  
  while ((qtyMatch = qtyRegex.exec(textForQty)) !== null) {
    const num = parseInt(qtyMatch[1], 10);
    if (!isNaN(num) && num > 0) {
      qtyMatches.push(num);
    }
  }

  if (qtyMatches.length > 0) {
    multiplier = qtyMatches[0];
  } else {
    // 텍스트 매칭 보완
    if (combinedText.includes("5팩")) {
      multiplier = 5;
    } else if (combinedText.includes("10팩")) {
      multiplier = 10;
    } else if (combinedText.includes("2개")) {
      multiplier = 2;
    }
  }

  return {
    unitWeight,
    multiplier
  };
}

// 상품명에서 단위(kg, g, 개, 팩 등), 수량, 괄호 수식어를 제거하여 순수 키값으로 단순화하는 함수
export function simplifyRawProductName(rawProdName: string): string {
  if (!rawProdName) return "";
  let name = String(rawProdName).trim();
  
  // 1. 대괄호 및 소괄호 지우기
  name = name.replace(/\[.*?\]|\(.*?\)/g, ' ');
  
  // 2. 용량/수량 패턴 지우기 (예: 1kg, 500g, 2개, 3팩, 10봉, 1박스, 2세트 등)
  const optionRegex = /\d+(?:\.\d+)?\s*(?:kg|g|k|L|ml|봉|팩|입|통|세트|개|p|짜리|묶음|박스)/gi;
  name = name.replace(optionRegex, ' ');
  
  // 3. 남은 기호 및 공백 정제
  name = name.replace(/^[\s\-,_/]+|[\s\-,_/]+$/g, '').trim();
  name = name.replace(/\s+/g, ' ');
  
  return name || rawProdName.trim();
}

// 상품명에서 옵션(중량, 개수 등)을 스마트하게 발라내고 매핑 키로 간소화하는 함수
export function extractOptionAndCleanName(
  rawProdName: string,
  productMap: ProductMapping[],
  originalUnit?: string
): { cleanName: string; mappedName: string; optionText: string; matchedRawName: string; isMatched: boolean; isSmartMatched?: boolean; smartMatchScore?: number; matchLevel?: number; isWarning?: boolean } {
  if (!rawProdName) {
    return {
      cleanName: "",
      mappedName: "",
      optionText: String(originalUnit || "").trim() || "기본",
      matchedRawName: "",
      isMatched: false,
      matchLevel: 6,
      isWarning: true
    };
  }

  const cacheKey = `${rawProdName}||${originalUnit || ''}`;
  if (cachedProductMapRef === productMap && extractOptionCache.has(cacheKey)) {
    return extractOptionCache.get(cacheKey)!;
  }

  const { preparedMap } = getPreparedProductMap(productMap);

  const cleanName = rawProdName.trim();
  let optionText = String(originalUnit || "").trim();

  // 1. 옵션(수량/용량/단위) 추출
  const optionRegex = /(\d+(?:\.\d+)?\s*(?:kg|g|k|L|ml|봉|팩|입|통|세트|개|p|짜리|묶음|박스))\s*(\(.*\))?|\((?:\d+(?:\.\d+)?\s*(?:kg|g|k|L|ml|봉|팩|입|통|세트|개|p))\)|\[(?:\d+(?:\.\d+)?\s*(?:kg|g|k|L|ml|봉|팩|입|통|세트|개|p))\]/gi;
  const matches: string[] = [];
  let match;
  const regex = new RegExp(optionRegex);
  while ((match = regex.exec(cleanName)) !== null) {
    matches.push(match[0]);
  }
  if (matches.length > 0) {
    const foundOption = matches.join(" ").trim();
    if (optionText) {
      if (!optionText.includes(foundOption)) {
        optionText = `${optionText} ${foundOption}`;
      }
    } else {
      optionText = foundOption;
    }
  }

  const inputClean = cleanMarketingAndNoise(cleanName);
  const normInput = normalizeTextForMapping(cleanName);

  // --- [1단계-A] 사전 원본명(rawName) 완전 일치 (Exact Raw Match) ---
  for (const item of preparedMap) {
    if (!item.raw) continue;
    if (cleanName === item.raw || inputClean === item.cleanRuleRaw || normInput === item.normRaw) {
      const res = {
        cleanName: item.raw,
        mappedName: item.mapped || item.raw,
        optionText: optionText || "기본",
        matchedRawName: item.raw,
        isMatched: true,
        matchLevel: 1,
        isWarning: false
      };
      if (cachedProductMapRef === productMap) extractOptionCache.set(cacheKey, res);
      return res;
    }
  }

  // --- [1단계-B] 사전 원본명(rawName) 부분 포함 (Substring Raw Match) ---
  for (const item of preparedMap) {
    if (!item.raw) continue;
    if (item.raw.length >= 2 && cleanName.includes(item.raw)) {
      const res = {
        cleanName: item.raw,
        mappedName: item.mapped || item.raw,
        optionText: optionText || "기본",
        matchedRawName: item.raw,
        isMatched: true,
        matchLevel: 1,
        isWarning: false
      };
      if (cachedProductMapRef === productMap) extractOptionCache.set(cacheKey, res);
      return res;
    }
  }

  // --- [2단계] 노이즈 제거 후 원본명(rawName) 일치 및 포함 (Cleaned Raw Substring Match) ---
  for (const item of preparedMap) {
    if (!item.raw) continue;
    if (item.cleanRuleRaw.length >= 3 && (inputClean === item.cleanRuleRaw || inputClean.includes(item.cleanRuleRaw))) {
      const res = {
        cleanName: item.raw,
        mappedName: item.mapped || item.raw,
        optionText: optionText || "기본",
        matchedRawName: item.raw,
        isMatched: true,
        matchLevel: 2,
        isWarning: false
      };
      if (cachedProductMapRef === productMap) extractOptionCache.set(cacheKey, res);
      return res;
    }

    if (item.normRaw.length >= 3 && (normInput === item.normRaw || normInput.includes(item.normRaw))) {
      const res = {
        cleanName: item.raw,
        mappedName: item.mapped || item.raw,
        optionText: optionText || "기본",
        matchedRawName: item.raw,
        isMatched: true,
        matchLevel: 2,
        isWarning: false
      };
      if (cachedProductMapRef === productMap) extractOptionCache.set(cacheKey, res);
      return res;
    }
  }

  // --- [3단계] 사전 원본명(rawName)의 핵심 토큰 교차 검사 (Multi-Token Match) ---
  for (const item of preparedMap) {
    if (!item.raw || item.ruleTokens.length === 0) continue;

    let matchCount = 0;
    for (const token of item.ruleTokens) {
      if (inputClean.includes(token) || cleanName.includes(token)) {
        matchCount++;
      }
    }

    const matchRatio = matchCount / item.ruleTokens.length;
    if (matchRatio >= 0.80) {
      const res = {
        cleanName: item.raw,
        mappedName: item.mapped || item.raw,
        optionText: optionText || "기본",
        matchedRawName: item.raw,
        isMatched: true,
        isSmartMatched: true,
        smartMatchScore: Math.round(matchRatio * 100),
        matchLevel: 3,
        isWarning: true
      };
      if (cachedProductMapRef === productMap) extractOptionCache.set(cacheKey, res);
      return res;
    }
  }

  // --- [4단계] 표준 대치어(mappedName) 직접 포함 매칭 ---
  for (const item of preparedMap) {
    if (!item.mapped) continue;
    if (item.mapped.length >= 2 && (cleanName.includes(item.mapped) || inputClean.includes(item.mapped))) {
      const res = {
        cleanName: item.raw || cleanName,
        mappedName: item.mapped,
        optionText: optionText || "기본",
        matchedRawName: item.raw || cleanName,
        isMatched: true,
        isSmartMatched: true,
        smartMatchScore: 85,
        matchLevel: 4,
        isWarning: true
      };
      if (cachedProductMapRef === productMap) extractOptionCache.set(cacheKey, res);
      return res;
    }
  }

  // --- [5단계] 지능형 유사도 매칭 (Fuzzy Smart Similarity Match) ---
  const smartResult = findBestIntelligentMatch(cleanName, productMap);
  if (smartResult.bestMapping && smartResult.score >= 0.80) {
    const matched = smartResult.bestMapping;
    const res = {
      cleanName: matched.rawName || cleanName,
      mappedName: matched.mappedName,
      optionText: optionText || "기본",
      matchedRawName: matched.rawName || cleanName,
      isMatched: true,
      isSmartMatched: true,
      smartMatchScore: Math.round(smartResult.score * 100),
      matchLevel: 5,
      isWarning: true
    };
    if (cachedProductMapRef === productMap) extractOptionCache.set(cacheKey, res);
    return res;
  }

  // --- [6단계] 미매칭 (유사도 80% 미만 시 미매칭 처리) ---
  const simplifiedCleanName = simplifyRawProductName(cleanName);
  const res = {
    cleanName: simplifiedCleanName,
    mappedName: simplifiedCleanName,
    optionText: optionText || "기본",
    matchedRawName: "",
    isMatched: false,
    matchLevel: 6,
    isWarning: true
  };
  if (cachedProductMapRef === productMap) extractOptionCache.set(cacheKey, res);
  return res;
}

// 품목 정제 (사전에 정의된 대치 단어 매핑 적용)
export function cleanProductName(text: string, productMap: ProductMapping[]): string {
  const result = extractOptionAndCleanName(text, productMap);
  return result.mappedName;
}

// 가이드 행(수정가능/수정불가 설명글이 포함된 행)인지 확인하는 유틸리티
export function isGuideRow(row: any[]): boolean {
  if (!row || row.length === 0) return false;
  
  const guideKeywords = [
    "수정불가", "수정가능", "수정 불가", "수정 가능", 
    "수정금지", "수정 금지", "입력불가", "입력 불가"
  ];
  
  // 배송메시지 등 고객이 입력하는 뒷쪽 열에서 우연히 매칭되어 주문이 유실되는 것을 방지하기 위해,
  // 앞쪽 10개 열까지만 검사하여 가이드 행 여부를 판별합니다.
  const limit = Math.min(10, row.length);
  for (let c = 0; c < limit; c++) {
    const cellStr = String(row[c] || "").trim().toLowerCase().replace(/\s+/g, "");
    if (!cellStr) continue;
    
    for (const kw of guideKeywords) {
      const cleanKw = kw.toLowerCase().replace(/\s+/g, "");
      if (cellStr === cleanKw || cellStr.includes(cleanKw)) {
        return true;
      }
    }
  }
  return false;
}

// 신규 품목 추출 유틸리티 (대치 단어 사전에 없는 신규 품목 발굴)
export function extractRawUniqueNames(
  rows: any[][], 
  colMapIndex: number, 
  startRow: number
): string[] {
  const uniqueNames = new Set<string>();
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    if (isGuideRow(row)) continue; // 가이드 행 건너뛰기

    const val = row[colMapIndex];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      uniqueNames.add(String(val).trim());
    }
  }
  return Array.from(uniqueNames);
}

// 헤더 셀 명칭을 기반으로 유연하게 열 인덱스를 탐색 및 보정하는 스마트 함수
export function resolveColumnMapping(headerRow: any[], defaultColMap: ColumnMapping): ColumnMapping {
  const colMap = { ...defaultColMap };
  if (!headerRow || headerRow.length === 0) return colMap;

  const headers = headerRow.map(h => String(h || "").trim().toLowerCase().replace(/\s+/g, ""));

  const findColumnIndex = (keywords: string[]): number => {
    // 1. 정확히 완벽 일치하는 헤더 우선 매칭
    for (const kw of keywords) {
      const cleanKw = kw.toLowerCase().replace(/\s+/g, "");
      const exactIdx = headers.findIndex(h => h === cleanKw);
      if (exactIdx !== -1) return exactIdx;
    }
    // 2. 키워드를 포함하는 헤더 부분 일치 매칭
    for (const kw of keywords) {
      const cleanKw = kw.toLowerCase().replace(/\s+/g, "");
      const partialIdx = headers.findIndex(h => h.includes(cleanKw));
      if (partialIdx !== -1) return partialIdx;
    }
    return -1;
  };

  const mappings: { [key in keyof ColumnMapping]: string[] } = {
    상품명: ["노출상품명", "상품명", "상품명(노출상품명)", "등록상품명", "품목명", "주문상품명", "상품", "제품명", "상품 정보", "주문상품", "상품/옵션"],
    용량: ["등록옵션명", "옵션명", "옵션정보", "상세옵션", "옵션", "상품상세", "규격", "단위", "품목옵션", "선택옵션", "옵션내용", "상품옵션"],
    수량: ["구매수량", "구매수", "수량", "수량(고정)", "주문수량", "개수", "발주수량", "수량/수", "구매 개수"],
    수령인: ["수취인명", "수령인명", "수령인", "받는사람", "수취인", "받는분", "수령자", "성명", "주문자명", "고객명", "수령자명"],
    연락처: ["수취인이동전화번호", "수취인연락처", "연락처", "전화번호", "휴대폰번호", "수취인전화번호", "수취인 연락처1", "수령인연락처", "수령인전화번호", "휴대폰", "수신인연락처", "수령인휴대폰", "전화번호1", "연락처1"],
    우편번호: ["우편번호", "수취인우편번호", "배송지우편번호", "수령인우편번호", "우편 번호", "수령우편번호", "우편선택"],
    주소: ["수취인주소", "배송지주소", "배송지", "주소", "수취인 주소", "배송지 주소", "배송주소", "수령인지주소", "기본주소", "수령인주소", "주소1", "배송주소지"],
    배송메시지: ["배송메세지", "배송메시지", "배송요청사항", "배송메세지1", "배송 메모", "메모", "요청사항", "배송메모", "고객요청사항"]
  };

  const keys: Array<keyof ColumnMapping> = [
    "상품명",
    "용량",
    "수량",
    "수령인",
    "연락처",
    "우편번호",
    "주소",
    "배송메시지"
  ];

  keys.forEach(key => {
    const matchedIdx = findColumnIndex(mappings[key]);
    if (matchedIdx !== -1) {
      colMap[key] = matchedIdx;
    }
  });

  return colMap;
}

// 엑셀 헤더에서 운송장번호열 및 택배사열 자동 감지
export function detectSpecialColumns(headerRow: any[]): { tracking_col: number; courier_col: number } {
  if (!headerRow || headerRow.length === 0) return { tracking_col: -1, courier_col: -1 };
  const headers = headerRow.map(h => String(h || "").trim().toLowerCase().replace(/\s+/g, ""));

  const trackingKeywords = ["운송장번호", "송장번호", "운송장 번호", "송장 번호", "등기번호", "운송장", "송장"];
  const courierKeywords = ["택배사명", "택배사 명", "택배사", "배송업체", "택배사코드", "택배"];

  let tracking_col = -1;
  let courier_col = -1;

  for (const kw of trackingKeywords) {
    const cleanKw = kw.replace(/\s+/g, "");
    const idx = headers.findIndex(h => h === cleanKw || h.includes(cleanKw));
    if (idx !== -1) { tracking_col = idx; break; }
  }

  for (const kw of courierKeywords) {
    const cleanKw = kw.replace(/\s+/g, "");
    const idx = headers.findIndex(h => h === cleanKw || h.includes(cleanKw));
    if (idx !== -1) { courier_col = idx; break; }
  }

  return { tracking_col, courier_col };
}

// 엑셀 헤더에서 보조 규격/단위/옵션 열 감지 (예: 규격과 단위가 나뉘어 있는 케이스)
export function detectSecondaryOptionColumns(headerRow: any[], primaryUnitCol: number, otherColsToExclude: number[] = []): number[] {
  if (!headerRow || headerRow.length === 0) return [];
  const headers = headerRow.map(h => String(h || "").trim().toLowerCase().replace(/\s+/g, ""));
  
  // 보조 단위/규격/옵션 키워드
  const secondaryKeywords = [
    "단위", "수량단위", "규격단위", "단위수량", "포장단위", "옵션2", "상세옵션", "추가옵션", "옵션상세", "옵션내용", "단위명", "개수단위", "입수", "용량단위", "포장규격", "규격2"
  ];
  
  const excludeSet = new Set([primaryUnitCol, ...otherColsToExclude].filter(idx => idx !== undefined && idx >= 0));
  const matchedIndices: number[] = [];

  for (let i = 0; i < headers.length; i++) {
    if (excludeSet.has(i)) continue; // 메인 용량열 및 수량/상품명 등 제외
    const headerStr = headers[i];
    if (!headerStr) continue;
    
    for (const kw of secondaryKeywords) {
      const cleanKw = kw.toLowerCase().replace(/\s+/g, "");
      if (headerStr === cleanKw || (cleanKw.length >= 2 && headerStr.includes(cleanKw))) {
        matchedIndices.push(i);
        break;
      }
    }
  }
  return matchedIndices;
}

// 메인 용량/규격 값과 보조 단위/옵션 열 값들을 스마트하게 하나로 병합해주는 유틸리티
export function buildCombinedOptionText(row: any[], primaryUnitCol: number, secondaryOptionCols: number[]): string {
  let mainVal = (primaryUnitCol >= 0 && row[primaryUnitCol] !== undefined) ? String(row[primaryUnitCol] || "").trim() : "";
  if (mainVal === "nan" || mainVal === "undefined" || mainVal === "-") mainVal = "";

  if (!secondaryOptionCols || secondaryOptionCols.length === 0) return mainVal;

  const extraVals: string[] = [];
  secondaryOptionCols.forEach(colIdx => {
    if (colIdx < 0 || row[colIdx] === undefined) return;
    let val = String(row[colIdx] || "").trim();
    if (val && val !== "nan" && val !== "undefined" && val !== "-") {
      // 만약 "10" 처럼 순수 숫자로만 되어있으면 뒤에 '개'를 붙여 가공
      if (/^\d+$/.test(val)) {
        val = `${val}개`;
      }
      extraVals.push(val);
    }
  });

  if (extraVals.length === 0) return mainVal;

  let combined = mainVal;
  extraVals.forEach(extra => {
    if (!combined) {
      combined = extra;
    } else if (!combined.includes(extra)) {
      combined = `${combined} ${extra}`;
    }
  });

  return combined;
}

// 여러 시트 중 실데이터가 존재하고 주문 관련 정보가 가장 많은 최적의 시트 이름을 찾는 스마트 유틸리티
export function findBestOrderSheet(workbook: XLSX.WorkBook): string {
  if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
    return "";
  }
  if (workbook.SheetNames.length === 1) {
    return workbook.SheetNames[0];
  }

  let bestSheetName = workbook.SheetNames[0];
  let maxScore = -1;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, range: 0, defval: "" });
    let score = 0;
    
    const scanRows = Math.min(15, rows.length);
    for (let i = 0; i < scanRows; i++) {
      const rowStr = (rows[i] || []).map(v => String(v)).join(" ");
      if (rowStr.includes("주문번호")) score += 10;
      if (rowStr.includes("수취인명") || rowStr.includes("수령인") || rowStr.includes("수취인")) score += 8;
      if (rowStr.includes("상품명")) score += 5;
      if (rowStr.includes("옵션") || rowStr.includes("용량")) score += 3;
      if (rowStr.includes("묶음배송번호")) score += 10;
    }

    if (score > maxScore) {
      maxScore = score;
      bestSheetName = sheetName;
    }
  }

  return bestSheetName;
}

// 병합 셀 및 2행 조합(1행 그룹명 + 2행 서브컬럼명)을 고려한 가상 결합 헤더 셀 리스트 생성 헬퍼
export function buildMergedHeaderCellList(topRow: any[] | undefined, bottomRow: any[] | undefined): string[] {
  if (!topRow && !bottomRow) return [];
  if (!topRow) return (bottomRow || []).map(v => String(v || "").trim());
  if (!bottomRow) return topRow.map(v => String(v || "").trim());

  const maxLen = Math.max(topRow.length, bottomRow.length);
  const result: string[] = [];

  // topRow에 대해 가로 병합셀 Forward Fill (예: "받는사람 정보" 뒤에 2개 빈 셀이 있으면 그룹명 유지)
  const filledTop: string[] = [];
  let lastVal = "";
  for (let c = 0; c < maxLen; c++) {
    const v = String(topRow[c] || "").trim();
    if (v) {
      lastVal = v;
      filledTop[c] = v;
    } else if (lastVal && c > 0) {
      const normLast = lastVal.replace(/\s+/g, "");
      if (
        normLast.includes("받는") || normLast.includes("수령") || normLast.includes("수취") ||
        normLast.includes("보낸") || normLast.includes("송하") || normLast.includes("발송") ||
        normLast.includes("상품") || normLast.includes("주문") || normLast.includes("배송") ||
        normLast.includes("고객") || normLast.includes("운송장") || normLast.includes("송장")
      ) {
        filledTop[c] = lastVal;
      } else {
        filledTop[c] = "";
      }
    } else {
      filledTop[c] = "";
    }
  }

  for (let c = 0; c < maxLen; c++) {
    const topV = filledTop[c] || "";
    const botV = String(bottomRow[c] || "").trim();

    if (topV && botV) {
      const normTop = topV.replace(/\s+/g, "").toLowerCase();
      const normBot = botV.replace(/\s+/g, "").toLowerCase();
      if (normTop === normBot || normTop.includes(normBot) || normBot.includes(normTop)) {
        result[c] = botV || topV;
      } else {
        result[c] = `${topV} ${botV}`;
      }
    } else {
      result[c] = botV || topV;
    }
  }

  return result;
}

export interface HeaderRowIndexResult {
  headerRowIndex: number;
  isMultiRowHeader: boolean;
  startDataRow: number;
  headerRow: string[];
}

// 2행 병합/조합 헤더까지 정밀 감지하여 최적의 헤더 행과 데이터 시작 행을 찾아내는 스마트 함수
export function findHeaderRowIndexDetailed(rawRows: any[][], defaultStartRow: number): HeaderRowIndexResult {
  if (!rawRows || rawRows.length === 0) {
    return {
      headerRowIndex: 0,
      isMultiRowHeader: false,
      startDataRow: 1,
      headerRow: []
    };
  }

  const keywords = [
    "주문번호", "상품명", "노출상품명", "등록상품명", "옵션", "옵션정보", "상세옵션",
    "수취인명", "수령인", "수령인명", "받는사람", "수취인", "받는분", "성명",
    "연락처", "전화번호", "휴대폰번호", "우편번호", "주소", "배송지", "배송지주소",
    "구매수", "수량", "구매수량"
  ];

  const scanLimit = Math.min(15, rawRows.length);
  let bestScore = -1;
  let bestRowIdx = Math.max(0, defaultStartRow - 1);
  let isMultiRow = false;
  let bestHeaderRow: string[] = [];

  for (let r = 0; r < scanLimit; r++) {
    // 1) 단일 행 r 평가
    const rowSingle = rawRows[r] || [];
    let scoreSingle = 0;
    const cellsSingle = rowSingle.map((c: any) => String(c || "").trim());

    cellsSingle.forEach(cellStr => {
      if (!cellStr) return;
      const clean = cellStr.toLowerCase().replace(/\s+/g, "");
      for (const kw of keywords) {
        const cleanKw = kw.toLowerCase().replace(/\s+/g, "");
        if (clean === cleanKw) {
          scoreSingle += 10;
        } else if (clean.includes(cleanKw) && clean.length <= cleanKw.length + 6) {
          scoreSingle += 2;
        }
      }
    });

    if (scoreSingle > bestScore) {
      bestScore = scoreSingle;
      bestRowIdx = r;
      isMultiRow = false;
      bestHeaderRow = cellsSingle;
    }

    // 2) 2행 결합 (r, r+1) 평가
    if (r + 1 < scanLimit) {
      const rowNext = rawRows[r + 1] || [];
      const cellsCombined = buildMergedHeaderCellList(rowSingle, rowNext);
      let scoreCombined = 0;

      cellsCombined.forEach(cellStr => {
        if (!cellStr) return;
        const clean = cellStr.toLowerCase().replace(/\s+/g, "");
        for (const kw of keywords) {
          const cleanKw = kw.toLowerCase().replace(/\s+/g, "");
          if (clean === cleanKw) {
            scoreCombined += 12;
          } else if (clean.includes(cleanKw) && clean.length <= cleanKw.length + 6) {
            scoreCombined += 3;
          }
        }
      });

      if (scoreCombined > bestScore && scoreCombined >= scoreSingle + 4) {
        bestScore = scoreCombined;
        bestRowIdx = r;
        isMultiRow = true;
        bestHeaderRow = cellsCombined;
      }
    }
  }

  if (bestScore < 8) {
    const fallbackIdx = Math.max(0, defaultStartRow - 1);
    const fallbackRow = rawRows[fallbackIdx] ? rawRows[fallbackIdx].map(v => String(v || "").trim()) : [];
    return {
      headerRowIndex: fallbackIdx,
      isMultiRowHeader: false,
      startDataRow: fallbackIdx + 1,
      headerRow: fallbackRow
    };
  }

  return {
    headerRowIndex: bestRowIdx,
    isMultiRowHeader: isMultiRow,
    startDataRow: isMultiRow ? bestRowIdx + 2 : bestRowIdx + 1,
    headerRow: bestHeaderRow
  };
}

// 기존 findHeaderRowIndex 호환용 함수
export function findHeaderRowIndex(rawRows: any[][], defaultStartRow: number): number {
  return findHeaderRowIndexDetailed(rawRows, defaultStartRow).headerRowIndex;
}

// ==========================================
// 2. 엑셀 파일 파싱 및 가공 (1단계)
// ==========================================

export interface FileParseResult {
  detectedPlatform: PlatformConfig | null;
  orders: ProcessedOrder[];
  rawRows: any[][];
  headers: any[];
  newRawItems: string[]; // 새로 발견되어 매핑이 필요한 원본 상품명들
  validationIssues: ValidationIssue[]; // 필수 항목 누락/오류 검사 결과 목록
  secondaryOptionColsInfo?: { index: number; letter: string; headerName: string }[];
}

// 2-1. 복호화되거나 이미 읽어온 2차원 배열 데이터를 기반으로 플랫폼 자동 감지 및 가공 분석을 실행하는 핵심 로직
export function processRawRows(
  rawRows: any[][],
  fileName: string,
  platforms: PlatformConfig[],
  productMap: ProductMapping[],
  forcedPlatformId?: string
): FileParseResult {
  if (rawRows.length === 0) {
    throw new Error("엑셀 파일에 데이터가 없습니다.");
  }

  // 플랫폼 자동 인식 또는 강제 지정
  let detectedPlatform: PlatformConfig | null = null;

  if (forcedPlatformId) {
    detectedPlatform = platforms.find(p => p.id === forcedPlatformId) || null;
  }

  if (!detectedPlatform) {
    // 1단계: 파일 이름 기반 매칭 시도 (Mac/Windows 한글 NFD/NFC 정규화)
    const normFileName = fileName.normalize('NFC').toLowerCase();
    
    // 식봄 vs 네이버 vs G마켓(ESM) 파일명 자동 구분 규칙
    // 네이버 스마트스토어 다운로드 파일명: '전체주문발주발송관리_YYYYMMDD_HHMM.xlsx' 또는 '발주발송관리_...'
    // - 네이버: '전체주문', '발주발송', '스마트스토어' 키워드가 명시된 경우 네이버로 최우선 지정
    // - 식봄: '발송관리_' (언더바 포함) 또는 '식봄' 포함
    // - G마켓(ESM): 단순 '발송관리.xlsx' 형태
    if (normFileName.includes('전체주문') || normFileName.includes('발주발송') || (normFileName.includes('주문') && normFileName.includes('발송관리'))) {
      const naverPlat = platforms.find(p => p.id === 'naver' || p.name.includes('네이버') || p.name.includes('스마트스토어'));
      if (naverPlat) {
        detectedPlatform = naverPlat;
      }
    }

    if (!detectedPlatform && normFileName.includes('발송관리')) {
      const isNaverExplicit = normFileName.includes('전체주문') || normFileName.includes('발주발송');
      const isSikbomPattern = !isNaverExplicit && (
        normFileName.includes('발송관리_') || 
        normFileName.includes('식봄') || 
        /발송관리[_\-\s]*\d+/.test(normFileName)
      );

      if (isSikbomPattern) {
        const sikbomPlat = platforms.find(p => p.id === 'sikbom' || p.name.includes('식봄'));
        if (sikbomPlat) {
          detectedPlatform = sikbomPlat;
        }
      } else {
        const esmPlat = platforms.find(p => p.id === 'ESM' || p.name.includes('ESM') || p.name.includes('G마켓'));
        if (esmPlat) {
          detectedPlatform = esmPlat;
        }
      }
    }

    if (!detectedPlatform) {
      // 일반 플랫폼 패턴 매칭 (더 구체적이고 패턴 길어가 긴 것부터 우선 순회)
      const sortedPlatforms = [...platforms].sort((a, b) => {
        const aLen = (a.filepath_pattern || '').length;
        const bLen = (b.filepath_pattern || '').length;
        return bLen - aLen;
      });

      for (const plat of sortedPlatforms) {
        // 기본 양식이나 미등록 양식은 자동 매칭 대상에서 제외
        if (plat.id === 'default_platform' || plat.id.startsWith('unregistered') || plat.name.includes('기본 양식') || plat.name.includes('미등록')) {
          continue;
        }

        const platNameLower = plat.name.normalize('NFC').toLowerCase();
        
        const rawPatterns = plat.filepath_pattern
          ? plat.filepath_pattern.split(',').map(k => k.trim()).filter(k => k !== '')
          : [];
          
        let isMatched = false;
        
        if (rawPatterns.length > 0) {
          for (const pattern of rawPatterns) {
            // 패턴 정제: input/ 경로, 확장자, [오늘날짜] 등 제거
            const cleanedPattern = pattern
              .normalize('NFC')
              .replace(/^input\//i, '')
              .replace(/\.xlsx$/i, '')
              .replace(/\.xls$/i, '')
              .replace(/\[.*?\]/g, '')
              .replace(/\(.*?\)/g, '')
              .toLowerCase();

            if (!cleanedPattern) continue;

            // 단일 통째로 포함 검사 (예: "주문배송관리")
            const pureString = cleanedPattern.replace(/[*_\-\s]+/g, '');
            const pureFileName = normFileName.replace(/[*_\-\s]+/g, '');
            if (pureString.length >= 2 && pureFileName.includes(pureString)) {
              isMatched = true;
              break;
            }

            // 와일드카드(*) 또는 구분자(-, _)로 나눈 핵심 토큰들 추출
            const tokens = cleanedPattern
              .split(/[*_\-\s]+/)
              .map(t => t.trim())
              .filter(t => t.length >= 2);

            if (tokens.length > 0) {
              const allTokensPresent = tokens.every(token => normFileName.includes(token));
              if (allTokensPresent) {
                isMatched = true;
                break;
              }
            }
          }
        }
        
        if (!isMatched) {
          // 쇼핑몰 이름 명시 키워드 일치 시에만 엄격 매칭
          if (
            (platNameLower && platNameLower.length >= 2 && normFileName.includes(platNameLower)) ||
            (platNameLower.includes("네이버") && (normFileName.includes("naver") || normFileName.includes("스마트스토어") || normFileName.includes("smartstore"))) ||
            (platNameLower.includes("쿠팡") && (normFileName.includes("coupang") || normFileName.includes("deliverylist") || normFileName.includes("wing"))) ||
            (platNameLower.includes("토스") && (normFileName.includes("toss") || normFileName.includes("주문배송관리"))) ||
            (platNameLower.includes("식봄") && (normFileName.includes("식봄") || normFileName.includes("발송관리_"))) ||
            (platNameLower.includes("g마켓") && (normFileName.includes("gmarket") || normFileName.includes("esm"))) ||
            (platNameLower.includes("옥션") && (normFileName.includes("auction") || normFileName.includes("esm"))) ||
            (platNameLower.includes("11번가") && (normFileName.includes("11st") || normFileName.includes("11번가")))
          ) {
            isMatched = true;
          }
        }
        
        if (isMatched) {
          detectedPlatform = plat;
          break;
        }
      }
    }
  }

  // 매칭된 쇼핑몰 양식이 없으면 모호하게 다른 쇼핑몰로 억지 할당하지 않고,
  // 자동으로 엑셀 헤더를 감지하여 스마트 컬럼 맵을 가진 '미등록 양식' 객체를 생성합니다.
  let platform: PlatformConfig;
  const isRegisteredPlatform = !!detectedPlatform && detectedPlatform.id !== 'default_platform' && !detectedPlatform.id.startsWith('unregistered');

  if (isRegisteredPlatform) {
    platform = { ...detectedPlatform };
  } else {
    const hIdx = findHeaderRowIndex(rawRows, 1);
    const hRow = rawRows[hIdx] || [];
    const autoColMap = resolveColumnMapping(hRow, {
      용량: 0, 상품명: 1, 수량: 2, 수령인: 3, 연락처: 4, 우편번호: 5, 주소: 6, 배송메시지: 7
    });
    const specialCols = detectSpecialColumns(hRow);

    platform = {
      id: 'unregistered_auto',
      name: '미등록 양식 (스마트 헤더 감지)',
      identifier: '',
      start_row: hIdx + 1,
      col_map: autoColMap,
      tracking_col: specialCols.tracking_col !== -1 ? specialCols.tracking_col : 8,
      courier_col: specialCols.courier_col !== -1 ? specialCols.courier_col : 9,
      filepath_pattern: ''
    };
  }
  
  // 헤더 행의 인덱스 및 2행 병합 여부를 본문 검색을 통해 동적으로 완벽 보정
  const headerInfo = findHeaderRowIndexDetailed(rawRows, platform.start_row);
  const headerRowIndex = headerInfo.headerRowIndex;
  const startRow = headerInfo.startDataRow;
  const headerRow = headerInfo.headerRow;

  let colMap: ColumnMapping;
  if (isRegisteredPlatform) {
    // 등록된 양식인 경우 사용자가 지정한 col_map을 바탕으로 맵 생성
    colMap = resolveColumnMapping(headerRow, platform.col_map);
  } else {
    // 등록되지 않은 양식/기본 양식인 경우 헤더 키워드를 실시간 스캔하여 자동 매칭
    colMap = resolveColumnMapping(headerRow, platform.col_map);
    const specialCols = detectSpecialColumns(headerRow);
    if (specialCols.tracking_col !== -1) {
      platform.tracking_col = specialCols.tracking_col;
    }
    if (specialCols.courier_col !== -1) {
      platform.courier_col = specialCols.courier_col;
    }
    platform.col_map = colMap;
  }

  // 날짜 컬럼 자동 찾기
  const dateColIdx = headerRow.findIndex((h: any) => {
    const s = String(h || '').replace(/\s+/g, '');
    return s.includes('주문일') || s.includes('결제일') || s.includes('발주일') || s.includes('배송일') || s.includes('날짜') || s.includes('주문시간');
  });

  // 보조 단위/규격/옵션 열 자동 감지 (규격, 단위 열이 분리되어 들어오는 케이스 대비)
  const secondaryOptionCols = detectSecondaryOptionColumns(headerRow, colMap.용량, [
    colMap.상품명, colMap.수량, colMap.수령인, colMap.연락처, colMap.주소, colMap.우편번호, colMap.배송메시지
  ]);

  const secondaryOptionColsInfo = secondaryOptionCols.map(colIdx => ({
    index: colIdx,
    letter: colNumToLetter(colIdx + 1),
    headerName: String(headerRow[colIdx] || '').trim() || `${colNumToLetter(colIdx + 1)}열`
  }));

  // 원본 상품명 추출 및 미매칭 품목 정제 목록 구축
  const rawNames = extractRawUniqueNames(rawRows, colMap.상품명, startRow);
  const newRawItemsSet = new Set<string>();

  rawNames.forEach(rawName => {
    if (!rawName || !rawName.trim()) return;
    const cleanResult = extractOptionAndCleanName(rawName, productMap);
    // 사전에 매칭되지 않은 품목(isMatched === false)만 '새로 발견된 미지정 품목'에 원본명 그대로 추가
    if (!cleanResult.isMatched) {
      newRawItemsSet.add(rawName.trim());
    }
  });
  const newRawItems = Array.from(newRawItemsSet);

  // 주문 데이터 추출 및 필수 유효성 검사
  const orders: ProcessedOrder[] = [];
  const validationIssues: ValidationIssue[] = [];

  for (let i = startRow; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row) continue;
    if (isGuideRow(row)) continue; // 가이드 행 건너뛰기

    const rawRecipient = String(row[colMap.수령인] || "").trim();
    const rawProdName = String(row[colMap.상품명] || "").trim();
    const rawAddr = String(row[colMap.주소] || "").trim();
    const rawPhone = String(row[colMap.연락처] || "").trim();
    const rawZip = normalizeValueForMatching(row[colMap.우편번호]);
    const rawQtyVal = row[colMap.수량];
    const qtyNum = Number(rawQtyVal) || 0;

    // 완전히 빈 행(모든 주요 데이터가 비어있는 경우) 건너뛰기
    const isCompletelyEmpty = (!rawRecipient || rawRecipient === "nan" || rawRecipient === "undefined") &&
                              !rawProdName && !rawAddr && !rawPhone;
    if (isCompletelyEmpty) continue;

    // 필수 항목 검사
    const missingFields: string[] = [];

    if (!rawRecipient || rawRecipient === "nan" || rawRecipient === "undefined" || rawRecipient === "-") {
      missingFields.push("수령인");
    }

    if (!rawAddr || rawAddr === "nan" || rawAddr === "undefined" || rawAddr === "-") {
      missingFields.push("주소");
    }

    if (!rawPhone || rawPhone === "nan" || rawPhone === "undefined" || rawPhone === "-") {
      missingFields.push("연락처");
    }

    if (!rawProdName || rawProdName === "nan" || rawProdName === "undefined") {
      missingFields.push("상품명");
    }

    if (qtyNum <= 0) {
      missingFields.push("수량");
    }

    if (!rawZip || rawZip === "nan" || rawZip === "undefined" || rawZip === "-") {
      missingFields.push("우편번호");
    }

    const recipientName = rawRecipient && rawRecipient !== "nan" && rawRecipient !== "undefined" ? rawRecipient : "(수령인 미입력)";
    const originalUnit = buildCombinedOptionText(row, colMap.용량, secondaryOptionCols);
    
    const cleanResult = extractOptionAndCleanName(rawProdName, productMap, originalUnit);
    const mappedName = cleanResult.mappedName;
    const { unitWeight, multiplier } = extractWeightAndMultiplier(rawProdName, originalUnit, mappedName);
    
    const zipCode = rawZip;
    const addr = rawAddr;
    const ordererName = recipientName;

    const uniqueIdName = recipientName;
    const combinedId = `${uniqueIdName}_${zipCode}_${addr}`;

    const excelRowIndex = i + 1; // 엑셀 실제 1-based 행 번호

    if (missingFields.length > 0) {
      validationIssues.push({
        id: `val_${i}_${Date.now()}`,
        rowIndex: excelRowIndex,
        fileName: fileName,
        recipient: recipientName,
        productName: rawProdName || mappedName || "(상품명 미입력)",
        address: addr || "(주소 미입력)",
        phone: rawPhone || "(연락처 미입력)",
        zipCode: zipCode || "(우편번호 미입력)",
        missingFields: missingFields
      });
    }

    let extractedDateStr = '';
    if (dateColIdx !== -1 && row[dateColIdx] !== undefined && row[dateColIdx] !== null) {
      const rawVal = row[dateColIdx];
      const valStr = String(rawVal).trim();
      
      // A. 엑셀 시리얼 날짜 숫자 체크 (예: 45000 ~ 60000)
      if (!isNaN(Number(rawVal)) && Number(rawVal) > 30000 && Number(rawVal) < 60000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const days = Math.floor(Number(rawVal));
        const dateObj = new Date(excelEpoch.getTime() + days * 86400000);
        const yyyy = dateObj.getUTCFullYear();
        const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getUTCDate()).padStart(2, '0');
        extractedDateStr = `${yyyy}-${mm}-${dd}`;
      } else {
        // B. 20XX년 4자리 연도 매칭
        const dateMatch = valStr.match(/(20\d{2})[-./년]?\s*([01]?\d)[-./월]?\s*([0-3]?\d)/);
        if (dateMatch) {
          const yyyy = dateMatch[1];
          const mm = dateMatch[2].padStart(2, '0');
          const dd = dateMatch[3].padStart(2, '0');
          extractedDateStr = `${yyyy}-${mm}-${dd}`;
        } else {
          // C. 2XX-XX-XX 등 8자리 연속 숫자 (예: 20260727)
          const compactMatch = valStr.match(/(20\d{2})([01]\d)([0-3]\d)/);
          if (compactMatch) {
            extractedDateStr = `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
          }
        }
      }
    }

    // 엑셀 셀에서 날짜를 파싱하지 못한 경우 파일명에서 파싱 시도
    if (!extractedDateStr) {
      const fnMatch = fileName.match(/(20\d{2})[-._]?([01]\d)[-._]?([0-3]\d)/);
      if (fnMatch) {
        extractedDateStr = `${fnMatch[1]}-${fnMatch[2]}-${fnMatch[3]}`;
      }
    }

    // 둘 다 없거나 실패한 경우, 오늘 업로드한 데이터이므로 업로드 당일 날짜(YYYY-MM-DD)로 기본 설정
    if (!extractedDateStr) {
      extractedDateStr = new Date().toISOString().slice(0, 10);
    }

    orders.push({
      id: String(i),
      용량: unitWeight,
      상품명: mappedName,
      수량: qtyNum,
      주문자: ordererName,
      수령인: recipientName,
      연락처: rawPhone,
      우편번호: zipCode,
      주소: addr,
      배송메시지: String(row[colMap.배송메시지] || ""),
      sortKey: mappedName,
      combinedId: combinedId,
      isMulti: false,
      multiplier: multiplier,
      originalOptionName: originalUnit,
      originalProductName: rawProdName,
      orderDate: extractedDateStr || undefined,
      validationIssues: missingFields.length > 0 ? missingFields : undefined,
      isSmartMatched: cleanResult.isSmartMatched,
      smartMatchScore: cleanResult.smartMatchScore,
      smartMatchDetail: cleanResult.isSmartMatched ? `[지능형 매칭] 원본 상품명: '${rawProdName}' ➔ 매칭 정제명: '${mappedName}' (유사도 ${cleanResult.smartMatchScore}%)` : undefined
    });
  }

  const idCounts: { [key: string]: number } = {};
  orders.forEach(o => {
    idCounts[o.combinedId] = (idCounts[o.combinedId] || 0) + 1;
  });

  orders.forEach(o => {
    o.isMulti = idCounts[o.combinedId] > 1;
  });

  const multiOrders = orders.filter(o => o.isMulti).sort(compareOrdersByCleanName);
  const singleOrders = orders.filter(o => !o.isMulti).sort(compareOrdersByCleanName);

  const sortedOrders = [...multiOrders, ...singleOrders];

  return {
    detectedPlatform: detectedPlatform,
    orders: sortedOrders,
    rawRows,
    headers: headerRow,
    newRawItems,
    validationIssues,
    secondaryOptionColsInfo
  };
}

export async function parseAndProcessOrderExcel(
  file: File,
  platforms: PlatformConfig[],
  productMap: ProductMapping[],
  forcedPlatformId?: string
): Promise<FileParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const bestSheetName = findBestOrderSheet(workbook);
        const worksheet = workbook.Sheets[bestSheetName];
        
        const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });
        const result = processRawRows(rawRows, file.name, platforms, productMap, forcedPlatformId);
        resolve(result);
      } catch (err: any) {
        const errMsg = err?.message || "";
        const lowerMsg = errMsg.toLowerCase();
        if (
          lowerMsg.includes("password") ||
          lowerMsg.includes("protected") ||
          lowerMsg.includes("decrypt") ||
          lowerMsg.includes("encrypted")
        ) {
          reject(new Error("PASSWORD_PROTECTED"));
        } else {
          reject(err);
        }
      }
    };
    reader.onerror = () => reject(new Error("파일을 읽는 도중 오류가 발생했습니다."));
    reader.readAsArrayBuffer(file);
  });
}

// ==========================================
// 3. 정렬 파일 및 요약 보고서 저장 (ExcelJS 활용)
// ==========================================

export function sortUnitsSmart(units: string[]): string[] {
  const getGroupAndValue = (unitStr: string) => {
    const s = unitStr.trim().toLowerCase();
    
    // 1. kg 단위 체크 (숫자 + kg)
    const kgMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:kg|k)$/i);
    if (kgMatch) {
      return { group: 0, val: parseFloat(kgMatch[1]), raw: unitStr };
    }
    
    // 2. g/ml 단위 체크 (숫자 + g 또는 ml)
    const gMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:g|ml)$/i);
    if (gMatch) {
      return { group: 1, val: parseFloat(gMatch[1]), raw: unitStr };
    }
    
    // 3. 기타 수량 단위 체크 (숫자 + 개/팩/세트 등)
    const numMatch = s.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (numMatch) {
      return { group: 2, val: parseFloat(numMatch[1]), suffix: numMatch[2], raw: unitStr };
    }
    
    // 4. 비수량 텍스트 (기본 등)
    return { group: 3, val: 0, suffix: s, raw: unitStr };
  };

  const parsed = units.map(getGroupAndValue);

  parsed.sort((a, b) => {
    if (a.group !== b.group) {
      return a.group - b.group;
    }
    if (a.group === 0 || a.group === 1) {
      return a.val - b.val;
    }
    if (a.group === 2) {
      if (a.val !== b.val) {
        return a.val - b.val;
      }
      return (a.suffix || '').localeCompare(b.suffix || '');
    }
    return (a.suffix || '').localeCompare(b.suffix || '');
  });

  return parsed.map(item => item.raw);
}

export async function exportSummaryReportExcel(orders: ProcessedOrder[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  
  // ----------------------------------------------------
  // 시트 1. 상세내역 (용량, 상품명, 수량, 주문자, 쇼핑몰/플랫폼)
  // ----------------------------------------------------
  const wsDetail = wb.addWorksheet('상세내역');
  wsDetail.addRow(["용량", "상품명", "수량", "주문자", "쇼핑몰/플랫폼"]);

  const sortedOrdersForDetail = [...orders].sort(compareOrdersByCleanName);

  sortedOrdersForDetail.forEach(o => {
    wsDetail.addRow([
      o.originalOptionName || "",
      o.originalProductName || "",
      o.수량,
      o.주문자 || "",
      o.platformName || "쇼핑몰/플랫폼"
    ]);
  });

  styleSheetCommon(wsDetail, 5, true);

  // ----------------------------------------------------
  // 시트 2. 상품준비요약 (기존 피벗 구조 및 종횡 총합계 포함)
  // ----------------------------------------------------
  const wsSummary = wb.addWorksheet('상품준비요약');

  const unitSet = new Set<string>();
  const pivotMap: { [baseName: string]: { [unit: string]: number } } = {};

  orders.forEach(o => {
    const unit = o.용량 || "기본";
    const baseName = o.상품명 || "미분류";
    unitSet.add(unit);

    if (!pivotMap[baseName]) {
      pivotMap[baseName] = {};
    }
    pivotMap[baseName][unit] = (pivotMap[baseName][unit] || 0) + (o.수량 * (o.multiplier || 1));
  });

  const sortedUnits = sortUnitsSmart(Array.from(unitSet));
  const sortedBaseNames = Object.keys(pivotMap).sort();

  // 요약 헤더 작성: [상품 분류 (행 레이블), 옵션1, 옵션2, ..., 총합계]
  const summaryHeader = ["상품 분류 (행 레이블)", ...sortedUnits, "총합계"];
  wsSummary.addRow(summaryHeader);

  // 데이터 행 작성
  sortedBaseNames.forEach(baseName => {
    const rowData: any[] = [baseName];
    let totalRowQty = 0;
    sortedUnits.forEach(unit => {
      const qty = pivotMap[baseName][unit] || 0;
      rowData.push(qty > 0 ? qty : "");
      totalRowQty += qty;
    });
    rowData.push(totalRowQty);
    wsSummary.addRow(rowData);
  });

  // 하단 총합계 행 작성
  const totalRow: any[] = ["총합계"];
  let grandTotal = 0;
  sortedUnits.forEach(unit => {
    let colTotal = 0;
    sortedBaseNames.forEach(baseName => {
      colTotal += pivotMap[baseName][unit] || 0;
    });
    totalRow.push(colTotal > 0 ? colTotal : "");
    grandTotal += colTotal;
  });
  totalRow.push(grandTotal);
  wsSummary.addRow(totalRow);

  styleSheetCommon(wsSummary, sortedUnits.length + 2, false);

  // 다운로드 처리
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const today = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `요약보고서_${today}.xlsx`);
}

export async function exportProductSortedExcel(orders: ProcessedOrder[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('가공데이터');

  // 노출상품명과 구매수 사이에 수량(고정)이 들어간 총 9개 컬럼 구성
  const headerRow = [
    "용량",
    "상품명",
    "수량(고정)",
    "수량",
    "수령인",
    "연락처",
    "우편번호",
    "주소",
    "배송메시지"
  ];
  ws.addRow(headerRow);

  const sortedOrdersForExport = [...orders].sort(compareOrdersByCleanName);

  sortedOrdersForExport.forEach(o => {
    ws.addRow([
      o.originalOptionName || "",
      o.originalProductName || "",
      1, // 수량(고정) 고정값 1
      o.수량,
      o.수령인 || "",
      o.연락처 || "",
      o.우편번호 || "",
      o.주소 || "",
      o.배송메시지 || ""
    ]);
  });

  styleSheetCommon(ws, 9, true);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  // 날짜 형식: YYYY_MM_DD
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}_${month}_${day}`;

  triggerDownload(blob, `품목별정렬_${todayStr}.xlsx`);
}

// 엑셀 서식 공통 적용 헬퍼 (파이썬 openpyxl 스타일 완벽 반영)
function styleSheetCommon(ws: ExcelJS.Worksheet, maxCol: number, isDetail: boolean = false) {
  // 폰트 및 스타일 상수 정의
  const font9 = { name: 'Inter', size: 9 };
  const font9Bold = { name: 'Inter', size: 9, bold: true };
  const headerFont = { name: 'Inter', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
  
  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2F5597' }
  };
  
  const stripeFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8F9FA' }
  };

  const thinBorder: any = {
    left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } }
  };

  const alignCenter: any = { horizontal: 'center', vertical: 'middle' };
  const alignLeft: any = { horizontal: 'left', vertical: 'middle', indent: 1 };

  // 1. 헤더 행(1번 행) 스타일
  const headerRow = ws.getRow(1);
  headerRow.height = 24;
  for (let c = 1; c <= maxCol; c++) {
    const cell = headerRow.getCell(c);
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.alignment = alignCenter;
    cell.border = thinBorder;
  }

  // 2. 데이터 행 스타일
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // 헤더 제외
    
    row.height = 20;
    const isEven = rowNumber % 2 === 0;

    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      if (isEven) {
        cell.fill = stripeFill;
      }

      // 기본 폰트
      cell.font = font9;

      // 정렬 설정
      if (isDetail) {
        // 상세내역 시트: 상품명(2번 열), 주문자(4번 열), 쇼핑몰/플랫폼(5번 열)은 왼쪽 정렬, 나머지는 가운데
        if (c === 2 || c === 4 || c === 5) {
          cell.alignment = alignLeft;
        } else {
          cell.alignment = alignCenter;
        }
      } else {
        // 일반 정렬 (텍스트는 왼쪽, 우편번호나 수량 등은 가운데)
        if (c === 1) {
          cell.alignment = alignLeft;
        } else {
          cell.alignment = alignCenter;
          // 요약 시트에서 수량이 0보다 큰 경우 볼드 처리
          if (cell.value && typeof cell.value === 'number') {
            cell.font = font9Bold;
          }
        }
      }
    }
  });

  // 3. 틀 고정 및 오토 필터
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0, activeCell: 'A2' }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: ws.actualRowCount, column: maxCol }
  };

  // 4. 셀 크기 자동 조정 (초밀착 정밀 너비 계산)
  ws.columns.forEach(col => {
    let maxLen = 0;
    col.eachCell!({ includeEmpty: false }, (cell) => {
      if (cell.value !== undefined && cell.value !== null) {
        const strVal = String(cell.value);
        // 한글은 대략 1.7배, 영숫자는 0.85배로 길이 산정
        let length = 0;
        for (let i = 0; i < strVal.length; i++) {
          length += strVal.charCodeAt(i) > 128 ? 1.7 : 0.85;
        }
        if (length > maxLen) maxLen = length;
      }
    });

    const padding = isDetail ? 2.5 : 1.8;
    col.width = Math.max(8, maxLen + padding);
  });
}

// ==========================================
// 4. 운송장 매칭 및 기입 프로세스 (2단계)
// ==========================================

export interface TrackingUpdateResult {
  matchCount: number;
  softMatchCount: number;
  bundledCount: number;      // 합포장 품목 건수
  bundledGroupCount: number; // 합포장 묶음(고객/송장) 그룹 수
  bundleMismatchCount?: number; // C열 합포장 수량 불일치 건수
  bundleMismatchDetails?: string[]; // C열 합포장 수량 불일치 내역
  unfilledErrors: MatchingError[];
  unusedErrors: MatchingError[];
  outputOrders: ProcessedOrder[];
}

// 헬퍼: 해당 주문/플랫폼이 쿠팡(DeliveryList)인지 판별하는 함수 (쿠팡만 합포장 연동 허용)
function isCoupangOrder(o: { platformName?: string; platformId?: string; sourceFileName?: string }): boolean {
  const plat = (o.platformName || o.platformId || "").toLowerCase();
  const file = (o.sourceFileName || "").toLowerCase();
  return (
    plat.includes("쿠팡") ||
    plat.includes("coupang") ||
    plat.includes("deliverylist") ||
    plat.includes("wing") ||
    file.includes("쿠팡") ||
    file.includes("coupang") ||
    file.includes("deliverylist")
  );
}

export function isSoftMatch(inKey: string[], srcKey: string[]): boolean {
  const [inN, inU, inP, inQ, inZ] = inKey;
  const [srcN, srcU, srcP, srcQ, srcZ] = srcKey;

  // 우편번호와 수량은 무조건 같아야 함
  if (inZ !== srcZ || inQ !== srcQ) return false;

  // 이름(2글자 이상) 및 품목명(3글자 이상) 포함 관계 확인
  const nameMatch = (inN.includes(srcN) || srcN.includes(inN)) && Math.min(inN.length, srcN.length) >= 2;
  const prodMatch = (inP.includes(srcP) || srcP.includes(inP)) && Math.min(inP.length, srcP.length) >= 3;

  return nameMatch && prodMatch;
}

// 헬퍼: 공통 최장 부분자열(LCS) 길이 계산 (수령인 이름 유사도 계산용)
function getLCSLength(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  if (m === 0 || n === 0) return 0;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[m][n];
}

// 헬퍼: 수령인(성명) 교차 일치 검사 (공백 제거 완전일치, 부분 포함, 긴 성명 80% 이상 유사 매칭)
function checkRecipientNameMatch(name1: string, name2: string): { isMatch: boolean; isExact: boolean; reason?: string } {
  const c1 = cleanStr(name1);
  const c2 = cleanStr(name2);
  if (!c1 || !c2) return { isMatch: false, isExact: false };

  // 1) 공백 및 특수문자 제거 후 100% 동일
  if (c1 === c2) {
    return { isMatch: true, isExact: true };
  }

  // 2) 한쪽이 다른 쪽에 완벽히 포함되는 경우 (예: "홍길동(네이버)" vs "홍길동", 10~14자 길어서 잘린 수령인명)
  if (c1.includes(c2) || c2.includes(c1)) {
    const minLen = Math.min(c1.length, c2.length);
    if (minLen >= 2) {
      return { isMatch: true, isExact: false, reason: `수령인 부분 포함 일치 ('${c1}' '${c2}')` };
    }
  }

  // 3) 긴 성명(8글자 이상) 또는 80% 이상 유사도 측정 (글자 일부 잘림/오탈자 대응)
  const lcsLen = getLCSLength(c1, c2);
  const maxLen = Math.max(c1.length, c2.length);
  const similarity = lcsLen / maxLen;

  if (similarity >= 0.78 || (lcsLen >= 8 && maxLen >= 10)) {
    return { isMatch: true, isExact: false, reason: `수령인명 지능형 유사 일치 (유사도 ${Math.round(similarity * 100)}%)` };
  }

  return { isMatch: false, isExact: false };
}

// 헬퍼: 정규화 텍스트 (특수문자 및 공백 완전 제거)
function normalizeText(val: any): string {
  if (!val) return "";
  return String(val)
    .replace(/[^\w\d가-힣]/g, "")
    .toLowerCase()
    .trim();
}

// 헬퍼: 텍스트에 대해 사전 등록된 대치 규칙(ProductMapping)을 양방향으로 적용하여 가능한 모든 대치 명칭 리스트 반환
function getPossibleMappedNames(text: string, mappings?: ProductMapping[]): string[] {
  if (!text) return [];
  const cleanText = String(text).replace(/\s+/g, "").toLowerCase();
  const results = new Set<string>();
  if (cleanText) results.add(cleanText);

  if (mappings && mappings.length > 0) {
    for (const m of mappings) {
      const raw = String(m.rawName || "").replace(/\s+/g, "").toLowerCase();
      const mapped = String(m.mappedName || "").replace(/\s+/g, "").toLowerCase();

      if (raw && cleanText.includes(raw)) {
        if (mapped) {
          results.add(cleanText.replace(raw, mapped));
          results.add(mapped);
        }
      }
      if (mapped && cleanText.includes(mapped)) {
        if (raw) {
          results.add(cleanText.replace(mapped, raw));
          results.add(raw);
        }
      }
    }
  }
  return Array.from(results);
}

// 헬퍼: 상품명/옵션명 및 품목 대치(ProductMapping) 양쪽 교차 일치 검사
function checkProductMatch(
  sourceProd: string,     // 2단계 송장파일의 상품명
  sourceUnit: string,     // 2단계 송장파일의 옵션/용량
  oOriginalProd: string,  // 1단계 원본 상품명
  oMappedProd: string,    // 1단계 매핑/표준 상품명
  oOriginalOpt: string,   // 1단계 원본 옵션명
  oMappedOpt: string,     // 1단계 매핑/표준 옵션명
  mappings?: ProductMapping[]
): { isMatch: boolean; reason: string } {
  // 송장 측 대치어 후보군 생성 (송장 상품명/옵션명도 대치 규칙 적용)
  const srcProdCandidates = getPossibleMappedNames(sourceProd, mappings);
  const srcUnitCandidates = getPossibleMappedNames(sourceUnit, mappings);

  // 주문서 측 대치어 후보군 생성 (원본/대치 상품명 및 옵션명 모두 대치 규칙 적용)
  const orderProdCandidates = new Set<string>([
    ...getPossibleMappedNames(oOriginalProd, mappings),
    ...getPossibleMappedNames(oMappedProd, mappings)
  ]);
  const orderUnitCandidates = new Set<string>([
    ...getPossibleMappedNames(oOriginalOpt, mappings),
    ...getPossibleMappedNames(oMappedOpt, mappings)
  ]);

  // 1) 상품명 후보군 간 양쪽 대치 교차 일치 검사
  for (const sP of srcProdCandidates) {
    if (!sP) continue;
    for (const oP of orderProdCandidates) {
      if (!oP) continue;
      if (sP === oP) {
        return { isMatch: true, reason: `상품명 양쪽 대치 교차 완전 일치 ('${sP}')` };
      }
      if (sP.length >= 2 && oP.length >= 2 && (sP.includes(oP) || oP.includes(sP))) {
        return { isMatch: true, reason: `상품명 양쪽 대치 교차 포함 일치 ('${sP}' '${oP}')` };
      }
    }
  }

  // 2) 옵션/용량 후보군 간 양쪽 대치 교차 일치 검사
  for (const sU of srcUnitCandidates) {
    if (!sU) continue;
    for (const oU of orderUnitCandidates) {
      if (!oU) continue;
      if (sU === oU) {
        return { isMatch: true, reason: `옵션/용량 양쪽 대치 교차 완전 일치 ('${sU}')` };
      }
      if (sU.length >= 2 && oU.length >= 2 && (sU.includes(oU) || oU.includes(sU))) {
        return { isMatch: true, reason: `옵션/용량 양쪽 대치 교차 포함 일치 ('${sU}' '${oU}')` };
      }
    }
  }

  return { isMatch: false, reason: "상품명/옵션명 미일치" };
}

// 헬퍼: 2단계 운송장 엑셀 파일의 헤더 및 택배사 양식 지능형 자동 감지 (1단계 플랫폼 헤더 감지 방식과 동일)
export interface TrackingHeaderDetectionResult {
  headerRowIndex: number;
  startDataRow: number;
  courierName: string;
  colMap: {
    track: number;
    name: number;
    zip: number;
    phone: number;
    prod: number;
    qty: number;
    unit: number;
    courier: number;
    addr: number;
  };
  headers: string[];
}

export function detectTrackingHeaderAndCourier(
  srcRows: any[][],
  fileName?: string,
  couriers?: CourierConfig[],
  selectedCourierName?: string
): TrackingHeaderDetectionResult {
  if (!srcRows || srcRows.length === 0) {
    return {
      headerRowIndex: 0,
      startDataRow: 1,
      courierName: selectedCourierName || "한진택배",
      colMap: { track: -1, name: -1, zip: -1, phone: -1, prod: -1, qty: -1, unit: -1, courier: -1, addr: -1 },
      headers: []
    };
  }

  // 1) 엑셀 상단 20개 행에서 키워드 기반 헤더 행 및 열 위치 다이나믹 스캔 (단일 행 및 2행 병합/조합 헤더 지원)
  const scanLimit = Math.min(20, srcRows.length);
  let bestScore = -1;
  let bestRowIdx = 0;
  let bestStartDataRow = 1;
  let bestHeaderCells: string[] = [];

  let bestTrack = -1, bestName = -1, bestZip = -1, bestPhone = -1;
  let bestProd = -1, bestQty = -1, bestUnit = -1, bestCourier = -1, bestAddr = -1;

  for (let r = 0; r < scanLimit; r++) {
    const rowSingle = srcRows[r] || [];
    const candidates: { rowCells: string[]; isMulti: boolean }[] = [
      { rowCells: rowSingle.map((v: any) => String(v || "").trim()), isMulti: false }
    ];

    if (r + 1 < scanLimit) {
      const rowNext = srcRows[r + 1] || [];
      candidates.push({
        rowCells: buildMergedHeaderCellList(rowSingle, rowNext),
        isMulti: true
      });
    }

    for (const cand of candidates) {
      if (cand.rowCells.length === 0) continue;

      let localTrack = -1, localName = -1, localZip = -1, localPhone = -1;
      let localProd = -1, localQty = -1, localUnit = -1, localCourier = -1, localAddr = -1;

      let localTrackScore = 0, localNameScore = 0, localZipScore = 0, localPhoneScore = 0;
      let localProdScore = 0, localQtyScore = 0, localUnitScore = 0, localCourierScore = 0, localAddrScore = 0;

      cand.rowCells.forEach((cellStr: string, colIdx: number) => {
        const s = String(cellStr || "").trim().toLowerCase().replace(/\s+/g, "");
        if (!s) return;

        // 보낸분 / 송하인 / 발송인 / 위탁자 / 등록자 / 화주 / 발송자 / 의뢰인 / 출고자 헤더는 수취인 정보 식별에서 제외
        const isSender = s.includes("보낸분") || s.includes("송하인") || s.includes("발송인") ||
                         s.includes("보내는분") || s.includes("위탁자") || s.includes("화주") ||
                         s.includes("등록자") || s.includes("의뢰자") || s.includes("발송자") ||
                         s.includes("보낸사람") || s.includes("보내는") || s.includes("송하") ||
                         s.includes("의뢰인") || s.includes("출고자") || s.includes("발송인주소") ||
                         s.includes("송하인주소") || s.includes("보낸분주소");

        if (isSender) return;

        // 1) 송장번호
        const isNotTrackNumber = s.includes("출력") || s.includes("구분") || s.includes("종류") || s.includes("건수") || s.includes("원송장") || s.includes("반품송장") || s.includes("서식") || s.includes("유형") || s.includes("상태") || s.includes("일자");
        const isTrackHeader = (s.includes("송장") || s.includes("운송장") || s.includes("등기") || s.includes("waybill") || s.includes("tracking")) && !isNotTrackNumber;
        
        // 2) 전화번호
        const isPhoneHeader = s.includes("전화") || s.includes("연락처") || s.includes("휴대폰") || s.includes("핸드폰") || s.includes("tel") || s.includes("phone") || s.includes("mobile");

        // 3) 우편번호
        const isZipHeader = s.includes("우편번호") || s === "우편" || s.includes("zip") || s.includes("우편 번호");

        // 4) 주소
        const isAddrHeader = (s.includes("주소") || s.includes("배송지") || s.includes("주소지") || s.includes("도로명")) && !s.includes("우편번호");

        // 5) 상품명
        const isNotProd = s.includes("코드") || s.includes("금액") || s.includes("단가") || s.includes("배송") || s.includes("번호");
        const isProdHeader = (s.includes("내품명") || s.includes("내품") || s.includes("상품명") || s.includes("품목명") || s.includes("품명") || s.includes("내용물") || s === "상품" || s === "품목" || s.includes("상품정보")) && !isNotProd;

        // 6) 수량
        const isQtyHeader = s.includes("수량") || s.includes("구매수") || s === "qty" || s.includes("개수") || s.includes("내품수량") || s.includes("내품수");

        // 7) 용량 / 옵션
        const isUnitHeader = s.includes("내품기타") || s.includes("내품규격") || s.includes("내품옵션") || s.includes("내품비고") || s.includes("내품명2") || s.includes("옵션명") || s.includes("등록옵션") || s === "용량" || s === "옵션" || s === "규격" || s === "단위" || s.includes("옵션정보");

        // 8) 택배사
        const isCourierHeader = s.includes("택배사") || s.includes("배송업체") || s.includes("택배사명") || s === "택배" || s === "배송사";

        const hasRecipientKeyword = s.includes("받는") || s.includes("수령") || s.includes("수취") || s.includes("수화인") || s.includes("받는사람") || s.includes("받는분") || s.includes("수령자") || s.includes("수신자") || s.includes("받는이");

        if (isTrackHeader) {
          const trackScore = (s.includes("운송장번호") || s.includes("송장번호") || s === "운송장" || s === "송장" || s === "waybill") ? 100 : 50;
          if (trackScore > localTrackScore) {
            localTrack = colIdx;
            localTrackScore = trackScore;
          }
        }

        if (isPhoneHeader) {
          const phoneScore = (hasRecipientKeyword || s.includes("수령") || s.includes("수취")) ? 100 : 60;
          if (phoneScore > localPhoneScore) {
            localPhone = colIdx;
            localPhoneScore = phoneScore;
          }
        }

        if (isZipHeader) {
          const zipScore = (hasRecipientKeyword || s.includes("수령") || s.includes("수취")) ? 100 : 60;
          if (zipScore > localZipScore) {
            localZip = colIdx;
            localZipScore = zipScore;
          }
        }

        if (isAddrHeader) {
          const addrScore = (hasRecipientKeyword || s.includes("수령") || s.includes("수취")) ? 100 : (s.includes("기본주소") || s.includes("도로명주소") ? 80 : 50);
          if (addrScore > localAddrScore) {
            localAddr = colIdx;
            localAddrScore = addrScore;
          }
        }

        if (!isProdHeader && !isTrackHeader && !isQtyHeader && !isUnitHeader && !isCourierHeader && !isPhoneHeader && !isAddrHeader && !isZipHeader) {
          const isExplicitName = s.includes("성명") || s.includes("이름") || s.includes("고객명") || hasRecipientKeyword;
          if (isExplicitName) {
            const nameScore = (hasRecipientKeyword || s.includes("수령인") || s.includes("수취인") || s.includes("받는분") || s.includes("받는사람")) ? 100 : 50;
            if (nameScore > localNameScore) {
              localName = colIdx;
              localNameScore = nameScore;
            }
          }
        }

        if (isProdHeader) {
          let prodScore = 60;
          if (s.includes("내품명") || s.includes("내품명1") || s.includes("내품") || s.includes("내용물명") || s.includes("내품정보")) {
            prodScore = 200; // '내품명', '내품' 등 택배사 실제 상품 상세명에 최우선점수 부여 (품목명보다 높음)
          } else if (s.includes("상품명") || s.includes("내용물") || s.includes("상품정보")) {
            prodScore = 120;
          } else if (s.includes("품목명") || s === "품목" || s.includes("품명")) {
            prodScore = 50; // '품목명'은 한진/CJ 등 택배사에서 분류 카테고리인 경우가 많으므로 점수를 낮춤
          }
          if (prodScore > localProdScore) {
            localProd = colIdx;
            localProdScore = prodScore;
          }
        }

        if (isQtyHeader) {
          let qtyScore = 60;
          if (s.includes("내품수량") || s.includes("내품수") || s.includes("내품개수")) {
            qtyScore = 200; // '내품수량', '내품수' 등 택배사 실제 상품 수량에 최우선점수 부여
          } else if (s.includes("구매수량") || s === "수량" || s.includes("주문수량")) {
            qtyScore = 100;
          }
          if (qtyScore > localQtyScore) {
            localQty = colIdx;
            localQtyScore = qtyScore;
          }
        }

        if (isUnitHeader) {
          let unitScore = 60;
          if (s.includes("내품기타") || s.includes("내품규격") || s.includes("내품옵션") || s.includes("내품비고") || s.includes("내품명2")) {
            unitScore = 200; // '내품기타', '내품규격', '내품옵션' 등에 최우선점수 부여
          } else if (s.includes("옵션명") || s.includes("등록옵션") || s.includes("옵션정보")) {
            unitScore = 100;
          }
          if (unitScore > localUnitScore) {
            localUnit = colIdx;
            localUnitScore = unitScore;
          }
        }

        if (isCourierHeader) {
          const courierScore = (s.includes("택배사명") || s === "택배사") ? 100 : 60;
          if (courierScore > localCourierScore) {
            localCourier = colIdx;
            localCourierScore = courierScore;
          }
        }
      });

      const score = localTrackScore + localNameScore + localZipScore + localPhoneScore + localAddrScore + localProdScore + localQtyScore + localUnitScore + localCourierScore;

      // 2행 결합 스캔이 기존 최고점수보다 높거나 동점 이상일 경우 채택
      if (score > bestScore && (localTrack !== -1 || localName !== -1)) {
        bestScore = score;
        bestRowIdx = r;
        bestStartDataRow = cand.isMulti ? r + 2 : r + 1;
        bestHeaderCells = cand.rowCells;
        bestTrack = localTrack;
        bestName = localName;
        bestZip = localZip;
        bestPhone = localPhone;
        bestProd = localProd;
        bestQty = localQty;
        bestUnit = localUnit;
        bestCourier = localCourier;
        bestAddr = localAddr;
      }
    }
  }

  // 2) 엑셀 헤더 셀 텍스트 또는 파일명 기반 택배사 지능형 자동 감지
  let detectedCourierName = selectedCourierName || "";
  const normFile = (fileName || "").normalize('NFC').toLowerCase();
  const sampleText = srcRows.slice(0, 15).map(r => (r ? r.join(" ") : "")).join(" ").toLowerCase();

  if (normFile.includes('대한통운') || normFile.includes('cj') || sampleText.includes('대한통운') || sampleText.includes('cjgls') || sampleText.includes('nflex')) {
    detectedCourierName = 'CJ대한통운';
  } else if (normFile.includes('한진') || normFile.includes('hanjin') || sampleText.includes('한진') || sampleText.includes('hanjin')) {
    detectedCourierName = '한진택배';
  } else if (normFile.includes('롯데') || normFile.includes('lotte') || sampleText.includes('롯데') || sampleText.includes('alps')) {
    detectedCourierName = '롯데택배';
  } else if (normFile.includes('로젠') || normFile.includes('logen') || sampleText.includes('로젠') || sampleText.includes('ilogen')) {
    detectedCourierName = '로젠택배';
  } else if (normFile.includes('우체국') || normFile.includes('epost') || sampleText.includes('우체국') || sampleText.includes('epost')) {
    detectedCourierName = '우체국택배';
  } else if (normFile.includes('경동') || sampleText.includes('경동')) {
    detectedCourierName = '경동화물';
  } else if (normFile.includes('대신') || sampleText.includes('대신')) {
    detectedCourierName = '대신화물';
  } else if (!detectedCourierName) {
    detectedCourierName = '한진택배';
  }

  const finalHeaders = bestHeaderCells.length > 0 ? bestHeaderCells : (srcRows[bestRowIdx] ? srcRows[bestRowIdx].map(v => String(v || "").trim()) : []);
  const maxCols = finalHeaders.length > 0 ? finalHeaders.length : 50;

  // 3) 헤더 스캔으로 찾지 못한 열이 존재하는 경우, 선택/감지된 택배사 기본 설정(CourierConfig)으로 보완
  const allAvailableCouriers = [...(couriers || []), ...DEFAULT_COURIERS];
  const targetCourier = allAvailableCouriers.find(c =>
    c.id === detectedCourierName ||
    c.name === detectedCourierName ||
    detectedCourierName.includes(c.name) ||
    c.name.includes(detectedCourierName)
  );

  if (targetCourier) {
    if (bestTrack === -1 && targetCourier.tracking_col < maxCols) bestTrack = targetCourier.tracking_col;
    if (bestName === -1 && targetCourier.name_col < maxCols) bestName = targetCourier.name_col;
    if (bestZip === -1 && targetCourier.zip_col < maxCols) bestZip = targetCourier.zip_col;
    if (bestPhone === -1 && targetCourier.phone_col < maxCols) bestPhone = targetCourier.phone_col;
    if (bestAddr === -1 && targetCourier.addr_col < maxCols) bestAddr = targetCourier.addr_col;
    if (bestProd === -1 && targetCourier.prod_col < maxCols) bestProd = targetCourier.prod_col;
    if (bestUnit === -1 && targetCourier.unit_col < maxCols) bestUnit = targetCourier.unit_col;
    if (bestQty === -1 && targetCourier.qty_col < maxCols) bestQty = targetCourier.qty_col;
    if (bestCourier === -1 && targetCourier.courier_col !== undefined && targetCourier.courier_col < maxCols) bestCourier = targetCourier.courier_col;
  }

  // 4) 데이터 샘플 패턴 스캔 백업 (숫자 송장, 한글 이름, 5자리 우편번호 등)
  if (bestTrack === -1 || bestName === -1) {
    const dataScanRows = Math.min(30, srcRows.length);
    for (let r = bestStartDataRow; r < dataScanRows; r++) {
      const row = srcRows[r];
      if (!row) continue;
      row.forEach((cell: any, cIdx: number) => {
        const val = String(cell || "").trim();
        if (bestTrack === -1 && /^[\d-]{9,16}$/.test(val)) {
          bestTrack = cIdx;
        }
        if (bestName === -1 && /^[가-힣]{2,5}$/.test(val) && !["수령인", "수취인", "상품명", "배송지", "받는분"].includes(val)) {
          bestName = cIdx;
        }
        if (bestZip === -1 && /^\d{5}$/.test(val)) {
          bestZip = cIdx;
        }
      });
    }
  }

  return {
    headerRowIndex: bestRowIdx,
    startDataRow: bestStartDataRow,
    courierName: detectedCourierName,
    colMap: {
      track: bestTrack,
      name: bestName,
      zip: bestZip,
      phone: bestPhone,
      prod: bestProd,
      qty: bestQty,
      unit: bestUnit,
      courier: bestCourier,
      addr: bestAddr
    },
    headers: finalHeaders
  };
}

// 2-2. 복호화되거나 이미 읽어온 2차원 배열 데이터를 기반으로 운송장 소스 매칭 분석을 수행하는 로직
export function processTrackingUpdateWithRows(
  inputOrders: ProcessedOrder[],
  srcRows: any[][],
  mappings?: ProductMapping[],
  couriers?: CourierConfig[],
  selectedCourierName?: string,
  sourceFileName?: string
): TrackingUpdateResult {
  if (!srcRows || srcRows.length === 0) {
    return {
      matchCount: 0,
      softMatchCount: 0,
      bundledCount: 0,
      bundledGroupCount: 0,
      unfilledErrors: inputOrders.map(o => ({
        type: 'unfilled',
        name: o.수령인,
        prod: o.상품명,
        qty: String(o.수량),
        zipCode: o.우편번호,
        reason: "소스 파일에 데이터가 없습니다.",
        sourceFileName: o.sourceFileName || "주문서 엑셀",
        platformName: o.platformName
      })),
      unusedErrors: [],
      outputOrders: inputOrders.map(o => ({ ...o }))
    };
  }

  // 1단계 플랫폼 감지와 동일하게 헤더 행 및 열 위치 다이나믹 자동 스캔 실행
  const detection = detectTrackingHeaderAndCourier(srcRows, sourceFileName, couriers, selectedCourierName);

  const startDataRow = detection.startDataRow;
  let SRC_TRACK_IDX = detection.colMap.track;
  let SRC_NAME_IDX = detection.colMap.name;
  let SRC_ZIP_IDX = detection.colMap.zip;
  const SRC_PHONE_IDX = detection.colMap.phone;
  const SRC_PROD_IDX = detection.colMap.prod;
  const SRC_QTY_IDX = detection.colMap.qty;
  const SRC_UNIT_IDX = detection.colMap.unit;
  const SRC_COURIER_IDX = detection.colMap.courier;
  const SRC_ADDR_IDX = detection.colMap.addr;

  // 만약 헤더 스캔으로 찾지 못한 경우 데이터 패턴 스캔 시도 (상단 30행 스캔)
  if (SRC_TRACK_IDX === -1 || SRC_NAME_IDX === -1) {
    const dataScanRows = Math.min(30, srcRows.length);
    for (let r = 0; r < dataScanRows; r++) {
      const row = srcRows[r];
      if (!row) continue;
      row.forEach((cell: any, cIdx: number) => {
        const val = String(cell || "").trim();
        // 송장번호 패턴 (숫자/하이픈 9자리 이상)
        if (SRC_TRACK_IDX === -1 && /^[\d-]{9,16}$/.test(val)) {
          SRC_TRACK_IDX = cIdx;
        }
        // 한국어 수령인 이름 패턴 (2~4글자 한글)
        if (SRC_NAME_IDX === -1 && /^[가-힣]{2,5}$/.test(val) && val !== "수령인" && val !== "수취인" && val !== "상품명" && val !== "배송지") {
          SRC_NAME_IDX = cIdx;
        }
        // 우편번호 패턴 (5자리 숫자)
        if (SRC_ZIP_IDX === -1 && /^\d{5}$/.test(val)) {
          SRC_ZIP_IDX = cIdx;
        }
      });
    }
  }

  // 헬퍼: 정규화 및 크리닝
  const cleanStr = (val: any) => String(val || "").replace(/\s+/g, "").trim().toLowerCase();
  const cleanZip = (val: any) => {
    let z = String(val || "").replace(/[^\d]/g, "");
    if (z.length === 4) z = "0" + z;
    return z;
  };
  const cleanPhone = (val: any) => String(val || "").replace(/[^\d]/g, "");

  // SourceItems 배열 구조 생성
  interface SourceItem {
    rawIndex: number;
    trackingNumber: string;
    courierName?: string;
    name: string;
    zip: string;
    phone: string;
    prod: string;
    unit: string;
    qty: number;
    addr: string;
    used: boolean;
    rowRawValues: string[];
    extraProducts?: { prod: string; unit: string; qty: number }[]; // C열 수량 > 1일 때 AW, BD, BK... 열의 추가 합포장 상품들
  }

  const sourceItems: SourceItem[] = [];

  for (let i = startDataRow; i < srcRows.length; i++) {
    const row = srcRows[i];
    if (!row || row.length === 0) continue;

    const rawTrack = SRC_TRACK_IDX !== -1 ? String(row[SRC_TRACK_IDX] || "").trim() : "";
    if (!rawTrack || rawTrack === "nan" || rawTrack === "undefined" || rawTrack === "송장번호") continue;

    const name = SRC_NAME_IDX !== -1 ? cleanStr(row[SRC_NAME_IDX]) : "";
    const zip = SRC_ZIP_IDX !== -1 ? cleanZip(row[SRC_ZIP_IDX]) : "";
    const phone = SRC_PHONE_IDX !== -1 ? cleanPhone(row[SRC_PHONE_IDX]) : "";
    const prod = SRC_PROD_IDX !== -1 ? cleanStr(row[SRC_PROD_IDX]) : "";
    const unit = SRC_UNIT_IDX !== -1 ? cleanStr(row[SRC_UNIT_IDX]) : "";
    const qty = SRC_QTY_IDX !== -1 ? (Number(row[SRC_QTY_IDX]) || 1) : 1;
    const addr = SRC_ADDR_IDX !== -1 ? cleanStr(row[SRC_ADDR_IDX]) : "";
    const courierName = SRC_COURIER_IDX !== -1 ? String(row[SRC_COURIER_IDX] || "").trim() : undefined;
    const rowRawValues = row.map((cell: any) => cleanStr(cell));

    // C열(인덱스 2)의 숫자가 2 이상이거나 AW(48), BD(55), BK(62)... 열에 추가 상품 정보가 기재된 경우 파싱
    const extraProducts: { prod: string; unit: string; qty: number }[] = [];
    const cColVal = Number(row[2]);
    const maxCheckCount = !isNaN(cColVal) && cColVal > 1 ? Math.min(10, cColVal - 1) : 10;

    for (let n = 1; n <= maxCheckCount; n++) {
      const pIdx = 48 + (n - 1) * 7; // AW = 48, BD = 55, BK = 62, BR = 69, BY = 76...
      const qIdx = 49 + (n - 1) * 7; // AX = 49, BE = 56, BL = 63...
      const uIdx = 50 + (n - 1) * 7; // AY = 50, BF = 57, BM = 64...

      if (pIdx >= row.length) break;

      const exProd = cleanStr(row[pIdx]);
      const exUnit = cleanStr(row[uIdx]);
      const exQty = Number(row[qIdx]) || 1;

      if (exProd || exUnit) {
        extraProducts.push({
          prod: exProd,
          unit: exUnit,
          qty: exQty
        });
      }
    }

    sourceItems.push({
      rawIndex: i,
      trackingNumber: rawTrack,
      courierName: courierName || undefined,
      name,
      zip,
      phone,
      prod,
      unit,
      qty,
      addr,
      used: false,
      rowRawValues,
      extraProducts: extraProducts.length > 0 ? extraProducts : undefined
    });
  }

  // 헬퍼: 수령인 이름 매칭 검사 (스마트 컬럼 지정 + 행 전체 Fallback 매칭)
  const itemHasRecipientName = (item: SourceItem, targetName: string): { isMatch: boolean; isExact: boolean; reason?: string } => {
    if (item.name) {
      const check = checkRecipientNameMatch(item.name, targetName);
      if (check.isMatch) return check;
    }
    // Fallback: 행 전체 원본 셀들 중 targetName과 일치하는 셀 검색
    if (item.rowRawValues && item.rowRawValues.length > 0) {
      for (const cellVal of item.rowRawValues) {
        if (!cellVal) continue;
        const check = checkRecipientNameMatch(cellVal, targetName);
        if (check.isMatch) return check;
      }
    }
    return { isMatch: false, isExact: false };
  };

  // 헬퍼: 1단계 완전 매칭 대비 부족한 요건(원인) 분석
  const getSoftMatchMissingReasons = (
    item: SourceItem,
    oName: string,
    oZip: string,
    oPhone: string,
    oAddr: string,
    prodOrAddrCheck?: { isMatched: boolean; isExact: boolean; reason: string }
  ): string => {
    const missing: string[] = [];

    // 1) 수령인 성명 완전 일치 검사
    const nameCheck = itemHasRecipientName(item, oName);
    if (!nameCheck.isExact) {
      missing.push('수령인명 부분/유사일치');
    }

    // 2) 식별 정보(연락처/우편번호/주소) 완전 일치 검사
    const zipMatch = Boolean(oZip && item.zip && cleanZip(oZip) === cleanZip(item.zip));
    const phoneMatch = Boolean(oPhone && item.phone && oPhone === item.phone);
    const addrMatch = Boolean(oAddr && item.addr && (item.addr.includes(oAddr.slice(0, 8)) || oAddr.includes(item.addr.slice(0, 8))));

    if (!zipMatch && !phoneMatch && !addrMatch) {
      if (oPhone && item.phone && oPhone !== item.phone) {
        missing.push(`전화번호 불일치(주문:${oPhone} vs 송장:${item.phone})`);
      } else if (!item.phone && !item.zip && !item.addr) {
        missing.push('송장 내 연락처/우편번호/주소 미기재');
      } else {
        missing.push('연락처/우편번호/주소 불일치');
      }
    } else {
      if (oPhone && item.phone && !phoneMatch) {
        missing.push(`전화번호 불일치(주문:${oPhone} vs 송장:${item.phone})`);
      }
      if (oZip && item.zip && !zipMatch) {
        missing.push(`우편번호 불일치(주문:${oZip} vs 송장:${item.zip})`);
      }
      if (oAddr && item.addr && !addrMatch) {
        missing.push('배송지 주소 불일치');
      }
    }

    // 3) 상품/옵션 매칭 정밀도 검사
    if (prodOrAddrCheck) {
      if (!prodOrAddrCheck.isExact) {
        missing.push(`상품/옵션 부분일치(${prodOrAddrCheck.reason})`);
      }
    } else {
      missing.push('상품명/옵션 완전검증 미충족');
    }

    return missing.length > 0 ? missing.join(', ') : '필수식별요건 일부 차이';
  };

  // 복제본 생성
  const outputOrders = inputOrders.map(o => ({ ...o }));
  let matchCount = 0;
  let softMatchCount = 0;
  const unfilledErrors: MatchingError[] = [];

  // 헬퍼: 메인 상품 및 추가 합포장 상품(AW, BD, BK열 등) 대조
  const checkProductMatchWithExtra = (
    item: SourceItem,
    oOrigProd: string,
    oMappedProd: string,
    oOrigOpt: string,
    oMappedOpt: string
  ): { isMatch: boolean; reason: string } => {
    // 1) 메인 상품 대조
    const mainCheck = checkProductMatch(item.prod, item.unit, oOrigProd, oMappedProd, oOrigOpt, oMappedOpt, mappings);
    if (mainCheck.isMatch) return mainCheck;

    // 2) 합포장 추가 상품들 대조 (AW, BD, BK열 등)
    if (item.extraProducts && item.extraProducts.length > 0) {
      for (let idx = 0; idx < item.extraProducts.length; idx++) {
        const ex = item.extraProducts[idx];
        const exCheck = checkProductMatch(ex.prod, ex.unit, oOrigProd, oMappedProd, oOrigOpt, oMappedOpt, mappings);
        if (exCheck.isMatch) {
          return {
            isMatch: true,
            reason: `합포장 추가 품목(${idx + 1}번째 AW/BD/BK열) ${exCheck.reason}`
          };
        }
      }
    }

    return { isMatch: false, reason: "상품명 미일치" };
  };

  // 헬퍼: 상품 및 주소 검증 조건 (OR 조건: 상품명 100% OR 주소 100% 정규화 OR 사전 등록 매핑 100%)
  const checkProductOrAddressMatch = (
    item: SourceItem,
    oOrigProd: string,
    oMappedProd: string,
    oOrigOpt: string,
    oMappedOpt: string,
    oAddr: string
  ): { isMatched: boolean; isExact: boolean; reason: string } => {
    const normSrcProd = normalizeText(item.prod);
    const normSrcUnit = normalizeText(item.unit);
    const normOrigProd = normalizeText(oOrigProd);
    const normMappedProd = normalizeText(oMappedProd);
    const normOrigOpt = normalizeText(oOrigOpt);
    const normMappedOpt = normalizeText(oMappedOpt);

    const normSrcAddr = normalizeText(item.addr);
    const normOrderAddr = normalizeText(oAddr);

    // 1) [Condition 1] 상품명 및 옵션 완전 일치 (100% 동일)
    const isProdExact =
      (normSrcProd && (normSrcProd === normOrigProd || normSrcProd === normMappedProd)) ||
      (normSrcUnit && (normSrcUnit === normOrigOpt || normSrcUnit === normMappedOpt));

    if (isProdExact) {
      return { isMatched: true, isExact: true, reason: "상품명/옵션 100% 완전 일치" };
    }

    // 2) [Condition 2] 주소 정규화 일치 (100% 동일)
    if (normSrcAddr && normOrderAddr && normSrcAddr === normOrderAddr) {
      return { isMatched: true, isExact: true, reason: "주소 정규화(100%) 완전 일치" };
    }

    // 3) [Condition 3] 사전 등록된 상품/고객 매핑 규칙 일치
    if (mappings && mappings.length > 0 && (normSrcProd || normSrcUnit)) {
      for (const m of mappings) {
        const mOrig = normalizeText(m.rawName);
        const mMapped = normalizeText(m.mappedName);

        if (!mOrig && !mMapped) continue;

        const isRuleExact =
          (mOrig && normSrcProd === mOrig) ||
          (mMapped && normSrcProd === mMapped) ||
          (mOrig && normSrcUnit === mOrig) ||
          (mMapped && normSrcUnit === mMapped);

        if (isRuleExact) {
          if (mMapped === normMappedProd || mOrig === normOrigProd || normSrcProd === mMapped) {
            return {
              isMatched: true,
              isExact: true,
              reason: `사전 등록 상품 매핑 규칙 완전 일치 (${m.rawName} ${m.mappedName})`
            };
          }
        }
      }
    }

    // C열 > 1 합포장 추가 상품들 (AW, BD, BK...) 대조
    if (item.extraProducts && item.extraProducts.length > 0) {
      for (let idx = 0; idx < item.extraProducts.length; idx++) {
        const ex = item.extraProducts[idx];
        const exProd = normalizeText(ex.prod);
        const exUnit = normalizeText(ex.unit);

        if (
          (exProd && (exProd === normOrigProd || exProd === normMappedProd)) ||
          (exUnit && (exUnit === normOrigOpt || exUnit === normMappedOpt))
        ) {
          return { isMatched: true, isExact: true, reason: `합포장 추가품목(${idx + 1}열) 완전 일치` };
        }
      }
    }

    // 1~3 완전 일치에 미달할 경우: 텍스트 포함(부분) 매칭 수행 (지능형 부분 매칭 판단용)
    const partialCheck = checkProductMatchWithExtra(item, oOrigProd, oMappedProd, oOrigOpt, oMappedOpt);
    if (partialCheck.isMatch) {
      return { isMatched: true, isExact: false, reason: partialCheck.reason };
    }

    return { isMatched: false, isExact: false, reason: "상품/주소 매칭 미일치" };
  };

  // 헬퍼: 매칭 실패 시 원인을 정밀 분석하는 디버그 헬퍼
  const analyzeUnmatchedReason = (
    o: ProcessedOrder,
    oName: string,
    oZip: string,
    oPhone: string,
    oOrigProd: string,
    oMappedProd: string,
    oOrigOpt: string,
    oMappedOpt: string,
    oQty: number,
    oAddr: string
  ): { reason: string; debugDetail: string } => {
    // 혹시 동일 수취인에게 이미 매칭된 타 주문건 운송장이 존재하는지 확인 (합포장건 확인 - 단, 쿠팡 주문에 한함!)
    if (isCoupangOrder(o)) {
      const existingOrderWithSameName = outputOrders.find(prev => 
        prev.trackingNumber && isCoupangOrder(prev) && cleanStr(prev.수령인) === oName
      );

      if (existingOrderWithSameName) {
        return {
          reason: ` [합포장 묶음 출고 안내] 동일 수취인('${o.수령인}') 명의의 타 주문건으로 운송장(${existingOrderWithSameName.trackingNumber})이 통합 발행됨`,
          debugDetail: `[합포장 출고 안내] 수취인 '${o.수령인}' 고객에게 대표 운송장(${existingOrderWithSameName.trackingNumber})이 발행되어 본 주문건은 별도 송장 없이 합포장 묶음배송 처리된 상태입니다.`
        };
      }
    }

    const sameNameItems = sourceItems.filter(item => itemHasRecipientName(item, oName).isMatch);

    if (sameNameItems.length === 0) {
      const similarNameItems = sourceItems.filter(item => {
        if (item.name && (item.name.includes(oName) || oName.includes(item.name))) return true;
        if (item.rowRawValues && item.rowRawValues.some(val => val.length >= 2 && (val.includes(oName) || oName.includes(val)))) return true;
        return false;
      });
      if (similarNameItems.length > 0) {
        return {
          reason: `수취인명 유사항목 발견 ('${similarNameItems[0].name}') - 정확히 일치하지 않음`,
          debugDetail: `주문서 수취인명: '${o.수령인}' | 송장파일 유사 수취인명: '${similarNameItems[0].name}' (스펠링/공백 차이)`
        };
      }
      const headerColStr = SRC_NAME_IDX >= 0 ? colNumToLetter(SRC_NAME_IDX + 1) : '미지정';
      const headerNameStr = (detection.headers && SRC_NAME_IDX >= 0 && detection.headers[SRC_NAME_IDX]) ? ` (${detection.headers[SRC_NAME_IDX]})` : '';
      return {
        reason: `송장 엑셀에서 수취인명 '${o.수령인}'을 가진 데이터 행을 찾을 수 없음`,
        debugDetail: `[수취인명 미존재] 송장파일 읽기열(${headerColStr}열${headerNameStr}) 내에 '${o.수령인}' 텍스트가 존재하지 않습니다.`
      };
    }

    const availableSameName = sameNameItems.filter(item => !item.used);
    if (availableSameName.length === 0) {
      const usedItem = sameNameItems[0];
      const sameRecipientCountInCoupangOrders = inputOrders.filter(ord => isCoupangOrder(ord) && checkRecipientNameMatch(ord.수령인, o.수령인).isMatch).length;
      
      if (isCoupangOrder(o) && sameRecipientCountInCoupangOrders >= 2) {
        return {
          reason: ` [합포장 묶음 출고 안내] 동일 수취인('${o.수령인}') 대표 송장(${usedItem.trackingNumber})에 합포장 포함됨`,
          debugDetail: `[합포장 소진] 송장 엑셀의 '${o.수령인}' 수량(${sameNameItems.length}건)이 앞선 주문건들에 매칭되어 소진되었습니다. 본 품목은 대표 송장(${usedItem.trackingNumber})으로 합포장 출고 처리되었습니다.`
        };
      } else {
        return {
          reason: `송장 엑셀의 '${o.수령인}' 데이터가 이미 앞선 항목에 매칭 소진됨`,
          debugDetail: `[송장 소진] 송장 엑셀의 수량이 이미 앞선 항목에 대조 매칭되었습니다. (타 플랫폼 주문건은 무조건 독립적인 운송장 매칭이 필요합니다.)`
        };
      }
    }

    const diffs: string[] = [];
    const item = availableSameName[0];

    const zipMatch = oZip && item.zip ? cleanZip(oZip) === cleanZip(item.zip) : true;
    if (!zipMatch) {
      diffs.push(`우편번호 불일치 (주문서: '${oZip}' vs 송장: '${item.zip}')`);
    }

    const prodOrAddrCheck = checkProductOrAddressMatch(item, oOrigProd, oMappedProd, oOrigOpt, oMappedOpt, oAddr);
    if (!prodOrAddrCheck.isMatched) {
      const srcProdDesc = [item.prod, item.unit].filter(Boolean).join(' / ') || '없음';
      const orderProdDesc = [oOrigProd, oOrigOpt].filter(Boolean).join(' / ') || '없음';
      diffs.push(`상품명/옵션명 불일치 (주문서: '${orderProdDesc}' [대치후: '${oMappedProd}'] vs 송장: '${srcProdDesc}')`);
      
      if (item.extraProducts && item.extraProducts.length > 0) {
        const extraDesc = item.extraProducts.map(e => `${e.prod}(${e.qty})`).join(', ');
        diffs.push(`참고: 송장 엑셀 합포장 추가열(AW, BD 등) 품목 [${extraDesc}]과도 일치하지 않음`);
      }
    }

    const mainReason = diffs.length > 0 ? diffs[0] : "매칭 조건 미충족";
    const debugDetail = `[수취인 '${o.수령인}' 송장 데이터 대조 구문]\n- ` + diffs.join('\n- ');

    return {
      reason: mainReason,
      debugDetail
    };
  };

  // 다단계(Multi-Pass) 스마트 매칭 실행
  outputOrders.forEach(o => {
    if (!o.수령인) return;

    const oName = cleanStr(o.수령인);
    const oZip = cleanZip(o.우편번호);
    const oPhone = cleanPhone(o.연락처);
    const oOrigProd = o.originalProductName || o.상품명 || "";
    const oMappedProd = o.상품명 || "";
    const oOrigOpt = o.originalOptionName || o.용량 || "";
    const oMappedOpt = o.용량 || "";
    const oQty = Number(o.수량) || 1;
    const oAddr = cleanStr(o.주소);

    let matchedItem: SourceItem | null = null;
    let matchType: 'exact' | 'soft' | 'bundled' = 'exact';
    let softMatchReason = '';

    // Tier 1: [100% 완전 매칭 (Exact Match)]
    // 수령인 성명 100% 일치 AND (우편번호/연락처/주소 포함 일치) AND [상품 조건 100% 완전 일치]
    for (const item of sourceItems) {
      if (item.used) continue;
      const nameCheck = itemHasRecipientName(item, oName);
      if (!nameCheck.isMatch || !nameCheck.isExact) continue;

      const zipMatch = oZip && item.zip && oZip === item.zip;
      const phoneMatch = oPhone && item.phone && oPhone === item.phone;
      const addrMatch = oAddr && item.addr && (item.addr.includes(oAddr.slice(0, 8)) || oAddr.includes(item.addr.slice(0, 8)));
      const infoMatch = zipMatch || phoneMatch || addrMatch;

      const prodOrAddrCheck = checkProductOrAddressMatch(item, oOrigProd, oMappedProd, oOrigOpt, oMappedOpt, oAddr);

      if (infoMatch && prodOrAddrCheck.isMatched && prodOrAddrCheck.isExact) {
        matchedItem = item;
        matchType = 'exact';
        softMatchReason = `수령인/연락처 일치 및 [${prodOrAddrCheck.reason}] 완전 매칭`;
        break;
      }
    }

    // Tier 2: [식별정보 완화 완전 매칭]
    if (!matchedItem) {
      for (const item of sourceItems) {
        if (item.used) continue;
        const nameCheck = itemHasRecipientName(item, oName);
        if (!nameCheck.isMatch || !nameCheck.isExact) continue;

        const zipMatch = oZip && item.zip && oZip === item.zip;
        const phoneMatch = oPhone && item.phone && oPhone === item.phone;
        const infoMatch = zipMatch || phoneMatch;

        const prodOrAddrCheck = checkProductOrAddressMatch(item, oOrigProd, oMappedProd, oOrigOpt, oMappedOpt, oAddr);

        if (infoMatch && prodOrAddrCheck.isMatched) {
          matchedItem = item;
          matchType = 'exact';
          softMatchReason = `수령인/연락처 일치 및 [${prodOrAddrCheck.reason}] 교차 완전 매칭`;
          break;
        }
      }
    }

    // Tier 3: [지능형 부분 매칭 (Soft Match) - 수령인 성명 유사/잘림/부분일치 포함]
    if (!matchedItem) {
      for (const item of sourceItems) {
        if (item.used) continue;
        const nameCheck = itemHasRecipientName(item, oName);
        if (!nameCheck.isMatch) continue;

        // 우편번호가 양쪽에 모두 있는 경우 일치 여부 검사
        const zipMatch = oZip && item.zip ? cleanZip(oZip) === cleanZip(item.zip) : true;
        if (!zipMatch) continue;

        const prodOrAddrCheck = checkProductOrAddressMatch(item, oOrigProd, oMappedProd, oOrigOpt, oMappedOpt, oAddr);

        if (prodOrAddrCheck.isMatched) {
          matchedItem = item;
          matchType = 'soft';
          const missingReason = getSoftMatchMissingReasons(item, oName, oZip, oPhone, oAddr, prodOrAddrCheck);
          softMatchReason = `지능형 부분 매칭 [완전 매칭 미달 원인: ${missingReason}] (매칭 근거: ${nameCheck.reason || '수령인 일치'} + ${prodOrAddrCheck.reason})`;
          break;
        }
      }
    }

    // Tier 4: [지능형 부분 매칭] 고유 수령인 명의 및 우편번호 1:1 유체 매칭
    if (!matchedItem) {
      const candidates = sourceItems.filter(item => {
        if (item.used) return false;
        const nameCheck = itemHasRecipientName(item, oName);
        if (!nameCheck.isMatch) return false;
        if (oZip && item.zip && cleanZip(oZip) !== cleanZip(item.zip)) return false;
        return true;
      });
      const orderCountWithSameName = inputOrders.filter(ord => checkRecipientNameMatch(ord.수령인, oName).isMatch).length;

      if (candidates.length === 1 && orderCountWithSameName === 1) {
        matchedItem = candidates[0];
        matchType = 'soft';
        const prodCheck = checkProductOrAddressMatch(matchedItem, oOrigProd, oMappedProd, oOrigOpt, oMappedOpt, oAddr);
        const missingReason = getSoftMatchMissingReasons(matchedItem, oName, oZip, oPhone, oAddr, prodCheck);
        softMatchReason = `지능형 부분 매칭 [완전 매칭 미달 원인: ${missingReason}] (매칭 근거: 고유 1:1 수령인 및 우편번호 매칭)`;
      }
    }

    // Tier 5: [독립 카테고리: 동일 수취인/배송지 합포장 묶음 자동 운송장 연동]
    // 단, 1) 해당 주문이 '쿠팡(DeliveryList)' 플랫폼일 때만 합포장 연동 수행! (다른 플랫폼은 합포장 미적용)
    // 2) 전체 주문서 내에 동일 수취인/배송지의 쿠팡 주문이 2건 이상일 때만 합포장 연동 수행!
    if (!matchedItem && isCoupangOrder(o)) {
      const sameRecipientOrdersInInput = inputOrders.filter(ord => 
        isCoupangOrder(ord) &&
        checkRecipientNameMatch(ord.수령인, oName).isMatch &&
        (!oZip || !ord.우편번호 || cleanZip(ord.우편번호) === oZip)
      );

      if (sameRecipientOrdersInInput.length >= 2) {
        const alreadyMatchedOrder = outputOrders.find(prev => 
          prev.trackingNumber && 
          isCoupangOrder(prev) &&
          checkRecipientNameMatch(prev.수령인, oName).isMatch &&
          (!oZip || !prev.우편번호 || cleanZip(prev.우편번호) === oZip)
        );

        if (alreadyMatchedOrder) {
          o.trackingNumber = alreadyMatchedOrder.trackingNumber;
          o.matchType = alreadyMatchedOrder.matchType || 'exact';
          o.isBundled = true;
          o.softMatchReason = ` [합포장 묶음 출고] 동일 수취인('${oName}') 타 주문건과 대표 송장(${alreadyMatchedOrder.trackingNumber})으로 통합 발송`;
          if (alreadyMatchedOrder.courierName) {
            o.courierName = alreadyMatchedOrder.courierName;
          }
          return;
        }
      }
    }

    if (matchedItem) {
      matchedItem.used = true;
      o.trackingNumber = matchedItem.trackingNumber;
      o.matchType = matchType;
      o.softMatchReason = softMatchReason;
      if (matchedItem.courierName) {
        o.courierName = matchedItem.courierName;
      }
    } else {
      const analysis = analyzeUnmatchedReason(o, oName, oZip, oPhone, oOrigProd, oMappedProd, oOrigOpt, oMappedOpt, oQty, oAddr);
      o.matchType = 'unmatched';
      o.unmatchedDetail = analysis.debugDetail;

      unfilledErrors.push({
        type: 'unfilled',
        name: o.수령인,
        prod: o.상품명,
        qty: String(o.수량),
        zipCode: o.우편번호,
        reason: analysis.reason,
        debugDetail: analysis.debugDetail,
        sourceFileName: o.sourceFileName || "주문서 엑셀",
        platformName: o.platformName
      });
    }
  });

  // 미사용 운송장 탐색
  const unusedErrors: MatchingError[] = [];
  sourceItems.forEach(item => {
    if (!item.used) {
      unusedErrors.push({
        type: 'unused',
        name: item.name || "알수없음",
        prod: item.prod || item.unit || "알수없음",
        qty: String(item.qty),
        zipCode: item.zip || "알수없음",
        reason: "취소 주문이거나 인풋 파일에서 이미 제외된 항목",
        sourceFileName: sourceFileName || "송장 엑셀 파일"
      });
    }
  });

  // ==========================================
  // 쿠팡 플랫폼 합포장(묶음배송) 그룹 후처리 및 C열 수량 대조 검사
  // ==========================================
  const trackingNumberCounts: { [tracking: string]: number } = {};
  outputOrders.forEach(o => {
    if (o.trackingNumber && isCoupangOrder(o)) {
      trackingNumberCounts[o.trackingNumber] = (trackingNumberCounts[o.trackingNumber] || 0) + 1;
    }
  });

  outputOrders.forEach(o => {
    if (o.trackingNumber && isCoupangOrder(o)) {
      const count = trackingNumberCounts[o.trackingNumber] || 0;
      if (count >= 2) {
        // 동일 대표 송장번호로 2개 이상의 쿠팡 품목이 매칭된 경우, 합포장 묶음 출고건으로 표기
        o.isBundled = true;
        if (!o.matchType || o.matchType === 'unmatched') {
          o.matchType = 'exact';
        }
        o.softMatchReason = ` [합포장 묶음 출고] 동일 수취인('${o.수령인}') 총 ${count}개 품목 통합 배송 (대표송장: ${o.trackingNumber})`;
      }
    }
  });

  // C열(합포) 수량 및 실제 매칭 수량 일치 여부 검사
  const bundleMismatchDetails: string[] = [];
  const checkedTrackings = new Set<string>();

  sourceItems.forEach(item => {
    if (!item.trackingNumber || checkedTrackings.has(item.trackingNumber)) return;
    checkedTrackings.add(item.trackingNumber);

    const cColVal = Number(srcRows[item.rawIndex] ? srcRows[item.rawIndex][2] : 0);
    const expectedQty = !isNaN(cColVal) && cColVal >= 2 ? cColVal : 1;

    const matchedForTrack = outputOrders.filter(o => o.trackingNumber === item.trackingNumber && isCoupangOrder(o));
    const actualQty = matchedForTrack.length;

    if (expectedQty >= 2 || actualQty >= 2) {
      if (expectedQty !== actualQty) {
        const recipName = item.name || (matchedForTrack[0] ? matchedForTrack[0].수령인 : "미상");
        bundleMismatchDetails.push(
          `[합포장 수량 불일치] 수령인 '${recipName}' (송장번호: ${item.trackingNumber}): 2단계 엑셀 C열(합포) 수량은 ${expectedQty}개이나, 실제 매칭된 주문 품목수는 ${actualQty}개입니다.`
        );
      }
    }
  });

  const exactMatchOrders = outputOrders.filter(o => o.matchType === 'exact');
  const softMatchOrders = outputOrders.filter(o => o.matchType === 'soft');
  const bundledOrders = outputOrders.filter(o => o.isBundled || o.matchType === 'bundled');

  matchCount = exactMatchOrders.length;
  softMatchCount = softMatchOrders.length;
  const bundledCount = bundledOrders.length;

  const bundledGroupCount = new Set(
    bundledOrders.map(o => `${cleanStr(o.수령인)}_${cleanZip(o.우편번호)}_${o.trackingNumber || ''}`)
  ).size;

  return {
    matchCount,
    softMatchCount,
    bundledCount,
    bundledGroupCount,
    bundleMismatchCount: bundleMismatchDetails.length,
    bundleMismatchDetails,
    unfilledErrors,
    unusedErrors,
    outputOrders
  };
}

export async function processTrackingUpdate(
  inputOrders: ProcessedOrder[],
  sourceFile: File,
  mappings?: ProductMapping[],
  couriers?: CourierConfig[],
  selectedCourierName?: string
): Promise<TrackingUpdateResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const bestSheetName = findBestOrderSheet(workbook);
        const worksheet = workbook.Sheets[bestSheetName];
        
        // 2차원 배열 데이터 로드
        const srcRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });
        const result = processTrackingUpdateWithRows(inputOrders, srcRows, mappings, couriers, selectedCourierName, sourceFile.name);
        resolve(result);
      } catch (err: any) {
        const errMsg = err?.message || "";
        const lowerMsg = errMsg.toLowerCase();
        if (
          lowerMsg.includes("password") ||
          lowerMsg.includes("protected") ||
          lowerMsg.includes("decrypt") ||
          lowerMsg.includes("encrypted")
        ) {
          reject(new Error("PASSWORD_PROTECTED"));
        } else {
          reject(err);
        }
      }
    };
    reader.onerror = () => reject(new Error("소스 파일을 읽는 도중 오류가 발생했습니다."));
    reader.readAsArrayBuffer(sourceFile);
  });
}

// 최종 운송장이 채워진 엑셀 파일 내보내기 (원본 양식, 노란 배경, 파란 헤더 100% 보존)
export async function exportFinalTrackingExcel(
  orders: ProcessedOrder[],
  originalRows: any[][],
  platform: PlatformConfig,
  outputFileName?: string,
  originalFileOrBuffer?: File | ArrayBuffer | Uint8Array,
  defaultCourierName: string = "한진택배"
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  let ws: ExcelJS.Worksheet | undefined;
  let loadedFromOriginal = false;

  if (originalFileOrBuffer) {
    try {
      let buffer: ArrayBuffer;
      if (originalFileOrBuffer instanceof File) {
        buffer = await originalFileOrBuffer.arrayBuffer();
      } else if (originalFileOrBuffer instanceof Uint8Array) {
        buffer = originalFileOrBuffer.buffer.slice(
          originalFileOrBuffer.byteOffset,
          originalFileOrBuffer.byteOffset + originalFileOrBuffer.byteLength
        ) as ArrayBuffer;
      } else {
        buffer = originalFileOrBuffer;
      }

      await wb.xlsx.load(buffer);
      
      let bestWs: ExcelJS.Worksheet | undefined = wb.worksheets[0];
      let maxScore = -1;

      wb.worksheets.forEach(sheet => {
        if (!sheet) return;
        let score = 0;
        const sheetName = (sheet.name || "").toLowerCase();
        if (sheetName.includes("발송") || sheetName.includes("주문") || sheetName.includes("delivery") || sheetName.includes("sheet1")) {
          score += 5;
        }
        
        const scanRows = Math.min(15, sheet.rowCount || 15);
        for (let r = 1; r <= scanRows; r++) {
          const rowVal = sheet.getRow(r).values;
          if (Array.isArray(rowVal)) {
            const rowStr = rowVal.map(v => String(v || "")).join(" ").toLowerCase();
            if (rowStr.includes("주문번호")) score += 10;
            if (rowStr.includes("수취인명") || rowStr.includes("수령인") || rowStr.includes("수취인")) score += 8;
            if (rowStr.includes("상품명")) score += 5;
            if (rowStr.includes("송장번호") || rowStr.includes("운송장")) score += 10;
            if (rowStr.includes("택배사")) score += 5;
          }
        }

        if (score > maxScore) {
          maxScore = score;
          bestWs = sheet;
        }
      });

      ws = bestWs;
      if (ws) {
        loadedFromOriginal = true;
      }
    } catch (e) {
      console.warn("원본 엑셀 템플릿 로드 실패, 기본 방식 사용:", e);
    }
  }

  // 송장번호 열 및 택배사 열 결정 (플랫폼 설정값 1순위 절대 기준)
  const trackingColIdx = platform.tracking_col !== undefined ? (platform.tracking_col + 1) : 9;
  const courierColIdx = platform.courier_col !== undefined ? (platform.courier_col + 1) : undefined;

  if (loadedFromOriginal && ws) {
    // orders에 존재하는 rawIdx와 { trackingNumber, courierName } 맵 생성
    const trackingByRawIdx = new Map<number, { trackingNumber: string; courierName?: string }>();
    orders.forEach(o => {
      const rawIdx = Number(o.id);
      if (!isNaN(rawIdx) && o.trackingNumber) {
        trackingByRawIdx.set(rawIdx, {
          trackingNumber: o.trackingNumber,
          courierName: o.courierName
        });
      }
    });

    // trackingByRawIdx에 존재하는 모든 0-based rawIdx 항목에 대해 직접 1-based 행(rawIdx + 1)을 얻어 값 기입
    trackingByRawIdx.forEach((item, rawIdx) => {
      const rowNum = rawIdx + 1; // 1-based index
      const row = ws!.getRow(rowNum);

      if (item.trackingNumber && trackingColIdx) {
        const cell = row.getCell(trackingColIdx);
        cell.value = item.trackingNumber;
      }
      const courierToSet = item.courierName || defaultCourierName;
      if (courierToSet && courierColIdx) {
        const courierCell = row.getCell(courierColIdx);
        courierCell.value = courierToSet;
      }
      row.commit();
    });
  } else {
    // 원본 파일을 로드하지 못한 경우의 폴백 생성기
    ws = wb.addWorksheet('최종송장반영');
    const seenIds = new Set<string>();
    const rowsToSave: any[][] = [];

    const startRow = platform.start_row;
    for (let r = 0; r < startRow; r++) {
      rowsToSave.push(originalRows[r] || []);
    }

    orders.forEach(o => {
      const rawIdx = Number(o.id);
      const originalRow = [...(originalRows[rawIdx] || [])];
      
      const orderId = String(originalRow[0] || "").trim();
      
      if (orderId) {
        if (seenIds.has(orderId)) {
          return;
        }
        seenIds.add(orderId);
      }

      if (o.trackingNumber && trackingColIdx) {
        originalRow[trackingColIdx - 1] = o.trackingNumber;
      }
      const courierToSet = o.courierName || defaultCourierName;
      if (courierToSet && courierColIdx) {
        originalRow[courierColIdx - 1] = courierToSet;
      }
      
      rowsToSave.push(originalRow);
    });

    rowsToSave.forEach(row => {
      ws!.addRow(row);
    });

    ws.columns.forEach(col => {
      let maxLen = 0;
      col.eachCell!({ includeEmpty: false }, (cell) => {
        if (cell.value) {
          const length = String(cell.value).length;
          if (length > maxLen) maxLen = length;
        }
      });
      col.width = Math.max(10, maxLen + 1.5);
    });
  }

  // ----------------------------------------------------
  // F열(6번 열) 분리배송 'N' 중복 행 삭제 처리 (쿠팡/DeliveryList 합포장건 1개만 남기기)
  // 예: [분리배송불가, N, N, N, 분리배송불가] -> [분리배송불가, N, 분리배송불가]
  // ----------------------------------------------------
  if (ws) {
    const totalRows = ws.rowCount;
    const rowsToDelete: number[] = [];
    let seenNInGroup = false;
    let currentGroupKey = "";

    for (let r = 1; r <= totalRows; r++) {
      const row = ws.getRow(r);
      const valF = String(row.getCell(6).value || "").trim().toUpperCase();

      const colAKey = String(row.getCell(1).value || "").trim();

      const recipientKey = String(
        row.getCell(platform.col_map.수령인 !== undefined ? platform.col_map.수령인 + 1 : 2).value ||
        row.getCell(2).value || ""
      ).trim();

      const addrKey = String(
        row.getCell(platform.col_map.주소 !== undefined ? platform.col_map.주소 + 1 : 4).value || ""
      ).trim();

      // A열 번호가 제공된 경우 A열 번호를 그룹 키로 사용하고, 없으면 수령인+주소 조합 사용
      const groupKey = colAKey ? `ORDER_${colAKey}` : `${recipientKey}_${addrKey}`;

      if (groupKey !== currentGroupKey && recipientKey !== "") {
        currentGroupKey = groupKey;
        seenNInGroup = false;
      }

      if (valF === "N") {
        if (seenNInGroup) {
          // 이미 그룹 내에서 첫 번째 'N' 행을 하나 유지하였으므로 중복 'N' 행 삭제
          rowsToDelete.push(r);
        } else {
          // 그룹 내 첫 번째 'N' 행은 그대로 유지
          seenNInGroup = true;
        }
      }
    }

    if (rowsToDelete.length > 0) {
      for (let i = rowsToDelete.length - 1; i >= 0; i--) {
        ws.spliceRows(rowsToDelete[i], 1);
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const today = new Date().toISOString().slice(0, 10);
  const finalName = outputFileName || `DeliveryList_최종송장_${platform.id}_${today}.xlsx`;
  triggerDownload(blob, finalName);
}

// 아이프레임(Iframe) 및 다양한 브라우저 환경에서 안정적으로 다운로드를 수행하는 헬퍼 함수
export function triggerDownload(blob: Blob, fileName: string) {
  try {
    // 1차적으로 file-saver 사용 (가장 넓은 브라우저 및 iframe 호환성 제공)
    saveAs(blob, fileName);
  } catch (err) {
    console.error("file-saver saveAs failed, attempting standard anchor download:", err);
    try {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.target = '_self';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 다운로드가 완전히 시작될 수 있도록 URL 파괴 지연
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 60000);
    } catch (innerErr) {
      console.error("Anchor download also failed:", innerErr);
    }
  }
}
