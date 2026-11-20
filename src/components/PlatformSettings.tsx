import React, { useState, useEffect, useMemo } from 'react';
import { PlatformConfig, CourierConfig, ProcessedOrder, ValidationIssue } from '../types';
import { PLATFORM_PRESETS, COURIER_PRESETS } from '../utils/defaultData';
import { detectSecondaryOptionColumns, detectTrackingHeaderAndCourier } from '../utils/excelProcessor';
import { 
  Plus, Trash2, Edit3, Settings, HelpCircle, Save, ShoppingBag, Truck, AlertTriangle, 
  Search, Filter, CheckCircle2, RefreshCw, Zap, Table, Layers, ArrowRight, Upload, 
  ChevronDown, Check, Lightbulb, FileText, Eye, Info, Grid, X
} from 'lucide-react';
import Modal, { btn, ConfirmDialog } from './ui/Modal';

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
  // 처음 보는 양식을 고칠 때 자동으로 만든 쇼핑몰 양식 id (안내 문구용)
  const [autoCreatedPlatformId, setAutoCreatedPlatformId] = useState<string | null>(null);

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
      displayLabel: `[${colNumToLetter(colIdx + 1)}열] ${String(h || '').trim() || '(칸 이름 없음)'}`,
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

  // 기본 양식이나 미등록 양식은 파일을 읽을 때 저장된 칸을 쓰지 않습니다.
  // 그래서 이런 파일에서 칸을 고치면, 지금 모양 그대로 새 쇼핑몰 양식을 만들어 그 파일에 연결합니다.
  const isGenericPlatform = (p: PlatformConfig | null | undefined) =>
    !!p && (p.id === 'default_platform' || p.id.startsWith('unregistered'));

  const buildPlatformFromActiveFile = (): PlatformConfig | null => {
    if (!activeFile || !activePlatform) return null;
    const base = activeFile.fileName.replace(/\.[^/.]+$/, "");
    const name = base.replace(/[0-9_\-\s]/g, " ").replace(/\s+/g, " ").trim() || "새 쇼핑몰";
    const key = base.split(/[_ -]/)[0] || "";
    return {
      id: 'custom_plat_' + Date.now(),
      name,
      identifier: '',
      start_row: activePlatform.start_row ?? 1,
      col_map: { ...activePlatform.col_map },
      tracking_col: activePlatform.tracking_col ?? 8,
      courier_col: activePlatform.courier_col,
      filepath_pattern: key
    };
  };

  const saveAsAutoCreatedPlatform = (cfg: PlatformConfig) => {
    const updated = [...platforms, cfg];
    onChange(updated);
    if (activeFile && onFilePlatformChange) {
      onFilePlatformChange(activeFile.fileName, cfg.id, updated);
    }
    setAutoCreatedPlatformId(cfg.id);
  };

  // 열 세팅 일괄 변경 처리 함수
  const handleUpdateColumnMapping = (targetPlatformId: string, fieldKey: string, newColIndex: number) => {
    if (activePlatform && isGenericPlatform(activePlatform) && targetPlatformId === activePlatform.id && activeFile) {
      const created = buildPlatformFromActiveFile();
      if (created) {
        if (fieldKey === 'tracking_col') created.tracking_col = newColIndex;
        else if (fieldKey === 'courier_col') created.courier_col = newColIndex;
        else created.col_map = { ...created.col_map, [fieldKey]: newColIndex };
        saveAsAutoCreatedPlatform(created);
        return;
      }
    }
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

    // 주문 다시 정리는 onChange가 바뀐 설정으로 해 줍니다. (여기서 또 부르면 옛 설정으로 한 번 더 돌아 덮어씀)

    const colLetter = colNumToLetter(newColIndex + 1);
    setToastMessage(`${colLetter}열로 바꿨어요. 주문도 다시 정리했어요.`);
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
      alert('쇼핑몰 이름을 적어 주세요.');
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
    setToastMessage(`'${newConfig.name}' 양식을 만들고 이 파일에 연결했어요.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 엑셀 헤더를 읽어서 목적 정보(상품명, 수량, 수령인, 연락처, 주소, 송장, 택배사 등) 자동 매칭 실행
  const handleAutoMatchHeaders = () => {
    if (!activeFile || !rawHeaders || rawHeaders.length === 0 || !activePlatform) {
      alert('엑셀 파일이 없거나 칸 이름을 읽지 못했어요.');
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

    if (isGenericPlatform(activePlatform)) {
      const created = buildPlatformFromActiveFile();
      if (created) {
        saveAsAutoCreatedPlatform({ ...created, col_map: updatedColMap, tracking_col: newTrackingCol, courier_col: newCourierCol });
        setToastMessage(`칸 이름으로 ${matchedCount}개를 다시 찾아 '${created.name}' 양식으로 저장했어요.`);
        setTimeout(() => setToastMessage(null), 3500);
        return;
      }
    }

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

    // 주문 다시 정리는 onChange와 onFilePlatformChange가 바뀐 설정으로 해 줍니다.

    setToastMessage(`칸 이름으로 ${matchedCount}개를 다시 찾았어요.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 감지/선택된 쇼핑몰 양식에 최신 스마트 매칭/설정 덮어씌우기
  const handleOverwriteActivePlatform = () => {
    if (!activePlatform || !activeFile) {
      alert('저장할 쇼핑몰 양식이나 파일을 골라 주세요.');
      return;
    }

    if (activePlatform.id.startsWith('unregistered')) {
      alert('처음 보는 양식이에요. "새 쇼핑몰로 등록"을 먼저 눌러 주세요.');
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

    // 주문 다시 정리는 onChange와 onFilePlatformChange가 바뀐 설정으로 해 줍니다.

    setToastMessage(`'${activePlatform.name}' 양식에 저장하고 주문을 다시 정리했어요.`);
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
    { key: '상품명', label: '상품명', icon: '', badgeBg: 'bg-brand-100 text-brand-800 border-brand-200', description: '주문한 상품 이름' },
    { key: '용량', label: '옵션·용량', icon: '', badgeBg: 'bg-blue-100 text-blue-800 border-blue-200', description: '예: 5kg, 1박스' },
    { key: '수량', label: '수량', icon: '', badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200', description: '몇 개 샀는지' },
    { key: '수령인', label: '받는 사람', icon: '', badgeBg: 'bg-purple-100 text-purple-800 border-purple-200', description: '받는 사람 이름' },
    { key: '연락처', label: '전화번호', icon: '', badgeBg: 'bg-amber-100 text-amber-800 border-amber-200', description: '받는 사람 휴대폰' },
    { key: '우편번호', label: '우편번호', icon: '', badgeBg: 'bg-cyan-100 text-cyan-800 border-cyan-200', description: '5자리 숫자' },
    { key: '주소', label: '주소', icon: '', badgeBg: 'bg-rose-100 text-rose-800 border-rose-200', description: '받는 곳 주소' },
    { key: '배송메시지', label: '배송 메시지', icon: '', badgeBg: 'bg-slate-100 text-slate-800 border-slate-200', description: '배송 요청 메모' },
    { key: 'tracking_col', label: '송장 번호 넣을 칸', icon: '', badgeBg: 'bg-violet-100 text-violet-800 border-violet-200', description: '쇼핑몰에 올릴 파일에서' },
    { key: 'courier_col', label: '택배사 이름 넣을 칸', icon: '', badgeBg: 'bg-teal-100 text-teal-800 border-teal-200', description: '쇼핑몰에 올릴 파일에서' },
  ] as const;

  // 택배사 매트릭스 타겟 필드 정의 (9가지 정보 - 2단계 택배사용)
  const COURIER_TARGET_FIELDS = [
    { key: 'tracking_col', label: '송장 번호', icon: '', badgeBg: 'bg-brand-100 text-brand-800 border-brand-200', description: '꼭 있어야 해요' },
    { key: 'name_col', label: '받는 사람', icon: '', badgeBg: 'bg-purple-100 text-purple-800 border-purple-200', description: '받는 사람 이름' },
    { key: 'phone_col', label: '전화번호', icon: '', badgeBg: 'bg-amber-100 text-amber-800 border-amber-200', description: '받는 사람 휴대폰' },
    { key: 'zip_col', label: '우편번호', icon: '', badgeBg: 'bg-cyan-100 text-cyan-800 border-cyan-200', description: '5자리 숫자' },
    { key: 'addr_col', label: '주소', icon: '', badgeBg: 'bg-rose-100 text-rose-800 border-rose-200', description: '받는 곳 주소' },
    { key: 'prod_col', label: '상품명', icon: '', badgeBg: 'bg-brand-100 text-brand-800 border-brand-200', description: '보낸 상품 이름' },
    { key: 'unit_col', label: '옵션·용량', icon: '', badgeBg: 'bg-blue-100 text-blue-800 border-blue-200', description: '예: 5kg, 1박스' },
    { key: 'qty_col', label: '수량', icon: '', badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200', description: '몇 개인지' },
    { key: 'courier_col', label: '택배사 이름', icon: '', badgeBg: 'bg-teal-100 text-teal-800 border-teal-200', description: '없으면 안 써도 돼요' },
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
    setToastMessage(`${colLetter === '미지정' ? '안 쓰도록' : colLetter + '열로'} 바꿔 택배사 양식에 저장했어요.`);
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

    setToastMessage(`칸 이름으로 다시 찾아 '${activeCourier.name}' 양식에 저장했어요.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 감지/선택된 택배사 양식에 최신 스마트 매칭/설정 덮어씌우기
  const handleOverwriteActiveCourier = () => {
    if (!activeCourier) {
      alert('저장할 택배사 양식을 골라 주세요.');
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

    setToastMessage(`'${activeCourier.name}' 양식에 저장했어요.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // 현재 감지된 헤더 세팅으로 신규 택배사 양식 등록 처리
  const handleSaveAsNewCourierSubmit = () => {
    if (!newCourierNameInput.trim()) {
      alert('택배사 이름을 적어 주세요.');
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
    setToastMessage(`'${newConfig.name}' 택배사 양식을 만들었어요.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <div id="platform-settings-container" className="space-y-6">
      
      {/* 토스트 알림 메시지 */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold border border-slate-700">
          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
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
      {/* 메인화면: 쇼핑몰·택배사 엑셀의 칸 맞추기                     */}
      {/* ======================================================== */}
      <div className="space-y-5 animate-fade-in">

        {/* 머리: 제목, 등록된 양식 보기, 쇼핑몰/택배사 전환, 볼 파일 고르기 */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">쇼핑몰·택배사 칸 맞추기</h2>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed max-w-[64ch]">
                엑셀의 어느 칸이 상품명이고 어느 칸이 받는 사람인지 맞추는 곳이에요. 대부분은 자동으로 맞춰져요. 정리 결과가 이상할 때만 여기서 고치면 돼요.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* 등록된 쇼핑몰·택배사 양식 창 열기 */}
              <button
                id="btn-open-settings-modal"
                onClick={() => {
                  setModalTab(matrixType === 'courier' ? 'courier' : 'platform');
                  setShowSettingsModal(true);
                }}
                className="pressable inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
              >
                <Settings className="w-4 h-4" />
                등록된 양식 보기
              </button>

              {parsedFiles.length > 0 && onNavigateToProcessTab && (
                <button
                  onClick={onNavigateToProcessTab}
                  className="pressable inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white hover:bg-brand-700 cursor-pointer"
                >
                  주문정리로 돌아가기
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* 쇼핑몰 주문 엑셀 / 택배사 송장 엑셀 전환 */}
          <div role="tablist" aria-label="엑셀 종류" className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 sm:inline-grid">
            {([
              { key: 'platform', label: '쇼핑몰 주문 엑셀', icon: <ShoppingBag className="w-4 h-4 shrink-0" />, count: parsedFiles.length },
              { key: 'courier', label: '택배사 송장 엑셀', icon: <Truck className="w-4 h-4 shrink-0" />, count: parsedTrackingFiles.length },
            ] as const).map(t => (
              <button
                key={t.key}
                role="tab"
                aria-selected={matrixType === t.key}
                onClick={() => setMatrixType(t.key)}
                className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-semibold cursor-pointer sm:px-3.5 ${
                  matrixType === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.icon}
                {t.label}
                {t.count > 0 && <span className="font-mono text-xs tabular-nums text-slate-500">{t.count}</span>}
              </button>
            ))}
          </div>

          {/* 쇼핑몰: 볼 파일 고르기 */}
          {matrixType === 'platform' && parsedFiles.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 mr-1">볼 파일</span>
              {parsedFiles.map((pf, idx) => {
                const isSelected = selectedFileIdx === idx;
                const generic = isGenericPlatform(pf.detectedPlatform);
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedFileIdx(idx)}
                    aria-pressed={isSelected}
                    className={`inline-flex min-h-[36px] items-center gap-2 rounded-lg border px-3 text-[13px] cursor-pointer ${
                      isSelected ? 'border-brand-600 bg-brand-50 text-slate-900 font-semibold' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {generic ? <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> : <CheckCircle2 className="w-3.5 h-3.5 text-brand-600" />}
                    <span className="max-w-[200px] truncate">{pf.fileName}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 택배사: 볼 파일 고르기 */}
          {matrixType === 'courier' && parsedTrackingFiles.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 mr-1">볼 파일</span>
              {parsedTrackingFiles.map((ptf, idx) => {
                const isSelected = selectedTrackingFileIdx === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedTrackingFileIdx(idx);
                      setSelectedCourierId(ptf.detectedCourier);
                    }}
                    aria-pressed={isSelected}
                    className={`inline-flex min-h-[36px] items-center gap-2 rounded-lg border px-3 text-[13px] cursor-pointer ${
                      isSelected ? 'border-brand-600 bg-brand-50 text-slate-900 font-semibold' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Truck className="w-3.5 h-3.5 text-slate-500" />
                    <span className="max-w-[200px] truncate">{ptf.fileName}</span>
                    <span className="text-slate-500">{ptf.detectedCourier}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* A. 쇼핑몰 주문 엑셀                                        */}
        {/* ======================================================== */}
        {matrixType === 'platform' && !activeFile && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">아직 올린 주문 엑셀이 없어요</h3>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed max-w-[64ch]">
                주문정리에서 주문 엑셀을 올리면, 여기서 칸이 제대로 맞았는지 예시 값과 함께 볼 수 있어요.
              </p>
            </div>
            {onNavigateToProcessTab && (
              <button
                onClick={onNavigateToProcessTab}
                className="pressable inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 cursor-pointer"
              >
                주문서 올리러 가기
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-600">등록된 쇼핑몰 양식 {platforms.length}개</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {platforms.map(p => (
                  <span key={p.id} className="rounded-md bg-slate-100 px-2 py-1 text-[13px] text-slate-700">{p.name}</span>
                ))}
              </div>
              <button
                onClick={() => { setModalTab('platform'); setShowSettingsModal(true); }}
                className="mt-3 inline-flex min-h-[40px] items-center text-sm font-semibold text-brand-700 underline-offset-4 hover:underline cursor-pointer"
              >
                등록된 양식 고치기
              </button>
            </div>
          </div>
        )}

        {matrixType === 'platform' && activeFile && activePlatform && (() => {
          const generic = isGenericPlatform(activePlatform);
          const justCreated = autoCreatedPlatformId !== null && activePlatform.id === autoCreatedPlatformId;
          const sampleRow: any[] = previewRows[1] || [];
          const colOf = (key: string): number => {
            if (key === 'tracking_col') return activePlatform.tracking_col;
            if (key === 'courier_col') return activePlatform.courier_col !== undefined ? activePlatform.courier_col : -1;
            return (activePlatform.col_map as any)[key] !== undefined ? (activePlatform.col_map as any)[key] : 0;
          };
          // 읽는 항목(상품명·받는 사람 등)끼리만 겹치는지 셉니다. 송장·택배사 칸은 '써 넣는 칸'이라 따로 봅니다.
          const usedCount = new Map<number, number>();
          TARGET_FIELDS.forEach(f => {
            if (f.key === 'tracking_col' || f.key === 'courier_col') return;
            const c = colOf(f.key); if (c >= 0) usedCount.set(c, (usedCount.get(c) || 0) + 1);
          });
          const readFieldLabelAt = (c: number) => TARGET_FIELDS.find(f => f.key !== 'tracking_col' && f.key !== 'courier_col' && colOf(f.key) === c)?.label;
          const openNewPlatformModal = () => {
            const autoName = activeFile.fileName.replace(/\.[^/.]+$/, "").replace(/[0-9_\-\s]/g, " ").trim() || "신규 쇼핑몰";
            const autoKey = activeFile.fileName.replace(/\.[^/.]+$/, "").split(/[_ -]/)[0] || "";
            setNewPlatformNameInput(autoName);
            setNewPlatformPatternInput(autoKey);
            setShowSaveAsNewModal(true);
          };
          return (
            <>
              {/* 이 파일을 어떻게 읽었는지 */}
              <section className={`rounded-2xl border p-5 space-y-3 ${generic ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-start gap-3">
                  {generic
                    ? <AlertTriangle className="mt-0.5 w-5 h-5 shrink-0 text-amber-600" />
                    : <CheckCircle2 className="mt-0.5 w-5 h-5 shrink-0 text-brand-600" />}
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900">
                      {generic ? '처음 보는 양식이에요' : justCreated ? `처음 보는 양식이라 '${activePlatform.name}'(으)로 저장했어요` : `'${activePlatform.name}' 양식으로 읽었어요`}
                    </h3>
                    <p className="mt-1 text-sm text-slate-700 leading-relaxed max-w-[70ch]">
                      {generic
                        ? '칸 이름을 보고 자동으로 맞춰 봤어요. 아래 표의 예시 값을 보고 틀린 칸만 고르세요. 고르는 순간 이 파일 모양을 새 쇼핑몰 양식으로 저장하고, 주문도 다시 정리해요.'
                        : '칸을 바꾸면 바로 저장되고, 올린 주문도 다시 정리돼요.'}
                    </p>
                    {secondaryColsInfo.length > 0 && (
                      <p className="mt-1 text-sm text-slate-700">
                        {secondaryColsInfo.map(s => `${s.letter}열 [${s.headerName}]`).join(', ')}도 옵션에 함께 붙여요.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-8">
                  {onFilePlatformChange && (
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      이 파일을 읽을 양식
                      <select
                        value={activePlatform.id}
                        onChange={(e) => onFilePlatformChange(activeFile.fileName, e.target.value)}
                        className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 cursor-pointer"
                      >
                        {!platforms.some(p => p.id === activePlatform.id) && (
                          <option value={activePlatform.id}>{activePlatform.id.startsWith('unregistered') ? '처음 보는 양식' : activePlatform.name}</option>
                        )}
                        {platforms.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {justCreated && (
                    <button
                      onClick={() => { setModalTab('platform'); setEditingPlatform(activePlatform); setShowSettingsModal(true); }}
                      className="inline-flex min-h-[36px] items-center text-sm font-semibold text-brand-700 underline-offset-4 hover:underline cursor-pointer"
                    >
                      이름 바꾸기
                    </button>
                  )}
                  <button
                    onClick={openNewPlatformModal}
                    className="inline-flex min-h-[36px] items-center gap-1 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    새 쇼핑몰로 등록
                  </button>
                </div>
              </section>

              {/* 칸 표: 항목 / 엑셀에서 찾은 칸 / 바꾸기 */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">칸 확인하기</h3>
                    <p className="text-sm text-slate-600 mt-0.5">
                      예시 값은 <span className="font-medium text-slate-800">{activeFile.fileName}</span>의 첫 주문이에요. 예시가 이상하면 맞는 칸으로 바꾸세요.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleAutoMatchHeaders}
                      className="pressable inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      칸 이름으로 다시 찾기
                    </button>
                    <button
                      onClick={() => {
                        if (onReProcessOrders) onReProcessOrders();
                        setToastMessage("주문을 다시 정리했어요.");
                        setTimeout(() => setToastMessage(null), 3000);
                      }}
                      className="pressable inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                    >
                      주문 다시 정리
                    </button>
                    {!generic && (
                      <button
                        onClick={handleOverwriteActivePlatform}
                        className="pressable inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        '{activePlatform.name}' 양식에 저장
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse sm:min-w-[640px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[13px] max-sm:hidden">
                        <th className="py-2.5 px-4 font-semibold w-48">항목</th>
                        <th className="py-2.5 px-4 font-semibold">엑셀에서 찾은 칸</th>
                        <th className="py-2.5 px-4 font-semibold w-72">바꾸기</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {TARGET_FIELDS.map((field) => {
                        const idx = colOf(field.key);
                        const assigned = idx >= 0;
                        const headerText = assigned && rawHeaders[idx] !== undefined ? String(rawHeaders[idx]).trim() : '';
                        const sample = assigned && sampleRow[idx] !== undefined ? String(sampleRow[idx]).trim() : '';
                        const isWriteCol = field.key === 'tracking_col' || field.key === 'courier_col';
                        const overlapsRead = isWriteCol && assigned ? readFieldLabelAt(idx) : undefined;
                        const looksLikeBuyer = (field.key === '수령인' || field.key === '연락처') && /주문자|구매자|주문인/.test(headerText);
                        const warn = !assigned ? ''
                          : !headerText ? '칸 이름이 없어요'
                          : isWriteCol ? (overlapsRead ? `'${overlapsRead}' 칸과 같아요. 송장을 붙인 파일에서 이 칸 내용이 바뀌어요` : '')
                          : (usedCount.get(idx) || 0) > 1 ? '다른 항목과 같은 칸이에요'
                          : looksLikeBuyer ? '주문한 사람 칸 같아요. 받는 사람 칸이 맞는지 예시를 보세요'
                          : '';
                        return (
                          <tr key={field.key} className={`max-sm:grid max-sm:grid-cols-1 max-sm:gap-1.5 max-sm:px-4 max-sm:py-3 ${warn ? 'bg-amber-50/70' : ''}`}>
                            <td className="py-3 px-4 align-top max-sm:p-0">
                              <div className="font-semibold text-slate-900">{field.label}</div>
                              <div className="text-[13px] text-slate-500">{field.description}</div>
                            </td>
                            <td className="py-3 px-4 align-top max-sm:p-0">
                              {assigned ? (
                                <div className="space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-[13px] font-medium text-slate-900 bg-slate-100 rounded px-1.5 py-0.5">{colNumToLetter(idx + 1)}열</span>
                                    <span className="text-slate-800">{headerText || '(칸 이름 없음)'}</span>
                                  </div>
                                  {!isWriteCol && (
                                    <div className="text-[13px] text-slate-600 truncate max-w-[360px]" title={sample}>
                                      예: {sample || <span className="text-slate-400">비어 있음</span>}
                                    </div>
                                  )}
                                  {warn && (
                                    <div className="inline-flex items-center gap-1 text-[13px] font-semibold text-amber-800">
                                      <AlertTriangle className="w-3.5 h-3.5" />{warn}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-500">안 씀</span>
                              )}
                            </td>
                            <td className="py-3 px-4 align-top max-sm:p-0">
                              <select
                                aria-label={`${field.label} 칸 바꾸기`}
                                value={idx}
                                onChange={(e) => handleUpdateColumnMapping(activePlatform.id, field.key, parseInt(e.target.value, 10))}
                                className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 cursor-pointer"
                              >
                                {allHeaderColumns.map(col => (
                                  <option key={col.index} value={col.index}>
                                    {col.letter}열 · {col.headerText || '(칸 이름 없음)'}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 칸 이름으로 찾기 (접어 둠) */}
              <details className="group bg-white border border-slate-200 rounded-2xl">
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-semibold text-slate-800">
                  <span className="inline-flex items-center gap-2"><Search className="w-4 h-4 text-slate-500" />칸 이름으로 찾기</span>
                  <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 px-5 pb-5">
                  <p className="text-sm text-slate-600">이 파일의 칸 {allHeaderColumns.length}개 중에서 이름이나 열 글자(예: E)로 찾아요.</p>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={keywordSearch}
                      onChange={(e) => setKeywordSearch(e.target.value)}
                      placeholder="예: 받는사람, 수량, 옵션, E"
                      className="w-full min-h-[44px] pl-10 pr-10 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
                    />
                    {keywordSearch && (
                      <button
                        onClick={() => setKeywordSearch('')}
                        aria-label="검색어 지우기"
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {keywordSearch.trim() !== '' && (
                    filteredColumns.length > 0 ? (
                      <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto pr-1">
                        {filteredColumns.map(col => (
                          <div key={col.index} className="rounded-lg border border-slate-200 p-2.5 text-sm space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[13px] bg-slate-100 rounded px-1.5 py-0.5">{col.letter}열</span>
                              <span className="font-semibold text-slate-800">{col.headerText || '(칸 이름 없음)'}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {TARGET_FIELDS.filter(f => !['tracking_col', 'courier_col', '우편번호'].includes(f.key)).map(f => (
                                <button
                                  key={f.key}
                                  onClick={() => handleUpdateColumnMapping(activePlatform.id, f.key, col.index)}
                                  className="min-h-[32px] rounded-md bg-slate-100 px-2 text-[13px] text-slate-700 hover:bg-brand-600 hover:text-white cursor-pointer"
                                >
                                  {f.label}(으)로
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">"{keywordSearch}"이(가) 들어간 칸이 없어요.</p>
                    )
                  )}
                </div>
              </details>

              {/* 엑셀 첫 5줄 보기 (접어 둠) */}
              {previewRows.length > 0 && (
                <details className="group bg-white border border-slate-200 rounded-2xl">
                  <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-semibold text-slate-800">
                    <span className="inline-flex items-center gap-2"><Eye className="w-4 h-4 text-slate-500" />엑셀 첫 5줄 보기</span>
                    <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-5 pb-5 space-y-2">
                    <p className="text-sm text-slate-600">{headerRowIndex + 1}번째 줄을 칸 이름으로 읽었어요. 칸 위의 표시는 그 칸을 어떤 항목으로 쓰는지예요.</p>
                    <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-lg">
                      <table className="w-full text-left text-[13px] border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-700">
                            <th className="p-2 w-10 text-center font-semibold border-r border-slate-200">줄</th>
                            {rawHeaders.map((_, cIdx) => {
                              const mappedField = TARGET_FIELDS.find(f => colOf(f.key) === cIdx);
                              return (
                                <th key={cIdx} className="p-2 min-w-[110px] max-w-[200px] align-top border-r border-slate-100">
                                  <div className="font-mono text-xs text-slate-500">{colNumToLetter(cIdx + 1)}</div>
                                  {mappedField && <div className="mt-0.5 inline-block rounded bg-brand-100 px-1.5 text-xs font-semibold text-brand-800">{mappedField.label}</div>}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {previewRows.map((row, rIdx) => (
                            <tr key={rIdx} className={rIdx === 0 ? 'bg-slate-50 font-semibold text-slate-900' : ''}>
                              <td className="p-2 text-center text-slate-500 border-r border-slate-200 tabular-nums">{headerRowIndex + rIdx + 1}</td>
                              {rawHeaders.map((_, cIdx) => (
                                <td key={cIdx} className="p-2 border-r border-slate-100 max-w-[200px] truncate" title={String(row[cIdx] || '')}>
                                  {String(row[cIdx] || '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>
              )}
            </>
          );
        })()}

        {/* ======================================================== */}
        {/* B. 택배사 송장 엑셀                                        */}
        {/* ======================================================== */}
        {matrixType === 'courier' && (() => {
          const tHeaders: any[] = trackingHeaderInfo.rawHeaders || [];
          const tSample: any[] = trackingHeaderInfo.previewRows[1] || [];
          const cColOf = (key: string): number => activeCourier && (activeCourier as any)[key] !== undefined ? (activeCourier as any)[key] : -1;
          const tUsed = new Map<number, number>();
          COURIER_TARGET_FIELDS.forEach(f => { const c = cColOf(f.key); if (c >= 0) tUsed.set(c, (tUsed.get(c) || 0) + 1); });
          const openNewCourierModal = () => {
            const autoName = activeTrackingFile
              ? activeTrackingFile.fileName.replace(/\.[^/.]+$/, "").replace(/[0-9_\-\s]/g, " ").trim() || "신규 택배사"
              : "신규 택배사";
            const autoKey = activeTrackingFile
              ? activeTrackingFile.fileName.replace(/\.[^/.]+$/, "").split(/[_ -]/)[0] || ""
              : "";
            setNewCourierNameInput(autoName);
            setNewCourierPatternInput(autoKey);
            setShowSaveAsNewCourierModal(true);
          };
          return (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <div className="flex items-start gap-3">
                  {activeTrackingFile ? <CheckCircle2 className="mt-0.5 w-5 h-5 shrink-0 text-brand-600" /> : <Info className="mt-0.5 w-5 h-5 shrink-0 text-slate-500" />}
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900">
                      {activeTrackingFile
                        ? `'${activeCourier?.name || '택배사'}' 양식으로 읽었어요`
                        : '아직 올린 송장 엑셀이 없어요'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-700 leading-relaxed max-w-[70ch]">
                      {activeTrackingFile
                        ? '칸을 바꾸면 이 택배사 양식에 바로 저장돼요.'
                        : '등록된 택배사 양식을 골라 어느 칸을 읽는지 볼 수 있어요.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-8">
                  {activeTrackingFile && onFileCourierChange ? (
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      이 파일을 읽을 택배사
                      <select
                        value={activeCourier?.name || ''}
                        onChange={(e) => onFileCourierChange(activeTrackingFile.fileName, e.target.value)}
                        className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 cursor-pointer"
                      >
                        {couriers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </label>
                  ) : (
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      볼 택배사
                      <select
                        value={activeCourier?.id || activeCourier?.name || ''}
                        onChange={(e) => setSelectedCourierId(e.target.value)}
                        className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 cursor-pointer"
                      >
                        {couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </label>
                  )}
                  <button
                    onClick={openNewCourierModal}
                    className="inline-flex min-h-[36px] items-center gap-1 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    새 택배사로 등록
                  </button>
                </div>
              </section>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">칸 확인하기</h3>
                    <p className="text-sm text-slate-600 mt-0.5">
                      {activeTrackingFile
                        ? <>예시 값은 <span className="font-medium text-slate-800">{activeTrackingFile.fileName}</span>의 첫 줄이에요.</>
                        : `'${activeCourier?.name || '택배사'}' 양식이 읽는 칸이에요.`}
                    </p>
                  </div>
                  {activeTrackingFile && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={handleAutoMatchCourierHeaders}
                        className="pressable inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        칸 이름으로 다시 찾기
                      </button>
                      {activeCourier && (
                        <button
                          onClick={handleOverwriteActiveCourier}
                          className="pressable inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                        >
                          <Save className="w-3.5 h-3.5" />
                          '{activeCourier.name}' 양식에 저장
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse sm:min-w-[640px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[13px] max-sm:hidden">
                        <th className="py-2.5 px-4 font-semibold w-48">항목</th>
                        <th className="py-2.5 px-4 font-semibold">엑셀에서 찾은 칸</th>
                        <th className="py-2.5 px-4 font-semibold w-72">바꾸기</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {COURIER_TARGET_FIELDS.map((field) => {
                        const idx = cColOf(field.key);
                        const assigned = idx >= 0;
                        const headerText = assigned && tHeaders[idx] !== undefined ? String(tHeaders[idx]).trim() : '';
                        const sample = assigned && tSample[idx] !== undefined ? String(tSample[idx]).trim() : '';
                        const warn = !activeTrackingFile || !assigned ? '' : !headerText ? '칸 이름이 없어요' : (tUsed.get(idx) || 0) > 1 ? '다른 항목과 같은 칸이에요' : '';
                        return (
                          <tr key={field.key} className={`max-sm:grid max-sm:grid-cols-1 max-sm:gap-1.5 max-sm:px-4 max-sm:py-3 ${warn ? 'bg-amber-50/70' : ''}`}>
                            <td className="py-3 px-4 align-top max-sm:p-0">
                              <div className="font-semibold text-slate-900">{field.label}</div>
                              <div className="text-[13px] text-slate-500">{field.description}</div>
                            </td>
                            <td className="py-3 px-4 align-top max-sm:p-0">
                              {assigned ? (
                                <div className="space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-[13px] font-medium text-slate-900 bg-slate-100 rounded px-1.5 py-0.5">{colNumToLetter(idx + 1)}열</span>
                                    {activeTrackingFile && <span className="text-slate-800">{headerText || '(칸 이름 없음)'}</span>}
                                  </div>
                                  {activeTrackingFile && (
                                    <div className="text-[13px] text-slate-600 truncate max-w-[360px]" title={sample}>
                                      예: {sample || <span className="text-slate-400">비어 있음</span>}
                                    </div>
                                  )}
                                  {warn && (
                                    <div className="inline-flex items-center gap-1 text-[13px] font-semibold text-amber-800">
                                      <AlertTriangle className="w-3.5 h-3.5" />{warn}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-500">안 씀</span>
                              )}
                            </td>
                            <td className="py-3 px-4 align-top max-sm:p-0">
                              {activeCourier ? (
                                <select
                                  aria-label={`${field.label} 칸 바꾸기`}
                                  value={idx}
                                  onChange={(e) => handleUpdateCourierColumnMapping(activeCourier.id, field.key, parseInt(e.target.value, 10))}
                                  className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 cursor-pointer"
                                >
                                  <option value={-1}>안 씀</option>
                                  {tHeaders.length > 0 ? (
                                    tHeaders.map((h: any, colIdx: number) => (
                                      <option key={colIdx} value={colIdx}>
                                        {colNumToLetter(colIdx + 1)}열 · {String(h || '').trim() || '(칸 이름 없음)'}
                                      </option>
                                    ))
                                  ) : (
                                    Array.from({ length: 20 }, (_, i) => (
                                      <option key={i} value={i}>{colNumToLetter(i + 1)}열</option>
                                    ))
                                  )}
                                </select>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {activeTrackingFile && tHeaders.length > 0 && (
                <details className="group bg-white border border-slate-200 rounded-2xl">
                  <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-semibold text-slate-800">
                    <span className="inline-flex items-center gap-2"><Search className="w-4 h-4 text-slate-500" />칸 이름으로 찾기</span>
                    <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-3 px-5 pb-5">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={keywordSearch}
                        onChange={(e) => setKeywordSearch(e.target.value)}
                        placeholder="예: 송장번호, 받는분, 주소, B"
                        className="w-full min-h-[44px] pl-10 pr-10 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
                      />
                      {keywordSearch && (
                        <button
                          onClick={() => setKeywordSearch('')}
                          aria-label="검색어 지우기"
                          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {keywordSearch.trim() !== '' && (
                      <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto pr-1">
                        {tHeaders
                          .map((h: any, i: number) => ({ index: i, letter: colNumToLetter(i + 1), text: String(h || '').trim() }))
                          .filter(col => col.text.toLowerCase().includes(keywordSearch.trim().toLowerCase()) || col.letter.toLowerCase() === keywordSearch.trim().toLowerCase() || (col.index + 1).toString() === keywordSearch.trim())
                          .map(col => (
                            <div key={col.index} className="rounded-lg border border-slate-200 p-2.5 text-sm space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[13px] bg-slate-100 rounded px-1.5 py-0.5">{col.letter}열</span>
                                <span className="font-semibold text-slate-800">{col.text || '(칸 이름 없음)'}</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {COURIER_TARGET_FIELDS.map(f => (
                                  <button
                                    key={f.key}
                                    onClick={() => activeCourier && handleUpdateCourierColumnMapping(activeCourier.id, f.key, col.index)}
                                    className="min-h-[32px] rounded-md bg-slate-100 px-2 text-[13px] text-slate-700 hover:bg-brand-600 hover:text-white cursor-pointer"
                                  >
                                    {f.label}(으)로
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </details>
              )}

              {activeTrackingFile && trackingHeaderInfo.previewRows.length > 0 && (
                <details className="group bg-white border border-slate-200 rounded-2xl">
                  <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-semibold text-slate-800">
                    <span className="inline-flex items-center gap-2"><Eye className="w-4 h-4 text-slate-500" />엑셀 첫 5줄 보기</span>
                    <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-5 pb-5 space-y-2">
                    <p className="text-sm text-slate-600">{trackingHeaderInfo.headerRowIndex + 1}번째 줄을 칸 이름으로 읽었어요.</p>
                    <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-lg">
                      <table className="w-full text-left text-[13px] border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-700">
                            <th className="p-2 w-10 text-center font-semibold border-r border-slate-200">줄</th>
                            {tHeaders.map((_, cIdx) => {
                              const mappedField = COURIER_TARGET_FIELDS.find(f => cColOf(f.key) === cIdx);
                              return (
                                <th key={cIdx} className="p-2 min-w-[110px] max-w-[200px] align-top border-r border-slate-100">
                                  <div className="font-mono text-xs text-slate-500">{colNumToLetter(cIdx + 1)}</div>
                                  {mappedField && <div className="mt-0.5 inline-block rounded bg-brand-100 px-1.5 text-xs font-semibold text-brand-800">{mappedField.label}</div>}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {trackingHeaderInfo.previewRows.map((row, rIdx) => (
                            <tr key={rIdx} className={rIdx === 0 ? 'bg-slate-50 font-semibold text-slate-900' : ''}>
                              <td className="p-2 text-center text-slate-500 border-r border-slate-200 tabular-nums">{trackingHeaderInfo.headerRowIndex + rIdx + 1}</td>
                              {tHeaders.map((_, cIdx) => (
                                <td key={cIdx} className="p-2 border-r border-slate-100 max-w-[200px] truncate" title={String(row[cIdx] || '')}>
                                  {String(row[cIdx] || '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>
              )}
            </>
          );
        })()}

      </div>

      {/* ======================================================== */}
      {/* 톱니바퀴 모달 팝업: 쇼핑몰 양식 & 택배사 송장 상세 관리     */}
      {/* ======================================================== */}
      {showSettingsModal && (
        <Modal
          onClose={() => setShowSettingsModal(false)}
          title="등록된 쇼핑몰·택배사"
          description="엑셀을 어떻게 읽을지 정해 둔 양식이에요. 정리 결과가 이상할 때만 고치면 돼요."
          size="xl"
          closeOnEsc={false}
          footer={<button type="button" onClick={() => setShowSettingsModal(false)} className={btn.dark}>닫기</button>}
        >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
              <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm" role="tablist" aria-label="양식 종류">
                <button
                  type="button"
                  role="tab"
                  aria-selected={modalTab === 'platform'}
                  onClick={() => setModalTab('platform')}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 transition cursor-pointer ${modalTab === 'platform' ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  <ShoppingBag className="w-4 h-4" />쇼핑몰 <span className="font-normal text-slate-500">{platforms.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={modalTab === 'courier'}
                  onClick={() => setModalTab('courier')}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 transition cursor-pointer ${modalTab === 'courier' ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  <Truck className="w-4 h-4" />택배사 <span className="font-normal text-slate-500">{couriers.length}</span>
                </button>
              </div>
              {modalTab === 'platform' ? (
                <button type="button" onClick={() => setShowPresetModal(true)} className={`${btn.secondary} min-h-9 px-3 text-brand-700`}>
                  <Plus className="w-4 h-4" />쇼핑몰 추가
                </button>
              ) : (
                <button type="button" onClick={() => setShowCourierPresetModal(true)} className={`${btn.secondary} min-h-9 px-3 text-brand-700`}>
                  <Plus className="w-4 h-4" />택배사 추가
                </button>
              )}
            </div>

            <div className="space-y-5">
              
              {/* TAB 1: 쇼핑몰 양식 설정 */}
              {modalTab === 'platform' && (
                <div className="space-y-6">
                  <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                    {platforms.map(p => {
                      const isEditing = editingPlatform?.id === p.id;
                      const isBase = p.id === 'default_platform';
                      const keyword = p.filepath_pattern || p.identifier;
                      return (
                        <li key={p.id} className={`flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${isEditing ? 'bg-brand-50' : isBase ? 'bg-slate-50' : 'bg-white'}`}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                              {p.name}
                              {isBase && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">기본</span>}
                            </div>
                            <div className="text-[13px] text-slate-600">
                              {keyword ? <>파일 이름에 <b className="font-semibold text-slate-800">{keyword}</b>가 있으면 이 양식</> : '어느 쇼핑몰인지 모를 때 칸 이름을 보고 읽어요'}
                              {' · '}주문은 {p.start_row + 1}번째 줄부터 · 송장 번호는 {colNumToLetter(p.tracking_col + 1)}열
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1 self-end sm:self-auto">
                            <button type="button" onClick={() => { setEditingPlatform(p); requestAnimationFrame(() => document.getElementById('edit-platform-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} className={`${btn.ghost} min-h-9 px-3 text-[13px]`}>고치기</button>
                            <button type="button" onClick={() => setDeletingPlatform(p)} className={`${btn.ghost} min-h-9 px-3 text-[13px] text-rose-700 hover:bg-rose-50`}>지우기</button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {/* 쇼핑몰 상세 편집 Form */}
                  {editingPlatform && (
                    <div id="edit-platform-form" className="scroll-mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4 sm:p-5">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                        <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                          <Edit3 className="w-4 h-4 text-brand-600" />
                          '{editingPlatform.name}' 고치기
                        </h4>
                        <button
                          type="button"
                          onClick={() => setEditingPlatform(null)}
                          aria-label="고치기 닫기"
                          className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[13px] font-semibold text-slate-800 mb-1">쇼핑몰 이름</label>
                          <input
                            type="text"
                            value={editingPlatform.name}
                            onChange={(e) => setEditingPlatform({ ...editingPlatform, name: e.target.value })}
                            className="w-full text-sm h-10 px-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
                          />
                        </div>

                        <div>
                          <label className="block text-[13px] font-semibold text-slate-800 mb-1">파일 이름에 들어 있는 말 (이 말이 있으면 이 쇼핑몰로 읽어요)</label>
                          <input
                            type="text"
                            value={editingPlatform.filepath_pattern || editingPlatform.identifier || ''}
                            onChange={(e) => setEditingPlatform({ 
                              ...editingPlatform, 
                              filepath_pattern: e.target.value,
                              identifier: e.target.value 
                            })}
                            placeholder="예: 쿠팡, coupang, smartstore..."
                            className="w-full text-sm h-10 px-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[13px] font-semibold text-slate-800 mb-1">주문이 시작되는 줄 (칸 이름 바로 다음 줄)</label>
                          <input
                            type="number"
                            min="1"
                            value={startRowInput}
                            onChange={(e) => handleStartRowChange(e.target.value)}
                            className="w-full text-sm h-10 px-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 font-mono"
                          />
                        </div>
                      </div>

                      <div className="border-t border-slate-200 pt-3 space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-2">항목별 칸 (A, B, C 같은 열 글자나 1, 2, 3 같은 번호)</label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            {Object.entries(editingPlatform.col_map).map(([key]) => {
                              const valStr = colMapInputs[key] || '';
                              const { displayPreview } = getColumnPreview(valStr);
                              return (
                                <div key={key} className="bg-white p-2 rounded-lg border border-slate-200">
                                  <span className="block text-xs font-semibold text-slate-600 mb-1">{key}</span>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={valStr}
                                      onChange={(e) => handleColMapChange(key, e.target.value)}
                                      className="w-full text-xs p-1 bg-slate-50 border border-slate-200 rounded font-mono uppercase"
                                    />
                                    <span className="text-xs text-brand-600 font-mono shrink-0">{displayPreview}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 송장기입열 & 택배사열 지정 필드 복구 */}
                        <div className="pt-3 border-t border-slate-200">
                          <label className="block text-xs font-bold text-[#0F3A2F] mb-2">
                            쇼핑몰에 올릴 파일에서 송장 번호와 택배사를 넣을 칸
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div className="bg-brand-50/70 p-3 rounded-xl border border-brand-200 space-y-1">
                              <span className="block text-xs font-bold text-[#0F3A2F]">송장 번호를 넣을 칸</span>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={trackingColInput}
                                  onChange={(e) => handleTrackingColChange(e.target.value)}
                                  placeholder="예: I 또는 9"
                                  className="w-full text-xs p-2 bg-white border border-brand-200 rounded-lg font-mono uppercase font-bold text-[#0F3A2F] focus:outline-none focus:ring-1 focus:ring-brand-600"
                                />
                                <span className="text-xs text-brand-700 font-mono font-bold shrink-0">{getColumnPreview(trackingColInput).displayPreview}</span>
                              </div>
                            </div>

                            <div className="bg-brand-50/70 p-3 rounded-xl border border-brand-200 space-y-1">
                              <span className="block text-xs font-bold text-[#0F3A2F]">택배사 이름을 넣을 칸</span>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={courierColInput}
                                  onChange={(e) => handleCourierColChange(e.target.value)}
                                  placeholder="예: J 또는 10 (비우면 안 써요)"
                                  className="w-full text-xs p-2 bg-white border border-brand-200 rounded-lg font-mono uppercase font-bold text-[#0F3A2F] focus:outline-none focus:ring-1 focus:ring-brand-600"
                                />
                                <span className="text-xs text-brand-700 font-mono font-bold shrink-0">{getColumnPreview(courierColInput).displayPreview}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                        <button type="button" onClick={() => setEditingPlatform(null)} className={btn.secondary}>
                          취소
                        </button>
                        <button type="button" onClick={() => savePlatform(editingPlatform)} className={btn.primary}>
                          저장하기
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: 택배사 송장 컬럼 설정 */}
              {modalTab === 'courier' && (
                <div className="space-y-6">
                  <p className="text-[13px] text-slate-600">택배사에서 받은 송장 엑셀에서 어느 칸을 읽을지 정해 둔 양식이에요.</p>
                  <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                    {couriers.map(c => {
                      const isEditing = editingCourier?.id === c.id;
                      return (
                        <li key={c.id} className={`flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${isEditing ? 'bg-brand-50' : 'bg-white'}`}>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900">{c.name}</div>
                            <div className="text-[13px] text-slate-600">송장은 {c.start_row + 1}번째 줄부터 · 송장 번호는 {colNumToLetter(c.tracking_col + 1)}열</div>
                          </div>
                          <div className="flex shrink-0 gap-1 self-end sm:self-auto">
                            <button type="button" onClick={() => { setEditingCourier(c); requestAnimationFrame(() => document.getElementById('edit-courier-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} className={`${btn.ghost} min-h-9 px-3 text-[13px]`}>고치기</button>
                            <button type="button" onClick={() => setDeletingCourier(c)} className={`${btn.ghost} min-h-9 px-3 text-[13px] text-rose-700 hover:bg-rose-50`}>지우기</button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {/* 택배사 상세 편집 Form */}
                  {editingCourier && (
                    <div id="edit-courier-form" className="scroll-mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4 sm:p-5">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                        <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                          <Edit3 className="w-4 h-4 text-brand-600" />
                          '{editingCourier.name}' 고치기
                        </h4>
                        <button
                          type="button"
                          onClick={() => setEditingCourier(null)}
                          aria-label="고치기 닫기"
                          className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[13px] font-semibold text-slate-800 mb-1">택배사 이름</label>
                          <input
                            type="text"
                            value={editingCourier.name}
                            onChange={(e) => setEditingCourier({ ...editingCourier, name: e.target.value })}
                            className="w-full text-sm h-10 px-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 font-bold text-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-[13px] font-semibold text-slate-800 mb-1">송장이 시작되는 줄 (칸 이름 바로 다음 줄)</label>
                          <input
                            type="number"
                            min="1"
                            value={courierStartRowInput}
                            onChange={(e) => handleCourierStartRowChange(e.target.value)}
                            className="w-full text-sm h-10 px-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 font-mono font-bold"
                          />
                        </div>
                      </div>

                      {/* 택배사 엑셀 컬럼 지정 영역 (운송장번호 지정 포함) */}
                      <div className="space-y-3 pt-3 border-t border-brand-100">
                        <label className="block text-xs font-bold text-[#0F3A2F] flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-brand-600" />
                          항목별 칸 (A, B, C 같은 열 글자나 1, 2, 3 같은 번호)
                        </label>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {/* 1. 운송장번호 지정 (핵심 요청) */}
                          <div className="bg-brand-50/80 p-2.5 rounded-xl border border-brand-200 space-y-1">
                            <span className="block text-xs font-bold text-[#0F3A2F] flex items-center justify-between">
                              <span> 송장 번호</span>
                              <span className="text-xs text-brand-600 bg-brand-100 px-1 rounded">필수</span>
                            </span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['tracking_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('tracking_col', e.target.value)}
                                placeholder="예: B 또는 2"
                                className="w-full text-xs p-1.5 bg-white border border-brand-200 rounded-lg font-mono uppercase font-bold text-[#0F3A2F] focus:outline-none focus:ring-1 focus:ring-brand-600"
                              />
                              <span className="text-xs text-brand-700 font-mono font-bold shrink-0">{getColumnPreview(courierColInputs['tracking_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 2. 받는사람/수령인 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-xs font-bold text-slate-700"> 받는 사람</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['name_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('name_col', e.target.value)}
                                placeholder="예: C 또는 3"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                              />
                              <span className="text-xs text-brand-600 font-mono shrink-0">{getColumnPreview(courierColInputs['name_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 3. 연락처 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-xs font-bold text-slate-700"> 전화번호</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['phone_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('phone_col', e.target.value)}
                                placeholder="예: D 또는 4"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                              />
                              <span className="text-xs text-brand-600 font-mono shrink-0">{getColumnPreview(courierColInputs['phone_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 4. 우편번호 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-xs font-bold text-slate-700"> 우편번호</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['zip_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('zip_col', e.target.value)}
                                placeholder="예: E 또는 5"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                              />
                              <span className="text-xs text-brand-600 font-mono shrink-0">{getColumnPreview(courierColInputs['zip_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 5. 주소 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-xs font-bold text-slate-700"> 주소</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['addr_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('addr_col', e.target.value)}
                                placeholder="예: F 또는 6"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                              />
                              <span className="text-xs text-brand-600 font-mono shrink-0">{getColumnPreview(courierColInputs['addr_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 6. 상품명 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-xs font-bold text-slate-700"> 상품명</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['prod_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('prod_col', e.target.value)}
                                placeholder="예: G 또는 7"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                              />
                              <span className="text-xs text-brand-600 font-mono shrink-0">{getColumnPreview(courierColInputs['prod_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 7. 옵션/규격 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-xs font-bold text-slate-700"> 옵션·용량</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['unit_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('unit_col', e.target.value)}
                                placeholder="예: H 또는 8"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                              />
                              <span className="text-xs text-brand-600 font-mono shrink-0">{getColumnPreview(courierColInputs['unit_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 8. 수량 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-xs font-bold text-slate-700"> 수량</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['qty_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('qty_col', e.target.value)}
                                placeholder="예: I 또는 9"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                              />
                              <span className="text-xs text-brand-600 font-mono shrink-0">{getColumnPreview(courierColInputs['qty_col'] || '').displayPreview}</span>
                            </div>
                          </div>

                          {/* 9. 택배사명 지정열 */}
                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                            <span className="block text-xs font-bold text-slate-700"> 택배사 이름</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={courierColInputs['courier_col'] || ''}
                                onChange={(e) => handleCourierFieldChange('courier_col', e.target.value)}
                                placeholder="선택 (예: A 또는 1)"
                                className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                              />
                              <span className="text-xs text-brand-600 font-mono shrink-0">{getColumnPreview(courierColInputs['courier_col'] || '').displayPreview}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                        <button type="button" onClick={() => setEditingCourier(null)} className={btn.secondary}>
                          취소
                        </button>
                        <button type="button" onClick={() => saveCourier(editingCourier)} className={btn.primary}>
                          저장하기
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
        </Modal>
      )}

      {/* 프리셋 모달 (쇼핑몰 추가 마법사) */}
      {showPresetModal && (
        <Modal
          onClose={() => setShowPresetModal(false)}
          title="쇼핑몰 추가"
          description="목록에 있는 쇼핑몰이면 골라서 바로 시작하세요. 없으면 빈 양식으로 만들어요."
          size="sm"
          zIndex={60}
          closeOnEsc={false}
          footerStart={<button type="button" onClick={createEmptyPlatform} className="text-[13px] font-semibold text-brand-700 underline underline-offset-2 cursor-pointer">빈 양식으로 만들기</button>}
          footer={<button type="button" onClick={() => setShowPresetModal(false)} className={btn.secondary}>취소</button>}
        >
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {PLATFORM_PRESETS.map((preset) => (
              <li key={preset.id}>
                <button
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="flex w-full min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-slate-800 transition hover:bg-brand-50 cursor-pointer"
                >
                  <span className="font-medium">{preset.name}</span>
                  <span className="text-[13px] font-semibold text-brand-700">고르기</span>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {/* 택배사 프리셋 모달 */}
      {showCourierPresetModal && (
        <Modal
          onClose={() => setShowCourierPresetModal(false)}
          title="택배사 추가"
          description="목록에 있는 택배사면 골라서 바로 시작하세요. 없으면 빈 양식으로 만들어요."
          size="sm"
          zIndex={60}
          closeOnEsc={false}
          footerStart={<button type="button" onClick={createEmptyCourier} className="text-[13px] font-semibold text-brand-700 underline underline-offset-2 cursor-pointer">빈 양식으로 만들기</button>}
          footer={<button type="button" onClick={() => setShowCourierPresetModal(false)} className={btn.secondary}>취소</button>}
        >
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {COURIER_PRESETS.map((preset) => (
              <li key={preset.id}>
                <button
                  type="button"
                  onClick={() => applyCourierPreset(preset)}
                  className="flex w-full min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-slate-800 transition hover:bg-brand-50 cursor-pointer"
                >
                  <span className="font-medium">{preset.name.replace(/\s*표준 템플릿$/, '')}</span>
                  <span className="text-[13px] font-semibold text-brand-700">고르기</span>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {/* 플랫폼 삭제 확인 모달 */}
      {deletingPlatform && (
        <ConfirmDialog
          title="이 쇼핑몰 양식을 지울까요?"
          detail={deletingPlatform.name}
          message="되돌릴 수 없어요."
          tone="danger"
          icon={<Trash2 className="w-4 h-4" />}
          confirmLabel="지우기"
          zIndex={60}
          onCancel={() => setDeletingPlatform(null)}
          onConfirm={() => executeDeletePlatform(deletingPlatform.id)}
        />
      )}

      {/* 현재 스마트 감지된 헤더로 새 쇼핑몰 양식 추가 모달 */}
      {showSaveAsNewModal && (
        <Modal
          onClose={() => setShowSaveAsNewModal(false)}
          title="새 쇼핑몰로 등록"
          description={<>엑셀 파일 <b className="font-semibold text-slate-800">{activeFile?.fileName}</b>의 지금 칸 그대로 양식을 만들어요.</>}
          size="md"
          zIndex={60}
          closeOnEsc={false}
          footer={
            <>
              <button type="button" onClick={() => setShowSaveAsNewModal(false)} className={btn.secondary}>취소</button>
              <button type="submit" form="form-new-platform" className={btn.primary}>등록하기</button>
            </>
          }
        >
          <form
            id="form-new-platform"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveAsNewPlatformSubmit();
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="block text-sm font-semibold text-slate-800">쇼핑몰 이름 <span className="text-rose-600">*</span></span>
              <input
                type="text"
                value={newPlatformNameInput}
                onChange={(e) => setNewPlatformNameInput(e.target.value)}
                placeholder="예: 11번가, 지마켓, 카페24, 자사몰"
                autoFocus
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-slate-800">파일 이름에 들어 있는 말 <span className="font-normal text-slate-500">(안 적어도 돼요)</span></span>
              <input
                type="text"
                value={newPlatformPatternInput}
                onChange={(e) => setNewPlatformPatternInput(e.target.value)}
                placeholder="예: 11st, order, coupang"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
              />
              <span className="mt-1 block text-[13px] text-slate-500">이 말이 이름에 들어간 엑셀은 다음부터 이 양식으로 읽어요.</span>
            </label>
          </form>
        </Modal>
      )}

      {/* 현재 스마트 감지된 헤더로 새 택배사 양식 추가 모달 */}
      {showSaveAsNewCourierModal && (
        <Modal
          onClose={() => setShowSaveAsNewCourierModal(false)}
          title="새 택배사로 등록"
          description={<>송장 엑셀 <b className="font-semibold text-slate-800">{activeTrackingFile?.fileName || '송장 파일'}</b>의 지금 칸 그대로 양식을 만들어요.</>}
          size="md"
          zIndex={60}
          closeOnEsc={false}
          footer={
            <>
              <button type="button" onClick={() => setShowSaveAsNewCourierModal(false)} className={btn.secondary}>취소</button>
              <button type="submit" form="form-new-courier" className={btn.primary}>등록하기</button>
            </>
          }
        >
          <form
            id="form-new-courier"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveAsNewCourierSubmit();
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="block text-sm font-semibold text-slate-800">택배사 이름 <span className="text-rose-600">*</span></span>
              <input
                type="text"
                value={newCourierNameInput}
                onChange={(e) => setNewCourierNameInput(e.target.value)}
                placeholder="예: CJ대한통운 (B형)"
                autoFocus
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-slate-800">파일 이름에 들어 있는 말 <span className="font-normal text-slate-500">(안 적어도 돼요)</span></span>
              <input
                type="text"
                value={newCourierPatternInput}
                onChange={(e) => setNewCourierPatternInput(e.target.value)}
                placeholder="예: hanjin, lotte, cj"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
              />
              <span className="mt-1 block text-[13px] text-slate-500">이 말이 이름에 들어간 송장 엑셀은 다음부터 이 택배사로 읽어요.</span>
            </label>
          </form>
        </Modal>
      )}

      {/* 택배사 삭제 확인 모달 */}
      {deletingCourier && (
        <ConfirmDialog
          title="이 택배사 양식을 지울까요?"
          detail={deletingCourier.name}
          message="되돌릴 수 없어요."
          tone="danger"
          icon={<Trash2 className="w-4 h-4" />}
          confirmLabel="지우기"
          zIndex={60}
          onCancel={() => setDeletingCourier(null)}
          onConfirm={() => executeDeleteCourier(deletingCourier.id)}
        />
      )}

    </div>
  );
}
