import React, { useState, useEffect, useMemo } from 'react';
import { PlatformConfig, CourierConfig, ProcessedOrder, ValidationIssue } from '../types';
import { PLATFORM_PRESETS, COURIER_PRESETS } from '../utils/defaultData';
import { detectSecondaryOptionColumns, detectTrackingHeaderAndCourier } from '../utils/excelProcessor';
import { 
  Plus, Trash2, Edit3, Settings, HelpCircle, Save, ShoppingBag, Truck, AlertTriangle, 
  Search, Filter, CheckCircle2, RefreshCw, Zap, Table, Layers, ArrowRight, Upload, 
  ChevronDown, Check, Sparkles, FileText, Eye, Info, Grid, X
} from 'lucide-react';

// Excel Column Letter to 1-based Number (e.g. "A" -> 1, "AA" -> 27)
function letterToColNum(letter: string): number {
  let colNum = 0;
  const clean = letter.toUpperCase().replace(/[^A-Z]/g, '');
  for (let i = 0; i < clean.length; i++) {
    colNum = colNum * 26 + (clean.charCodeAt(i) - 64);
  }
  return colNum;
}

// 1-based Number to Excel Column Letter (e.g. 1 -> "A", 27 -> "AA")
function colNumToLetter(num: number): string {
  let letter = '';
  let temp = num;
  while (temp > 0) {
    const modulo = (temp - 1) % 26;
    letter = String.fromCharCode(65 + modulo) + letter;
    temp = Math.floor((temp - modulo) / 26);
  }
  return letter || '';
}

// Get column preview counterpart
function getColumnPreview(inputVal: string): { parsedZeroBased: number; displayPreview: string } {
  const clean = inputVal.trim().toUpperCase();
  if (!clean) {
    return { parsedZeroBased: 0, displayPreview: '' };
  }
  
  if (/^\d+$/.test(clean)) {
    const num = parseInt(clean, 10);
    if (num <= 0) {
      return { parsedZeroBased: 0, displayPreview: '→ A' };
    }
    const letter = colNumToLetter(num);
    return { parsedZeroBased: num - 1, displayPreview: `→ ${letter}` };
  } else {
    const letter = clean.replace(/[^A-Z]/g, '');
    if (!letter) {
      return { parsedZeroBased: 0, displayPreview: '' };
    }
    const num = letterToColNum(letter);
    return { parsedZeroBased: num - 1, displayPreview: `→ ${num}` };
  }
}

// 스마트 헤더 행 탐색 유틸리티
function findHeaderRowIndexInClient(rawRows: any[][], defaultStartRow: number): number {
  if (!rawRows || rawRows.length === 0) return 0;
  let bestRowIdx = Math.max(0, defaultStartRow - 1);
  let maxScore = -1;

  const keywords = [
    "주문번호", "상품명", "노출상품명", "등록상품명", "옵션", "옵션정보", "상세옵션",
    "수취인명", "수령인", "수령인명", "받는사람", "수취인",
    "연락처", "전화번호", "휴대폰번호", "우편번호", "주소", "배송지", "배송지주소",
    "구매수", "수량", "구매수량"
  ];

  const scanLimit = Math.min(15, rawRows.length);
  for (let r = 0; r < scanLimit; r++) {
    const row = rawRows[r] || [];
    let score = 0;

    row.forEach(cell => {
      const cellStr = String(cell || "").trim().toLowerCase().replace(/\s+/g, "");
      if (!cellStr) return;

      for (const kw of keywords) {
        const cleanKw = kw.toLowerCase().replace(/\s+/g, "");
        if (cellStr === cleanKw) {
          score += 10;
        } else if (cellStr.includes(cleanKw) && cellStr.length <= cleanKw.length + 6) {
          score += 1;
        }
      }
    });

    if (score > maxScore) {
      maxScore = score;
      bestRowIdx = r;
    }
  }

  if (maxScore < 8) {
    return Math.max(0, defaultStartRow - 1);
  }

  return bestRowIdx;
}

export interface ParsedFileInfo {
  fileName: string;
  file?: File;
  originalBuffer?: any;
  detectedPlatform: PlatformConfig;
  orders: ProcessedOrder[];
  rawRows: any[][];
  headers: any[];
  newRawItems: string[];
  validationIssues?: ValidationIssue[];
}

export interface ParsedTrackingFileInfo {
  fileName: string;
  file?: File;
  detectedCourier: string;
  rawRows: any[][];
  count: number;
}

interface PlatformSettingsProps {
  platforms: PlatformConfig[];
  onChange: (updated: PlatformConfig[]) => void;
  couriers: CourierConfig[];
  onCouriersChange: (updated: CourierConfig[]) => void;
  parsedFiles?: ParsedFileInfo[];
  parsedTrackingFiles?: ParsedTrackingFileInfo[];
  onFilePlatformChange?: (fileName: string, platformId: string, updatedPlatforms?: PlatformConfig[]) => void;
  onFileCourierChange?: (fileName: string, courierName: string) => void;
  onNavigateToProcessTab?: () => void;
  onReProcessOrders?: () => void;
  initialMatrixType?: 'platform' | 'courier';
}

export default function PlatformSettings({ 
  platforms, 
  onChange, 
  couriers, 
  onCouriersChange,
  parsedFiles = [],
  parsedTrackingFiles = [],
  onFilePlatformChange,
  onFileCourierChange,
  onNavigateToProcessTab,
  onReProcessOrders,
  initialMatrixType = 'platform'
}: PlatformSettingsProps) {
  // 톱니바퀴 모달 팝업 상태
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [modalTab, setModalTab] = useState<'platform' | 'courier'>('platform');

  // 현재 감지된 헤더 세팅으로 새 양식 추가 모달 상태
  const [showSaveAsNewModal, setShowSaveAsNewModal] = useState<boolean>(false);
  const [newPlatformNameInput, setNewPlatformNameInput] = useState<string>('');
  const [newPlatformPatternInput, setNewPlatformPatternInput] = useState<string>('');

  // --- 1. 열 감지 & 매핑 한눈에 보기 GUI 상태 ---
  const [matrixType, setMatrixType] = useState<'platform' | 'courier'>(initialMatrixType);

  useEffect(() => {
    if (initialMatrixType) {
      setMatrixType(initialMatrixType);
    }
  }, [initialMatrixType]);
  const [selectedFileIdx, setSelectedFileIdx] = useState<number>(0);
  const [selectedTrackingFileIdx, setSelectedTrackingFileIdx] = useState<number>(0);
  const [selectedCourierId, setSelectedCourierId] = useState<string>('');
  const [keywordSearch, setKeywordSearch] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // --- 2. 쇼핑몰 플랫폼 편집 상태 ---
  const [editingPlatform, setEditingPlatform] = useState<PlatformConfig | null>(null);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [deletingPlatform, setDeletingPlatform] = useState<PlatformConfig | null>(null);

  const [startRowInput, setStartRowInput] = useState<string>('');
  const [trackingColInput, setTrackingColInput] = useState<string>('');
  const [courierColInput, setCourierColInput] = useState<string>('');
  const [colMapInputs, setColMapInputs] = useState<Record<string, string>>({});

  // --- 3. 택배사 상태 ---
  const [editingCourier, setEditingCourier] = useState<CourierConfig | null>(null);
  const [showCourierPresetModal, setShowCourierPresetModal] = useState(false);
  const [deletingCourier, setDeletingCourier] = useState<CourierConfig | null>(null);

  const [showSaveAsNewCourierModal, setShowSaveAsNewCourierModal] = useState<boolean>(false);
  const [newCourierNameInput, setNewCourierNameInput] = useState<string>('');
  const [newCourierPatternInput, setNewCourierPatternInput] = useState<string>('');

  const [courierStartRowInput, setCourierStartRowInput] = useState<string>('');
  const [courierColInputs, setCourierColInputs] = useState<Record<string, string>>({});

  // 쇼핑몰 선택 시 로컬 입력 동기화
  useEffect(() => {
    if (editingPlatform) {
      setStartRowInput(String(editingPlatform.start_row + 1));
      setTrackingColInput(colNumToLetter(editingPlatform.tracking_col + 1));
      setCourierColInput(editingPlatform.courier_col !== undefined ? colNumToLetter(editingPlatform.courier_col + 1) : '');
      
      const newColMapInputs: Record<string, string> = {};
      Object.entries(editingPlatform.col_map).forEach(([field, val]) => {
        newColMapInputs[field] = colNumToLetter((val as number) + 1);
      });
      setColMapInputs(newColMapInputs);
    } else {
      setStartRowInput('');
      setTrackingColInput('');
      setCourierColInput('');
      setColMapInputs({});
    }
  }, [editingPlatform?.id]);

  // 택배사 선택 시 로컬 입력 동기화
  useEffect(() => {
    if (editingCourier) {
      setCourierStartRowInput(String(editingCourier.start_row + 1));
      setCourierColInputs({
        tracking_col: colNumToLetter(editingCourier.tracking_col + 1),
        courier_col: editingCourier.courier_col !== undefined ? colNumToLetter(editingCourier.courier_col + 1) : '',
        name_col: colNumToLetter(editingCourier.name_col + 1),
        phone_col: colNumToLetter(editingCourier.phone_col + 1),
        zip_col: colNumToLetter(editingCourier.zip_col + 1),
        addr_col: colNumToLetter(editingCourier.addr_col + 1),
        prod_col: colNumToLetter(editingCourier.prod_col + 1),
        unit_col: colNumToLetter(editingCourier.unit_col + 1),
        qty_col: colNumToLetter(editingCourier.qty_col + 1)
      });
    } else {
      setCourierStartRowInput('');
      setCourierColInputs({});
    }
  }, [editingCourier?.id]);

  // 모달창 ESC 키로 닫기 및 Enter 처리
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSaveAsNewModal) {
          setShowSaveAsNewModal(false);
          return;
        }
        if (showSaveAsNewCourierModal) {
          setShowSaveAsNewCourierModal(false);
          return;
        }
        if (showSettingsModal) {
          setShowSettingsModal(false);
          return;
        }
        if (showPresetModal) {
          setShowPresetModal(false);
          return;
        }
        if (showCourierPresetModal) {
          setShowCourierPresetModal(false);
          return;
        }
        if (deletingPlatform) {
          setDeletingPlatform(null);
          return;
        }
        if (deletingCourier) {
          setDeletingCourier(null);
          return;
        }
        if (editingPlatform) {
          setEditingPlatform(null);
          return;
        }
        if (editingCourier) {
          setEditingCourier(null);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showSaveAsNewModal,
    showSettingsModal,
    showPresetModal,
    showCourierPresetModal,
    deletingPlatform,
    deletingCourier,
    editingPlatform,
    editingCourier
  ]);

  // 활성화된 업로드 파일 및 헤더 파싱 결과
  const activeFile = useMemo(() => {
    if (!parsedFiles || parsedFiles.length === 0) return null;
    return parsedFiles[Math.min(selectedFileIdx, parsedFiles.length - 1)] || parsedFiles[0];
  }, [parsedFiles, selectedFileIdx]);

  // 해당 파일의 바인딩된 플랫폼 설정
  const activePlatform = useMemo(() => {
    if (activeFile?.detectedPlatform) {
      return platforms.find(p => p.id === activeFile.detectedPlatform.id) || activeFile.detectedPlatform;
    }
    return platforms[0] || null;
  }, [activeFile, platforms]);

  // 해당 엑셀 파일의 헤더 행 인덱스 및 헤더 배열
  const { headerRowIndex, rawHeaders, previewRows } = useMemo(() => {
    if (!activeFile || !activeFile.rawRows || activeFile.rawRows.length === 0) {
      return { headerRowIndex: 0, rawHeaders: [], previewRows: [] };
    }
    const hIdx = findHeaderRowIndexInClient(activeFile.rawRows, activePlatform?.start_row || 1);
    const headers = (activeFile.headers && activeFile.headers.length > 0)
      ? activeFile.headers
      : (activeFile.rawRows[hIdx] ? activeFile.rawRows[hIdx] : []);
    
    // 헤더 포함 데이터 행 샘플 (최대 6행)
    const preview = activeFile.rawRows.slice(hIdx, Math.min(hIdx + 7, activeFile.rawRows.length));
    
    return {
      headerRowIndex: hIdx,
      rawHeaders: headers,
      previewRows: preview
    };
  }, [activeFile, activePlatform]);

  // 기본 양식 또는 미등록 양식인 경우 엑셀 헤더 감지 시 자동 스마트 매칭 실행 (스마트 매칭 버튼 누르지 않아도 기본 1회 자동 적용)
  useEffect(() => {
    if (!rawHeaders || rawHeaders.length === 0) return;

    const platToMatch = editingPlatform || activePlatform;
    if (!platToMatch) return;

    const isDefaultOrUnregistered = 
      platToMatch.id === 'default_platform' || 
      platToMatch.id.startsWith('unregistered') || 
      platToMatch.name.includes('기본') ||
      platToMatch.name.includes('미등록');

    if (!isDefaultOrUnregistered) return;

    const findIndexForKeywords = (keywords: string[]): number => {
      const headers = rawHeaders.map((h: any) => String(h || "").trim().toLowerCase().replace(/\s+/g, ""));
      for (const kw of keywords) {
        const cleanKw = kw.toLowerCase().replace(/\s+/g, "");
        const exactIdx = headers.findIndex(h => h === cleanKw);
        if (exactIdx !== -1) return exactIdx;
      }
      for (const kw of keywords) {
        const cleanKw = kw.toLowerCase().replace(/\s+/g, "");
        const partialIdx = headers.findIndex(h => h.includes(cleanKw));
        if (partialIdx !== -1) return partialIdx;
      }
      return -1;
    };

    const keywordMap: Record<string, string[]> = {
      상품명: ["노출상품명", "상품명", "상품명(노출상품명)", "등록상품명", "품목명", "주문상품명", "상품", "제품명", "상품 정보", "주문상품", "상품/옵션"],
      용량: ["등록옵션명", "옵션명", "옵션정보", "상세옵션", "옵션", "상품상세", "규격", "단위", "품목옵션", "선택옵션", "옵션내용"],
      수량: ["구매수량", "구매수", "수량", "수량(고정)", "주문수량", "개수", "발주수량"],
      수령인: ["수취인명", "수령인명", "수령인", "받는사람", "수취인", "받는분", "수령자", "성명", "주문자명", "고객명"],
      연락처: ["수취인이동전화번호", "수취인연락처", "연락처", "전화번호", "휴대폰번호", "수취인전화번호", "수취인 연락처1", "수령인연락처", "수령인전화번호", "휴대폰"],
      우편번호: ["우편번호", "수취인우편번호", "배송지우편번호", "수령인우편번호", "우편 번호"],
      주소: ["수취인주소", "배송지주소", "배송지", "주소", "수취인 주소", "배송지 주소", "배송주소", "수령인지주소", "기본주소"],
      배송메시지: ["배송메세지", "배송메시지", "배송요청사항", "배송메세지1", "배송 메모", "메모", "요청사항"]
    };

    const updatedColMap = { ...platToMatch.col_map };
    let changed = false;

    Object.keys(keywordMap).forEach(key => {
      const idx = findIndexForKeywords(keywordMap[key]);
      if (idx !== -1 && (updatedColMap as any)[key] !== idx) {
        (updatedColMap as any)[key] = idx;
        changed = true;
      }
    });

    const trackingIdx = findIndexForKeywords(["운송장번호", "송장번호", "운송장 번호", "송장 번호", "등기번호", "송장"]);
    const courierIdx = findIndexForKeywords(["택배사명", "택배사 명", "택배사", "배송업체", "택배사코드", "택배"]);

    const newTrackingCol = trackingIdx !== -1 ? trackingIdx : platToMatch.tracking_col;
    const newCourierCol = courierIdx !== -1 ? courierIdx : platToMatch.courier_col;

    if (changed || newTrackingCol !== platToMatch.tracking_col || newCourierCol !== platToMatch.courier_col) {
      const updatedPlatforms = platforms.map(p => {
        if (p.id !== platToMatch.id) return p;
        return {
          ...p,
          col_map: updatedColMap,
          tracking_col: newTrackingCol,
          courier_col: newCourierCol
        };
      });
      onChange(updatedPlatforms);

      if (editingPlatform && editingPlatform.id === platToMatch.id) {
        setEditingPlatform(prev => prev ? {
          ...prev,
          col_map: updatedColMap,
          tracking_col: newTrackingCol,
          courier_col: newCourierCol
        } : prev);

        const newColMapInputs: Record<string, string> = {};
        Object.entries(updatedColMap).forEach(([field, val]) => {
          newColMapInputs[field] = colNumToLetter((val as number) + 1);
        });
        setColMapInputs(newColMapInputs);
        setTrackingColInput(colNumToLetter(newTrackingCol + 1));
        if (newCourierCol !== undefined) {
          setCourierColInput(colNumToLetter(newCourierCol + 1));
        }
      }
    }
  }, [editingPlatform?.id, activePlatform?.id, rawHeaders]);

  // 보조 단위/규격/옵션 열 자동 감지 정보 (실시간 확장을 눈으로 파악 가능)
  const secondaryColsInfo = useMemo(() => {
    if (!rawHeaders || rawHeaders.length === 0 || !activePlatform) return [];
    const primaryUnitCol = activePlatform.col_map.용량;
    const otherCols = [
      activePlatform.col_map.상품명,
      activePlatform.col_map.수량,
      activePlatform.col_map.수령인,
      activePlatform.col_map.연락처,
      activePlatform.col_map.주소,
      activePlatform.col_map.우편번호,
      activePlatform.col_map.배송메시지
    ];
    const detectedCols = detectSecondaryOptionColumns(rawHeaders, primaryUnitCol, otherCols);
    return detectedCols.map(idx => ({
      index: idx,
      letter: colNumToLetter(idx + 1),
      headerName: String(rawHeaders[idx] || '').trim() || `${colNumToLetter(idx + 1)}열`
    }));
  }, [rawHeaders, activePlatform]);

  // 전체 엑셀 열 옵션 리스트
  const allHeaderColumns = useMemo(() => {
    if (!rawHeaders || rawHeaders.length === 0) return [];
    return rawHeaders.map((h: any, colIdx: number) => ({
      index: colIdx,
      letter: colNumToLetter(colIdx + 1),
      displayLabel: `[${colNumToLetter(colIdx + 1)}열] ${String(h || '').trim() || '(헤더명 없음)'}`,
      headerText: String(h || '').trim()
    }));
  }, [rawHeaders]);

  // 키워드 검색("키워드로 원하는 열 찾기") 필터링 결과
  const filteredColumns = useMemo(() => {
    if (!keywordSearch.trim()) return [];
    const q = keywordSearch.trim().toLowerCase();
    return allHeaderColumns.filter(c => 
      c.headerText.toLowerCase().includes(q) ||
      c.letter.toLowerCase() === q ||
      (c.index + 1).toString() === q
    );
  }, [keywordSearch, allHeaderColumns]);

  // 열 세팅 일괄 변경 처리 함수
  const handleUpdateColumnMapping = (targetPlatformId: string, fieldKey: string, newColIndex: number) => {
    const updatedPlatforms = platforms.map(p => {
      if (p.id !== targetPlatformId) return p;
      if (fieldKey === 'tracking_col') {
        return { ...p, tracking_col: newColIndex };
      } else if (fieldKey === 'courier_col') {
        return { ...p, courier_col: newColIndex };
      } else {
        return {
          ...p,
          col_map: {
            ...p.col_map,
            [fieldKey]: newColIndex
          }
        };
      }
    });

    onChange(updatedPlatforms);

    if (editingPlatform && editingPlatform.id === targetPlatformId) {
      if (fieldKey === 'tracking_col') {
        setEditingPlatform(prev => prev ? { ...prev, tracking_col: newColIndex } : null);
      } else if (fieldKey === 'courier_col') {
        setEditingPlatform(prev => prev ? { ...prev, courier_col: newColIndex } : null);
      } else {
        setEditingPlatform(prev => prev ? {
          ...prev,
          col_map: { ...prev.col_map, [fieldKey]: newColIndex }
        } : null);
      }
    }

    if (onReProcessOrders) {
      onReProcessOrders();
    }

    const colLetter = colNumToLetter(newColIndex + 1);
    setToastMessage(`[${fieldKey}] 필드가 ${colLetter}열(${newColIndex + 1}번째)로 저장되어 가공이 재적용되었습니다.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 쇼핑몰 핸들러들
  const handleStartRowChange = (val: string) => {
    setStartRowInput(val);
    const parsedRow = parseInt(val, 10);
    if (!isNaN(parsedRow) && parsedRow > 0) {
      setEditingPlatform(prev => prev ? { ...prev, start_row: parsedRow - 1 } : null);
    }
  };

  const handleTrackingColChange = (val: string) => {
    setTrackingColInput(val);
    const { parsedZeroBased } = getColumnPreview(val);
    setEditingPlatform(prev => prev ? { ...prev, tracking_col: parsedZeroBased } : null);
  };

  const handleCourierColChange = (val: string) => {
    setCourierColInput(val);
    if (!val.trim()) {
      setEditingPlatform(prev => prev ? { ...prev, courier_col: undefined } : null);
    } else {
      const { parsedZeroBased } = getColumnPreview(val);
      setEditingPlatform(prev => prev ? { ...prev, courier_col: parsedZeroBased } : null);
    }
  };

  const handleColMapChange = (field: string, val: string) => {
    setColMapInputs(prev => ({ ...prev, [field]: val }));
    const { parsedZeroBased } = getColumnPreview(val);
    setEditingPlatform(prev => {
      if (!prev) return null;
      return {
        ...prev,
        col_map: {
          ...prev.col_map,
          [field]: parsedZeroBased
        }
      };
    });
  };

  const savePlatform = (updated: PlatformConfig) => {
    const exists = platforms.some(p => p.id === updated.id);
    if (exists) {
      onChange(platforms.map(p => p.id === updated.id ? updated : p));
    } else {
      onChange([...platforms, updated]);
    }
    setEditingPlatform(null);
  };

  // 현재 스마트 감지된 헤더를 신규 쇼핑몰 양식으로 등록 처리
  const handleSaveAsNewPlatformSubmit = () => {
    if (!newPlatformNameInput.trim()) {
      alert('등록할 쇼핑몰 이름을 입력해주세요.');
      return;
    }

    const newPlatId = 'custom_plat_' + Date.now();
    const newConfig: PlatformConfig = {
      id: newPlatId,
      name: newPlatformNameInput.trim(),
      identifier: '',
      start_row: activePlatform?.start_row ?? 1,
      col_map: { ...(activePlatform?.col_map || { 용량: 0, 상품명: 1, 수량: 2, 수령인: 3, 연락처: 4, 우편번호: 5, 주소: 6, 배송메시지: 7 }) },
      tracking_col: activePlatform?.tracking_col ?? 8,
      courier_col: activePlatform?.courier_col,
      filepath_pattern: newPlatformPatternInput.trim()
    };

    const updatedPlatforms = [...platforms, newConfig];
    onChange(updatedPlatforms);

    if (activeFile && onFilePlatformChange) {
      onFilePlatformChange(activeFile.fileName, newPlatId, updatedPlatforms);
    }

    setShowSaveAsNewModal(false);
    setToastMessage(` [${newConfig.name}] 쇼핑몰 양식이 추가되어 연동되었습니다!`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 엑셀 헤더를 읽어서 목적 정보(상품명, 수량, 수령인, 연락처, 주소, 송장, 택배사 등) 자동 매칭 실행
  const handleAutoMatchHeaders = () => {
    if (!activeFile || !rawHeaders || rawHeaders.length === 0 || !activePlatform) {
      alert('분석할 엑셀 파일이 없거나 헤더를 읽어오지 못했습니다.');
      return;
    }

    const findIndexForKeywords = (keywords: string[]): number => {
      const headers = rawHeaders.map((h: any) => String(h || "").trim().toLowerCase().replace(/\s+/g, ""));
      // 1. 완전 정밀 일치
      for (const kw of keywords) {
        const cleanKw = kw.toLowerCase().replace(/\s+/g, "");
        const idx = headers.findIndex(h => h === cleanKw);
        if (idx !== -1) return idx;
      }
      // 2. 키워드 포함 일치
      for (const kw of keywords) {
        const cleanKw = kw.toLowerCase().replace(/\s+/g, "");
        const idx = headers.findIndex(h => h.includes(cleanKw));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const keywordMap: Record<string, string[]> = {
      상품명: ["노출상품명", "상품명", "상품명(노출상품명)", "등록상품명", "품목명", "주문상품명", "상품", "제품명", "상품 정보", "주문상품", "상품/옵션"],
      용량: ["등록옵션명", "옵션명", "옵션정보", "상세옵션", "옵션", "상품상세", "규격", "단위", "품목옵션", "선택옵션", "옵션내용"],
      수량: ["구매수량", "구매수", "수량", "수량(고정)", "주문수량", "개수", "발주수량"],
      수령인: ["수취인명", "수령인명", "수령인", "받는사람", "수취인", "받는분", "수령자", "성명", "주문자명", "고객명"],
      연락처: ["수취인이동전화번호", "수취인연락처", "연락처", "전화번호", "휴대폰번호", "수취인전화번호", "수취인 연락처1", "수령인연락처", "수령인전화번호", "휴대폰"],
      우편번호: ["우편번호", "수취인우편번호", "배송지우편번호", "수령인우편번호", "우편 번호"],
      주소: ["수취인주소", "배송지주소", "배송지", "주소", "수취인 주소", "배송지 주소", "배송주소", "수령인지주소", "기본주소"],
      배송메시지: ["배송메세지", "배송메시지", "배송요청사항", "배송메세지1", "배송 메모", "메모", "요청사항"]
    };

    const updatedColMap = { ...activePlatform.col_map };
    let matchedCount = 0;

    Object.keys(keywordMap).forEach(key => {
      const idx = findIndexForKeywords(keywordMap[key]);
      if (idx !== -1) {
        (updatedColMap as any)[key] = idx;
        matchedCount++;
      }
    });

    const trackingIdx = findIndexForKeywords(["운송장번호", "송장번호", "운송장 번호", "송장 번호", "등기번호", "송장"]);
    const courierIdx = findIndexForKeywords(["택배사명", "택배사 명", "택배사", "배송업체", "택배사코드", "택배"]);

    const newTrackingCol = trackingIdx !== -1 ? trackingIdx : activePlatform.tracking_col;
    const newCourierCol = courierIdx !== -1 ? courierIdx : activePlatform.courier_col;

    const updatedPlatforms = platforms.map(p => {
      if (p.id !== activePlatform.id) return p;
      return {
        ...p,
        col_map: updatedColMap,
        tracking_col: newTrackingCol,
        courier_col: newCourierCol
      };
    });

    onChange(updatedPlatforms);

    if (editingPlatform && editingPlatform.id === activePlatform.id) {
      setEditingPlatform({
        ...editingPlatform,
        col_map: updatedColMap,
        tracking_col: newTrackingCol,
        courier_col: newCourierCol
      });
      setTrackingColInput(colNumToLetter(newTrackingCol + 1));
      if (newCourierCol !== undefined) {
        setCourierColInput(colNumToLetter(newCourierCol + 1));
      }
      const newColMapInputs: Record<string, string> = {};
      Object.entries(updatedColMap).forEach(([field, val]) => {
        newColMapInputs[field] = colNumToLetter((val as number) + 1);
      });
      setColMapInputs(newColMapInputs);
    }

    if (activeFile && onFilePlatformChange) {
      onFilePlatformChange(activeFile.fileName, activePlatform.id, updatedPlatforms);
    }

    if (onReProcessOrders) onReProcessOrders();

    setToastMessage(` 엑셀 헤더 스캔 완료! ${matchedCount}개 목적 컬럼이 헤더와 자동 매칭되었습니다.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 감지/선택된 쇼핑몰 양식에 최신 스마트 매칭/설정 덮어씌우기
  const handleOverwriteActivePlatform = () => {
    if (!activePlatform || !activeFile) {
      alert('덮어씌울 쇼핑몰 양식 또는 파싱 파일이 선택되지 않았습니다.');
      return;
    }

    if (activePlatform.id.startsWith('unregistered')) {
      alert('현재 선택된 양식은 미등록 양식입니다. "이 헤더 구조로 새 쇼핑몰 양식 등록" 버튼을 눌러 먼저 등록해주세요.');
      return;
    }

    const updatedPlatforms = platforms.map(p => {
      if (p.id !== activePlatform.id) return p;
      return {
        ...p,
        col_map: { ...activePlatform.col_map },
        tracking_col: activePlatform.tracking_col,
        courier_col: activePlatform.courier_col
      };
    });

    onChange(updatedPlatforms);

    if (onFilePlatformChange) {
      onFilePlatformChange(activeFile.fileName, activePlatform.id, updatedPlatforms);
    }

    if (onReProcessOrders) {
      onReProcessOrders();
    }

    setToastMessage(` [${activePlatform.name}] 쇼핑몰 열 매핑 설정이 최신 상태로 덮어씌워졌으며 1단계 주문서에 즉시 적용되었습니다!`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const executeDeletePlatform = (id: string) => {
    onChange(platforms.filter(p => p.id !== id));
    if (editingPlatform?.id === id) {
      setEditingPlatform(null);
    }
    setDeletingPlatform(null);
  };

  const applyPreset = (preset: typeof PLATFORM_PRESETS[0]) => {
    const newId = preset.id.replace('_preset', '') + '_' + Date.now();
    const newConfig: PlatformConfig = {
      id: newId,
      name: preset.name + ' (복사본)',
      identifier: '',
      start_row: preset.config.start_row,
      col_map: { ...preset.config.col_map },
      tracking_col: preset.config.tracking_col,
      filepath_pattern: preset.config.filepath_pattern
    };
    setEditingPlatform(newConfig);
    setShowPresetModal(false);
  };

  const createEmptyPlatform = () => {
    const newConfig: PlatformConfig = {
      id: 'custom_' + Date.now(),
      name: '새로운 배송 플랫폼',
      identifier: '',
      start_row: 1,
      col_map: {
        용량: 0,
        상품명: 1,
        수량: 2,
        수령인: 3,
        연락처: 4,
        우편번호: 5,
        주소: 6,
        배송메시지: 7
      },
      tracking_col: 8,
      filepath_pattern: "input/*.xlsx"
    };
    setEditingPlatform(newConfig);
    setShowPresetModal(false);
  };

  // 택배사 핸들러들
  const handleCourierStartRowChange = (val: string) => {
    setCourierStartRowInput(val);
    const parsedRow = parseInt(val, 10);
    if (!isNaN(parsedRow) && parsedRow > 0) {
      setEditingCourier(prev => prev ? { ...prev, start_row: parsedRow - 1 } : null);
    }
  };

  const handleCourierFieldChange = (field: keyof Omit<CourierConfig, 'id' | 'name' | 'filepath_pattern' | 'start_row'>, val: string) => {
    setCourierColInputs(prev => ({ ...prev, [field]: val }));
    if (!val.trim() && field === 'courier_col') {
      setEditingCourier(prev => prev ? { ...prev, courier_col: undefined } : null);
      return;
    }
    const { parsedZeroBased } = getColumnPreview(val);
    setEditingCourier(prev => {
      if (!prev) return null;
      return {
        ...prev,
        [field]: parsedZeroBased
      };
    });
  };

  const saveCourier = (updated: CourierConfig) => {
    const exists = couriers.some(c => c.id === updated.id);
    if (exists) {
      onCouriersChange(couriers.map(c => c.id === updated.id ? updated : c));
    } else {
      onCouriersChange([...couriers, updated]);
    }
    setEditingCourier(null);
  };

  const executeDeleteCourier = (id: string) => {
    onCouriersChange(couriers.filter(c => c.id !== id));
    if (editingCourier?.id === id) {
      setEditingCourier(null);
    }
    setDeletingCourier(null);
  };

  const applyCourierPreset = (preset: typeof COURIER_PRESETS[0]) => {
    const newId = preset.id.replace('_preset', '') + '_' + Date.now();
    const newConfig: CourierConfig = {
      id: newId,
      name: preset.name.replace(' 표준 템플릿', ''),
      start_row: preset.config.start_row,
      tracking_col: preset.config.tracking_col,
      courier_col: preset.config.courier_col,
      name_col: preset.config.name_col,
      phone_col: preset.config.phone_col,
      zip_col: preset.config.zip_col,
      addr_col: preset.config.addr_col,
      prod_col: preset.config.prod_col,
      unit_col: preset.config.unit_col,
      qty_col: preset.config.qty_col
    };
    setEditingCourier(newConfig);
    setShowCourierPresetModal(false);
  };

  const createEmptyCourier = () => {
    const newConfig: CourierConfig = {
      id: 'courier_' + Date.now(),
      name: '신규 택배사',
      start_row: 1,
      tracking_col: 1,
      courier_col: 0,
      name_col: 3,
      phone_col: 5,
      zip_col: 6,
      addr_col: 7,
      prod_col: 8,
      unit_col: 9,
      qty_col: 10
    };
    setEditingCourier(newConfig);
    setShowCourierPresetModal(false);
  };

  // 주요 타겟 필드 정의 (10가지 정보 - 쇼핑몰용)
  const TARGET_FIELDS = [
    { key: '상품명', label: '상품명', icon: '', badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200', description: '주문 상품 이름' },
    { key: '용량', label: '용량 / 옵션명', icon: '', badgeBg: 'bg-blue-100 text-blue-800 border-blue-200', description: '상세 옵션 및 수량단위' },
    { key: '수량', label: '주문 수량', icon: '', badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200', description: '구매 개수' },
    { key: '수령인', label: '수령인 (받는사람)', icon: '', badgeBg: 'bg-purple-100 text-purple-800 border-purple-200', description: '수취인 성명' },
    { key: '연락처', label: '연락처 (전화번호)', icon: '', badgeBg: 'bg-amber-100 text-amber-800 border-amber-200', description: '휴대폰 및 전화번호' },
    { key: '우편번호', label: '우편번호', icon: '', badgeBg: 'bg-cyan-100 text-cyan-800 border-cyan-200', description: '배송지 5자리 우편번호' },
    { key: '주소', label: '배송지 주소', icon: '', badgeBg: 'bg-rose-100 text-rose-800 border-rose-200', description: '기본 및 상세주소' },
    { key: '배송메시지', label: '배송 메시지', icon: '', badgeBg: 'bg-slate-100 text-slate-800 border-slate-200', description: '배송요청 메모' },
    { key: 'tracking_col', label: '운송장번호 기입열', icon: '', badgeBg: 'bg-violet-100 text-violet-800 border-violet-200', description: '송장 기입할 열' },
    { key: 'courier_col', label: '택배사명 기입열', icon: '', badgeBg: 'bg-teal-100 text-teal-800 border-teal-200', description: '택배사 기입할 열' },
  ] as const;

  // 택배사 매트릭스 타겟 필드 정의 (9가지 정보 - 2단계 택배사용)
  const COURIER_TARGET_FIELDS = [
    { key: 'tracking_col', label: '운송장번호 열', icon: '', badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200', description: '운송장번호 위치 (필수)' },
    { key: 'name_col', label: '수령인 (받는사람)', icon: '', badgeBg: 'bg-purple-100 text-purple-800 border-purple-200', description: '수취인 성명 위치' },
    { key: 'phone_col', label: '연락처 (전화번호)', icon: '', badgeBg: 'bg-amber-100 text-amber-800 border-amber-200', description: '전화/휴대폰번호 위치' },
    { key: 'zip_col', label: '우편번호', icon: '', badgeBg: 'bg-cyan-100 text-cyan-800 border-cyan-200', description: '우편번호 5자리 위치' },
    { key: 'addr_col', label: '배송지 주소', icon: '', badgeBg: 'bg-rose-100 text-rose-800 border-rose-200', description: '배송지 주소 위치' },
    { key: 'prod_col', label: '상품명', icon: '', badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200', description: '상품/품목명 위치' },
    { key: 'unit_col', label: '옵션 / 규격', icon: '', badgeBg: 'bg-blue-100 text-blue-800 border-blue-200', description: '옵션/용량/규격 위치' },
    { key: 'qty_col', label: '수량', icon: '', badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200', description: '구매 개수 위치' },
    { key: 'courier_col', label: '택배사명 지정열', icon: '', badgeBg: 'bg-teal-100 text-teal-800 border-teal-200', description: '택배사명 표시열' },
  ] as const;

  // 2단계 택배사 관련 활성 파일 및 택배사 설정
  const activeTrackingFile = useMemo(() => {
    if (!parsedTrackingFiles || parsedTrackingFiles.length === 0) return null;
    return parsedTrackingFiles[Math.min(selectedTrackingFileIdx, parsedTrackingFiles.length - 1)] || parsedTrackingFiles[0];
  }, [parsedTrackingFiles, selectedTrackingFileIdx]);

  const activeCourier = useMemo(() => {
    if (selectedCourierId) {
      return couriers.find(c => c.id === selectedCourierId || c.name === selectedCourierId) || couriers[0];
    }
    if (activeTrackingFile?.detectedCourier) {
      return couriers.find(c => c.name === activeTrackingFile.detectedCourier || c.id === activeTrackingFile.detectedCourier) || couriers[0];
    }
    return couriers[0] || null;
  }, [couriers, selectedCourierId, activeTrackingFile]);

  // 2단계 택배사 엑셀의 헤더 및 데이터 행 파싱 정보
  const trackingHeaderInfo = useMemo(() => {
    if (!activeTrackingFile || !activeTrackingFile.rawRows || activeTrackingFile.rawRows.length === 0) {
      return { headerRowIndex: 0, rawHeaders: [], previewRows: [], colMap: null };
    }
    const detection = detectTrackingHeaderAndCourier(activeTrackingFile.rawRows, activeTrackingFile.fileName, couriers, activeCourier?.name);
    const hIdx = detection.headerRowIndex;
    const headers = detection.headers && detection.headers.length > 0 ? detection.headers : (activeTrackingFile.rawRows[hIdx] || []);
    const preview = activeTrackingFile.rawRows.slice(hIdx, Math.min(hIdx + 7, activeTrackingFile.rawRows.length));
    return {
      headerRowIndex: hIdx,
      rawHeaders: headers,
      previewRows: preview,
      colMap: detection.colMap
    };
  }, [activeTrackingFile, couriers, activeCourier]);

  // 택배사 매핑 세팅 수동 업데이트 핸들러
  const handleUpdateCourierColumnMapping = (targetCourierId: string, fieldKey: string, newColIndex: number) => {
    const updatedCouriers = couriers.map(c => {
      if (c.id !== targetCourierId && c.name !== targetCourierId) return c;
      return {
        ...c,
        [fieldKey]: newColIndex < 0 ? undefined : newColIndex
      };
    });

    onCouriersChange(updatedCouriers);

    if (editingCourier && (editingCourier.id === targetCourierId || editingCourier.name === targetCourierId)) {
      setEditingCourier(prev => prev ? {
        ...prev,
        [fieldKey]: newColIndex < 0 ? undefined : newColIndex
      } : null);
    }

    const colLetter = newColIndex >= 0 ? colNumToLetter(newColIndex + 1) : '미지정';
    setToastMessage(`[${fieldKey}] 필드가 ${colLetter}열로 택배사 설정에 저장되었습니다.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 택배사 헤더 자동 스마트 매칭 핸들러
  const handleAutoMatchCourierHeaders = () => {
    if (!activeTrackingFile || !activeTrackingFile.rawRows || activeTrackingFile.rawRows.length === 0 || !activeCourier) {
      alert('분석할 운송장 엑셀 파일이 없거나 택배사를 선택하지 못했습니다.');
      return;
    }

    const detection = detectTrackingHeaderAndCourier(activeTrackingFile.rawRows, activeTrackingFile.fileName, couriers, activeCourier.name);
    const { colMap } = detection;

    const updatedCouriers = couriers.map(c => {
      if (c.id !== activeCourier.id && c.name !== activeCourier.id) return c;
      return {
        ...c,
        tracking_col: colMap.track !== -1 ? colMap.track : c.tracking_col,
        name_col: colMap.name !== -1 ? colMap.name : c.name_col,
        zip_col: colMap.zip !== -1 ? colMap.zip : c.zip_col,
        phone_col: colMap.phone !== -1 ? colMap.phone : c.phone_col,
        prod_col: colMap.prod !== -1 ? colMap.prod : c.prod_col,
        qty_col: colMap.qty !== -1 ? colMap.qty : c.qty_col,
        unit_col: colMap.unit !== -1 ? colMap.unit : c.unit_col,
        courier_col: colMap.courier !== -1 ? colMap.courier : c.courier_col,
        addr_col: colMap.addr !== -1 ? colMap.addr : c.addr_col
      };
    });

    onCouriersChange(updatedCouriers);

    setToastMessage(` 택배사 헤더 자동 매칭 완료! [${activeCourier.name}] 택배사 컬럼 매핑이 갱신되었습니다.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 감지/선택된 택배사 양식에 최신 스마트 매칭/설정 덮어씌우기
  const handleOverwriteActiveCourier = () => {
    if (!activeCourier) {
      alert('덮어씌울 택배사 양식이 선택되지 않았습니다.');
      return;
    }

    const colMap = trackingHeaderInfo.colMap;

    const updatedCouriers = couriers.map(c => {
      if (c.id !== activeCourier.id && c.name !== activeCourier.name) return c;
      return {
        ...c,
        tracking_col: (colMap && colMap.track !== -1) ? colMap.track : c.tracking_col,
        name_col: (colMap && colMap.name !== -1) ? colMap.name : c.name_col,
        zip_col: (colMap && colMap.zip !== -1) ? colMap.zip : c.zip_col,
        phone_col: (colMap && colMap.phone !== -1) ? colMap.phone : c.phone_col,
        prod_col: (colMap && colMap.prod !== -1) ? colMap.prod : c.prod_col,
        qty_col: (colMap && colMap.qty !== -1) ? colMap.qty : c.qty_col,
        unit_col: (colMap && colMap.unit !== -1) ? colMap.unit : c.unit_col,
        courier_col: (colMap && colMap.courier !== -1) ? colMap.courier : c.courier_col,
        addr_col: (colMap && colMap.addr !== -1) ? colMap.addr : c.addr_col,
        start_row: trackingHeaderInfo.headerRowIndex !== undefined ? trackingHeaderInfo.headerRowIndex : c.start_row
      };
    });

    onCouriersChange(updatedCouriers);

    if (activeTrackingFile && onFileCourierChange) {
      onFileCourierChange(activeTrackingFile.fileName, activeCourier.name);
    }

    setToastMessage(` [${activeCourier.name}] 택배사 열 매핑 설정이 최신 상태로 덮어씌워졌습니다!`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // 현재 감지된 헤더 세팅으로 신규 택배사 양식 등록 처리
  const handleSaveAsNewCourierSubmit = () => {
    if (!newCourierNameInput.trim()) {
      alert('등록할 택배사 이름을 입력해주세요.');
      return;
    }

    const colMap = trackingHeaderInfo.colMap;
    const newCourierId = 'custom_courier_' + Date.now();
    const newConfig: CourierConfig = {
      id: newCourierId,
      name: newCourierNameInput.trim(),
      filepath_pattern: newCourierPatternInput.trim(),
      start_row: trackingHeaderInfo.headerRowIndex ?? (activeCourier?.start_row ?? 1),
      tracking_col: (colMap && colMap.track !== -1) ? colMap.track : (activeCourier?.tracking_col ?? 0),
      name_col: (colMap && colMap.name !== -1) ? colMap.name : (activeCourier?.name_col ?? 1),
      zip_col: (colMap && colMap.zip !== -1) ? colMap.zip : (activeCourier?.zip_col ?? 2),
      phone_col: (colMap && colMap.phone !== -1) ? colMap.phone : (activeCourier?.phone_col ?? 3),
      addr_col: (colMap && colMap.addr !== -1) ? colMap.addr : (activeCourier?.addr_col ?? 4),
      prod_col: (colMap && colMap.prod !== -1) ? colMap.prod : (activeCourier?.prod_col ?? 5),
      unit_col: (colMap && colMap.unit !== -1) ? colMap.unit : (activeCourier?.unit_col ?? 6),
      qty_col: (colMap && colMap.qty !== -1) ? colMap.qty : (activeCourier?.qty_col ?? 7),
      courier_col: (colMap && colMap.courier !== -1) ? colMap.courier : activeCourier?.courier_col
    };

    const updatedCouriers = [...couriers, newConfig];
    onCouriersChange(updatedCouriers);

    setSelectedCourierId(newConfig.id);

    if (activeTrackingFile && onFileCourierChange) {
      onFileCourierChange(activeTrackingFile.fileName, newConfig.name);
    }

    setShowSaveAsNewCourierModal(false);
    setToastMessage(` [${newConfig.name}] 택배사 양식이 추가되어 연동되었습니다!`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <div id="platform-settings-container" className="space-y-6">
      
      {/* 토스트 알림 메시지 */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold animate-bounce border border-slate-700">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 p-0.5 rounded hover:bg-white/20 text-slate-400 hover:text-white transition shrink-0 cursor-pointer"
            title="닫기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* 메인화면: 엑셀 열 감지 & 키워드 매핑 한눈에 보기 GUI        */}
      {/* ======================================================== */}
      <div className="space-y-6 animate-fade-in">
        
        {/* 상단 메인 헤더 & 톱니바퀴 버튼 & 쇼핑몰/택배사 모드 전환 탭 */}
        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md border border-indigo-700/50 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-indigo-500/30 rounded-lg text-amber-300">
                  <Grid className="w-5 h-5" />
                </span>
                <h2 className="text-lg font-bold tracking-tight">
                  엑셀 열 감지 & 세팅 매트릭스 GUI
                </h2>
              </div>
              <p className="text-xs text-indigo-200/90 mt-1.5 leading-relaxed">
                업로드된 엑셀 파일의 헤더 명칭과 자동 선별된 열 위치(A, B, C...)를 한눈에 파악하고, 키워드로 원하는 열을 즉시 탐색하여 설정에 반영합니다.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* 톱니바퀴 고급 설정 버튼 (쇼핑몰 양식 & 택배사 송장 설정 팝업) */}
              <button
                id="btn-open-settings-modal"
                onClick={() => {
                  setModalTab(matrixType === 'courier' ? 'courier' : 'platform');
                  setShowSettingsModal(true);
                }}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold transition shadow-sm flex items-center justify-center gap-1.5 backdrop-blur-xs cursor-pointer"
                title="쇼핑몰 양식 및 택배사 컬럼 상세 관리"
              >
                <Settings className="w-4 h-4 text-amber-300 animate-spin-slow" />
                <span>쇼핑몰/택배사 상세 설정 ()</span>
              </button>

              {parsedFiles.length > 0 && onNavigateToProcessTab && (
                <button
                  onClick={onNavigateToProcessTab}
                  className="px-3.5 py-2 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                  주문 가공으로 돌아가기
                </button>
              )}
            </div>
          </div>

          {/* 쇼핑몰 플랫폼 vs 택배사 송장 매트릭스 전환 토글 스위치 */}
          <div className="pt-3 border-t border-indigo-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 bg-indigo-950/80 p-1 rounded-xl border border-indigo-700/60 shrink-0">
              <button
                onClick={() => setMatrixType('platform')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  matrixType === 'platform'
                    ? 'bg-white text-indigo-950 shadow-md font-extrabold'
                    : 'text-indigo-200 hover:text-white hover:bg-indigo-800/50'
                }`}
              >
                <ShoppingBag className="w-4 h-4 text-indigo-600 shrink-0" />
                <span> 1단계 쇼핑몰 플랫폼 감지</span>
                {parsedFiles.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                    matrixType === 'platform' ? 'bg-indigo-100 text-indigo-800 font-bold' : 'bg-indigo-900 text-indigo-300'
                  }`}>
                    {parsedFiles.length}개 파일
                  </span>
                )}
              </button>

              <button
                onClick={() => setMatrixType('courier')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  matrixType === 'courier'
                    ? 'bg-amber-400 text-slate-950 shadow-md font-extrabold'
                    : 'text-indigo-200 hover:text-white hover:bg-indigo-800/50'
                }`}
              >
                <Truck className="w-4 h-4 text-amber-600 shrink-0" />
                <span> 2단계 택배사 송장 감지</span>
                {parsedTrackingFiles.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                    matrixType === 'courier' ? 'bg-slate-900 text-amber-300 font-bold' : 'bg-indigo-900 text-indigo-300'
                  }`}>
                    {parsedTrackingFiles.length}개 파일
                  </span>
                )}
              </button>
            </div>

            {/* 현재 선택 상태 서머리 텍스트 */}
            <div className="text-xs text-indigo-200/90 font-medium flex items-center gap-2">
              {matrixType === 'platform' ? (
                <span>쇼핑몰 주문서 엑셀 헤더 파싱 및 열 매핑 관리 모드</span>
              ) : (
                <span>택배사 운송장 엑셀 헤더 파싱 및 택배사 양식 열 매핑 관리 모드</span>
              )}
            </div>
          </div>

          {/* 1) 쇼핑몰 모드 파일 목록 선택 탭 */}
          {matrixType === 'platform' && (
            parsedFiles.length > 0 ? (
              <div className="pt-3 border-t border-indigo-700/50 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-indigo-200 mr-1">업로드된 쇼핑몰 엑셀 파일:</span>
                {parsedFiles.map((pf, idx) => {
                  const isSelected = selectedFileIdx === idx;
                  const platName = pf.detectedPlatform?.name || '기본 양식';
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedFileIdx(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 border cursor-pointer ${
                        isSelected
                          ? 'bg-white text-indigo-900 border-white shadow-sm font-bold'
                          : 'bg-indigo-800/60 text-indigo-200 border-indigo-700 hover:bg-indigo-800'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span className="max-w-[180px] truncate">{pf.fileName}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                        isSelected ? 'bg-indigo-100 text-indigo-800' : 'bg-indigo-950 text-indigo-300'
                      }`}>
                        {platName}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="pt-2 border-t border-indigo-700/50 flex items-center justify-between text-xs text-indigo-200">
                <span> 아직 업로드된 쇼핑몰 엑셀 파일이 없습니다. 1단계 주문 가공에서 엑셀을 올리거나 아래 등록된 쇼핑몰의 기본 열 매핑 구조를 확인하세요.</span>
                {onNavigateToProcessTab && (
                  <button
                    onClick={onNavigateToProcessTab}
                    className="underline text-amber-300 hover:text-amber-200 font-bold ml-2 shrink-0 cursor-pointer"
                  >
                    1단계에서 엑셀 파일 올리기 →
                  </button>
                )}
              </div>
            )
          )}

          {/* 2) 택배사 모드 파일 목록 및 택배사 선택 드롭다운 */}
          {matrixType === 'courier' && (
            <div className="pt-3 border-t border-indigo-700/50 space-y-2">
              {parsedTrackingFiles.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-amber-200 mr-1">업로드된 택배사 엑셀 파일:</span>
                  {parsedTrackingFiles.map((ptf, idx) => {
                    const isSelected = selectedTrackingFileIdx === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setSelectedTrackingFileIdx(idx);
                          setSelectedCourierId(ptf.detectedCourier);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 border cursor-pointer ${
                          isSelected
                            ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-sm font-bold'
                            : 'bg-indigo-800/60 text-indigo-200 border-indigo-700 hover:bg-indigo-800'
                        }`}
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span className="max-w-[180px] truncate">{ptf.fileName}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                          isSelected ? 'bg-slate-900 text-amber-300 font-bold' : 'bg-indigo-950 text-indigo-300'
                        }`}>
                          {ptf.detectedCourier}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-indigo-200">
                  <span> 업로드된 택배사 운송장 파일이 없습니다. 등록된 택배사 목록에서 직접 양식을 선택하여 미리 확인하고 설정할 수 있습니다.</span>
                </div>
              )}

              {/* 택배사 수동 선택 드롭다운 */}
              <div className="flex items-center gap-3 pt-1">
                <span className="text-xs font-semibold text-indigo-200 shrink-0">조회/설정할 택배사 양식 선택:</span>
                <select
                  value={activeCourier?.id || activeCourier?.name || ''}
                  onChange={(e) => setSelectedCourierId(e.target.value)}
                  className="bg-indigo-950 text-white border border-indigo-600 rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer max-w-xs"
                >
                  {couriers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} (송장열: {colNumToLetter(c.tracking_col + 1)}열, 시작행: {c.start_row + 1}행)
                    </option>
                  ))}
                </select>

                {activeCourier && (
                  <span className="text-[11px] text-amber-300 bg-amber-400/10 border border-amber-400/30 px-2.5 py-1 rounded-md font-semibold">
                    선택된 택배사: <strong>{activeCourier.name}</strong>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 미등록 또는 자동 감지된 양식인 경우 새 쇼핑몰 양식 등록 안내 배너 */}
        {matrixType === 'platform' && activeFile && activePlatform && (
          <div className="bg-amber-50 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-3">
              <span className="p-2 bg-amber-500/20 text-amber-600 rounded-xl shrink-0 mt-0.5">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-slate-800 text-sm">
                    {activePlatform.id.startsWith('unregistered') ? ' 미등록 엑셀 양식 감지됨' : `현재 파싱 설정: [${activePlatform.name}]`}
                  </h4>
                  {activePlatform.id.startsWith('unregistered') && (
                    <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-extrabold text-[10px] rounded-md animate-pulse">
                      스마트 헤더 자동매칭 적용됨
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {activePlatform.id.startsWith('unregistered')
                    ? `[${activeFile.fileName}] 파일의 헤더를 자동 정밀 파싱했습니다. 이 헤더 구조를 내 쇼핑몰 설정으로 저장하시겠습니까?`
                    : `현재 감지/선택된 [${activePlatform.name}] 컬럼 구조를 기반으로 새로운 쇼핑몰 양식 항목을 등록할 수 있습니다.`}
                </p>

                {secondaryColsInfo.length > 0 && (
                  <div className="mt-2.5 flex items-center gap-2 bg-purple-50 border border-purple-200 text-purple-900 px-3 py-1.5 rounded-xl text-xs font-semibold">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0 animate-pulse" />
                    <span>
                      <strong>분리 확장 감지:</strong> {secondaryColsInfo.map(s => `${s.letter}열 [${s.headerName}]`).join(', ')} 이(가) 메인 용량/옵션열 뒤에 실시간으로 확장 결합되도록 감지되었습니다.
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-col md:flex-row items-center gap-2 shrink-0">
              {activePlatform && !activePlatform.id.startsWith('unregistered') && (
                <button
                  onClick={handleOverwriteActivePlatform}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer hover:shadow-md"
                  title={`현재 파싱/매칭된 헤더 상태를 [${activePlatform.name}] 쇼핑몰 설정에 덮어씌워 저장합니다`}
                >
                  <Save className="w-4 h-4" />
                  [{activePlatform.name}] 양식에 덮어씌우기
                </button>
              )}

              <button
                onClick={() => {
                  const autoName = activeFile.fileName.replace(/\.[^/.]+$/, "").replace(/[0-9_\-\s]/g, " ").trim() || "신규 쇼핑몰";
                  const autoKey = activeFile.fileName.replace(/\.[^/.]+$/, "").split(/[_ -]/)[0] || "";
                  setNewPlatformNameInput(autoName);
                  setNewPlatformPatternInput(autoKey);
                  setShowSaveAsNewModal(true);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer hover:shadow-md"
              >
                <Plus className="w-4 h-4" />
                새 쇼핑몰 양식으로 등록
              </button>
            </div>
          </div>
        )}

        {/* 2단계 택배사 송장 양식 덮어씌우기 및 새 택배사 양식 등록 안내 배너 */}
        {matrixType === 'courier' && activeCourier && (
          <div className="bg-amber-50 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-3">
              <span className="p-2 bg-amber-500/20 text-amber-600 rounded-xl shrink-0 mt-0.5">
                <Truck className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-slate-800 text-sm">
                    현재 택배사 설정: [{activeCourier.name}]
                  </h4>
                  <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-extrabold text-[10px] rounded-md">
                    2단계 송장 양식 연동
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {activeTrackingFile
                    ? `[${activeTrackingFile.fileName}] 운송장 파일의 헤더 파싱 설정입니다. 이 헤더 구조를 [${activeCourier.name}] 택배사 설정에 덮어씌우거나 새로운 택배사 양식으로 등록할 수 있습니다.`
                    : `현재 선택된 [${activeCourier.name}] 택배사의 컬럼 구조를 기반으로 새로운 택배사 양식을 추가 등록하거나 기존 설정을 덮어씌울 수 있습니다.`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-col md:flex-row items-center gap-2 shrink-0">
              <button
                onClick={handleOverwriteActiveCourier}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer hover:shadow-md"
                title={`현재 파싱/매칭된 헤더 상태를 [${activeCourier.name}] 택배사 설정에 덮어씌워 저장합니다`}
              >
                <Save className="w-4 h-4" />
                [{activeCourier.name}] 양식에 덮어씌우기
              </button>

              <button
                onClick={() => {
                  const autoName = activeTrackingFile
                    ? activeTrackingFile.fileName.replace(/\.[^/.]+$/, "").replace(/[0-9_\-\s]/g, " ").trim() || "신규 택배사"
                    : "신규 택배사";
                  const autoKey = activeTrackingFile
                    ? activeTrackingFile.fileName.replace(/\.[^/.]+$/, "").split(/[_ -]/)[0] || ""
                    : "";
                  setNewCourierNameInput(autoName);
                  setNewCourierPatternInput(autoKey);
                  setShowSaveAsNewCourierModal(true);
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer hover:shadow-md"
              >
                <Plus className="w-4 h-4" />
                새 택배사 양식으로 등록
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* A. 쇼핑몰 감지 매트릭스 뷰                                */}
        {/* ======================================================== */}
        {matrixType === 'platform' && (
          <>
            {/* 1. 키워드로 원하는 열 찾기 패널 */}
            {activeFile && activePlatform && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Search className="w-4 h-4 text-indigo-600" />
                      키워드로 원하는 열 찾기 (헤더 검색기)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      "{activeFile.fileName}" 파일의 전체 헤더({allHeaderColumns.length}개 열)에서 검색어로 원하는 열 위치를 신속하게 찾습니다.
                    </p>
                  </div>

                  {onFilePlatformChange && (
                    <div className="flex items-center gap-2 shrink-0 bg-slate-50 p-1.5 rounded-lg border border-slate-200 text-xs">
                      <span className="text-slate-500 font-medium">연동 쇼핑몰:</span>
                      <select
                        value={activePlatform.id}
                        onChange={(e) => onFilePlatformChange(activeFile.fileName, e.target.value)}
                        className="bg-white border border-slate-200 rounded px-2 py-1 font-bold text-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        {platforms.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* 검색 인풋 Box */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={keywordSearch}
                    onChange={(e) => setKeywordSearch(e.target.value)}
                    placeholder="찾고 싶은 헤더 키워드를 입력하세요 (예: 받는사람, 수량, 옵션, 전화번호, 주소, E열, 5번째)..."
                    className="w-full pl-10 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                  {keywordSearch && (
                    <button
                      onClick={() => setKeywordSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* 검색어 입력 시 매칭된 열 타일 리스트 */}
                {keywordSearch.trim() !== '' && (
                  <div className="space-y-2 bg-indigo-50/40 border border-indigo-100 rounded-xl p-3.5">
                    <div className="text-xs font-bold text-indigo-900 flex items-center justify-between">
                      <span> 키워드 "{keywordSearch}" 검색 결과 ({filteredColumns.length}개 열 찾음):</span>
                      <span className="text-[10px] text-indigo-600 font-normal">버튼을 클릭하면 플랫폼 설정 항목에 즉시 지정됩니다</span>
                    </div>

                    {filteredColumns.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1 max-h-40 overflow-y-auto pr-1">
                        {filteredColumns.map(col => (
                          <div
                            key={col.index}
                            className="bg-white border border-indigo-200 hover:border-indigo-500 rounded-lg p-2 text-xs shadow-2xs space-y-1.5 transition"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded text-[10px]">
                                {col.letter}열 ({col.index + 1}번째)
                              </span>
                              <span className="font-semibold text-slate-800">{col.headerText}</span>
                            </div>

                            <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-100">
                              {['상품명', '용량', '수량', '수령인', '연락처', '주소', '배송메시지'].map(targetKey => (
                                <button
                                  key={targetKey}
                                  onClick={() => handleUpdateColumnMapping(activePlatform.id, targetKey, col.index)}
                                  className="text-[10px] bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 px-1.5 py-0.5 rounded transition font-medium cursor-pointer"
                                >
                                  {targetKey}로 지정
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 p-2 text-center">
                        "{keywordSearch}" 키워드와 일치하는 헤더 열이 엑셀 파일에 없습니다.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 2. 한눈에 보는 열 매핑 GUI 메인 테이블 */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    <Table className="w-5 h-5 text-indigo-600" />
                    {activeFile ? `[${activePlatform?.name || '쇼핑몰'}] 감지된 열 매핑 현황 매트릭스` : '플랫폼 표준 열 매핑 구조'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    각 목적 정보(상품명, 수령인, 주소 등)에 어떤 헤더가 감지되었고 몇 번째 열이 매핑되었는지 한눈에 나타냅니다.
                  </p>
                </div>

                {activeFile && (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 1. 스마트 매칭 버튼 */}
                    <button
                      onClick={handleAutoMatchHeaders}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer hover:shadow-md"
                      title="엑셀 파일의 헤더명을 재분석하여 목적 항목 열을 자동으로 탐색 및 매칭합니다"
                    >
                      <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                      스마트 매칭 실행
                    </button>

                    {/* 2. 1단계 주문서에 즉시 적용하기 버튼 */}
                    <button
                      onClick={() => {
                        if (onReProcessOrders) onReProcessOrders();
                        setToastMessage(" 현재 매칭 결과가 1단계 주문 가공 데이터에 즉시 적용되었습니다!");
                        setTimeout(() => setToastMessage(null), 3000);
                      }}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer hover:shadow-md"
                      title="현재 지정된 열 매핑을 바탕으로 1단계 주문 데이터를 즉시 재가공합니다"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      1단계 주문에 즉시 적용
                    </button>

                    {/* 3. 기존 쇼핑몰 설정에 덮어씌우기 버튼 */}
                    {activePlatform && !activePlatform.id.startsWith('unregistered') && (
                      <button
                        onClick={handleOverwriteActivePlatform}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer hover:shadow-md"
                        title={`현재 감지/매칭된 열 구성을 [${activePlatform.name}] 양식 설정에 저장(덮어쓰기)하고 1단계에 반영합니다`}
                      >
                        <Save className="w-3.5 h-3.5" />
                        [{activePlatform.name}] 설정에 덮어씌우기
                      </button>
                    )}

                    <div className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      <span>분석 파일: <strong>{activeFile.fileName}</strong> (헤더: {headerRowIndex + 1}행)</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                      <th className="py-3 px-4 w-40">목적 정보 (Target Info)</th>
                      <th className="py-3 px-4 w-52">감지된 엑셀 헤더명</th>
                      <th className="py-3 px-4 w-36">선택된 열 위치</th>
                      <th className="py-3 px-4 w-44">인식 상태 / 매칭 키워드</th>
                      <th className="py-3 px-4 min-w-[220px]">열 선택 & 변경 (원하는 열 지정)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {TARGET_FIELDS.map((field) => {
                      let currentMappedColIdx = 0;
                      if (activePlatform) {
                        if (field.key === 'tracking_col') {
                          currentMappedColIdx = activePlatform.tracking_col;
                        } else if (field.key === 'courier_col') {
                          currentMappedColIdx = activePlatform.courier_col !== undefined ? activePlatform.courier_col : -1;
                        } else {
                          currentMappedColIdx = (activePlatform.col_map as any)[field.key] !== undefined 
                            ? (activePlatform.col_map as any)[field.key] 
                            : 0;
                        }
                      }

                      const isAssigned = currentMappedColIdx >= 0;
                      const colLetter = isAssigned ? colNumToLetter(currentMappedColIdx + 1) : '-';
                      const detectedHeaderText = (isAssigned && rawHeaders[currentMappedColIdx] !== undefined)
                        ? String(rawHeaders[currentMappedColIdx]).trim()
                        : '';

                      let statusLabel = '자동 키워드 매칭됨';
                      let statusBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                      if (!activeFile) {
                        statusLabel = '설정값 기준';
                        statusBg = 'bg-slate-100 text-slate-600 border-slate-200';
                      } else if (!detectedHeaderText) {
                        statusLabel = '헤더명 없음/미감지';
                        statusBg = 'bg-amber-50 text-amber-700 border-amber-200';
                      } else if (detectedHeaderText.includes(field.key) || field.key.includes(detectedHeaderText)) {
                        statusLabel = `키워드 '${field.key}' 감지 완료`;
                        statusBg = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                      }

                      return (
                        <tr key={field.key} className="hover:bg-indigo-50/20 transition">
                          <td className="py-3.5 px-4 font-bold text-slate-800">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{field.icon}</span>
                              <div>
                                <div>{field.label}</div>
                                <div className="text-[10px] text-slate-400 font-normal">{field.description}</div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            {detectedHeaderText ? (
                              <div>
                                <span className={`inline-block px-2.5 py-1 rounded-md font-semibold text-xs border ${field.badgeBg}`}>
                                  "{detectedHeaderText}"
                                </span>

                                {field.key === '용량' && secondaryColsInfo.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    <div className="text-[10px] text-purple-800 font-bold flex items-center gap-1">
                                      <Sparkles className="w-3 h-3 text-purple-600 animate-pulse" />
                                      보조 확장 감지된 규격/단위 열 ({secondaryColsInfo.length}개):
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {secondaryColsInfo.map(s => (
                                        <span key={s.index} className="inline-flex items-center gap-1 text-[10px] bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-md font-extrabold shadow-2xs">
                                          <span>{s.letter}열</span>
                                          <span className="text-purple-600">[{s.headerName}]</span>
                                          <span className="text-[9px] text-purple-500 font-normal">(용량에 자동 결합)</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">(파일 미업로드 또는 헤더 없음)</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            {isAssigned ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-xs">
                                  {colLetter}열
                                </span>
                                <span className="text-[11px] text-slate-500 font-mono">
                                  ({currentMappedColIdx + 1}번째)
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">미지정</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${statusBg}`}>
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              {statusLabel}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            {activePlatform ? (
                              <div className="relative flex items-center max-w-xs">
                                <select
                                  value={currentMappedColIdx}
                                  onChange={(e) => {
                                    const newIdx = parseInt(e.target.value, 10);
                                    handleUpdateColumnMapping(activePlatform.id, field.key, newIdx);
                                  }}
                                  className="w-full text-xs bg-white border border-slate-200 hover:border-indigo-500 rounded-lg p-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer"
                                >
                                  {allHeaderColumns.length > 0 ? (
                                    allHeaderColumns.map(col => (
                                      <option key={col.index} value={col.index}>
                                        {col.displayLabel}
                                      </option>
                                    ))
                                  ) : (
                                    Array.from({ length: 20 }, (_, i) => (
                                      <option key={i} value={i}>
                                        [{colNumToLetter(i + 1)}열 / {i + 1}번째] 기본 열
                                      </option>
                                    ))
                                  )}
                                </select>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. 엑셀 원본 데이터 5행 실시간 미리보기 */}
            {activeFile && previewRows.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Eye className="w-4 h-4 text-indigo-600" />
                    엑셀 원본 헤더 및 상위 5행 데이터 실시간 검증
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    헤더 행({headerRowIndex + 1}행)이 보라색으로 강조되고, 각 열에 세팅된 필드 태그가 표시됩니다.
                  </span>
                </div>

                <div className="overflow-x-auto max-h-64 border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-[11px] border-collapse font-mono">
                    <thead>
                      <tr className="bg-indigo-900 text-white font-bold divide-x divide-indigo-800">
                        <th className="p-2 w-12 text-center bg-indigo-950">행</th>
                        {rawHeaders.map((_, cIdx) => {
                          const cLetter = colNumToLetter(cIdx + 1);
                          const mappedField = TARGET_FIELDS.find(f => {
                            if (!activePlatform) return false;
                            if (f.key === 'tracking_col') return activePlatform.tracking_col === cIdx;
                            if (f.key === 'courier_col') return activePlatform.courier_col === cIdx;
                            return (activePlatform.col_map as any)[f.key] === cIdx;
                          });

                          return (
                            <th key={cIdx} className="p-2 min-w-[110px] max-w-[200px] truncate">
                              <div className="text-[10px] text-indigo-200">{cLetter}열 ({cIdx + 1})</div>
                              {mappedField && (
                                <div className="text-[9px] bg-amber-400 text-slate-900 font-extrabold px-1 py-0.2 rounded mt-0.5 inline-block">
                                  {mappedField.icon} {mappedField.label.split(' ')[0]}
                                </div>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {previewRows.map((row, rIdx) => {
                        const isHeader = rIdx === 0;
                        return (
                          <tr key={rIdx} className={isHeader ? 'bg-indigo-50/80 font-bold text-indigo-950' : 'hover:bg-slate-50'}>
                            <td className="p-2 text-center text-slate-400 bg-slate-50 font-bold border-r border-slate-200">
                              {headerRowIndex + rIdx + 1}
                            </td>
                            {rawHeaders.map((_, cIdx) => (
                              <td key={cIdx} className="p-2 border-r border-slate-100 max-w-[200px] truncate" title={String(row[cIdx] || '')}>
                                {String(row[cIdx] || '')}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ======================================================== */}
        {/* B. 택배사 감지 매트릭스 뷰                                */}
        {/* ======================================================== */}
        {matrixType === 'courier' && (
          <>
            {/* 1. 키워드로 원하는 열 찾기 패널 (택배사 모드) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Search className="w-4 h-4 text-amber-600" />
                    키워드로 원하는 열 찾기 (택배사 헤더 검색기)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activeTrackingFile 
                      ? `"${activeTrackingFile.fileName}" 파일의 전체 헤더(${trackingHeaderInfo.rawHeaders.length}개 열)에서 검색어로 택배사 열 위치를 찾습니다.` 
                      : `선택된 [${activeCourier?.name}] 택배사의 열 위치를 파악하고 설정에 반영합니다.`}
                  </p>
                </div>

                {onFileCourierChange && activeTrackingFile && (
                  <div className="flex items-center gap-2 shrink-0 bg-slate-50 p-1.5 rounded-lg border border-slate-200 text-xs">
                    <span className="text-slate-500 font-medium">연동 택배사:</span>
                    <select
                      value={activeCourier?.name || ''}
                      onChange={(e) => onFileCourierChange(activeTrackingFile.fileName, e.target.value)}
                      className="bg-white border border-slate-200 rounded px-2 py-1 font-bold text-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                    >
                      {couriers.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 검색 인풋 Box */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={keywordSearch}
                  onChange={(e) => setKeywordSearch(e.target.value)}
                  placeholder="찾고 싶은 택배사 헤더 키워드를 입력하세요 (예: 송장번호, 받는분, 연락처, 주소, B열, 2번째)..."
                  className="w-full pl-10 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
                />
                {keywordSearch && (
                  <button
                    onClick={() => setKeywordSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* 검색어 입력 시 매칭된 열 타일 리스트 */}
              {keywordSearch.trim() !== '' && trackingHeaderInfo.rawHeaders.length > 0 && (
                <div className="space-y-2 bg-amber-50/40 border border-amber-100 rounded-xl p-3.5">
                  <div className="text-xs font-bold text-amber-900 flex items-center justify-between">
                    <span> 택배사 키워드 "{keywordSearch}" 검색 결과:</span>
                    <span className="text-[10px] text-amber-700 font-normal">버튼을 클릭하면 선택된 택배사 설정에 저장됩니다</span>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1 max-h-40 overflow-y-auto pr-1">
                    {trackingHeaderInfo.rawHeaders
                      .map((h: any, idx: number) => ({ index: idx, letter: colNumToLetter(idx + 1), text: String(h || '').trim() }))
                      .filter(col => col.text.toLowerCase().includes(keywordSearch.trim().toLowerCase()) || col.letter.toLowerCase() === keywordSearch.trim().toLowerCase() || (col.index + 1).toString() === keywordSearch.trim())
                      .map(col => (
                        <div key={col.index} className="bg-white border border-amber-200 hover:border-amber-500 rounded-lg p-2 text-xs shadow-2xs space-y-1.5 transition">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-[10px]">
                              {col.letter}열 ({col.index + 1}번째)
                            </span>
                            <span className="font-semibold text-slate-800">{col.text || '(헤더명 없음)'}</span>
                          </div>

                          <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-100">
                            {COURIER_TARGET_FIELDS.map(f => (
                              <button
                                key={f.key}
                                onClick={() => activeCourier && handleUpdateCourierColumnMapping(activeCourier.id, f.key, col.index)}
                                className="text-[10px] bg-slate-100 hover:bg-amber-500 hover:text-slate-950 text-slate-700 px-1.5 py-0.5 rounded transition font-medium cursor-pointer"
                              >
                                {f.label.split(' ')[0]}로 지정
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2. 한눈에 보는 택배사 열 매핑 GUI 메인 테이블 */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    <Truck className="w-5 h-5 text-amber-600" />
                    [{activeCourier?.name || '택배사'}] 감지된 운송장 열 매핑 현황 매트릭스
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    택배사 양식의 필수 열(운송장번호, 수령인, 주소 등)에 매핑된 엑셀 컬럼 위치를 한눈에 확인하고 손쉽게 조정합니다.
                  </p>
                </div>

                {activeTrackingFile && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleAutoMatchCourierHeaders}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer hover:shadow-md"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      스마트 매칭 실행
                    </button>

                    {activeCourier && (
                      <button
                        onClick={handleOverwriteActiveCourier}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer hover:shadow-md"
                        title={`현재 감지/매칭된 열 구성을 [${activeCourier.name}] 택배사 설정에 저장(덮어쓰기)합니다`}
                      >
                        <Save className="w-3.5 h-3.5" />
                        [{activeCourier.name}] 설정에 덮어씌우기
                      </button>
                    )}

                    <button
                      onClick={() => {
                        const autoName = activeTrackingFile
                          ? activeTrackingFile.fileName.replace(/\.[^/.]+$/, "").replace(/[0-9_\-\s]/g, " ").trim() || "신규 택배사"
                          : "신규 택배사";
                        const autoKey = activeTrackingFile
                          ? activeTrackingFile.fileName.replace(/\.[^/.]+$/, "").split(/[_ -]/)[0] || ""
                          : "";
                        setNewCourierNameInput(autoName);
                        setNewCourierPatternInput(autoKey);
                        setShowSaveAsNewCourierModal(true);
                      }}
                      className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer hover:shadow-md"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      새 택배사 양식 등록
                    </button>

                    <div className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-amber-600" />
                      <span>운송장 파일: <strong>{activeTrackingFile.fileName}</strong> (헤더: {trackingHeaderInfo.headerRowIndex + 1}행)</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                      <th className="py-3 px-4 w-44">택배사 타겟 필드</th>
                      <th className="py-3 px-4 w-52">감지된 엑셀 헤더명</th>
                      <th className="py-3 px-4 w-36">선택된 열 위치</th>
                      <th className="py-3 px-4 w-44">인식 상태 / 매칭 키워드</th>
                      <th className="py-3 px-4 min-w-[220px]">열 선택 & 변경 (원하는 열 지정)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {COURIER_TARGET_FIELDS.map((field) => {
                      let currentMappedColIdx = -1;
                      if (activeCourier) {
                        currentMappedColIdx = (activeCourier as any)[field.key] !== undefined ? (activeCourier as any)[field.key] : -1;
                      }

                      const isAssigned = currentMappedColIdx >= 0;
                      const colLetter = isAssigned ? colNumToLetter(currentMappedColIdx + 1) : '미지정';
                      const detectedHeaderText = (isAssigned && trackingHeaderInfo.rawHeaders[currentMappedColIdx] !== undefined)
                        ? String(trackingHeaderInfo.rawHeaders[currentMappedColIdx]).trim()
                        : '';

                      let statusLabel = '자동 키워드 매칭됨';
                      let statusBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                      if (!activeTrackingFile) {
                        statusLabel = '택배사 설정값 기준';
                        statusBg = 'bg-slate-100 text-slate-600 border-slate-200';
                      } else if (!detectedHeaderText) {
                        statusLabel = '헤더명 없음/미감지';
                        statusBg = 'bg-amber-50 text-amber-700 border-amber-200';
                      } else {
                        statusLabel = `키워드 감지 완료`;
                        statusBg = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                      }

                      return (
                        <tr key={field.key} className="hover:bg-amber-50/20 transition">
                          <td className="py-3.5 px-4 font-bold text-slate-800">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{field.icon}</span>
                              <div>
                                <div>{field.label}</div>
                                <div className="text-[10px] text-slate-400 font-normal">{field.description}</div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            {detectedHeaderText ? (
                              <span className={`inline-block px-2.5 py-1 rounded-md font-semibold text-xs border ${field.badgeBg}`}>
                                "{detectedHeaderText}"
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">(파일 미업로드 또는 헤더 없음)</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            {isAssigned ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs">
                                  {colLetter}열
                                </span>
                                <span className="text-[11px] text-slate-500 font-mono">
                                  ({currentMappedColIdx + 1}번째)
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">미지정</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${statusBg}`}>
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              {statusLabel}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            {activeCourier ? (
                              <div className="relative flex items-center max-w-xs">
                                <select
                                  value={currentMappedColIdx}
                                  onChange={(e) => {
                                    const newIdx = parseInt(e.target.value, 10);
                                    handleUpdateCourierColumnMapping(activeCourier.id, field.key, newIdx);
                                  }}
                                  className="w-full text-xs bg-white border border-slate-200 hover:border-amber-500 rounded-lg p-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition cursor-pointer"
                                >
                                  <option value={-1}>[미지정] 사용 안함</option>
                                  {trackingHeaderInfo.rawHeaders.length > 0 ? (
                                    trackingHeaderInfo.rawHeaders.map((h: any, colIdx: number) => (
                                      <option key={colIdx} value={colIdx}>
                                        [{colNumToLetter(colIdx + 1)}열] {String(h || '').trim() || '(헤더명 없음)'}
                                      </option>
                                    ))
                                  ) : (
                                    Array.from({ length: 20 }, (_, i) => (
                                      <option key={i} value={i}>
                                        [{colNumToLetter(i + 1)}열 / {i + 1}번째] 기본 열
                                      </option>
                                    ))
                                  )}
                                </select>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. 택배사 엑셀 원본 데이터 5행 실시간 미리보기 */}
            {activeTrackingFile && trackingHeaderInfo.previewRows.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Eye className="w-4 h-4 text-amber-600" />
                    택배사 엑셀 원본 헤더 및 상위 5행 데이터 실시간 검증
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    헤더 행({trackingHeaderInfo.headerRowIndex + 1}행)이 강조되고, 각 열에 세팅된 택배사 필드 태그가 표시됩니다.
                  </span>
                </div>

                <div className="overflow-x-auto max-h-64 border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-[11px] border-collapse font-mono">
                    <thead>
                      <tr className="bg-slate-900 text-amber-300 font-bold divide-x divide-slate-800">
                        <th className="p-2 w-12 text-center bg-slate-950">행</th>
                        {trackingHeaderInfo.rawHeaders.map((_, cIdx) => {
                          const cLetter = colNumToLetter(cIdx + 1);
                          const mappedField = COURIER_TARGET_FIELDS.find(f => {
                            if (!activeCourier) return false;
                            return (activeCourier as any)[f.key] === cIdx;
                          });

                          return (
                            <th key={cIdx} className="p-2 min-w-[110px] max-w-[200px] truncate">
                              <div className="text-[10px] text-slate-300">{cLetter}열 ({cIdx + 1})</div>
                              {mappedField && (
                                <div className="text-[9px] bg-amber-400 text-slate-950 font-extrabold px-1 py-0.2 rounded mt-0.5 inline-block">
                                  {mappedField.icon} {mappedField.label.split(' ')[0]}
                                </div>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {trackingHeaderInfo.previewRows.map((row, rIdx) => {
                        const isHeader = rIdx === 0;
                        return (
                          <tr key={rIdx} className={isHeader ? 'bg-amber-50/80 font-bold text-amber-950' : 'hover:bg-slate-50'}>
                            <td className="p-2 text-center text-slate-400 bg-slate-50 font-bold border-r border-slate-200">
                              {trackingHeaderInfo.headerRowIndex + rIdx + 1}
                            </td>
                            {trackingHeaderInfo.rawHeaders.map((_, cIdx) => (
                              <td key={cIdx} className="p-2 border-r border-slate-100 max-w-[200px] truncate" title={String(row[cIdx] || '')}>
                                {String(row[cIdx] || '')}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

      </div>

      {/* ======================================================== */}
      {/* 톱니바퀴 모달 팝업: 쇼핑몰 양식 & 택배사 송장 상세 관리     */}
      {/* ======================================================== */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 my-auto">
            
            {/* 팝업 헤더 */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-indigo-500/20 rounded-xl text-amber-300">
                  <Settings className="w-5 h-5 animate-spin-slow" />
                </span>
                <div>
                  <h3 className="font-bold text-base text-white">쇼핑몰 양식 & 택배사 컬럼 상세 관리</h3>
                  <p className="text-xs text-indigo-200/80 mt-0.5">
                    연동 플랫폼 및 택배사의 시작 행, 컬럼 매핑 구조를 정밀 수정하고 추가합니다.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 팝업 서브탭 바 */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-5">
              <button
                onClick={() => setModalTab('platform')}
                className={`flex items-center gap-2 py-3 px-4 font-bold text-xs border-b-2 transition cursor-pointer ${
                  modalTab === 'platform'
                    ? 'border-indigo-600 text-indigo-600 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                쇼핑몰 양식 설정 ({platforms.length}개)
              </button>

              <button
                onClick={() => setModalTab('courier')}
                className={`flex items-center gap-2 py-3 px-4 font-bold text-xs border-b-2 transition cursor-pointer ${
                  modalTab === 'courier'
                    ? 'border-indigo-600 text-indigo-600 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Truck className="w-4 h-4" />
                택배사 송장 컬럼 ({couriers.length}개)
              </button>
            </div>

            {/* 팝업 모달 메인 바디 */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              
              {/* TAB 1: 쇼핑몰 양식 설정 */}
              {modalTab === 'platform' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-600">
                      등록된 쇼핑몰 양식을 선택해 수정하거나 새로운 양식을 등록하세요.
                    </p>
                    <button
                      onClick={() => setShowPresetModal(true)}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      쇼핑몰 추가하기
                    </button>
                  </div>

                  {/* 플랫폼 목록 카드 Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {platforms.map(p => {
                      const isEditing = editingPlatform?.id === p.id;
                      return (
                        <div 
                          key={p.id}
                          className={`p-4 rounded-xl border transition space-y-2 ${
                            isEditing 
                              ? 'bg-indigo-50/50 border-indigo-500 ring-1 ring-indigo-500' 
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-sm text-slate-800">{p.name}</div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setEditingPlatform(p)}
                                className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 rounded font-medium transition cursor-pointer"
                              >
                                수정
                              </button>
                              <button
                                onClick={() => setDeletingPlatform(p)}
                                className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 rounded font-medium transition cursor-pointer"
                              >
                                삭제
                              </button>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2 font-mono flex-wrap gap-1">
                            <span>인식 키워드: <strong className="text-indigo-700">{p.filepath_pattern || p.identifier || '전체'}</strong></span>
                            <span>시작 행: {p.start_row + 1}행</span>
                            <span>송장 기입: {colNumToLetter(p.tracking_col + 1)}열</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 쇼핑몰 상세 편집 Form */}
                  {editingPlatform && (
                    <div className="bg-slate-50 border border-indigo-200 rounded-xl p-5 space-y-4 animate-fade-in">
                      <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
                        <h4 className="font-bold text-indigo-900 text-sm flex items-center gap-1.5">
                          <Edit3 className="w-4 h-4 text-indigo-600" />
                          [{editingPlatform.name}] 세부 컬럼 편집
                        </h4>
                        <button
                          onClick={() => setEditingPlatform(null)}
                          className="text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                        >
                          닫기
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">플랫폼 이름</label>
                          <input
                            type="text"
                            value={editingPlatform.name}
                            onChange={(e) => setEditingPlatform({ ...editingPlatform, name: e.target.value })}
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">인식 파일명 키워드 (자동 매칭용)</label>
                          <input
                            type="text"
                            value={editingPlatform.filepath_pattern || editingPlatform.identifier || ''}
                            onChange={(e) => setEditingPlatform({ 
                              ...editingPlatform, 
                              filepath_pattern: e.target.value,
                              identifier: e.target.value 
                            })}
                            placeholder="예: 쿠팡, coupang, smartstore..."
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">시작 행 번호 (1-based)</label>
                          <input
                            type="number"
                            min="1"
                            value={startRowInput}
                            onChange={(e) => handleStartRowChange(e.target.value)}
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                          />
                        </div>
                      </div>

                      <div className="border-t border-slate-200 pt-3 space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-2">기본 주문 필드별 열 지정 (알파벳 A, B, C... 또는 열 번호)</label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            {Object.entries(editingPlatform.col_map).map(([key]) => {
                              const valStr = colMapInputs[key] || '';
                              const { displayPreview } = getColumnPreview(valStr);
                              return (
                                <div key={key} className="bg-white p-2 rounded-lg border border-slate-200">
                                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">{key}</span>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={valStr}
                                      onChange={(e) => handleColMapChange(key, e.target.value)}
                                      className="w-full text-xs p-1 bg-slate-50 border border-slate-200 rounded font-mono uppercase"
                                    />
                                    <span className="text-[10px] text-indigo-600 font-mono shrink-0">{displayPreview}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 송장기입열 & 택배사열 지정 필드 복구 */}
                        <div className="pt-3 border-t border-slate-200">
                          <label className="block text-xs font-bold text-indigo-900 mb-2">
                            송장번호 & 택배사 기입열 지정 (송장 입력 엑셀 다운로드용)
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-200 space-y-1">
                              <span className="block text-[11px] font-bold text-indigo-900">운송장번호 기입열 (tracking_col)</span>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={trackingColInput}
                                  onChange={(e) => handleTrackingColChange(e.target.value)}
                                  placeholder="예: I 또는 9"
                                  className="w-full text-xs p-2 bg-white border border-indigo-200 rounded-lg font-mono uppercase font-bold text-indigo-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <span className="text-xs text-indigo-700 font-mono font-bold shrink-0">{getColumnPreview(trackingColInput).displayPreview}</span>
                              </div>
                            </div>

                            <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-200 space-y-1">
                              <span className="block text-[11px] font-bold text-indigo-900">택배사명 기입열 (courier_col)</span>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={courierColInput}
                                  onChange={(e) => handleCourierColChange(e.target.value)}
                                  placeholder="예: J 또는 10 (미입력 시 사용 안 함)"
                                  className="w-full text-xs p-2 bg-white border border-indigo-200 rounded-lg font-mono uppercase font-bold text-indigo-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <span className="text-xs text-indigo-700 font-mono font-bold shrink-0">{getColumnPreview(courierColInput).displayPreview}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                        <button
                          onClick={() => setEditingPlatform(null)}
                          className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => savePlatform(editingPlatform)}
                          className="px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer"
                        >
                          설정 저장하기
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: 택배사 송장 컬럼 설정 */}
              {modalTab === 'courier' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-600">
                      택배사별 송장 입력 엑셀 서식의 컬럼 매핑을 관리합니다.
                    </p>
                    <button
                      onClick={() => setShowCourierPresetModal(true)}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      택배사 추가하기
                    </button>
                  </div>

                  {/* 택배사 목록 Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {couriers.map(c => {
                      const isEditing = editingCourier?.id === c.id;
                      return (
                        <div 
                          key={c.id}
                          className={`p-4 rounded-xl border transition space-y-2 ${
                            isEditing 
                              ? 'bg-indigo-50/50 border-indigo-500 ring-1 ring-indigo-500' 
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-sm text-slate-800">{c.name}</div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setEditingCourier(c)}
                                className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 rounded font-medium transition cursor-pointer"
                              >
                                수정
                              </button>
                              <button
                                onClick={() => setDeletingCourier(c)}
                                className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 rounded font-medium transition cursor-pointer"
                              >
                                삭제
                              </button>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2 font-mono">
                            <span>시작 행: {c.start_row + 1}행</span>
                            <span>송장열: {colNumToLetter(c.tracking_col + 1)}열</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 택배사 상세 편집 Form */}
                  {editingCourier && (
                    <div className="bg-slate-50 border border-indigo-200 rounded-xl p-5 space-y-4 animate-fade-in">
                      <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
                        <h4 className="font-bold text-indigo-900 text-sm flex items-center gap-1.5">
                          <Edit3 className="w-4 h-4 text-indigo-600" />
                          [{editingCourier.name}] 컬럼 편집
                        </h4>
                        <button
                          onClick={() => setEditingCourier(null)}
                          className="text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                        >
                          닫기
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">택배사명</label>
                          <input
                            type="text"
                            value={editingCourier.name}
                            onChange={(e) => setEditingCourier({ ...editingCourier, name: e.target.value })}
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold text-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">시작 행 번호 (1-based)</label>
                          <input
                            type="number"
                            min="1"
                            value={courierStartRowInput}
                            onChange={(e) => handleCourierStartRowChange(e.target.value)}
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-bold"
                          />
                        </div>
                      </div>

                      {/* 택배사 엑셀 컬럼 지정 영역 (운송장번호 지정 포함) */}
                      <div className="space-y-3 pt-3 border-t border-indigo-100">
                        <label className="block text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-indigo-600" />
                          택배사 엑셀 항목별 열 위치 (A, B, C 또는 1, 2, 3...)
                        </label>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {/* 1. 운송장번호 지정 (핵심 요청) */}
                          <div className="bg-indigo-50/80 p-2.5 rounded-xl border border-indigo-200 space-y-1">
                            <span className="block text-[11px] font-bold text-indigo-900 flex items-center justify-between">
                              <span> 운송장번호 열</span>
                              <span className="text-[9px] text-indigo-600 bg-indigo-100 px-1 rounded">필수</span>
                            </span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['tracking_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('tracking_col', e.target.value)}
                                placeholder="예: B 또는 2"
                                className="w-full text-xs p-1.5 bg-white border border-indigo-200 rounded-lg font-mono uppercase font-bold text-indigo-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="text-[10px] text-indigo-700 font-mono font-bold shrink-0">{getColumnPreview(courierColInputs['tracking_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 2. 받는사람/수령인 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-[11px] font-bold text-slate-700"> 수령인 (받는사람)</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['name_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('name_col', e.target.value)}
                                placeholder="예: C 또는 3"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="text-[10px] text-indigo-600 font-mono shrink-0">{getColumnPreview(courierColInputs['name_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 3. 연락처 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-[11px] font-bold text-slate-700"> 연락처</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['phone_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('phone_col', e.target.value)}
                                placeholder="예: D 또는 4"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="text-[10px] text-indigo-600 font-mono shrink-0">{getColumnPreview(courierColInputs['phone_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 4. 우편번호 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-[11px] font-bold text-slate-700"> 우편번호</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['zip_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('zip_col', e.target.value)}
                                placeholder="예: E 또는 5"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="text-[10px] text-indigo-600 font-mono shrink-0">{getColumnPreview(courierColInputs['zip_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 5. 주소 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-[11px] font-bold text-slate-700"> 배송지 주소</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['addr_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('addr_col', e.target.value)}
                                placeholder="예: F 또는 6"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="text-[10px] text-indigo-600 font-mono shrink-0">{getColumnPreview(courierColInputs['addr_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 6. 상품명 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-[11px] font-bold text-slate-700"> 상품명</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['prod_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('prod_col', e.target.value)}
                                placeholder="예: G 또는 7"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="text-[10px] text-indigo-600 font-mono shrink-0">{getColumnPreview(courierColInputs['prod_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 7. 옵션/규격 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-[11px] font-bold text-slate-700"> 옵션 / 규격</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['unit_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('unit_col', e.target.value)}
                                placeholder="예: H 또는 8"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="text-[10px] text-indigo-600 font-mono shrink-0">{getColumnPreview(courierColInputs['unit_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 8. 수량 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-[11px] font-bold text-slate-700"> 수량</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['qty_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('qty_col', e.target.value)}
                                placeholder="예: I 또는 9"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="text-[10px] text-indigo-600 font-mono shrink-0">{getColumnPreview(courierColInputs['qty_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 9. 택배사명 지정열 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-[11px] font-bold text-slate-700"> 택배사명 지정열</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['courier_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('courier_col', e.target.value)}
                                placeholder="선택 (예: A 또는 1)"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="text-[10px] text-indigo-600 font-mono shrink-0">{getColumnPreview(courierColInputs['courier_col'] || '').displayPreview}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                        <button
                          onClick={() => setEditingCourier(null)}
                          className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => saveCourier(editingCourier)}
                          className="px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer"
                        >
                          택배사 설정 저장하기
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* 팝업 하단 푸터 */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
              >
                닫기 & 적용
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 프리셋 모달 (쇼핑몰 추가 마법사) */}
      {showPresetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">새 쇼핑몰 추가 프리셋</h3>
              <button 
                onClick={() => setShowPresetModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">
                자주 사용하는 쇼핑몰 템플릿(프리셋)을 선택하여 설정을 빠르게 시작하세요.
              </p>
              
              <div className="grid grid-cols-1 gap-2 max-h-[280px] overflow-y-auto">
                {PLATFORM_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    className="flex items-center justify-between p-3.5 border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/40 rounded-xl text-left transition cursor-pointer"
                  >
                    <div className="font-semibold text-slate-800 text-xs">{preset.name}</div>
                    <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-1 rounded font-bold">불러오기</span>
                  </button>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-xs">
                <button
                  onClick={createEmptyPlatform}
                  className="text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  템플릿 없이 새로 만들기
                </button>
                <button
                  onClick={() => setShowPresetModal(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 택배사 프리셋 모달 */}
      {showCourierPresetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">새 택배사 추가 프리셋</h3>
              <button 
                onClick={() => setShowCourierPresetModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">
                주요 택배사 양식 템플릿을 선택하여 간편하게 등록하세요.
              </p>
              
              <div className="grid grid-cols-1 gap-2 max-h-[280px] overflow-y-auto">
                {COURIER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyCourierPreset(preset)}
                    className="flex items-center justify-between p-3.5 border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/40 rounded-xl text-left transition cursor-pointer"
                  >
                    <div className="font-semibold text-slate-800 text-xs">{preset.name}</div>
                    <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-1 rounded font-bold">불러오기</span>
                  </button>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-xs">
                <button
                  onClick={createEmptyCourier}
                  className="text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  템플릿 없이 새로 만들기
                </button>
                <button
                  onClick={() => setShowCourierPresetModal(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 플랫폼 삭제 확인 모달 */}
      {deletingPlatform && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4 border border-slate-100">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
              연동 쇼핑몰 삭제 확인
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>"{deletingPlatform.name}"</strong> 설정을 목록에서 삭제하시겠습니까?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeletingPlatform(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={() => executeDeletePlatform(deletingPlatform.id)}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 현재 스마트 감지된 헤더로 새 쇼핑몰 양식 추가 모달 */}
      {showSaveAsNewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveAsNewPlatformSubmit();
            }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-100"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600" />
                신규 쇼핑몰 양식으로 내 설정에 저장
              </h3>
              <button type="button" onClick={() => setShowSaveAsNewModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              현재 엑셀 파일(<strong>{activeFile?.fileName}</strong>)에서 자동 감지 및 설정된 헤더 매핑 구조로 신규 쇼핑몰 템플릿을 등록합니다.
            </p>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  쇼핑몰 이름 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newPlatformNameInput}
                  onChange={(e) => setNewPlatformNameInput(e.target.value)}
                  placeholder="예: 11번가, 지마켓, 카페24, 자사몰"
                  autoFocus
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  파일명 식별 키워드 (선택)
                </label>
                <input
                  type="text"
                  value={newPlatformPatternInput}
                  onChange={(e) => setNewPlatformPatternInput(e.target.value)}
                  placeholder="예: 11st, order, coupang (파일명에 이 단어가 들어있으면 자동 매칭)"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  이 키워드가 들어간 엑셀 파일을 올리면 방금 설정한 양식으로 자동 인식됩니다.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSaveAsNewModal(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                취소 (ESC)
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm cursor-pointer"
              >
                새 쇼핑몰 양식으로 추가 저장 (Enter)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 현재 스마트 감지된 헤더로 새 택배사 양식 추가 모달 */}
      {showSaveAsNewCourierModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveAsNewCourierSubmit();
            }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-100"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-600" />
                신규 택배사 양식으로 내 설정에 저장
              </h3>
              <button type="button" onClick={() => setShowSaveAsNewCourierModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              현재 운송장 엑셀 파일(<strong>{activeTrackingFile?.fileName || '운송장 파일'}</strong>)에서 자동 감지 및 설정된 헤더 매핑 구조로 신규 택배사 템플릿을 등록합니다.
            </p>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  택배사 이름 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCourierNameInput}
                  onChange={(e) => setNewCourierNameInput(e.target.value)}
                  placeholder="예: CJ대한통운 (B타입), 한진택배 (특수양식), 우체국 (신규)"
                  autoFocus
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  파일명 식별 키워드 (선택)
                </label>
                <input
                  type="text"
                  value={newCourierPatternInput}
                  onChange={(e) => setNewCourierPatternInput(e.target.value)}
                  placeholder="예: hanjin, lotte, cj (운송장 파일명에 이 단어가 있으면 자동 매칭)"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  이 키워드가 들어간 운송장 파일을 업로드하면 방금 설정한 택배사 양식으로 자동 인식됩니다.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSaveAsNewCourierModal(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                취소 (ESC)
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl shadow-sm cursor-pointer"
              >
                새 택배사 양식으로 추가 저장 (Enter)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 택배사 삭제 확인 모달 */}
      {deletingCourier && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4 border border-slate-100">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
              택배사 설정 삭제 확인
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>"{deletingCourier.name}"</strong> 설정을 목록에서 삭제하시겠습니까?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeletingCourier(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={() => executeDeleteCourier(deletingCourier.id)}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
