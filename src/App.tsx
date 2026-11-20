import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  Settings, 
  ClipboardList, 
  Database, 
  ArrowRight, 
  Upload, 
  Download, 
  Check, 
  AlertCircle, 
  HelpCircle, 
  FileText, 
  Info,
  Trash2,
  RefreshCw,
  Lightbulb,
  Layers,
  Truck,
  Eye,
  FileCode,
  Copy,
  BarChart3,
  Grid,
  RotateCcw,
  X,
  CheckCircle2
} from 'lucide-react';

import { PlatformConfig, ProductMapping, ProcessedOrder, MatchingError, ValidationIssue, StepValidationResult, CourierConfig, SecondaryOptionColInfo } from './types';
import { DEFAULT_PLATFORMS, DEFAULT_PRODUCT_MAPPINGS, DEFAULT_COURIERS } from './utils/defaultData';
import { 
  parseAndProcessOrderExcel, 
  processRawRows,
  exportSummaryReportExcel,
  exportProductSortedExcel,
  processTrackingUpdate,
  processTrackingUpdateWithRows,
  exportFinalTrackingExcel,
  findBestOrderSheet,
  findHeaderRowIndex,
  sortUnitsSmart,
  extractCleanProductRecommendation,
  detectAnomalousOrders,
  triggerDownload,
  normalizeTextForMapping,
  findBestIntelligentMatch,
  extractOptionAndCleanName,
  detectTrackingHeaderAndCourier,
  compareOrdersByCleanName,
  getCleanNameForSort
} from './utils/excelProcessor';
import { runComprehensiveValidation, ValidationInputStep1, ValidationInputStep2, OutputFileInfo } from './utils/validationEngine';

import PlatformSettings from './components/PlatformSettings';
import AiAssistant from './components/AiAssistant';
import ProductMappingList from './components/ProductMappingList';
import WaybillReportDashboard from './components/WaybillReportDashboard';
import ExcelValidationDashboard from './components/ExcelValidationDashboard';
import ExcelPreviewModal, { ExcelPreviewFile } from './components/ExcelPreviewModal';
import DeliveryAnalyticsReport from './components/DeliveryAnalyticsReport';
import AnomalousOrdersModal from './components/AnomalousOrdersModal';
import SmartApiConnector, { DEFAULT_API_CONFIGS, mergeApiConfigs, type PlatformApiConfig } from './components/SmartApiConnector';
import { loadCloudSettings, saveCloudSettings } from './lib/cloudSettings';
import { encryptApiConfigs, decryptApiConfigs } from './lib/secureKey';
import { decryptExcelFile } from './utils/decryptExcel';
import { getCurrentUid, logout } from './firebaseAuth';
import { useAccount } from './AccountGate';
import { consumeUploads, uploadsLeft } from './lib/account';
import { APP_NAME } from './config/brand';
import { uploadsUsedThisMonth } from './lib/account';
import FeedbackModal from './components/FeedbackModal';
import { LogOut, Menu, MessageSquare, ChevronDown, ShieldCheck } from 'lucide-react';

// 2단계 운송장 소스 엑셀 파일 택배사/양식 자동 감지 헬퍼
function detectCourierForFile(fileName: string, rawRows?: any[][]): string {
  const norm = fileName.normalize('NFC').toLowerCase();
  if (norm.includes('한진') || norm.includes('hanjin')) return '한진택배';
  if (norm.includes('대한통운') || norm.includes('cj')) return 'CJ대한통운';
  if (norm.includes('롯데') || norm.includes('lotte')) return '롯데택배';
  if (norm.includes('로젠') || norm.includes('logen')) return '로젠택배';
  if (norm.includes('우체국') || norm.includes('epost') || norm.includes('우편')) return '우체국택배';
  if (norm.includes('경동')) return '경동화물';
  if (norm.includes('대신')) return '대신화물';
  
  if (rawRows && rawRows.length > 0) {
    const headerStr = rawRows.slice(0, 5).map(r => (r || []).join(' ')).join(' ').toLowerCase();
    if (headerStr.includes('한진')) return '한진택배';
    if (headerStr.includes('대한통운') || headerStr.includes('cj')) return 'CJ대한통운';
    if (headerStr.includes('롯데')) return '롯데택배';
    if (headerStr.includes('로젠')) return '로젠택배';
    if (headerStr.includes('우체국')) return '우체국택배';
  }

  return '한진택배';
}

function colNumToLetter(colNum: number): string {
  if (colNum <= 0) return '';
  let temp = colNum;
  let letter = '';
  while (temp > 0) {
    let mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

// 주문 고유 키 생성 및 중복 제거 스마트 병합 헬퍼
function getOrderKey(o: ProcessedOrder): string {
  const date = o.orderDate || '';
  const receiver = (o.수령인 || '').trim();
  const prod = (o.상품명 || o.originalProductName || '').trim();
  const opt = (o.originalOptionName || '').trim();
  const qty = o.fixedQty || o.수량 || 1;
  const combined = o.combinedId || '';
  
  if (combined) {
    return `${combined}_${prod}_${qty}`;
  }
  return `${date}_${receiver}_${prod}_${opt}_${qty}_${o.id || ''}`;
}

function mergeOrdersWithoutDuplicates(existing: ProcessedOrder[], incoming: ProcessedOrder[]): ProcessedOrder[] {
  if (!existing || existing.length === 0) return incoming;
  if (!incoming || incoming.length === 0) return existing;

  const existingKeys = new Set(existing.map(getOrderKey));
  const merged = [...existing];

  incoming.forEach(item => {
    const key = getOrderKey(item);
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      merged.push(item);
    }
  });

  return merged;
}

// 저장된 플랫폼 설정을 최신 기본값 기준으로 정리합니다.
function migratePlatforms(parsed: PlatformConfig[]): PlatformConfig[] {
  let migrated = false;
  const cleaned = parsed.map(p => {
    let updated = { ...p };
    const defaultPlat = DEFAULT_PLATFORMS.find(dp => dp.id === p.id);

    if (defaultPlat && (p.id === 'naver' || p.id === 'toss') && p.start_row === 3) {
      updated.start_row = defaultPlat.start_row;
      migrated = true;
    }

    if (defaultPlat && p.id === 'toss') {
      if (updated.col_map?.상품명 !== defaultPlat.col_map.상품명 || updated.courier_col !== defaultPlat.courier_col) {
        updated = { ...defaultPlat };
        migrated = true;
      }
    }

    if (defaultPlat && (p.id === 'sikbom' || p.id === 'ESM')) {
      if (updated.filepath_pattern !== defaultPlat.filepath_pattern || updated.identifier !== defaultPlat.identifier) {
        updated.filepath_pattern = defaultPlat.filepath_pattern;
        updated.identifier = defaultPlat.identifier;
        migrated = true;
      }
    }

    // '주문자'가 col_map에 있으면 제거하고 최신 사양으로 마이그레이션
    if (updated.col_map && ('주문자' in updated.col_map || Object.keys(updated.col_map).length > 8)) {
      migrated = true;
      const newColMap = { ...updated.col_map };
      delete (newColMap as any).주문자;

      // 표준 기본 플랫폼인 경우, 최신 defaultData 설정값과 동기화
      if (defaultPlat) {
        return {
          ...updated,
          col_map: { ...defaultPlat.col_map },
          tracking_col: defaultPlat.tracking_col,
          start_row: defaultPlat.start_row
        };
      }

      return {
        ...updated,
        col_map: newColMap
      };
    }
    return updated;
  });

  let finalPlatforms = cleaned.filter(p => p.id !== 'gmarket' && p.id !== 'elevenst');
  if (finalPlatforms.length !== cleaned.length) {
    migrated = true;
  }

  // DEFAULT_PLATFORMS 중 누락된 기본 플랫폼 추가
  DEFAULT_PLATFORMS.forEach(dp => {
    if (!finalPlatforms.some(p => p.id === dp.id)) {
      finalPlatforms.push(dp);
      migrated = true;
    }
  });

  if (migrated) {
    return finalPlatforms;
  }
  return finalPlatforms;
}

export default function App() {
  const { features, account } = useAccount();
  // ----------------------------------------------------
  // 1. 상태 선언 및 로컬스토리지 연동
  // ----------------------------------------------------
  const [platforms, setPlatforms] = useState<PlatformConfig[]>(DEFAULT_PLATFORMS);

  const [couriers, setCouriers] = useState<CourierConfig[]>(DEFAULT_COURIERS);

  // 시각화 리포트용 주문 데이터 (메모리에만 두며, 새로고침하면 사라집니다)
  const [analyticsOrders, setAnalyticsOrders] = useState<ProcessedOrder[]>([]);

  // 대치 규칙은 기본값으로 시작한 뒤, 로그인한 계정의 설정(Firestore)에서 불러옵니다.
  const [apiConfigs, setApiConfigs] = useState<PlatformApiConfig[]>(DEFAULT_API_CONFIGS);
  const [productMappings, setProductMappings] = useState<ProductMapping[]>([]);
  const [defaultRawNames, setDefaultRawNames] = useState<string[]>([]);
  const [isMappingsLoaded, setIsMappingsLoaded] = useState(false);
  const [mappingImportConfirm, setMappingImportConfirm] = useState<{
    isOpen: boolean;
    parsed: ProductMapping[];
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'process' | 'analytics' | 'products' | 'platforms'>('process');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  // 화면 상태만: 끝난 1단계를 펼쳐 볼지, 결과 시트에서 어느 쇼핑몰을 보고 있는지
  const [step1Open, setStep1Open] = useState(false);
  const [sheetShop, setSheetShop] = useState<string | null>(null);
  const [settingsSection, setSettingsSection] = useState<'backup' | 'account'>('backup');
  const openSettings = (section: 'backup' | 'account') => {
    setSettingsSection(section);
    setIsSettingsOpen(true);
  };
  const [selectedPlatformId, setSelectedPlatformId] = useState<string>('');
  // 1단계 (주문 가공) 상태 (다중 파일 지원!)
  const [orderFiles, setOrderFiles] = useState<File[]>([]);
  const [customFilePlatforms, setCustomFilePlatforms] = useState<{ [fileName: string]: string }>({});
  const [isProcessingOrders, setIsProcessingOrders] = useState(false);
  const [orderParseResult, setOrderParseResult] = useState<any>(null);
  const [newItemsMappingForm, setNewItemsMappingForm] = useState<{ [key: string]: string }>({});
  const [anomalousModalOpen, setAnomalousModalOpen] = useState<boolean>(false);

  // 보조 규격/단위 열 확장 감지 정보 통합
  const activeSecondaryOptionColsInfo = useMemo(() => {
    if (!orderParseResult || !orderParseResult.parsedFiles) return [];
    const list: { index: number; letter: string; headerName: string }[] = [];
    const seen = new Set<string>();
    orderParseResult.parsedFiles.forEach((pf: any) => {
      if (pf.secondaryOptionColsInfo && pf.secondaryOptionColsInfo.length > 0) {
        pf.secondaryOptionColsInfo.forEach((sec: any) => {
          const key = `${sec.letter}_${sec.headerName}`;
          if (!seen.has(key)) {
            seen.add(key);
            list.push(sec);
          }
        });
      }
    });
    return list;
  }, [orderParseResult]);

  // 이상 주문 자동 검출 결과
  const anomalousIssues = useMemo(() => {
    if (!orderParseResult || !orderParseResult.orders) return [];
    return detectAnomalousOrders(orderParseResult.orders);
  }, [orderParseResult]);

  // 미매칭 품목 AI 추천 정제어 일괄 적용
  const handleApplyAllRecommendations = () => {
    if (!orderParseResult || !orderParseResult.newRawItems) return;
    const updatedForm: { [key: string]: string } = { ...newItemsMappingForm };
    orderParseResult.newRawItems.forEach((item: string) => {
      const rec = extractCleanProductRecommendation(item);
      updatedForm[item] = rec;
    });
    setNewItemsMappingForm(updatedForm);
    showNotification('info', "모든 미매칭 항목에 AI 추천 정제어가 입력되었습니다.");
  };

  // 2단계 (운송장 업데이트) 상태 - 1단계와 동일하게 다중 파일 및 자동 감지 지원
  const [trackingFiles, setTrackingFiles] = useState<File[]>([]);
  const [customTrackingCouriers, setCustomTrackingCouriers] = useState<{ [fileName: string]: string }>({});
  const [parsedTrackingFiles, setParsedTrackingFiles] = useState<{
    fileName: string;
    file?: File;
    detectedCourier: string;
    rawRows: any[][];
    count: number;
  }[]>([]);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [isProcessingTracking, setIsProcessingTracking] = useState(false);
  const [trackingResult, setTrackingResult] = useState<any>(null);
  const [selectedCourierFormatId, setSelectedCourierFormatId] = useState<string>("auto");
  const [selectedCourier, setSelectedCourier] = useState<string>("한진택배");
  const [customCourier, setCustomCourier] = useState<string>("");
  const [platformMatrixType, setPlatformMatrixType] = useState<'platform' | 'courier'>('platform');

  // 종합 품질 검사 결과 상태
  const [stepValidationResult, setStepValidationResult] = useState<StepValidationResult | undefined>(undefined);

  // 실시간 종합 품질 검사 평가 계산기
  useEffect(() => {
    let step1Input: ValidationInputStep1 | undefined = undefined;
    let step2Input: ValidationInputStep2 | undefined = undefined;

    if (orderParseResult && orderParseResult.orders && orderParseResult.orders.length > 0) {
      const orders: ProcessedOrder[] = orderParseResult.orders;
      
      // 업로드된 원본 엑셀 파일들(parsedFiles)로부터 모든 파싱 주문 수집
      let rawOrders: ProcessedOrder[] = [];
      if (orderParseResult.parsedFiles && orderParseResult.parsedFiles.length > 0) {
        orderParseResult.parsedFiles.forEach((pf: any) => {
          if (Array.isArray(pf.orders)) {
            rawOrders.push(...pf.orders);
          }
        });
      }
      if (rawOrders.length === 0) {
        rawOrders = orders;
      }

      const summaryDetailHeaders = ["용량", "상품명", "수량", "주문자"];
      const summaryDetailRows = orders.map(o => ({
        용량: o.originalOptionName || "",
        상품명: o.originalProductName || "",
        수량: o.수량,
        주문자: o.주문자 || "",
        multiplier: o.multiplier || 1
      }));

      const unitSet = new Set<string>();
      const pivotMap: { [baseName: string]: { [unit: string]: number } } = {};
      orders.forEach(o => {
        const unit = o.용량 || "기본";
        const baseName = o.상품명 || "미분류";
        unitSet.add(unit);
        if (!pivotMap[baseName]) pivotMap[baseName] = {};
        pivotMap[baseName][unit] = (pivotMap[baseName][unit] || 0) + (o.수량 * (o.multiplier || 1));
      });
      const sortedUnits = sortUnitsSmart(Array.from(unitSet));
      const summaryGroupHeaders = ["상품 분류 (행 레이블)", ...sortedUnits, "총합계"];

      const summaryGroupRows: { 상품분류: string; 총수량: number; 총kg: number }[] = [];
      Object.keys(pivotMap).forEach(baseName => {
        let totalQty = 0;
        let totalKg = 0;
        sortedUnits.forEach(unit => {
          const q = pivotMap[baseName][unit] || 0;
          totalQty += q;
          let kgVal = 0;
          const uLower = unit.toLowerCase();
          if (uLower.includes("kg")) kgVal = parseFloat(uLower) || 0;
          else if (uLower.includes("g")) kgVal = (parseFloat(uLower) || 0) / 1000;
          totalKg += kgVal * q;
        });
        summaryGroupRows.push({
          상품분류: baseName,
          총수량: totalQty,
          총kg: totalKg
        });
      });

      const sortedHeaders = ["용량", "상품명", "수량(고정)", "수량", "수령인", "연락처", "우편번호", "주소", "배송메세지"];

      step1Input = {
        rawOrders,
        processedOrders: orders,
        summaryDetailHeaders,
        summaryDetailRows,
        summaryGroupHeaders,
        summaryGroupRows,
        sortedHeaders,
        sortedRows: orders,
        productMappings
      };
    }

    if (trackingResult && orderParseResult && orderParseResult.parsedFiles) {
      const outputFilesInfo: OutputFileInfo[] = [];
      const parsedFiles = orderParseResult.parsedFiles;
      const finalCourierName = selectedCourier === 'custom' ? customCourier : selectedCourier;

      parsedFiles.forEach((pf: any) => {
        const fileOrders = trackingResult.outputOrders ? trackingResult.outputOrders.filter(
          (o: any) => !o.sourceFileName || o.sourceFileName === pf.fileName || parsedFiles.length === 1
        ) : [];

        let missingTracking = 0;
        let missingCourier = 0;
        fileOrders.forEach((o: any) => {
          const effectiveCourier = o.courierName || finalCourierName;
          if (!o.trackingNumber) missingTracking++;
          if (!effectiveCourier || String(effectiveCourier).trim() === '') missingCourier++;
        });

        outputFilesInfo.push({
          fileName: pf.fileName,
          platformName: pf.detectedPlatform?.name || "알수없음",
          totalRows: fileOrders.length,
          headers: pf.headers || [],
          originalHeaders: pf.headers || [],
          missingTrackingCount: missingTracking,
          missingCourierCount: missingCourier,
          duplicateDeliveryNCount: trackingResult.dupNCount || 0
        });
      });

      step2Input = {
        step1InputOrderCount: orderParseResult.orders.length,
        outputFiles: outputFilesInfo
      };
    }

    if (step1Input || step2Input) {
      const result = runComprehensiveValidation(step1Input, step2Input);
      setStepValidationResult(result);
    } else {
      setStepValidationResult(undefined);
    }
  }, [orderParseResult, trackingResult, productMappings]);

  // 비밀번호 잠금 에러 상태
  const [passwordErrorFile, setPasswordErrorFile] = useState<'order' | 'tracking' | null>(null);

  // 엑셀 비밀번호 복호화 처리 상태
  interface PasswordPromptState {
    file: File;
    type: 'order' | 'tracking';
  }
  const [passwordPrompt, setPasswordPrompt] = useState<PasswordPromptState | null>(null);
  const [promptPassword, setPromptPassword] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedFilesCache, setDecryptedFilesCache] = useState<{ [fileName: string]: any[][] }>({});

  // 알림 메시지
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [hideTipStep1, setHideTipStep1] = useState(false);
  const [hideTipStep2, setHideTipStep2] = useState(false);

  // 커스텀 확인 모달 상태 (confirm API 대리)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const openConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(null);
      }
    });
  };

  const handleUpdateSingleMapping = (rawName: string, newMappedName: string) => {
    const existingFiltered = productMappings.filter(m => m.rawName !== rawName);
    const updated = [...existingFiltered, { rawName, mappedName: newMappedName }];
    setProductMappings(updated);
    showNotification('success', `'${rawName}' ➔ '${newMappedName}' 정제 규칙이 저장되어 주문에 반영되었습니다.`);

    if (orderFiles.length > 0) {
      processMultipleOrderFiles(orderFiles, customFilePlatforms, decryptedFilesCache, updated);
    }
  };

  const handleUpdateMultipleMappings = (mappingsToAdd: { rawName: string; mappedName: string }[]) => {
    if (!mappingsToAdd || mappingsToAdd.length === 0) return;

    const mapDict = new Map<string, string>();
    productMappings.forEach(m => mapDict.set(m.rawName, m.mappedName));
    mappingsToAdd.forEach(m => mapDict.set(m.rawName, m.mappedName));

    const updated: ProductMapping[] = Array.from(mapDict.entries()).map(([rawName, mappedName]) => ({
      rawName,
      mappedName
    }));

    setProductMappings(updated);
    showNotification('success', `Warning 매칭 ${mappingsToAdd.length}건이 대치 리스트에 성공적으로 일괄 등록되었습니다.`);

    if (orderFiles.length > 0) {
      processMultipleOrderFiles(orderFiles, customFilePlatforms, decryptedFilesCache, updated);
    }
  };

  const isAppDataLoadedRef = React.useRef(false);

  // 로그인한 계정의 설정을 Firestore에서 불러옵니다. 엑셀 주문 데이터는 불러오지 않습니다.
  useEffect(() => {
    setDefaultRawNames(DEFAULT_PRODUCT_MAPPINGS.map(m => m.rawName));
    setProductMappings(DEFAULT_PRODUCT_MAPPINGS);

    // 예전 버전이 브라우저에 남겨 둔 주문 데이터 캐시는 지웁니다.
    try {
      localStorage.removeItem('s_waybill_analytics_orders');
    } catch (e) {
      // 저장소를 쓸 수 없는 환경에서는 무시합니다.
    }

    const uid = getCurrentUid();
    if (!uid) {
      isAppDataLoadedRef.current = true;
      setIsMappingsLoaded(true);
      return;
    }

    loadCloudSettings(uid)
      .then(async (cloud) => {
        if (!cloud) return;
        const savedPlats = cloud.platforms;
        const savedCouriers = cloud.couriers;
        const savedMappings = cloud.productMappings;
        const savedApi = cloud.apiConfigs;

        if (Array.isArray(savedPlats) && savedPlats.length > 0) {
          setPlatforms(migratePlatforms(savedPlats as PlatformConfig[]));
        }
        if (Array.isArray(savedCouriers) && savedCouriers.length > 0) {
          setCouriers(savedCouriers as CourierConfig[]);
        }
        if (Array.isArray(savedMappings) && savedMappings.length > 0) {
          setProductMappings(savedMappings as ProductMapping[]);
        }
        if (Array.isArray(savedApi) && savedApi.length > 0) {
          const decrypted = await decryptApiConfigs(savedApi as PlatformApiConfig[]);
          setApiConfigs(mergeApiConfigs(decrypted));
        }
      })
      .catch((err) => {
        console.warn('클라우드 설정 불러오기 실패:', err);
      })
      .finally(() => {
        isAppDataLoadedRef.current = true;
        setIsMappingsLoaded(true);
      });
  }, []);

  // 주문 가공 또는 운송장 업데이트 결과는 시각화용으로 메모리에 중복 없이 병합합니다.
  useEffect(() => {
    if (orderParseResult?.orders && orderParseResult.orders.length > 0) {
      setAnalyticsOrders(prev => mergeOrdersWithoutDuplicates(prev, orderParseResult.orders));
    }
  }, [orderParseResult]);

  useEffect(() => {
    if (trackingResult?.outputOrders && trackingResult.outputOrders.length > 0) {
      setAnalyticsOrders(prev => mergeOrdersWithoutDuplicates(prev, trackingResult.outputOrders));
    }
  }, [trackingResult]);

  // 설정이 바뀌면 잠시 후 Firestore에 저장합니다. API 키는 암호화해서 저장하고, 주문 데이터는 저장하지 않습니다.
  useEffect(() => {
    if (!isAppDataLoadedRef.current) return;
    const uid = getCurrentUid();
    if (!uid) return;

    const timer = setTimeout(async () => {
      try {
        const securedApi = await encryptApiConfigs(apiConfigs);
        await saveCloudSettings(uid, {
          platforms,
          couriers,
          productMappings,
          apiConfigs: securedApi,
        });
      } catch (err) {
        console.warn('설정 저장 실패:', err);
        showNotification('error', '설정을 저장하지 못했습니다. 인터넷 연결을 확인해 주세요.');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [platforms, couriers, productMappings, apiConfigs]);

  // 기본 플랫폼 선정
  useEffect(() => {
    if (platforms.length > 0 && !selectedPlatformId) {
      setSelectedPlatformId(platforms[0].id);
    }
  }, [platforms, selectedPlatformId]);

  const showNotification = (type: 'success' | 'error' | 'info', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  // ----------------------------------------------------
  // 2. 1단계: 주문서 파싱 및 가공 핸들러 (다중 파일 처리 지원)
  // ----------------------------------------------------
  // 업로드 횟수 제한: 한도 안이면 사용량을 올리고, 넘으면 막고 안내합니다.
  const checkUploadAllowed = async (count: number): Promise<boolean> => {
    const ok = await consumeUploads(account, count);
    if (!ok) window.alert(`이번 달 업로드 횟수를 모두 썼어요. 남은 횟수: ${uploadsLeft(account) ?? 0}회`);
    return ok;
  };

  const handleOrderFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const newFiles = Array.from(files);
    if (!(await checkUploadAllowed(newFiles.length))) { e.target.value = ''; return; }
    // 중복 파일명 체크하여 중복 로딩 방지
    const existingNames = new Set(orderFiles.map((f: File) => f.name));
    const uniqueNewFiles = newFiles.filter((f: File) => !existingNames.has(f.name));

    if (uniqueNewFiles.length === 0) {
      showNotification('info', '이미 업로드 목록에 포함된 엑셀 파일입니다.');
      e.target.value = '';
      return;
    }

    const updatedFiles = [...orderFiles, ...uniqueNewFiles];
    setOrderFiles(updatedFiles);
    setNewItemsMappingForm({});
    setPasswordErrorFile(null);
    await processMultipleOrderFiles(updatedFiles);
    e.target.value = '';
  };

  const handleRemoveOrderFile = async (indexToRemove: number) => {
    const updatedFiles = orderFiles.filter((_, idx) => idx !== indexToRemove);
    setOrderFiles(updatedFiles);
    if (updatedFiles.length === 0) {
      setOrderParseResult(null);
      setNewItemsMappingForm({});
      setCustomFilePlatforms({});
    } else {
      await processMultipleOrderFiles(updatedFiles);
    }
  };

  const handleFilePlatformChange = async (fileName: string, platformId: string, updatedPlatformsList?: PlatformConfig[]) => {
    const activePlatforms = updatedPlatformsList || platforms;
    const updatedCustom = { ...customFilePlatforms, [fileName]: platformId };
    setCustomFilePlatforms(updatedCustom);
    await processMultipleOrderFiles(orderFiles, updatedCustom, decryptedFilesCache, productMappings, activePlatforms);
    const platName = activePlatforms.find(p => p.id === platformId)?.name || '알 수 없음';
    showNotification('success', `"${fileName}" 파일의 쇼핑몰 양식을 "${platName}"(으)로 지정했습니다.`);
  };

  const processMultipleOrderFiles = async (
    files: File[], 
    customPlatforms: { [fileName: string]: string } = customFilePlatforms,
    cacheToUse: { [fileName: string]: any[][] } = decryptedFilesCache,
    mappingsToUse: ProductMapping[] = productMappings,
    platformsToUse: PlatformConfig[] = platforms
  ) => {
    if (files.length === 0) {
      setOrderParseResult(null);
      return;
    }
    setIsProcessingOrders(true);
    setPasswordErrorFile(null);

    try {
      const parsedFilesList: {
        fileName: string;
        file?: File;
        originalBuffer?: any;
        detectedPlatform: PlatformConfig;
        orders: ProcessedOrder[];
        rawRows: any[][];
        headers: any[];
        newRawItems: string[];
        validationIssues?: ValidationIssue[];
        secondaryOptionColsInfo?: SecondaryOptionColInfo[];
      }[] = [];

      for (const file of files) {
        try {
          const forcedPlatId = customPlatforms[file.name];
          let result;

          if (cacheToUse[file.name]) {
            const workbook = XLSX.read(cacheToUse[file.name], { type: 'array' });
            const bestSheetName = findBestOrderSheet(workbook);
            const worksheet = workbook.Sheets[bestSheetName];
            const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });
            result = processRawRows(rawRows, file.name, platformsToUse, mappingsToUse, forcedPlatId);
          } else {
            result = await parseAndProcessOrderExcel(file, platformsToUse, mappingsToUse, forcedPlatId);
          }

          const platform = result.detectedPlatform || platforms[0];
          
          parsedFilesList.push({
            fileName: file.name,
            file: file,
            originalBuffer: cacheToUse[file.name] || null,
            detectedPlatform: platform,
            orders: result.orders.map(order => ({
              ...order,
              sourceFileName: file.name,
              platformName: platform.name,
              platformId: platform.id
            })),
            rawRows: result.rawRows,
            headers: result.headers,
            newRawItems: result.newRawItems,
            validationIssues: result.validationIssues || [],
            secondaryOptionColsInfo: result.secondaryOptionColsInfo || []
          });
        } catch (err: any) {
          if (err.message === "PASSWORD_PROTECTED") {
            setPasswordPrompt({ file, type: 'order' });
            setPromptPassword('');
            showNotification('info', `"${file.name}" 파일에 비밀번호가 설정되어 있습니다. 비밀번호를 입력해주세요.`);
            setIsProcessingOrders(false);
            return;
          }
          const errMsg = String(err.message || err).toLowerCase();
          const isPassword = errMsg.includes('password') || errMsg.includes('decrypt') || errMsg.includes('protected') || errMsg.includes('encrypt');
          if (isPassword) {
            setPasswordPrompt({ file, type: 'order' });
            setPromptPassword('');
            showNotification('info', `"${file.name}" 파일에 비밀번호가 설정되어 있습니다. 비밀번호를 입력해주세요.`);
            setIsProcessingOrders(false);
            return;
          } else {
            showNotification('error', `"${file.name}" 분석 실패: ${err.message || '오류 발생'}`);
          }
        }
      }

      if (parsedFilesList.length === 0) {
        setOrderParseResult(null);
        return;
      }

      // Combine orders
      const combinedOrders: ProcessedOrder[] = [];
      parsedFilesList.forEach(pf => {
        combinedOrders.push(...pf.orders);
      });

      // Recalculate combinedId count for multiple platforms
      const idCounts: { [key: string]: number } = {};
      combinedOrders.forEach(o => {
        idCounts[o.combinedId] = (idCounts[o.combinedId] || 0) + 1;
      });

      combinedOrders.forEach(o => {
        o.isMulti = idCounts[o.combinedId] > 1;
      });

      // Stagger / sort combined orders using clean name sorting
      const multiOrders = combinedOrders.filter(o => o.isMulti).sort(compareOrdersByCleanName);
      const singleOrders = combinedOrders.filter(o => !o.isMulti).sort(compareOrdersByCleanName);

      const sortedCombinedOrders = [...multiOrders, ...singleOrders];

      // 기존 순수 API 자동 수집건 주문만 따로 보존
      const existingApiOrders = (orderParseResult?.orders || []).filter(
        o => o.platformId === 'api_auto' || o.sourceFileName?.endsWith('.api') || (o.sourceFileName && o.sourceFileName.includes('API_'))
      );

      // API 수집 주문이 존재하는 경우에만 기존 API 주문과 이번 엑셀 파싱 주문(sortedCombinedOrders)을 병합
      const mergedOrders = existingApiOrders.length > 0
        ? mergeOrdersWithoutDuplicates(existingApiOrders, sortedCombinedOrders)
        : sortedCombinedOrders;

      // 엑셀 수집 주문 + API 수집 주문 통합 매핑 적용 및 미대치 원본명 추출 + 합포장 재그룹핑
      const reprocessed = processOrdersWithMappings(mergedOrders, mappingsToUse);

      // 기존 API 수집 파일 정보도 parsedFiles 목록에 함께 보존
      const existingApiParsedFiles = (orderParseResult?.parsedFiles || []).filter(
        pf => pf.platformId === 'api_auto' || pf.fileName.endsWith('.api') || (pf.fileName && pf.fileName.includes('API_'))
      );
      const combinedParsedFiles = [...parsedFilesList];
      existingApiParsedFiles.forEach(apiFile => {
        if (!combinedParsedFiles.some(f => f.fileName === apiFile.fileName)) {
          combinedParsedFiles.push(apiFile);
        }
      });

      const allValidationIssues: ValidationIssue[] = [];
      parsedFilesList.forEach(pf => {
        if (pf.validationIssues && pf.validationIssues.length > 0) {
          allValidationIssues.push(...pf.validationIssues);
        }
      });

      setOrderParseResult({
        orders: reprocessed.orders,
        newRawItems: reprocessed.newRawItems,
        validationIssues: allValidationIssues,
        parsedFiles: combinedParsedFiles
      });

      setAnalyticsOrders(reprocessed.orders);

      // 1단계 주문 데이터가 갱신되면 2단계 운송장 소스 파일이 존재하는 경우 실시간 자동 재매칭 실행
      if (trackingFiles.length > 0) {
        processMultipleTrackingFiles(trackingFiles, customTrackingCouriers, cacheToUse, reprocessed.orders);
      }

      // Set up mapping form
      if (reprocessed.newRawItems.length > 0) {
        const initialForm: { [key: string]: string } = {};
        reprocessed.newRawItems.forEach(item => {
          initialForm[item] = "";
        });
        setNewItemsMappingForm(initialForm);
      } else {
        setNewItemsMappingForm({});
      }
    } catch (err: any) {
      showNotification('error', `통합 처리 중 오류 발생: ${err.message || err}`);
    } finally {
      setIsProcessingOrders(false);
    }
  };

  // 주문 목록에 productMappings를 적용하고, 미대치 품목(newRawItems) 추출 및 합포장(combinedId, isMulti)을 재계산하는 함수
  const processOrdersWithMappings = (
    ordersList: ProcessedOrder[],
    mappings: ProductMapping[]
  ) => {
    const newRawItemsSet = new Set<string>();

    // 1. 각 주문에 대해 캐시 기반 매핑 및 스마트 매칭 적용
    const mappedOrders = ordersList.map(order => {
      const rawProdName = (order.originalProductName || order.상품명 || '').trim();
      if (!rawProdName) {
        return order;
      }
      
      const cleanResult = extractOptionAndCleanName(rawProdName, mappings, order.용량);
      
      if (cleanResult.isMatched && cleanResult.mappedName) {
        return {
          ...order,
          originalProductName: rawProdName,
          상품명: cleanResult.mappedName,
          용량: cleanResult.optionText || order.용량 || '기본'
        };
      }

      // 미대치 원본 품목인 경우 newRawItemsSet에 수집
      newRawItemsSet.add(rawProdName);
      return {
        ...order,
        originalProductName: rawProdName,
        상품명: cleanResult.mappedName || rawProdName
      };
    });

    // 2. 수령인+연락처+주소 기반 합포장 그룹핑 재계산
    const recipientGroupMap = new Map<string, ProcessedOrder[]>();
    mappedOrders.forEach(o => {
      const key = `${o.수령인 || ''}_${o.연락처 || ''}_${o.주소 || ''}`.trim();
      if (!recipientGroupMap.has(key)) {
        recipientGroupMap.set(key, []);
      }
      recipientGroupMap.get(key)!.push(o);
    });

    const finalProcessedOrders: ProcessedOrder[] = [];
    let groupIdx = 1;

    recipientGroupMap.forEach((groupOrders) => {
      const isMultiGroup = groupOrders.length > 1;
      const combinedGroupId = `COMB_${groupIdx++}`;

      groupOrders.forEach(o => {
        finalProcessedOrders.push({
          ...o,
          combinedId: combinedGroupId,
          isMulti: isMultiGroup
        });
      });
    });

    // 합포장건(isMulti: true)을 상단으로 오게 정렬 및 정제된 단어 기준 가나다순 정렬
    finalProcessedOrders.sort(compareOrdersByCleanName);

    return {
      orders: finalProcessedOrders,
      newRawItems: Array.from(newRawItemsSet)
    };
  };

  // 수집된 특정 파일/API 데이터 세트 개별 삭제 핸들러 (엑셀 파일 & API 수집건 공통 지원)
  const handleRemoveParsedFile = async (fileNameToRemove: string) => {
    // 1. 엑셀 업로드 파일 목록에서 해당 파일 제거
    const updatedOrderFiles = orderFiles.filter(f => f.name !== fileNameToRemove);
    setOrderFiles(updatedOrderFiles);

    // 2. parsedFiles 목록에서 제거 대상 제외
    const currentParsedFiles = orderParseResult?.parsedFiles || [];
    const remainingParsedFiles = currentParsedFiles.filter(pf => pf.fileName !== fileNameToRemove);

    if (remainingParsedFiles.length === 0) {
      setOrderParseResult(null);
      setAnalyticsOrders([]);
      setNewItemsMappingForm({});
      showNotification('info', "모든 수집 데이터가 삭제되었습니다.");
      return;
    }

    // 3. 남은 parsedFiles의 주문 데이터만 합산하여 재계산
    const remainingOrders: ProcessedOrder[] = [];
    remainingParsedFiles.forEach(pf => {
      remainingOrders.push(...pf.orders);
    });

    const reprocessed = processOrdersWithMappings(remainingOrders, productMappings);

    setOrderParseResult({
      orders: reprocessed.orders,
      parsedFiles: remainingParsedFiles,
      newRawItems: reprocessed.newRawItems,
      validationIssues: orderParseResult?.validationIssues || []
    });
    setAnalyticsOrders(reprocessed.orders);

    if (reprocessed.newRawItems.length > 0) {
      const initialForm: { [key: string]: string } = {};
      reprocessed.newRawItems.forEach(item => {
        initialForm[item] = "";
      });
      setNewItemsMappingForm(initialForm);
    } else {
      setNewItemsMappingForm({});
    }

    showNotification('success', `"${fileNameToRemove}" 수집 데이터가 삭제되었습니다.`);
  };

  // 발견된 신규 품목 실시간 즉시 매핑 처리
  const handleAddNewItemMappings = () => {
    const newMappingsToAdd: ProductMapping[] = [];
    Object.entries(newItemsMappingForm).forEach(([raw, mapped]) => {
      const mappedStr = String(mapped);
      // 대치 단어를 입력하지 않고 비워둔 경우에도 버튼을 누르면 원본명(raw) 그대로 사전에 등록
      const finalMapped = mappedStr.trim() ? mappedStr.trim() : raw.trim();
      if (finalMapped) {
        newMappingsToAdd.push({
          rawName: raw,
          mappedName: finalMapped
        });
      }
    });

    if (newMappingsToAdd.length === 0) {
      showNotification('info', "등록할 신규 품목이 없습니다.");
      return;
    }

    const updatedMappings = [...newMappingsToAdd, ...productMappings];
    setProductMappings(updatedMappings);
    showNotification('success', `신규 품목 ${newMappingsToAdd.length}개의 정제 규칙이 사전에 등록되었습니다.`);

    // 엑셀 수집 파일 및 API 수집 주문 포함 전체 재대치 실행
    if (orderParseResult && orderParseResult.orders && orderParseResult.orders.length > 0) {
      const reprocessed = processOrdersWithMappings(orderParseResult.orders, updatedMappings);
      setOrderParseResult({
        ...orderParseResult,
        orders: reprocessed.orders,
        newRawItems: reprocessed.newRawItems
      });
      setAnalyticsOrders(reprocessed.orders);

      if (reprocessed.newRawItems.length > 0) {
        const initialForm: { [key: string]: string } = {};
        reprocessed.newRawItems.forEach(item => {
          initialForm[item] = "";
        });
        setNewItemsMappingForm(initialForm);
      } else {
        setNewItemsMappingForm({});
      }
    } else if (orderFiles.length > 0) {
      processMultipleOrderFiles(orderFiles, customFilePlatforms, decryptedFilesCache, updatedMappings);
    }
  };

  // 요약보고서 다운로드
  const handleDownloadSummaryReport = async () => {
    if (!orderParseResult) return;
    try {
      await exportSummaryReportExcel(orderParseResult.orders);
      showNotification('success', "요약보고서 엑셀 파일을 성공적으로 다운로드했습니다.");
    } catch (err) {
      console.error("요약보고서 다운로드 실패:", err);
      showNotification('error', "요약보고서 다운로드 중 오류가 발생했습니다.");
    }
  };

  // 품목별정렬 다운로드
  const handleDownloadProductSorted = async () => {
    if (!orderParseResult) return;
    try {
      await exportProductSortedExcel(orderParseResult.orders);
      showNotification('success', "품목별정렬 엑셀 파일을 성공적으로 다운로드했습니다.");
    } catch (err) {
      console.error("품목별정렬 다운로드 실패:", err);
      showNotification('error', "품목별정렬 다운로드 중 오류가 발생했습니다.");
    }
  };

  // 한 번에 모두 다운로드 (2종)
  const handleDownloadAllProcessed = async () => {
    if (!orderParseResult) return;
    try {
      await exportSummaryReportExcel(orderParseResult.orders);
      await new Promise(resolve => setTimeout(resolve, 600));
      await exportProductSortedExcel(orderParseResult.orders);
      showNotification('success', "2종의 엑셀 파일(요약보고서 & 품목별정렬)을 전체 다운로드했습니다.");
    } catch (err) {
      console.error("전체 다운로드 실패:", err);
      showNotification('error', "다운로드 처리 중 오류가 발생했습니다.");
    }
  };

  // 엑셀 미리보기 모달 상태
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    files: ExcelPreviewFile[];
    onDownloadAll?: () => void;
    downloadAllButtonText?: string;
  }>({
    isOpen: false,
    title: '',
    files: []
  });

  // 1단계 가공된 주문 데이터 미리보기 (실제 생성되는 2개 파일 및 각각의 시트와 1:1 완벽 대조)
  const handlePreviewStep1Excel = () => {
    if (!orderParseResult || !orderParseResult.orders || orderParseResult.orders.length === 0) {
      showNotification('info', "미리볼 주문 가공 데이터가 없습니다. 먼저 주문서를 올려 주세요.");
      return;
    }

    const orders: ProcessedOrder[] = orderParseResult.orders;

    // --- [파일 1: 1. 요약보고서.xlsx] ---
    // 시트 1: 상세내역 (용량, 상품명, 수량, 주문자, 쇼핑몰/플랫폼)
    const summarySheet1Columns = ["용량", "상품명", "수량", "주문자", "쇼핑몰/플랫폼"];
    const summarySheet1Rows = orders.map(o => [
      o.originalOptionName || "",
      o.originalProductName || "",
      o.수량,
      o.주문자 || "",
      o.platformName || "쇼핑몰/플랫폼"
    ]);

    // 시트 2: 상품준비요약 (상품 분류 (행 레이블), sortedUnits..., 총합계)
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

    const summarySheet2Columns = ["상품 분류 (행 레이블)", ...sortedUnits, "총합계"];
    const summarySheet2Rows: (string | number)[][] = [];

    sortedBaseNames.forEach(baseName => {
      const rowData: (string | number)[] = [baseName];
      let totalRowQty = 0;
      sortedUnits.forEach(unit => {
        const qty = pivotMap[baseName][unit] || 0;
        rowData.push(qty > 0 ? qty : "");
        totalRowQty += qty;
      });
      rowData.push(totalRowQty);
      summarySheet2Rows.push(rowData);
    });

    // 하단 총합계 행
    const totalRow: (string | number)[] = ["총합계"];
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
    summarySheet2Rows.push(totalRow);

    const summaryReportFile: ExcelPreviewFile = {
      fileName: "1. 요약보고서.xlsx",
      fileDescription: "상세내역 시트 및 상품준비요약(피벗 집계표) 시트로 구성된 엑셀 파일입니다.",
      sheets: [
        { sheetName: "상세내역", columns: summarySheet1Columns, rows: summarySheet1Rows },
        { sheetName: "상품준비요약", columns: summarySheet2Columns, rows: summarySheet2Rows }
      ],
      secondaryOptionColsInfo: activeSecondaryOptionColsInfo,
      onDownload: () => {
        handleDownloadSummaryReport();
      }
    };

    // --- [파일 2: 2. 품목별정렬.xlsx] ---
    const sortedSheetColumns = ["용량", "상품명", "수량(고정)", "수량", "수령인", "연락처", "우편번호", "주소", "배송메시지"];
    const sortedSheetRows = orders.map(o => [
      o.originalOptionName || "",
      o.originalProductName || "",
      1,
      o.수량,
      o.수령인 || "",
      o.연락처 || "",
      o.우편번호 || "",
      o.주소 || "",
      o.배송메시지 || ""
    ]);

    const productSortedFile: ExcelPreviewFile = {
      fileName: "2. 품목별정렬.xlsx",
      fileDescription: "주소록 및 품목별 정렬이 완료된 원본 가공데이터 엑셀 파일입니다.",
      sheets: [
        { sheetName: "가공데이터", columns: sortedSheetColumns, rows: sortedSheetRows }
      ],
      secondaryOptionColsInfo: activeSecondaryOptionColsInfo,
      onDownload: () => {
        handleDownloadProductSorted();
      }
    };

    setPreviewModal({
      isOpen: true,
      title: "정리된 파일 미리 보기 (2개)",
      subtitle: "다운로드되는 실제 엑셀 파일 및 시트 구조와 100% 동일한 미리보기 화면입니다.",
      files: [summaryReportFile, productSortedFile],
      onDownloadAll: () => {
        setPreviewModal(prev => ({ ...prev, isOpen: false }));
        handleDownloadAllProcessed();
      },
      downloadAllButtonText: "두 파일 한 번에 모두 다운로드"
    });
  };

  // 송장 붙인 파일 미리 보기 (각 인풋 쇼핑몰/플랫폼별로 실제 생성되는 출력 엑셀 다중 파일과 100% 동일)
  const handlePreviewStep2Excel = () => {
    if (!trackingResult || !trackingResult.outputOrders || trackingResult.outputOrders.length === 0) {
      showNotification('info', "미리볼 운송장 매칭 결과가 없습니다. 먼저 운송장 매칭을 실행해주세요.");
      return;
    }

    const effectiveCourier = selectedCourier === 'custom' ? customCourier : selectedCourier;
    const today = new Date().toISOString().slice(0, 10);

    const parsedFiles = orderParseResult?.parsedFiles || [];
    const previewFiles: ExcelPreviewFile[] = [];

    if (parsedFiles.length > 0) {
      parsedFiles.forEach((pf) => {
        const fileOrders: ProcessedOrder[] = trackingResult.outputOrders.filter(
          (o: any) => !o.sourceFileName || o.sourceFileName === pf.fileName || parsedFiles.length === 1
        );

        if (!fileOrders || fileOrders.length === 0) return;

        const platform: PlatformConfig = pf.detectedPlatform || platforms[0];
        const platformName = platform.name || '쇼핑몰/플랫폼';

        const trackingColIdx = platform.tracking_col !== undefined ? platform.tracking_col : undefined;
        const courierColIdx = platform.courier_col !== undefined ? platform.courier_col : undefined;

        // 원본 헤더 추출
        const headerRowIndex = findHeaderRowIndex(pf.rawRows || [], platform.start_row || 1);
        const rawHeaderRow = (pf.headers && pf.headers.length > 0)
          ? [...pf.headers]
          : (pf.rawRows && pf.rawRows[headerRowIndex] ? [...pf.rawRows[headerRowIndex]] : []);

        // 최소 열 길이 보장
        let maxCols = rawHeaderRow.length;
        if (trackingColIdx !== undefined && trackingColIdx + 1 > maxCols) maxCols = trackingColIdx + 1;
        if (courierColIdx !== undefined && courierColIdx + 1 > maxCols) maxCols = courierColIdx + 1;

        const columns: string[] = [];
        for (let c = 0; c < maxCols; c++) {
          let colName = String(rawHeaderRow[c] || '').trim();
          if (!colName) {
            if (c === trackingColIdx) colName = '운송장번호';
            else if (c === courierColIdx) colName = '택배사';
            else colName = `열 ${colNumToLetter(c + 1)}`;
          }
          columns.push(colName);
        }

        // 추가 디버그/확인 열 (매칭상태, 매칭 유추 근거)
        columns.push("매칭상태", "맞춘 근거");

        // rawRowIndex -> ProcessedOrder 매핑 생성
        const orderMapByRowIndex = new Map<number, ProcessedOrder>();
        fileOrders.forEach(o => {
          const rawIdx = Number(o.id);
          if (!isNaN(rawIdx)) {
            orderMapByRowIndex.set(rawIdx, o);
          }
        });

        // 원본 rawRows의 행 순서(headerRowIndex + 1부터 끝까지) 100% 보존 후 합포장 중복(F열 'N') 제거
        const unfilteredRows: (string | number | undefined | null)[][] = [];
        const rawRows = pf.rawRows || [];
        const startDataRow = headerRowIndex + 1;

        for (let rIdx = startDataRow; rIdx < rawRows.length; rIdx++) {
          const origRow = rawRows[rIdx] ? [...rawRows[rIdx]] : [];
          if (origRow.length === 0 && !orderMapByRowIndex.has(rIdx)) continue;

          const rowCells: (string | number | undefined | null)[] = [];
          for (let c = 0; c < maxCols; c++) {
            rowCells.push(origRow[c] !== undefined ? origRow[c] : "");
          }

          const matchedOrder = orderMapByRowIndex.get(rIdx);

          if (matchedOrder) {
            if (trackingColIdx !== undefined) {
              rowCells[trackingColIdx] = matchedOrder.trackingNumber || "(미부여)";
            }
            if (courierColIdx !== undefined) {
              rowCells[courierColIdx] = matchedOrder.courierName || effectiveCourier;
            }
            rowCells.push(
              matchedOrder.matchType || "unmatched",
              matchedOrder.softMatchReason || (matchedOrder.matchType === 'exact' ? '키 정보 100% 완전 일치' : '-')
            );
          } else {
            // 해당 원본 행에 매칭된 주문이 없는 경우 (공백, 가이드행 등)
            rowCells.push("-", "-");
          }

          unfilteredRows.push(rowCells);
        }

        // 실제 최종 엑셀 파일 출력시 수행되는 합포장 중복(F열 'N') 제거 처리와 100% 동일하게 행 필터링
        const recipColIdx = platform.col_map?.수령인 !== undefined ? platform.col_map.수령인 : 1;
        const addrColIdx = platform.col_map?.주소 !== undefined ? platform.col_map.주소 : 3;
        const orderNoColIdx = (platform.col_map as any)?.주문번호 !== undefined ? (platform.col_map as any).주문번호 : 0;

        let seenNInGroup = false;
        let currentGroupKey = "";

        const rows = unfilteredRows.filter(rowCells => {
          const valF = String(rowCells[5] || "").trim().toUpperCase(); // F열(6번째 열)
          const colOrderKey = String(rowCells[orderNoColIdx] || rowCells[0] || "").trim();
          const recipientKey = String(rowCells[recipColIdx] || "").trim();
          const addrKey = String(rowCells[addrColIdx] || "").trim();

          const groupKey = colOrderKey ? `ORDER_${colOrderKey}` : `${recipientKey}_${addrKey}`;

          if (groupKey !== currentGroupKey && recipientKey !== "") {
            currentGroupKey = groupKey;
            seenNInGroup = false;
          }

          if (valF === "N") {
            if (seenNInGroup) {
              // 중복 'N' 행은 최종 파일 출력처럼 미리보기에서도 제거
              return false;
            } else {
              seenNInGroup = true;
            }
          }
          return true;
        });

        const fileName = `최종송장_${pf.fileName.replace(/\.xlsx?$/i, '')}_${today}.xlsx`;

        previewFiles.push({
          fileName,
          platformName,
          fileDescription: `[${platformName}] 양식 원본 순서를 100% 유지하여 운송장 번호가 반영된 최종 배송용 엑셀 파일입니다.`,
          sheets: [
            {
              sheetName: `${platformName} 송장반영`,
              columns,
              rows
            }
          ],
          onDownload: async () => {
            const courierToUse = selectedCourier === "custom" ? customCourier.trim() || "한진택배" : selectedCourier;
            await exportFinalTrackingExcel(
              fileOrders,
              pf.rawRows,
              pf.detectedPlatform,
              fileName,
              pf.originalBuffer || pf.file,
              courierToUse
            );
          }
        });
      });
    }

    // 폴백: parsedFiles가 비어있거나 매칭된 것이 없는 경우
    if (previewFiles.length === 0) {
      const outputOrders: ProcessedOrder[] = trackingResult.outputOrders;
      const sheetColumns = [
        "순번", "수령인", "우편번호", "주소", "연락처", "주문 품목명", "용량/옵션", "수량", "택배사", "운송장번호", "매칭상태", "맞춘 근거"
      ];
      const sheetRows = outputOrders.map((o, idx) => [
        idx + 1,
        o.수령인,
        o.우편번호,
        o.주소,
        o.연락처,
        o.originalProductName || o.상품명,
        o.originalOptionName || o.용량,
        o.수량,
        o.courierName || effectiveCourier,
        o.trackingNumber || "(미부여)",
        o.matchType || "unmatched",
        o.softMatchReason || (o.matchType === 'exact' ? '키 정보 100% 완전 일치' : '-')
      ]);

      previewFiles.push({
        fileName: `최종_운송장반영_배송데이터_${today}.xlsx`,
        platformName: "기본 통합",
        fileDescription: "운송장 번호가 매칭되어 부여된 최종 배송용 엑셀 파일입니다.",
        sheets: [
          { sheetName: "배송반영데이터", columns: sheetColumns, rows: sheetRows }
        ],
        onDownload: () => {
          handleDownloadFinalTracking();
        }
      });
    }

    setPreviewModal({
      isOpen: true,
      title: `송장 붙인 파일 미리 보기`,
      subtitle: "입력된 원본 쇼핑몰 양식의 행 순서와 구성을 100% 유지한 실제 출력 엑셀 파일 미리보기입니다.",
      files: previewFiles,
      onDownloadAll: () => {
        setPreviewModal(prev => ({ ...prev, isOpen: false }));
        handleDownloadFinalTracking();
      },
      downloadAllButtonText: previewFiles.length > 1 ? "모든 최종 배송엑셀 파일 한 번에 다운로드" : "최종 배송엑셀 파일 다운로드"
    });
  };

  // ----------------------------------------------------
  // 3. 2단계: 운송장 다중 업로드 및 자동 매칭 핸들러
  // ----------------------------------------------------
  const processMultipleTrackingFiles = async (
    files: File[],
    customCouriers: { [fileName: string]: string } = customTrackingCouriers,
    cacheToUse: { [fileName: string]: any[][] } = decryptedFilesCache,
    ordersToUse: ProcessedOrder[] = orderParseResult?.orders || []
  ) => {
    if (files.length === 0) {
      setTrackingResult(null);
      setParsedTrackingFiles([]);
      return;
    }

    setIsProcessingTracking(true);
    setPasswordErrorFile(null);

    try {
      const parsedTrackingList: {
        fileName: string;
        file?: File;
        detectedCourier: string;
        rawRows: any[][];
        count: number;
      }[] = [];

      for (const file of files) {
        let rawRows: any[][] = [];
        if (cacheToUse[file.name]) {
          const workbook = XLSX.read(cacheToUse[file.name], { type: 'array' });
          const bestSheetName = findBestOrderSheet(workbook);
          const worksheet = workbook.Sheets[bestSheetName];
          rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });
        } else {
          const data = new Uint8Array(await file.arrayBuffer());
          const workbook = XLSX.read(data, { type: 'array' });
          const bestSheetName = findBestOrderSheet(workbook);
          const worksheet = workbook.Sheets[bestSheetName];
          rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });
        }

        const forcedCourier = customCouriers[file.name];
        const detectedCourier = forcedCourier || detectCourierForFile(file.name, rawRows);

        parsedTrackingList.push({
          fileName: file.name,
          file,
          detectedCourier,
          rawRows,
          count: Math.max(0, rawRows.length - 1)
        });
      }

      setParsedTrackingFiles(parsedTrackingList);

      if (!ordersToUse || ordersToUse.length === 0) {
        setTrackingResult(null);
        showNotification('info', `송장 엑셀 ${files.length}개를 올렸어요. 주문서를 올리면 바로 맞춰 드려요.`);
        return;
      }

      // 전체 운송장 소스 파일들의 rawRows 결합
      const combinedRawRows: any[][] = [];
      parsedTrackingList.forEach(ptf => {
        if (ptf.rawRows.length > 0) {
          if (combinedRawRows.length === 0) {
            combinedRawRows.push(...ptf.rawRows);
          } else {
            combinedRawRows.push(...ptf.rawRows.slice(1));
          }
        }
      });

      const effectiveCourier = parsedTrackingList[0]?.detectedCourier || (selectedCourier === 'custom' ? customCourier : selectedCourier);

      const result = processTrackingUpdateWithRows(
        ordersToUse,
        combinedRawRows,
        productMappings,
        couriers,
        effectiveCourier
      );

      setTrackingResult(result);
      if (parsedTrackingList.length > 0) {
        setSourceFile(parsedTrackingList[0].file || null);
      }
      showNotification('success', `${files.length}개 운송장 파일 자동 분석 완료. (매칭 성공: ${result.matchCount + result.softMatchCount}건)`);
    } catch (err: any) {
      if (err.message === "PASSWORD_PROTECTED" || String(err).toLowerCase().includes('password')) {
        const firstFile = files[0];
        setPasswordPrompt({ file: firstFile, type: 'tracking' });
        setPromptPassword('');
        showNotification('info', `"${firstFile.name}" 파일에 비밀번호가 설정되어 있습니다.`);
      } else {
        showNotification('error', `운송장 분석 처리 중 오류 발생: ${err.message || '오류'}`);
      }
    } finally {
      setIsProcessingTracking(false);
    }
  };

  const handleSourceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    if (!(await checkUploadAllowed(newFiles.length))) { e.target.value = ''; return; }

    const existingNames = new Set(trackingFiles.map((f: File) => f.name));
    const uniqueNewFiles = newFiles.filter((f: File) => !existingNames.has(f.name));

    if (uniqueNewFiles.length === 0) {
      showNotification('info', '이미 올린 송장 엑셀이에요.');
      e.target.value = '';
      return;
    }

    const updatedFiles = [...trackingFiles, ...uniqueNewFiles];
    setTrackingFiles(updatedFiles);
    await processMultipleTrackingFiles(updatedFiles);
    e.target.value = '';
  };

  const handleRemoveParsedTrackingFile = async (fileNameToRemove: string) => {
    const updatedFiles = trackingFiles.filter(f => f.name !== fileNameToRemove);
    setTrackingFiles(updatedFiles);

    const remainingParsed = parsedTrackingFiles.filter(p => p.fileName !== fileNameToRemove);
    setParsedTrackingFiles(remainingParsed);

    if (remainingParsed.length === 0) {
      setTrackingResult(null);
      setSourceFile(null);
      showNotification('info', "모든 운송장 소스 파일이 삭제되었습니다.");
      return;
    }

    await processMultipleTrackingFiles(updatedFiles);
  };

  const handleTrackingFileCourierChange = async (fileName: string, courierName: string) => {
    const updatedCustoms = { ...customTrackingCouriers, [fileName]: courierName };
    setCustomTrackingCouriers(updatedCustoms);
    await processMultipleTrackingFiles(trackingFiles, updatedCustoms);
  };

  const handleApplyTracking = async () => {
    if (trackingFiles.length > 0) {
      await processMultipleTrackingFiles(trackingFiles);
    }
  };

  // 쇼핑몰 API 자동 연동 수집 결과 수신 핸들러 (플랫폼별 독립 데이터 세트 생성)
  const handleOrdersApiSynced = (syncedOrders: ProcessedOrder[], summaryMsg: string) => {
    if (!syncedOrders || syncedOrders.length === 0) return;

    const existingOrders = orderParseResult?.orders || [];
    const mergedOrders = mergeOrdersWithoutDuplicates(existingOrders, syncedOrders);

    // 품목대치 사전 적용 및 미대치 원본명 추출 + 합포장 재그룹핑
    const processed = processOrdersWithMappings(mergedOrders, productMappings);

    // 수집된 주문들을 플랫폼별로 그룹화
    const platformGroupMap = new Map<string, { platformName: string; platformId: string; orders: ProcessedOrder[] }>();
    syncedOrders.forEach(o => {
      const pId = o.platformId || 'api_auto';
      const pName = o.platformName || 'API 자동수집';
      if (!platformGroupMap.has(pId)) {
        platformGroupMap.set(pId, { platformName: pName, platformId: pId, orders: [] });
      }
      platformGroupMap.get(pId)!.orders.push(o);
    });

    const existingParsedFiles = orderParseResult?.parsedFiles || [];
    const updatedParsedFiles = [...existingParsedFiles];

    platformGroupMap.forEach((group, pId) => {
      const fileName = `API_실시간수집_${group.platformName.replace(/\s+/g, '')}.api`;
      
      // 동일한 API 수집 파일이 이미 있으면 주문 업데이트, 없으면 신규 추가
      const existingIdx = updatedParsedFiles.findIndex(pf => pf.fileName === fileName || (pf.platformId === pId && pf.fileName.endsWith('.api')));
      
      const matchedPlatConfig = platforms.find(p => p.id === pId) || {
        id: pId,
        name: group.platformName,
        identifier: '',
        start_row: 1,
        col_map: { 용량: 0, 상품명: 1, 수량: 2, 수령인: 3, 연락처: 4, 우편번호: 5, 주소: 6, 배송메시지: 7 },
        tracking_col: 8,
        courier_col: 9,
        filepath_pattern: ''
      };

      const apiParsedFileObj = {
        fileName,
        platformId: pId,
        platformName: group.platformName,
        detectedPlatform: matchedPlatConfig,
        orders: group.orders,
        rawRows: [],
        headers: ["용량", "상품명", "수량", "수령인", "연락처", "우편번호", "주소", "배송메시지"],
        newRawItems: []
      };

      if (existingIdx !== -1) {
        // 기존 해당 플랫폼 API 수집 파일의 주문 병합
        const oldOrders = updatedParsedFiles[existingIdx].orders || [];
        const mergedPlatOrders = mergeOrdersWithoutDuplicates(oldOrders, group.orders);
        updatedParsedFiles[existingIdx] = {
          ...updatedParsedFiles[existingIdx],
          orders: mergedPlatOrders
        };
      } else {
        updatedParsedFiles.push(apiParsedFileObj);
      }
    });

    const updatedParseResult = {
      orders: processed.orders,
      parsedFiles: updatedParsedFiles,
      newRawItems: processed.newRawItems,
      validationIssues: orderParseResult?.validationIssues || []
    };

    setOrderParseResult(updatedParseResult);
    setAnalyticsOrders(processed.orders);

    // 미대치 원본 품목이 있다면 Step 1 신규 품목 대치 매핑 폼 활성화
    if (processed.newRawItems.length > 0) {
      const initialForm: { [key: string]: string } = {};
      processed.newRawItems.forEach(item => {
        initialForm[item] = "";
      });
      setNewItemsMappingForm(initialForm);
    }
  };

  // ----------------------------------------------------
  // 4. 비밀번호 보호 엑셀 복호화 핸들러 (브라우저에서 처리)
  // ----------------------------------------------------
  const handleCancelPasswordPrompt = () => {
    if (passwordPrompt) {
      const fileNameToCancel = passwordPrompt.file.name;
      if (passwordPrompt.type === 'order') {
        const remainingFiles = orderFiles.filter(f => f.name !== fileNameToCancel);
        setOrderFiles(remainingFiles);
        if (remainingFiles.length > 0) {
          processMultipleOrderFiles(remainingFiles, customFilePlatforms, decryptedFilesCache);
        } else {
          setOrderParseResult(null);
        }
      } else if (passwordPrompt.type === 'tracking') {
        setSourceFile(null);
        setTrackingResult(null);
      }
    }
    setPasswordPrompt(null);
    setPromptPassword('');
  };

  const handleDecryptFile = async () => {
    if (!passwordPrompt) return;
    setIsDecrypting(true);

    try {
      // 옛 .xls(암호)는 브라우저에서 해제할 수 없습니다. 안내만 띄우고 중단합니다.
      if (passwordPrompt.file.name.toLowerCase().endsWith('.xls')) {
        throw new Error('암호가 걸린 .xls 파일은 지원하지 않습니다. 엑셀에서 .xlsx로 저장한 뒤 다시 올려 주세요.');
      }

      // 파일을 서버로 보내지 않고 이 브라우저에서 비밀번호를 해제합니다.
      const bytes = await decryptExcelFile(passwordPrompt.file, promptPassword);

      const updatedCache = {
        ...decryptedFilesCache,
        [passwordPrompt.file.name]: bytes
      };
      setDecryptedFilesCache(updatedCache);
      
      showNotification('success', `"${passwordPrompt.file.name}" 파일 비밀번호 해제에 성공했습니다.`);
      const activeType = passwordPrompt.type;
      
      setPasswordPrompt(null);
      setPromptPassword('');

      if (activeType === 'order') {
        await processMultipleOrderFiles(orderFiles, customFilePlatforms, updatedCache);
      } else {
        await processMultipleTrackingFiles(trackingFiles, customTrackingCouriers, updatedCache);
      }
    } catch (err: any) {
      console.error("복호화 오류:", err);
      showNotification('error', err.message || "비밀번호가 일치하지 않습니다. 올바른 엑셀 비밀번호를 다시 입력해 주세요.");
      setPromptPassword('');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleDownloadFinalTracking = async () => {
    if (!trackingResult || !orderParseResult) return;
    
    try {
      const { parsedFiles } = orderParseResult;
      if (!parsedFiles || parsedFiles.length === 0) return;

      let downloadedCount = 0;
      const courierToUse = selectedCourier === "custom" ? customCourier.trim() || "한진택배" : selectedCourier;

      for (const pf of parsedFiles) {
        const fileOrders = trackingResult.outputOrders.filter(
          (o: any) => !o.sourceFileName || o.sourceFileName === pf.fileName || parsedFiles.length === 1
        );

        if (fileOrders.length > 0) {
          const today = new Date().toISOString().slice(0, 10);
          const customName = `최종송장_${pf.fileName.replace(/\.xlsx?$/i, '')}_${today}.xlsx`;
          
          await exportFinalTrackingExcel(
            fileOrders,
            pf.rawRows,
            pf.detectedPlatform,
            customName,
            pf.originalBuffer || pf.file,
            courierToUse
          );
          downloadedCount++;
        }
      }

      showNotification('success', `성공: 각 쇼핑몰 양식에 맞춰 최종 송장 파일 ${downloadedCount}개를 다운로드했습니다.`);
    } catch (err) {
      showNotification('error', "최종 송장 파일 저장 중 오류가 발생했습니다.");
    }
  };

  const handleResetProcess = () => {
    setOrderFiles([]);
    setCustomFilePlatforms({});
    setOrderParseResult(null);
    setNewItemsMappingForm({});
    setTrackingFiles([]);
    setParsedTrackingFiles([]);
    setCustomTrackingCouriers({});
    setSourceFile(null);
    setTrackingResult(null);
    setPasswordErrorFile(null);
    setDecryptedFilesCache({});
    showNotification('info', "작업 영역이 깔끔하게 리셋되었습니다.");
  };

  // ----------------------------------------------------
  // 4. 설정 백업 및 가져오기 핸들러
  // ----------------------------------------------------
  // --- 품목 대치 사전 전용 내보내기 ---
  const handleExportProductMappingsExcel = () => {
    if (productMappings.length === 0) {
      showNotification('error', "내보낼 품목 대치 규칙이 존재하지 않습니다.");
      return;
    }
    const data = productMappings.map(m => ({
      '원본 상품명 키워드': m.rawName,
      '정제 후 표준 상품명': m.mappedName
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '품목대치사전');
    XLSX.writeFile(wb, `품목대치사전_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showNotification('success', "품목 대치 사전 엑셀(.xlsx) 파일 내보내기가 완료되었습니다.");
  };

  const handleExportProductMappingsCSV = () => {
    if (productMappings.length === 0) {
      showNotification('error', "내보낼 품목 대치 규칙이 존재하지 않습니다.");
      return;
    }
    const data = productMappings.map(m => ({
      '원본 상품명 키워드': m.rawName,
      '정제 후 표준 상품명': m.mappedName
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const csvOutput = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(["\uFEFF" + csvOutput], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `품목대치사전_${new Date().toISOString().slice(0, 10)}.csv`);
    showNotification('success', "품목 대치 사전 CSV(.csv) 파일 내보내기가 완료되었습니다.");
  };

  const handleExportProductMappingsJSON = () => {
    if (productMappings.length === 0) {
      showNotification('error', "내보낼 품목 대치 규칙이 존재하지 않습니다.");
      return;
    }
    const blob = new Blob([JSON.stringify(productMappings, null, 2)], { type: 'application/json;charset=utf-8;' });
    triggerDownload(blob, `품목대치사전_${new Date().toISOString().slice(0, 10)}.json`);
    showNotification('success', "품목 대치 사전 JSON(.json) 파일 내보내기가 완료되었습니다.");
  };

  const handleCopyProductMappingsClipboard = () => {
    if (productMappings.length === 0) {
      showNotification('error', "복사할 품목 대치 규칙이 존재하지 않습니다.");
      return;
    }
    const text = productMappings
      .map(m => `'${m.rawName}' : '${m.mappedName}'`)
      .join(',\n');
    navigator.clipboard.writeText(text)
      .then(() => showNotification('success', "전체 품목 대치 규칙 텍스트가 클립보드에 복사되었습니다."))
      .catch(() => showNotification('error', "클립보드 복사에 실패했습니다."));
  };

  // --- 품목 대치 사전 전용 파일 가져오기 (Import) ---
  const handleImportProductMappingFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    if (fileName.endsWith('.json')) {
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const json = JSON.parse(content);
          const parsed: ProductMapping[] = [];
          if (Array.isArray(json)) {
            json.forEach((item: any) => {
              const raw = item.rawName || item['원본'] || item['원본상품명'] || item['raw'] || '';
              const mapped = item.mappedName || item['대치'] || item['표준상품명'] || item['mapped'] || '';
              if (raw) parsed.push({ rawName: String(raw).trim(), mappedName: String(mapped).trim() });
            });
          }
          if (parsed.length > 0) {
            setMappingImportConfirm({ isOpen: true, parsed });
          } else {
            showNotification('error', "JSON 파일에 유효한 품목 대치 데이터가 없습니다.");
          }
        } catch {
          showNotification('error', "JSON 파일 형식이 올바르지 않습니다.");
        }
      };
      reader.readAsText(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          const parsed: ProductMapping[] = [];
          const seen = new Set<string>();

          rows.forEach((row, idx) => {
            if (!row || row.length === 0) return;
            const col0 = String(row[0] || '').trim();
            const col1 = String(row[1] || '').trim();

            if (idx === 0 && (col0.includes('원본') || col0.includes('raw') || col0.includes('상품명'))) {
              return;
            }

            if (col0 && !seen.has(col0)) {
              seen.add(col0);
              parsed.push({ rawName: col0, mappedName: col1 });
            }
          });

          if (parsed.length > 0) {
            setMappingImportConfirm({ isOpen: true, parsed });
          } else {
            showNotification('error', "엑셀/CSV 파일에서 품목 대치 규칙을 읽지 못했습니다.");
          }
        } catch {
          showNotification('error', "파일을 읽는 중 오류가 발생했습니다.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // txt
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const lines = text.split('\n');
        const parsed: ProductMapping[] = [];
        const seen = new Set<string>();

        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          let raw = '';
          let mapped = '';
          if (trimmed.includes(':')) {
            const parts = trimmed.split(':');
            raw = parts[0].replace(/['",]/g, '').trim();
            mapped = parts.slice(1).join(':').replace(/['",]/g, '').trim();
          } else if (trimmed.includes(',')) {
            const parts = trimmed.split(',');
            raw = parts[0].replace(/['"]/g, '').trim();
            mapped = parts.slice(1).join(',').replace(/['"]/g, '').trim();
          } else if (trimmed.includes('\t')) {
            const parts = trimmed.split('\t');
            raw = parts[0].replace(/['"]/g, '').trim();
            mapped = parts.slice(1).join('\t').replace(/['"]/g, '').trim();
          } else {
            raw = trimmed.replace(/['",]/g, '').trim();
          }
          if (raw && !seen.has(raw)) {
            seen.add(raw);
            parsed.push({ rawName: raw, mappedName: mapped });
          }
        });

        if (parsed.length > 0) {
          setMappingImportConfirm({ isOpen: true, parsed });
        } else {
          showNotification('error', "TXT 파일에서 대치 규칙을 읽지 못했습니다.");
        }
      };
      reader.readAsText(file);
    }

    e.target.value = '';
  };

  const handleApplyMappingImport = (overwrite: boolean) => {
    if (!mappingImportConfirm) return;
    const { parsed } = mappingImportConfirm;

    if (overwrite) {
      setProductMappings(parsed);
      showNotification('success', `총 ${parsed.length}개 품목 대치 규칙으로 전체 교체되었습니다.`);
    } else {
      const merged = [...productMappings];
      let addedCount = 0;
      parsed.forEach(p => {
        if (!merged.some(m => m.rawName === p.rawName)) {
          merged.push(p);
          addedCount++;
        }
      });
      setProductMappings(merged);
      showNotification('success', `신규 ${addedCount}개 품목 대치 규칙이 추가되었습니다.`);
    }

    setMappingImportConfirm(null);
  };

  // --- 전체 설정 & 시각화 데이터 통합 백업 ---
  const handleExportBackup = () => {
    // 백업 파일에는 설정만 담깁니다. 엑셀 주문 데이터와 API 키는 넣지 않습니다.
    const backupData = {
      platforms,
      couriers,
      productMappings,
      version: "1.3",
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json;charset=utf-8;' });
    triggerDownload(blob, `스마트운송장_설정백업_${new Date().toISOString().slice(0, 10)}.json`);
    showNotification('success', `설정 백업 완료: 플랫폼, 택배사, 품목 사전(${productMappings.length}개)이 백업 파일에 저장되었습니다.`);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.platforms || parsed.productMappings || parsed.couriers || parsed.analyticsOrders) {
          openConfirm(
            "통합 데이터 복원",
            "기존의 플랫폼 설정, 택배사 설정, 품목 대치 리스트가 업로드한 파일의 내용으로 복원됩니다. 정말 계속할까요?",
            () => {
              if (parsed.platforms) setPlatforms(parsed.platforms);
              if (parsed.couriers) setCouriers(parsed.couriers);
              if (parsed.productMappings) setProductMappings(parsed.productMappings);
              if (parsed.analyticsOrders && Array.isArray(parsed.analyticsOrders)) {
                setAnalyticsOrders(parsed.analyticsOrders);
              }
              showNotification('success', "백업 파일로부터 플랫폼, 품목 사전 및 시각화 리포트 데이터를 성공적으로 복원했습니다.");
            }
          );
        } else {
          showNotification('error', "잘못된 백업 파일 형식입니다.");
        }
      } catch (err) {
        showNotification('error', "파일을 읽지 못했어요.");
      }
    };
    reader.readAsText(file);
  };

  const handleResetToDefault = () => {
    openConfirm(
      "전체 기본 설정 초기화",
      "주의. 사용자가 임의로 추가하거나 수정한 플랫폼/택배사 설정, 품목 대치 사전 규칙, 시각화 데이터가 모두 영구 삭제되고 초기 설치 상태로 복원됩니다. 정말 초기화할까요?",
      () => {
        setPlatforms(DEFAULT_PLATFORMS);
        setCouriers(DEFAULT_COURIERS);
        setProductMappings(DEFAULT_PRODUCT_MAPPINGS);
        setDefaultRawNames(DEFAULT_PRODUCT_MAPPINGS.map(m => m.rawName));
        setAnalyticsOrders([]);
        showNotification('success', "초기 기본 설정으로 복원되었습니다.");
      }
    );
  };

  // 모달창 ESC 키로 닫기 지원 전역 핸들러
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmModal?.isOpen) {
          setConfirmModal(null);
          return;
        }
        if (passwordPrompt) {
          handleCancelPasswordPrompt();
          return;
        }
        if (mappingImportConfirm) {
          setMappingImportConfirm(null);
          return;
        }
        if (anomalousModalOpen) {
          setAnomalousModalOpen(false);
          return;
        }
        if (previewModal.isOpen) {
          setPreviewModal(prev => ({ ...prev, isOpen: false }));
          return;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [confirmModal, passwordPrompt, mappingImportConfirm, anomalousModalOpen, previewModal]);

  // 화면에 보여 줄 숫자 (기존 결과에서 세기만 합니다)
  const orderCount: number = orderParseResult?.orders?.length || 0;
  const orderFileCount: number = orderParseResult?.parsedFiles?.length || orderFiles.length;
  const matchedCount: number = trackingResult ? trackingResult.matchCount + trackingResult.softMatchCount : 0;
  const trackTotal: number = trackingResult?.outputOrders?.length || orderCount;
  const trackCheckCount: number = trackingResult ? trackingResult.softMatchCount + (trackingResult.unfilledErrors?.length || 0) : 0;
  const newItemCount: number = orderParseResult?.newRawItems?.length || 0;
  const shopCounts: [string, number][] = (() => {
    const rows: any[] = trackingResult?.outputOrders || orderParseResult?.orders || [];
    const m = new Map<string, number>();
    rows.forEach((o) => { const k = o.platformName || '기타'; m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()];
  })();
  const bundledCount: number = trackingResult?.bundledCount ?? (orderParseResult?.orders || []).filter((o: any) => o.isMulti).length;
  const step1Collapsed = trackingFiles.length > 0 && !step1Open;
  const scrollToId = (id: string) => {
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  return (
    <div id="app-root-wrapper" className={`min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col w-full overflow-x-clip ${
      isSidebarOpen ? 'md:pl-56' : 'md:pl-14'
    }`}>
      
      {/* 커스텀 전역 확인 모달 */}
      {confirmModal?.isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in"
          onKeyDown={(e) => {
            // 되돌릴 수 없는 작업만 묻는 창이라 Enter로는 확정하지 않습니다 (포커스가 '취소'에 있습니다)
            if (e.key === 'Escape') {
              setConfirmModal(null);
            }
          }}
          role="alertdialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4 border border-slate-100">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-brand-600 shrink-0" />
              {confirmModal.title}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
              {confirmModal.message}
            </p>
            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => setConfirmModal(null)}
                autoFocus
                className="pressable px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-lg text-sm font-semibold cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="pressable px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 비밀번호 입력 모달 */}
      {/* AI 도우미 (준비 중) */}
      <AiAssistant />

      {isFeedbackOpen && (
        <FeedbackModal
          onClose={() => setIsFeedbackOpen(false)}
          onSent={() => showNotification('success', '보내 주셔서 감사합니다. 확인 후 반영하겠습니다.')}
          onError={(msg) => showNotification('error', msg)}
        />
      )}

      {passwordPrompt && (
        <div 
          id="decrypt-password-modal" 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              handleCancelPasswordPrompt();
            }
          }}
        >
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (!isDecrypting && promptPassword) {
                handleDecryptFile();
              }
            }}
            className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4 border border-slate-100"
          >
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-brand-600 shrink-0" />
              엑셀 비밀번호 입력 필요
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
              선택한 <strong>"{passwordPrompt.file.name}"</strong> 파일은 암호로 보호되어 있습니다. 
              파일을 읽고 가공하기 위해 비밀번호를 입력해주세요.
            </p>
            <div>
              <input
                id="decrypt-password-input"
                type="password"
                placeholder="비밀번호를 입력 후 Enter 누르세요"
                value={promptPassword}
                onChange={(e) => setPromptPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!isDecrypting && promptPassword) {
                      handleDecryptFile();
                    }
                  } else if (e.key === 'Escape') {
                    handleCancelPasswordPrompt();
                  }
                }}
                disabled={isDecrypting}
                autoFocus
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600 transition"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCancelPasswordPrompt}
                disabled={isDecrypting}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                취소 (ESC)
              </button>
              <button
                type="submit"
                disabled={isDecrypting || !promptPassword}
                className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                {isDecrypting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    해제 중...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    암호 해제 및 확인 (Enter)
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 알림 배너 */}
      <AnimatePresence>
        {notification && (
          <motion.div
            id="notification-toast"
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2.5 ${
              notification.type === 'success' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : notification.type === 'error' 
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-brand-50 border-brand-200 text-brand-800'
            }`}
          >
            {notification.type === 'success' ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            <span>{notification.text}</span>
            <button
              onClick={() => setNotification(null)}
              className="ml-2.5 p-1 rounded-lg hover:bg-black/10 transition text-slate-500 hover:text-slate-800 shrink-0 cursor-pointer flex items-center justify-center"
              title="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 휴대폰 상단 바: 메뉴 버튼과 서비스 이름 (넓은 화면에서는 사이드바가 대신합니다) */}
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-2 md:hidden">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="pressable flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
          aria-label="메뉴 열기"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-base font-bold text-brand-600">{APP_NAME}</span>
      </header>

      {/* 휴대폰에서 메뉴가 열려 있을 때 뒤쪽을 어둡게 하고, 누르면 닫습니다 */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 md:hidden" onClick={() => setIsSidebarOpen(false)} aria-hidden="true" />
      )}

      <div className="flex flex-1 min-h-0">
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col gap-1 overflow-y-auto border-r border-slate-200 bg-slate-50 px-3 py-4 transition-[transform,width] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] md:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0 md:w-56' : '-translate-x-full md:w-14 md:px-2'
          }`}
        >
          <button
            onClick={() => setIsSidebarOpen((v) => !v)}
            className="pressable mb-2 flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200/60"
            aria-label={isSidebarOpen ? '메뉴 접기' : '메뉴 펼치기'}
            title={isSidebarOpen ? '메뉴 접기' : '메뉴 펼치기'}
          >
            <Menu className="w-5 h-5" />
          </button>

          {isSidebarOpen && (
            <span className="px-3 pb-5 pt-1 text-lg font-bold text-brand-600">{APP_NAME}</span>
          )}

          {[
            { key: 'process', label: '주문정리', icon: <Layers className="w-5 h-5 shrink-0" />, selected: activeTab === 'process' && !isSettingsOpen, show: true, action: () => setActiveTab('process') },
            { key: 'analytics', label: '리포트', icon: <BarChart3 className="w-5 h-5 shrink-0" />, selected: activeTab === 'analytics' && !isSettingsOpen, show: features.analytics, action: () => setActiveTab('analytics') },
            { key: 'products', label: '품목사전', icon: <ClipboardList className="w-5 h-5 shrink-0" />, selected: activeTab === 'products' && !isSettingsOpen, show: true, action: () => setActiveTab('products') },
            { key: 'platforms', label: '플랫폼 설정', icon: <Grid className="w-5 h-5 shrink-0" />, selected: activeTab === 'platforms' && !isSettingsOpen, show: true, action: () => setActiveTab('platforms') },
            { key: 'settings', label: '설정', icon: <Settings className="w-5 h-5 shrink-0" />, selected: isSettingsOpen, show: true, action: () => openSettings('backup') },
            { key: 'support', label: '문의하기', icon: <MessageSquare className="w-5 h-5 shrink-0" />, selected: false, show: true, action: () => setIsFeedbackOpen(true) },
          ]
            .filter((item) => item.show)
            .map((item) => (
              <React.Fragment key={item.key}>
                {/* 화면을 바꾸는 메뉴와 창을 여는 메뉴 사이 구분선 */}
                {item.key === 'settings' && <div className="my-2 border-t border-slate-200" aria-hidden="true" />}
                <button
                  onClick={() => {
                    item.action();
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                  }}
                  title={item.label}
                  aria-current={item.selected ? 'page' : undefined}
                  className={`pressable flex h-10 items-center gap-3 rounded-lg text-sm font-semibold ${
                    isSidebarOpen ? 'w-full px-3' : 'w-10 justify-center'
                  } ${item.selected ? 'bg-brand-100 text-brand-800' : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'}`}
                >
                  {item.icon}
                  {isSidebarOpen && <span className="whitespace-nowrap">{item.label}</span>}
                </button>
              </React.Fragment>
            ))}

          {/* 하단: 로그인한 계정, 이용 중인 플랜, 로그아웃 */}
          <div className="mt-auto flex flex-col gap-2 border-t border-slate-200 pt-3">
            {isSidebarOpen && (
              <div className="flex flex-col gap-0.5 px-3">
                <span className="text-xs text-slate-500">로그인한 계정</span>
                {account?.email && (
                  <span className="truncate text-sm font-medium text-slate-800" title={account.email}>
                    {account.email}
                  </span>
                )}
                {account && typeof account.uploadLimit === 'number' && (
                  <span className="mt-1 text-xs text-slate-500 tabular-nums">
                    무료 플랜 · 이번 달 {uploadsUsedThisMonth(account)}/{account.uploadLimit}회 사용
                  </span>
                )}
              </div>
            )}
            <button
              onClick={() => openConfirm('로그아웃', '로그아웃 하시겠습니까? 저장되지 않은 작업은 사라집니다.', () => logout())}
              title="로그아웃"
              className={`pressable flex h-10 items-center gap-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-100 ${
                isSidebarOpen ? 'w-full px-3' : 'w-10 justify-center'
              }`}
            >
              <LogOut className="w-5 h-5 shrink-0" />
              {isSidebarOpen && <span className="whitespace-nowrap">로그아웃</span>}
            </button>
          </div>

        </aside>

        {/* 메인 본문 콘텐츠 */}
        <main className="flex-1 min-w-0 max-w-[1440px] w-full mx-auto px-4 py-5 pb-8 sm:px-8 sm:py-6">
        <AnimatePresence mode="wait">
          
          {/* 탭 1: 가공 및 매칭 */}
          {activeTab === 'process' && (
            <motion.div
              key="process-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-6"
            >

              {/* 제목 줄: 주문정리와 처음부터 다시 */}
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">주문정리</h1>
                <span className="sp flex-1" />
                {(orderParseResult || trackingFiles.length > 0) && (
                  <button
                    onClick={() => openConfirm("작업 비우기", "올려 둔 주문 파일, 정리 결과, 송장 파일이 모두 지워져요. 처음부터 다시 할까요?", handleResetProcess)}
                    className="pressable inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    처음부터 다시
                  </button>
                )}
              </div>

              {/* 작업 순서: 지금 어디까지 했는지, 단계마다 파일 수와 확인할 수를 보여 줍니다. 2·4단계는 택배사·쇼핑몰 사이트에서 하는 일 */}
              {(() => {
                const done = [Boolean(orderParseResult), trackingFiles.length > 0, Boolean(trackingResult), false];
                const current = done.findIndex((d) => !d);
                const items = [
                  { title: '주문서 올리기', desc: orderParseResult ? `파일 ${orderFileCount}개 · ${orderCount}건` : '쇼핑몰 주문 엑셀', warn: orderParseResult ? anomalousIssues.length : 0 },
                  { title: '택배사에서 송장 받기', desc: '택배사 사이트에서 해요', warn: 0 },
                  { title: '송장 맞추기', desc: trackingResult ? `송장 ${trackingFiles.length}개 · ${matchedCount}/${trackTotal}` : '송장 엑셀 올리기', warn: trackCheckCount },
                  { title: '쇼핑몰에 올리기', desc: '쇼핑몰 사이트에서 해요', warn: 0 },
                ];
                return (
                  <div>
                  <div className="mb-2 flex items-center gap-2 md:hidden" aria-hidden="true">
                    {items.map((st, i) => (
                      <span key={st.title} className={`h-1.5 flex-1 rounded-full ${done[i] ? 'bg-brand-600' : i === current ? 'bg-slate-900' : 'bg-slate-200'}`} />
                    ))}
                    <span className="ml-1 text-[13px] font-semibold tabular-nums text-slate-600">{Math.min(current + 1, 4)}/4</span>
                  </div>
                  <ol aria-label="작업 순서" className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    {items.map((st, i) => {
                      const isDone = done[i];
                      const isCurrent = i === current;
                      return (
                        <li
                          key={st.title}
                          aria-current={isCurrent ? 'step' : undefined}
                          className={`items-start gap-3 rounded-xl p-3 md:flex md:p-3.5 ${
                            isCurrent ? 'flex bg-white ring-[1.5px] ring-inset ring-brand-600' : 'hidden'
                          }`}
                        >
                          {isDone ? (
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white" aria-label="완료">
                              <Check className="h-4 w-4" />
                            </span>
                          ) : (
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                                isCurrent ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {i + 1}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className={`text-[15px] font-semibold leading-snug ${isDone || isCurrent ? 'text-slate-900' : 'text-slate-600'}`}>{st.title}</p>
                            <p className="text-[13px] text-slate-600">
                              {st.desc}
                              {st.warn > 0 && (
                                <span className="ml-2 inline-flex items-center gap-1 font-semibold text-amber-800">
                                  <AlertCircle className="h-3.5 w-3.5" />확인 {st.warn}
                                </span>
                              )}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  </div>
                );
              })()}

              {/* 비밀번호 보호 해결 가이드 배너 */}
              {passwordErrorFile && (
                <motion.div
                  id="password-error-guide"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-rose-50/80 border border-rose-200 rounded-xl p-5 space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <div className="p-2 bg-rose-100 text-rose-700 rounded-lg shrink-0">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">
                          비밀번호가 걸린 엑셀이에요
                        </h3>
                        <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                          올리신 <strong>{passwordErrorFile === 'order' ? '주문' : '송장'}</strong> 파일을 열려면 비밀번호가 필요해요. 파일을 다시 올리고 비밀번호를 넣으면 바로 열 수 있어요.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setPasswordErrorFile(null)}
                      className="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-1 rounded hover:bg-slate-100"
                    >
                      닫기
                    </button>
                  </div>

                  <details className="group bg-white rounded-lg border border-rose-100 p-4">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-slate-700 flex items-center justify-between">
                      비밀번호를 직접 풀고 싶다면
                      <span aria-hidden="true" className="text-slate-400 transition-transform duration-200 group-open:rotate-45">+</span>
                    </summary>
                    <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                      주문 파일은 서버로 보내지 않고 이 브라우저 안에서만 열어요. 아래 방법 중 하나로 비밀번호를 지운 뒤 다시 올려도 돼요.
                    </p>
                    {/* 가이드 단계 */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-150 space-y-1.5">
                        <div className="text-xs font-bold text-brand-600">엑셀에서 풀기</div>
                        <ol className="text-xs text-slate-500 list-decimal list-inside space-y-1">
                          <li>암호가 걸린 파일을 엑셀로 엽니다.</li>
                          <li>상단 메뉴 <strong className="text-slate-700">파일 &gt; 정보</strong>를 누릅니다.</li>
                          <li><strong className="text-slate-700">통합 문서 보호 &gt; 암호 설정</strong>을 클릭합니다.</li>
                          <li>기존 입력된 비밀번호를 <strong className="text-slate-700">모두 지우고 빈칸</strong>으로 만든 뒤 확인을 누릅니다.</li>
                          <li>파일을 <strong className="text-slate-700">저장(Ctrl + S)</strong>한 후 다시 업로드합니다.</li>
                        </ol>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-150 space-y-1.5">
                        <div className="text-xs font-bold text-brand-600">구글 시트에서 풀기</div>
                        <ol className="text-xs text-slate-500 list-decimal list-inside space-y-1">
                          <li>구글 드라이브에 파일을 올리고 구글 스프레드시트로 엽니다.</li>
                          <li><strong className="text-slate-700">파일 &gt; 다운로드 &gt; Microsoft Excel(.xlsx)</strong>을 누릅니다.</li>
                          <li>새로 다운로드된 파일은 암호가 풀린 상태가 됩니다. 해당 파일을 업로드하세요.</li>
                        </ol>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-150 space-y-1.5">
                        <div className="text-xs font-bold text-brand-600">다른 이름으로 저장하며 풀기</div>
                        <ol className="text-xs text-slate-500 list-decimal list-inside space-y-1">
                          <li>암호가 걸린 파일을 엑셀로 엽니다.</li>
                          <li><strong className="text-slate-700">다른 이름으로 저장</strong>을 선택합니다.</li>
                          <li>저장 창의 하단 <strong className="text-slate-700">도구 &gt; 일반 옵션</strong>을 클릭합니다.</li>
                          <li>열기/쓰기 암호를 지운 뒤 저장하여 새로 파일을 생성하고 업로드합니다.</li>
                        </ol>
                      </div>
                    </div>
                  </details>
                </motion.div>
              )}

              {/* 작업 패널: 왼쪽은 단계 카드, 1400px 이상에서는 오른쪽에 확인할 일 */}
              {(() => {
                const todoBox = (() => {
                const todos: { key: string; tone: 'rose' | 'amber' | 'slate'; text: string; actions: { label: string; onClick: () => void }[] }[] = [];
                if (orderParseResult && anomalousIssues.length > 0) {
                  todos.push({ key: 'anomalous', tone: 'rose', text: `받는 사람·전화번호·주소를 확인할 주문 ${anomalousIssues.length}건`, actions: [{ label: '주문 확인하기', onClick: () => setAnomalousModalOpen(true) }] });
                }
                if (newItemCount > 0) {
                  todos.push({ key: 'new-items', tone: 'amber', text: `품목사전에 없는 새 품목 ${newItemCount}건`, actions: [
                    { label: '추천 이름으로 채우기', onClick: () => { handleApplyAllRecommendations(); setStep1Open(true); scrollToId('new-items-panel'); } },
                    { label: '하나씩 보기', onClick: () => { setStep1Open(true); scrollToId('new-items-panel'); } },
                  ] });
                }
                if (orderParseResult && stepValidationResult) {
                  todos.push({ key: 'quality', tone: 'slate', text: '엑셀 품질 검사 결과', actions: [{ label: '품질 검사 보기', onClick: () => { setStep1Open(true); scrollToId('quality-1'); } }] });
                }
                if (trackingResult && trackCheckCount > 0) {
                  todos.push({ key: 'tracking', tone: 'amber', text: `송장을 한 번 더 볼 주문 ${trackCheckCount}건`, actions: [{ label: '결과 보고서 보기', onClick: () => scrollToId('waybill-report') }] });
                }
                const toneDot = { rose: 'bg-rose-600', amber: 'bg-amber-500', slate: 'bg-slate-400' } as const;
                const list = (compact: boolean) => todos.length === 0 ? (
                  <p className="text-sm text-slate-600">{orderParseResult ? '지금은 확인할 일이 없어요.' : '주문서를 올리면 확인할 일이 여기에 모여요.'}</p>
                ) : (
                  <ul className={compact ? 'flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-5' : 'flex flex-col divide-y divide-slate-100'}>
                    {todos.map((t) => (
                      <li key={t.key} className={compact ? 'flex flex-wrap items-center gap-x-2 gap-y-1' : 'py-3 first:pt-0 last:pb-0'}>
                        <span className="flex items-start gap-2 text-sm text-slate-800">
                          <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${toneDot[t.tone]}`} aria-hidden="true" />
                          {t.text}
                        </span>
                        <span className={`flex flex-wrap gap-1.5 ${compact ? '' : 'mt-2 pl-4'}`}>
                          {t.actions.map((a) => (
                            <button
                              key={a.label}
                              onClick={a.onClick}
                              className="pressable inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                            >
                              {a.label}
                            </button>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                );
                return { todos, list };
              })();
                return (
              <div className="grid items-start gap-6 min-[1400px]:grid-cols-[minmax(0,1fr)_300px]">
              <div className="flex min-w-0 flex-col gap-6">

                {/* 1400px 아래: 확인할 일을 한 줄로 */}
                {todoBox.todos.length > 0 && (
                  <section aria-label="확인할 일" className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 min-[1400px]:hidden">
                    {todoBox.list(true)}
                  </section>
                )}

                {/* 쇼핑몰 API 자동 연동 수집 센터 모듈 */}
                {features.apiSync && (
                  <div className={step1Collapsed ? 'max-md:order-4' : ''}>
                  <SmartApiConnector
                    onOrdersSynced={handleOrdersApiSynced}
                    showNotification={showNotification}
                    configs={apiConfigs}
                    setConfigs={setApiConfigs}
                  />
                  </div>
                )}
                
                {/* 1단계 카드: 주문 데이터 가공. 송장을 올린 뒤에는 한 줄로 접고, 펼치면 그대로 다 보입니다 */}
                <div className={`bg-white rounded-xl p-5 space-y-4 ${step1Collapsed ? 'max-md:order-2' : ''} ${orderParseResult && trackingFiles.length === 0 ? 'ring-[1.5px] ring-inset ring-brand-600' : 'border border-slate-200'}`}>
                  <div className={`flex flex-wrap items-center justify-between gap-2 ${step1Collapsed ? '' : 'border-b border-slate-100 pb-3'}`}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      {orderParseResult ? (
                        <span className="w-6 h-6 shrink-0 rounded-full bg-brand-600 text-white flex items-center justify-center" aria-label="1단계 완료"><Check className="w-3.5 h-3.5" /></span>
                      ) : (
                        <span className="w-6 h-6 shrink-0 rounded-full bg-slate-900 text-white text-xs font-semibold tabular-nums flex items-center justify-center">1</span>
                      )}
                      <h2 className="font-semibold text-slate-900 text-base">
                        {orderParseResult && trackingFiles.length === 0 ? '지금 할 일: 정리된 파일을 받아 택배사 사이트에 올리기' : '주문서 올리기'}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      {orderParseResult && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[13px] font-semibold text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          파일 {orderFileCount}개 · {orderCount}건 정리됨
                        </span>
                      )}
                      {trackingFiles.length > 0 && (
                        <button
                          onClick={() => setStep1Open(!step1Open)}
                          aria-expanded={!step1Collapsed}
                          className="pressable inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          {step1Collapsed ? '펼치기' : '접기'}
                          <ChevronDown className={`h-4 w-4 transition-transform ${step1Collapsed ? '' : 'rotate-180'}`} />
                        </button>
                      )}
                    </div>
                  </div>

                  {!step1Collapsed && (<>
                  <p className="text-sm text-slate-600 leading-relaxed max-w-[68ch]">
                    쇼핑몰에서 내려받은 주문 엑셀을 올려 주세요. 어느 쇼핑몰 파일인지 알아서 구분하고, 같은 사람에게 갈 주문은 위쪽에 모아 택배사에 넣을 파일로 정리해요.
                  </p>

                  {/* 드롭존 영역 */}
                  <div 
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={async (e) => {
                      e.preventDefault();
                      const droppedFiles = Array.from(e.dataTransfer.files as FileList).filter((f: File) => f.name.match(/\.xlsx?$/i));
                      if (droppedFiles.length === 0) return;
                      if (!(await checkUploadAllowed(droppedFiles.length))) return;
                      const existingNames = new Set(orderFiles.map((f: File) => f.name));
                      const uniqueNewFiles = droppedFiles.filter((f: File) => !existingNames.has(f.name));

                      if (uniqueNewFiles.length === 0) {
                        showNotification('info', '이미 업로드 목록에 포함된 엑셀 파일입니다.');
                        return;
                      }

                      const updatedFiles = [...orderFiles, ...uniqueNewFiles];
                      setOrderFiles(updatedFiles);
                      setNewItemsMappingForm({});
                      setPasswordErrorFile(null);
                      await processMultipleOrderFiles(updatedFiles);
                    }}
                    className={`relative border-2 border-dashed border-slate-200 hover:border-brand-600 rounded-xl bg-slate-50 text-center transition cursor-pointer ${orderFiles.length > 0 ? 'p-3' : 'p-6'}`}
                  >
                    <input
                      type="file"
                      multiple
                      accept=".xlsx, .xls"
                      onChange={handleOrderFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    {orderFiles.length === 0 && <Upload className="w-8 h-8 text-brand-600 mx-auto mb-2" />}
                    {orderFiles.length > 0 ? (
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-800">
                          주문 파일 {orderFiles.length}개를 올렸어요
                        </div>
                        <div className="text-xs text-brand-600 font-medium">
                          더 올리려면 눌러서 고르거나 끌어다 놓으세요
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-sm font-semibold text-slate-800">주문 엑셀을 끌어다 놓거나 눌러서 고르세요</div>
                        <div className="text-xs text-slate-500 mt-1">여러 파일을 한 번에 올려도 돼요 (.xlsx, .xls)</div>
                      </div>
                    )}
                  </div>

                  {/* 업로드/수집된 데이터 리스트 (엑셀 업로드 파일 + 쇼핑몰 API 자동수집건) */}
                  {((orderParseResult?.parsedFiles && orderParseResult.parsedFiles.length > 0) || orderFiles.length > 0) && (
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                        <div className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                          <span>불러온 수집 데이터 세트 (총 {orderParseResult?.parsedFiles?.length || orderFiles.length}개):</span>
                        </div>
                        <button
                          onClick={() => {
                            setPlatformMatrixType('platform');
                            setActiveTab('platforms');
                          }}
                          className="text-xs bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold px-2.5 py-1 rounded-lg border border-brand-200 transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                        >
                          <Grid className="w-3.5 h-3.5 text-brand-600" />
                          <span> 플랫폼 설정에서 감지된 열 매핑 한눈에 보기 →</span>
                        </button>
                      </div>
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {(orderParseResult?.parsedFiles || []).map((pf: any, idx: number) => {
                          const isApiSynced = pf.platformId === 'api_auto' || pf.fileName.includes('API_실시간수집');
                          const detectedPlat = pf.detectedPlatform;
                          const fileObj = orderFiles.find(f => f.name === pf.fileName);
                          
                          return (
                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {isApiSynced ? (
                                  <RefreshCw className="w-4 h-4 text-emerald-500 shrink-0" />
                                ) : (
                                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-slate-700 truncate flex items-center gap-1.5" title={pf.fileName}>
                                    <span>{pf.fileName}</span>
                                    {isApiSynced && (
                                      <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                                        API 연동 자동수집건
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                                    {fileObj && <span>{(fileObj.size / 1024).toFixed(1)} KB</span>}
                                    <span className="text-slate-600 font-medium">수집 주문: {pf.orders?.length || 0}건</span>
                                    {detectedPlat && !isApiSynced && (
                                      <span className="text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded font-medium">
                                        감지됨: {detectedPlat.name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {!isApiSynced && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-slate-400 shrink-0">양식 보정:</span>
                                    <select
                                      value={detectedPlat?.id || ""}
                                      onChange={(e) => handleFilePlatformChange(pf.fileName, e.target.value)}
                                      className="text-xs border border-slate-200 hover:border-slate-300 rounded px-1.5 py-0.5 bg-white font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-600"
                                    >
                                      <option value="" disabled>-- 플랫폼 선택 --</option>
                                      {platforms.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                <button
                                  onClick={() => openConfirm("수집 데이터 삭제", `"${pf.fileName}" 수집 데이터(총 ${pf.orders?.length || 0}건)를 목록에서 삭제하시겠습니까?`, () => handleRemoveParsedFile(pf.fileName))}
                                  className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition shrink-0 ml-1 cursor-pointer"
                                  title="데이터 삭제"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 가공 완료 후 다운로드 버튼 및 신규 품목 스마트 매핑 */}
                  {orderParseResult && (
                    <div className="space-y-4">

                      {/* 2번 요구사항: 이상 주문 데이터 자동 검증 (오류 선별 알림 패널) */}
                      {anomalousIssues.length > 0 && (
                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span className="p-2 bg-rose-100 text-rose-600 rounded-lg shrink-0 mt-0.5">
                              <AlertCircle className="w-5 h-5" />
                            </span>
                            <div>
                              <div className="text-xs font-bold text-rose-800 flex items-center gap-2">
                                확인이 필요한 주문 {anomalousIssues.length}건
                              </div>
                              <p className="text-xs text-rose-700/90 mt-1 leading-relaxed">
                                받는 사람 이름이 비었거나, 전화번호가 10자리보다 짧거나, 주소가 불완전한 주문이에요. 송장을 뽑기 전에 확인하세요.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setAnomalousModalOpen(true)}
                            className="pressable min-h-[40px] px-3.5 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg text-sm font-semibold shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                            주문 확인하기
                          </button>
                        </div>
                      )}

                      {/* 4번 요구사항: 미매칭 품목 자동 정제 규칙 추천 (투명도 있는 placeholder + 가이드 추천) */}
                      {orderParseResult.newRawItems && orderParseResult.newRawItems.length > 0 && (
                        <div id="new-items-panel" className="scroll-mt-6 bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 pb-2.5">
                            <div className="flex items-center gap-2">
                                                            <div>
                                <h3 className="font-bold text-slate-800 text-xs">새로 발견된 미지정 품목 ({orderParseResult.newRawItems.length}건)</h3>
                                <p className="text-sm text-slate-600 leading-relaxed max-w-[68ch]">
                                  상품명에서 광고 문구와 안내 문구를 뺀 이름을 추천해 두었어요. 추천 버튼을 누르거나 직접 고쳐 쓰세요.
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={handleApplyAllRecommendations}
                              className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded text-xs font-bold transition shrink-0 flex items-center gap-1 cursor-pointer"
                            >
                              추천 이름으로 모두 채우기
                            </button>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5 max-h-52 overflow-y-auto pr-1">
                            {orderParseResult.newRawItems.map((item: string, idx: number) => {
                              const rec = extractCleanProductRecommendation(item);
                              return (
                                <div key={`${item}-${idx}`} className="bg-white p-3 rounded-lg border border-amber-200/80 space-y-2">
                                  <div className="text-xs font-semibold text-slate-700 truncate flex items-center gap-1.5" title={item}>
                                    <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono shrink-0">원본</span>
                                    <span className="truncate">{item}</span>
                                  </div>
                                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                    <input
                                      type="text"
                                      placeholder={`추천: "${rec}" (클릭 시 수동 수정 가능)`}
                                      value={newItemsMappingForm[item] || ""}
                                      onChange={(e) => {
                                        setNewItemsMappingForm({
                                          ...newItemsMappingForm,
                                          [item]: e.target.value
                                        });
                                      }}
                                      className="text-xs border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 flex-1 placeholder:text-slate-400/80 placeholder:italic placeholder:font-normal font-medium text-slate-800"
                                    />
                                    {rec && (
                                      <button
                                        onClick={() => setNewItemsMappingForm({ ...newItemsMappingForm, [item]: rec })}
                                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-xs font-semibold transition shrink-0 flex items-center justify-center gap-1 cursor-pointer"
                                        title="추천 이름 넣기"
                                      >
                                        추천 적용: <span className="font-bold underline underline-offset-2">{rec}</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex justify-end pt-1">
                            <button
                              onClick={handleAddNewItemMappings}
                              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                            >
                              품목사전에 저장하고 지금 주문에 반영
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 space-y-3">
                        <div className="text-slate-900 font-bold text-sm mb-1">정리된 파일 받기</div>
                        <div className="space-y-2">
                          <button
                            onClick={handlePreviewStep1Excel}
                            className="pressable w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg text-sm font-semibold cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                            정리된 파일 미리 보기
                          </button>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              onClick={handleDownloadSummaryReport}
                              className="pressable flex items-center justify-center gap-2 px-3 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg text-sm font-semibold"
                            >
                              <Download className="w-4 h-4" />
                              요약 보고서 받기
                            </button>
                            <button
                              onClick={handleDownloadProductSorted}
                              className="pressable flex items-center justify-center gap-2 px-3 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg text-sm font-semibold"
                            >
                              <Download className="w-4 h-4" />
                              품목별 정렬 파일 받기
                            </button>
                          </div>
                          <button
                            onClick={handleDownloadAllProcessed}
                            className="pressable w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold"
                          >
                            <Download className="w-4 h-4" />
                            두 파일 한 번에 받기
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {isProcessingOrders && (
                    <div className="flex items-center justify-center gap-2 text-xs text-brand-600 py-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      주문 엑셀을 정리하고 있어요…
                    </div>
                  )}

                  {/* 1단계 엑셀 품질 검사 대시보드 */}
                  {orderParseResult && stepValidationResult && (
                    <div id="quality-1" className="pt-2 scroll-mt-6">
                      <ExcelValidationDashboard
                        validationResult={stepValidationResult}
                        stepFilter={1}
                        totalOrderCount={orderParseResult.orders.length}
                        secondaryOptionColsInfo={activeSecondaryOptionColsInfo}
                        onUpdateMapping={handleUpdateSingleMapping}
                        onAddMultipleMappings={handleUpdateMultipleMappings}
                      />
                    </div>
                  )}
                  </>)}
                </div>

                {/* 2단계 카드: 운송장 매칭 (1단계와 동일하게 다중 파일 & 자동 감지 지원) */}
                <div className={`bg-white rounded-xl p-5 space-y-4 ${step1Collapsed ? 'max-md:order-1' : ''} ${orderParseResult && trackingFiles.length > 0 ? 'ring-[1.5px] ring-inset ring-brand-600' : 'border border-slate-200'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={`w-6 h-6 shrink-0 rounded-full text-white text-xs font-semibold tabular-nums flex items-center justify-center ${trackingResult ? 'bg-brand-600' : 'bg-slate-900'}`}>3</span>
                      <h2 className="font-semibold text-slate-900 text-base">
                        {trackingResult ? '지금 할 일: 결과를 확인하고 쇼핑몰 파일 받기' : '송장 맞추기'}
                      </h2>
                    </div>
                  </div>

                  <p className={`text-sm text-slate-600 leading-relaxed max-w-[68ch] ${trackingResult ? 'hidden' : ''}`}>
                    택배사 사이트에서 받은 송장 엑셀을 올려 주세요. 받는 사람, 상품, 수량, 우편번호를 맞춰 보고 주문마다 송장 번호를 붙여요.
                  </p>

                  {/* 드롭존 영역 (다중 파일 drag & drop 및 즉시 자동 분석 지원) */}
                  <div 
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={async (e) => {
                      e.preventDefault();
                      const droppedFiles = Array.from(e.dataTransfer.files as FileList).filter((f: File) => f.name.match(/\.xlsx?$/i));
                      if (droppedFiles.length === 0) return;
                      if (!(await checkUploadAllowed(droppedFiles.length))) return;

                      const existingNames = new Set(trackingFiles.map((f: File) => f.name));
                      const uniqueNewFiles = droppedFiles.filter((f: File) => !existingNames.has(f.name));

                      if (uniqueNewFiles.length === 0) {
                        showNotification('info', '이미 올린 송장 엑셀이에요.');
                        return;
                      }

                      const updatedFiles = [...trackingFiles, ...uniqueNewFiles];
                      setTrackingFiles(updatedFiles);
                      await processMultipleTrackingFiles(updatedFiles);
                    }}
                    className={`relative border-2 border-dashed border-slate-200 hover:border-brand-600 rounded-xl bg-slate-50 text-center transition cursor-pointer ${trackingFiles.length > 0 ? 'p-3' : 'p-6'}`}
                  >
                    <input
                      type="file"
                      multiple
                      accept=".xlsx, .xls"
                      onChange={handleSourceFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    {trackingFiles.length === 0 && <Upload className="w-8 h-8 mx-auto mb-2 text-brand-600" />}
                    <div>
                      <div className="text-sm font-semibold text-slate-800">
                        {trackingFiles.length > 0 ? "송장 엑셀 더 올리기" : "송장 엑셀을 끌어다 놓거나 눌러서 고르세요"}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        어느 택배사 파일인지 알아서 구분해요
                        {!orderParseResult && ". 주문서를 먼저 올리면 바로 맞춰 드려요"}
                      </div>
                    </div>
                  </div>

                  {/* 불러온 운송장 소스 데이터 세트 리스트 카드 (1단계와 100% 동일한 형태 및 편의 기능) */}
                  {parsedTrackingFiles.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-brand-600" />
                          <span className="text-xs font-bold text-slate-800">
                            불러온 운송장 소스 데이터 세트 (총 {parsedTrackingFiles.length}개)
                          </span>
                          <span className="text-xs text-slate-400 font-medium">
                            (총 {parsedTrackingFiles.reduce((acc, curr) => acc + curr.count, 0)}건 운송장 데이터)
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setPlatformMatrixType('courier');
                            setActiveTab('platforms');
                          }}
                          className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold px-2.5 py-1 rounded-lg border border-amber-200 transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                        >
                          <Grid className="w-3.5 h-3.5 text-amber-600" />
                          <span> 택배사 설정에서 감지된 열 매핑 한눈에 보기 →</span>
                        </button>
                      </div>

                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {parsedTrackingFiles.map((ptf, idx) => {
                          const currentCourier = ptf.detectedCourier || "한진택배";
                          return (
                            <div
                              key={`${ptf.fileName}-${idx}`}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white rounded-lg border border-slate-200/80 text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileSpreadsheet className="w-4 h-4 text-brand-600 shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-800 truncate" title={ptf.fileName}>
                                    {ptf.fileName}
                                  </div>
                                  <div className="text-xs text-slate-400 flex items-center gap-2">
                                    <span>{ptf.file ? (ptf.file.size / 1024).toFixed(1) + " KB" : "캐시된 데이터"}</span>
                                    <span>·</span>
                                    <span className="text-brand-600 font-bold">{ptf.count}건 운송장</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-slate-400 shrink-0">택배사 보정:</span>
                                  <select
                                    value={currentCourier}
                                    onChange={(e) => handleTrackingFileCourierChange(ptf.fileName, e.target.value)}
                                    className="text-xs border border-slate-200 hover:border-slate-300 rounded px-1.5 py-0.5 bg-white font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-600"
                                  >
                                    <option value="한진택배">한진택배</option>
                                    <option value="CJ대한통운">CJ대한통운</option>
                                    <option value="롯데택배">롯데택배</option>
                                    <option value="로젠택배">로젠택배</option>
                                    <option value="우체국택배">우체국택배</option>
                                    <option value="경동화물">경동화물</option>
                                    <option value="대신화물">대신화물</option>
                                  </select>
                                </div>

                                <button
                                  onClick={() => openConfirm("운송장 데이터 삭제", `"${ptf.fileName}" 운송장 데이터를 삭제하시겠습니까?`, () => handleRemoveParsedTrackingFile(ptf.fileName))}
                                  className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition shrink-0 ml-1 cursor-pointer"
                                  title="데이터 삭제"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 결과: 맞춘 수, 세부 칩, 결과 시트 처음 8줄, 받기 */}
                  {trackingFiles.length > 0 && orderParseResult && trackingResult && (() => {
                    const rows: any[] = trackingResult.outputOrders || [];
                    const shops = [...new Set(rows.map((o: any) => o.platformName || '기타'))];
                    const activeShop = sheetShop && shops.includes(sheetShop) ? sheetShop : shops[0];
                    const shopRows = rows.filter((o: any) => (o.platformName || '기타') === activeShop);
                    const label: Record<string, string> = { exact: '완전 일치', soft: '비슷한 주문', bundled: '합포장', unmatched: '송장 없음' };
                    return (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                          <p className="font-mono text-4xl font-medium tabular-nums tracking-tight text-slate-900">
                            {matchedCount}<span className="text-slate-400"> / {trackTotal}</span>
                          </p>
                          <ul className="flex flex-wrap gap-2 pb-1 text-[13px] font-semibold">
                            <li className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" />완전 일치 {trackingResult.matchCount}</li>
                            {trackingResult.softMatchCount > 0 && (
                              <li className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-900"><AlertCircle className="h-3.5 w-3.5" />비슷한 주문 {trackingResult.softMatchCount}</li>
                            )}
                            {(trackingResult.unfilledErrors?.length || 0) > 0 && (
                              <li className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-rose-800"><AlertCircle className="h-3.5 w-3.5" />송장 없음 {trackingResult.unfilledErrors.length}</li>
                            )}
                          </ul>
                        </div>

                        {rows.length > 0 && (
                          <div className="overflow-hidden rounded-lg border border-slate-200">
                            {shops.length > 1 && (
                              <div role="tablist" aria-label="쇼핑몰" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2 pt-2">
                                {shops.map((sh) => (
                                  <button
                                    key={sh}
                                    role="tab"
                                    aria-selected={sh === activeShop}
                                    onClick={() => setSheetShop(sh)}
                                    className={`-mb-px min-h-[40px] shrink-0 rounded-t-md border px-3 text-[13px] font-semibold cursor-pointer ${sh === activeShop ? 'border-slate-200 border-b-white bg-white text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
                                  >
                                    {sh} <span className="font-mono tabular-nums text-slate-500">{rows.filter((o: any) => (o.platformName || '기타') === sh).length}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[560px] text-left text-[13px]">
                                <thead className="bg-slate-50 text-slate-600">
                                  <tr>
                                    <th className="px-3 py-2 font-semibold">받는 사람</th>
                                    <th className="px-3 py-2 font-semibold">상품</th>
                                    <th className="px-3 py-2 text-right font-semibold">수량</th>
                                    <th className="px-3 py-2 font-semibold">송장 번호</th>
                                    <th className="px-3 py-2 font-semibold">맞춘 방법</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {shopRows.slice(0, 8).map((o: any, i: number) => {
                                    const odd = o.matchType === 'soft' || o.matchType === 'unmatched' || !o.trackingNumber;
                                    return (
                                      <tr key={o.id ?? i} className={`border-t border-slate-100 ${odd ? 'bg-amber-50' : ''}`}>
                                        <td className="px-3 py-2 text-slate-900">{o.수령인}</td>
                                        <td className="max-w-[260px] truncate px-3 py-2 text-slate-700" title={o.상품명}>{o.상품명}</td>
                                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">{o.수량}</td>
                                        <td className="px-3 py-2 font-mono tabular-nums text-slate-800">{o.trackingNumber || '—'}</td>
                                        <td className={`px-3 py-2 font-semibold ${odd ? 'text-amber-900' : 'text-slate-600'}`}>
                                          {odd && <AlertCircle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />}
                                          {label[o.matchType] || (o.trackingNumber ? '맞춤' : '송장 없음')}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            {shopRows.length > 8 && (
                              <button
                                onClick={handlePreviewStep2Excel}
                                className="w-full border-t border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                              >
                                {shopRows.length - 8}줄 더 있어요 · 미리 보기에서 전체 보기
                              </button>
                            )}
                          </div>
                        )}

                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <button
                            onClick={handleDownloadFinalTracking}
                            className="pressable inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 cursor-pointer"
                          >
                            <Download className="h-4 w-4" />
                            쇼핑몰 파일 모두 받기
                          </button>
                          <button
                            onClick={handlePreviewStep2Excel}
                            className="pressable inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                          >
                            <Eye className="h-4 w-4" />
                            미리 보기
                          </button>
                          <button
                            onClick={() => scrollToId('waybill-report')}
                            className="inline-flex min-h-[44px] items-center justify-center px-2 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline cursor-pointer"
                          >
                            결과 보고서
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {isProcessingTracking && (
                    <div className="flex items-center justify-center gap-2 text-xs text-brand-600 py-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      송장을 주문에 맞춰 보고 있어요…
                    </div>
                  )}

                  {/* 2단계 엑셀 품질 검사 대시보드 */}
                  {trackingResult && stepValidationResult && (
                    <div className="pt-2">
                      <ExcelValidationDashboard
                        validationResult={stepValidationResult}
                        stepFilter={2}
                        totalOrderCount={orderParseResult?.orders?.length || 0}
                      />
                    </div>
                  )}
                </div>

              {/* 운송장 결과 보고서 대시보드 */}
              {trackingResult && (
                <section id="waybill-report" className="scroll-mt-6 space-y-4 max-md:order-3">
                  <h2 className="text-lg font-semibold text-slate-900">결과 보고서</h2>

                  <WaybillReportDashboard
                    matchCount={trackingResult.matchCount}
                    softMatchCount={trackingResult.softMatchCount}
                    bundledCount={trackingResult.bundledCount}
                    bundledGroupCount={trackingResult.bundledGroupCount}
                    unfilledErrors={trackingResult.unfilledErrors}
                    unusedErrors={trackingResult.unusedErrors}
                    totalInputRows={orderParseResult ? orderParseResult.orders.length : 0}
                    outputOrders={trackingResult.outputOrders}
                  />

                </section>
              )}
              </div>

              {/* 1400px 이상: 오른쪽 확인할 일 */}
              <aside aria-label="확인할 일" className="hidden min-[1400px]:block sticky top-6 rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-slate-900">
                  확인할 일
                  {todoBox.todos.length > 0 && (
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">{todoBox.todos.length}</span>
                  )}
                </h2>
                {todoBox.list(false)}
              </aside>
              </div>
                );
              })()}

            </motion.div>
          )}

          {/* 설정 창 (팝업): 가운데에 하나의 창으로 열립니다 */}
          {isSettingsOpen && (
            <div
              className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4"
              onClick={() => setIsSettingsOpen(false)}
            >
              <motion.div
                key="settings-modal"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="flex h-[min(680px,88vh)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <h2 className="text-base font-bold text-slate-900">설정</h2>
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-1 text-slate-500 hover:text-slate-800"
                    aria-label="닫기"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                  <aside className="shrink-0 border-b border-slate-200 p-3 md:w-44 md:border-b-0 md:border-r">
                    <div className="space-y-1">
                  {([
                    ['backup', '설정 백업'],
                    ['account', '계정'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setSettingsSection(key)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                        settingsSection === key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                  </aside>

                  <section className="min-w-0 flex-1 overflow-y-auto bg-slate-50 p-5">
            {settingsSection === 'backup' && (
              <motion.div
                key="backup-tab"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                className="max-w-3xl mx-auto"
              >
                <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
                
                  {/* 헤더 타이틀 */}
                  <div className="border-b border-slate-100 pb-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                          <Database className="w-6 h-6 text-brand-600" />
                          통합 백업 & 복원 (데이터 전체 관리)
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          쇼핑몰 플랫폼 설정, 택배사 설정, 품목 대치 사전({productMappings.length}개 규칙)을 파일로 백업하거나 복원합니다.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold shrink-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        실시간 자동 백업 동기화 중
                      </div>
                    </div>

                    <div className="mt-3 p-3 bg-brand-50/60 border border-brand-100 rounded-xl text-xs text-[#0F3A2F] leading-relaxed">
                      <strong>설정은 자동으로 저장됩니다:</strong> 플랫폼 양식, 택배사 양식, 품목 대치 사전, 쇼핑몰 연동 설정은 로그인한 계정에 저장되어 다음에 접속해도 그대로 있습니다. <strong>엑셀 주문 데이터는 저장되지 않으며</strong>, 새로고침하면 사라집니다. API 키는 암호화되어 저장되고, 다른 컴퓨터에서는 다시 입력해야 합니다.
                    </div>
                  </div>

                  {/* 메인 2분할: 가져오기 (Import) vs 내보내기 (Export) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-0 md:divide-x md:divide-slate-200">
                  
                    {/* 1. 파일 가져오기 (복원/업로드) */}
                    <div className="p-0 md:px-8 first:md:pl-0 last:md:pr-0 flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <span className="inline-block text-xs font-bold text-brand-600 bg-brand-50 border border-brand-100 px-2.5 py-0.5 rounded-md">
                          RESTORE & IMPORT
                        </span>
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                          <Upload className="w-4 h-4 text-brand-600" />
                          백업 / 사전 파일 가져오기
                        </h3>
                        <p className="text-sm text-slate-600 leading-relaxed max-w-[68ch]">
                          통합 백업 파일(<code>.json</code>) 또는 품목 사전(<code>.xlsx</code>, <code>.csv</code>, <code>.txt</code>)을 업로드하면 자동으로 형식을 감지해 복원합니다.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="relative">
                          <input
                            type="file"
                            accept=".json, .xlsx, .xls, .csv, .txt"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.name.toLowerCase().endsWith('.json')) {
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                  try {
                                    const json = JSON.parse(ev.target?.result as string);
                                    if (json.platforms || json.productMappings || json.analyticsOrders) {
                                      openConfirm(
                                        "통합 데이터 복원",
                                        "기존의 플랫폼 설정과 품목 대치 사전이 업로드한 백업 내용으로 복원됩니다. 진행할까요?",
                                        () => {
                                          if (json.platforms) setPlatforms(json.platforms);
                                          if (json.productMappings) setProductMappings(json.productMappings);
                                          if (json.couriers) setCouriers(json.couriers);
                                          if (json.analyticsOrders && Array.isArray(json.analyticsOrders)) {
                                            setAnalyticsOrders(json.analyticsOrders);
                                          }
                                          showNotification('success', "플랫폼, 품목 사전 및 시각화 데이터가 완벽 복원되었습니다.");
                                        }
                                      );
                                    } else if (Array.isArray(json)) {
                                      handleImportProductMappingFile(e);
                                    }
                                  } catch {
                                    showNotification('error', "JSON 파일 형식이 올바르지 않습니다.");
                                  }
                                };
                                reader.readAsText(file);
                              } else {
                                handleImportProductMappingFile(e);
                              }
                              e.target.value = '';
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                          <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold transition shadow-sm cursor-pointer">
                            <Upload className="w-4 h-4" />
                            파일 선택하여 복원하기
                          </button>
                        </div>
                        <p className="text-xs text-center text-slate-400">지원: .json (전체), .xlsx / .csv / .txt (품목사전)</p>
                      </div>
                    </div>

                    {/* 2. 파일 내보내기 (백업/다운로드) */}
                    <div className="p-0 md:px-8 first:md:pl-0 last:md:pr-0 flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <span className="inline-block text-xs font-bold text-slate-600 bg-slate-200/70 px-2.5 py-0.5 rounded-md">
                          BACKUP & EXPORT
                        </span>
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                          <Download className="w-4 h-4 text-slate-700" />
                          백업 / 사전 파일 내보내기
                        </h3>
                        <p className="text-sm text-slate-600 leading-relaxed max-w-[68ch]">
                          현재 설정된 <strong>플랫폼 양식, 택배사 양식, 품목 정제 사전</strong>을 백업 파일(.json)로 저장합니다. 주문 데이터는 포함되지 않습니다.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <button
                          onClick={handleExportBackup}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition shadow-xs cursor-pointer"
                        >
                          <Database className="w-3.5 h-3.5" />
                          전체 설정 통합 백업 (.json)
                        </button>

                        <div className="grid grid-cols-2 gap-2 pt-0.5">
                          <button
                            onClick={handleExportProductMappingsExcel}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            품목사전 (.xlsx)
                          </button>
                          <button
                            onClick={handleExportProductMappingsCSV}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            품목사전 (.csv)
                          </button>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* 하단 리셋 안내 */}
                  <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-700">기본 설정으로 원복</h4>
                      <p className="text-xs text-slate-400 mt-0.5">처음 설치 시 제공된 네이버/쿠팡 및 샘플 품목 매핑 사전 데이터로 전체 원복합니다.</p>
                    </div>
                    <button
                      onClick={handleResetToDefault}
                      className="flex items-center gap-1.5 px-3.5 py-2 border border-rose-200 hover:border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      기본 설정으로 전체 초기화
                    </button>
                  </div>

                </div>
              </motion.div>
            )}

                  {settingsSection === 'account' && (
                    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">계정</h2>
                        <p className="mt-1 text-sm text-slate-600">문의나 버그 신고는 왼쪽 메뉴의 '문의하기'에서 보내 주세요.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openConfirm('로그아웃', '로그아웃 하시겠습니까? 저장되지 않은 작업은 사라집니다.', () => logout())}
                          className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          로그아웃
                        </button>
                      </div>
                    </div>
                  )}
                  </section>
                </div>
              </motion.div>
            </div>
          )}

          {/* 탭 4: 시각화 리포트 탭 */}
          {activeTab === 'analytics' && features.analytics && (
            <motion.div
              key="analytics-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            >
              <DeliveryAnalyticsReport 
                orders={analyticsOrders.length > 0 ? analyticsOrders : (trackingResult?.outputOrders || orderParseResult?.orders || [])} 
                defaultCourierName={selectedCourier === 'custom' ? customCourier : selectedCourier}
                onClearOrders={() => {
                  openConfirm(
                    "시각화 데이터 전체 초기화",
                    "지금 화면의 시각화 리포트 데이터를 모두 비우시겠습니까?",
                    () => {
                      setAnalyticsOrders([]);
                      showNotification('info', "시각화 데이터가 초기화되었습니다.");
                    }
                  );
                }}
              />
            </motion.div>
          )}

          {/* 화면: 플랫폼 설정 (쇼핑몰·택배사 엑셀 열 위치) */}
          {activeTab === 'platforms' && (
            <motion.div
              key="platforms-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            >
              <PlatformSettings 
                platforms={platforms} 
                onChange={(updatedPlatforms) => {
                  setPlatforms(updatedPlatforms);
                  if (orderFiles.length > 0) {
                    processMultipleOrderFiles(orderFiles, customFilePlatforms, decryptedFilesCache, productMappings, updatedPlatforms);
                  }
                }} 
                couriers={couriers}
                onCouriersChange={setCouriers}
                parsedFiles={orderParseResult?.parsedFiles}
                parsedTrackingFiles={parsedTrackingFiles}
                onFilePlatformChange={handleFilePlatformChange}
                onFileCourierChange={handleTrackingFileCourierChange}
                onNavigateToProcessTab={() => setActiveTab('process')}
                onReProcessOrders={() => {
                  if (orderFiles.length > 0) {
                    processMultipleOrderFiles(orderFiles, customFilePlatforms, decryptedFilesCache, productMappings, platforms);
                  }
                }}
                initialMatrixType={platformMatrixType}
              />
            </motion.div>
          )}

          {/* 화면: 품목사전 */}
          {activeTab === 'products' && (
            <motion.div
              key="products-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            >
              <ProductMappingList 
                mappings={productMappings} 
                onChange={setProductMappings} 
              />
            </motion.div>
          )}

        </AnimatePresence>
        </main>
      </div>

      {/* 품목 사전 불러오기 확인 모달 */}
      {mappingImportConfirm && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setMappingImportConfirm(null);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              handleApplyMappingImport(false);
            }
          }}
          tabIndex={-1}
          ref={(node) => node?.focus()}
        >
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="p-2.5 bg-brand-50 text-brand-600 rounded-xl">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">품목 대치 사전 가져오기</h3>
                <p className="text-xs text-brand-600 font-semibold">총 {mappingImportConfirm.parsed.length}개의 대치 규칙 탐지됨</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              불러온 대치 규칙을 기존 품목 대치 사전에 어떻게 적용할까요?
            </p>

            <div className="space-y-2 pt-1">
              <button
                onClick={() => handleApplyMappingImport(false)}
                className="w-full text-left p-3.5 bg-brand-50/80 hover:bg-brand-100 border border-brand-200 text-[#0F3A2F] rounded-xl text-xs font-semibold transition flex flex-col gap-0.5 cursor-pointer"
              >
                <span> 기존 사전에 추가 (병합) [Enter]</span>
                <span className="text-xs text-brand-600 font-normal">기존 목록을 유지하고 중복되지 않은 신규 항목만 추가합니다.</span>
              </button>

              <button
                onClick={() => handleApplyMappingImport(true)}
                className="w-full text-left p-3.5 bg-rose-50/80 hover:bg-rose-100 border border-rose-200 text-rose-900 rounded-xl text-xs font-semibold transition flex flex-col gap-0.5 cursor-pointer"
              >
                <span> 기존 사전 전체 교체 (덮어쓰기)</span>
                <span className="text-xs text-rose-600 font-normal">기존 목록을 지우고 업로드한 파일 데이터로 전체 대체합니다.</span>
              </button>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setMappingImportConfirm(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                취소 (ESC)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 데이터 미리보기 모달 */}
      <ExcelPreviewModal
        isOpen={previewModal.isOpen}
        onClose={() => setPreviewModal(prev => ({ ...prev, isOpen: false }))}
        title={previewModal.title}
        subtitle={previewModal.subtitle}
        files={previewModal.files}
        onDownloadAll={previewModal.onDownloadAll}
        downloadAllButtonText={previewModal.downloadAllButtonText}
      />

      {/* 이상 주문 선별 검증 모달 */}
      <AnomalousOrdersModal
        isOpen={anomalousModalOpen}
        onClose={() => setAnomalousModalOpen(false)}
        issues={anomalousIssues}
      />

      {/* 하단 푸터 */}
      {/* 아래쪽 집계 줄: 쇼핑몰별 건수, 합포장, 송장, 서버 저장 없음 */}
      <footer id="main-footer" className="shrink-0 border-t border-slate-200 bg-white/95 pb-[calc(4.5rem+env(safe-area-inset-bottom))] backdrop-blur md:sticky md:bottom-0 md:z-10 md:pb-0">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[13px] text-slate-600 sm:px-8">
          {activeTab === 'process' && orderParseResult && (
            <>
              {shopCounts.map(([shop, n]) => (
                <span key={shop} className="whitespace-nowrap">{shop} <span className="font-mono tabular-nums text-slate-900">{n}</span></span>
              ))}
              {bundledCount > 0 && (
                <span className="whitespace-nowrap">합포장 <span className="font-mono tabular-nums text-slate-900">{bundledCount}</span></span>
              )}
              {trackingResult && (
                <span className="whitespace-nowrap">송장 <span className="font-mono tabular-nums text-slate-900">{matchedCount}/{trackTotal}</span></span>
              )}
            </>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            브라우저 안에서만 처리 · 서버 저장 없음
          </span>
        </div>
      </footer>

      {/* 휴대폰 아래쪽 탭바: 화면을 바꾸는 메뉴만. 설정·문의·로그아웃은 왼쪽 위 메뉴에 그대로 */}
      <nav aria-label="주요 화면" className="fixed inset-x-0 bottom-0 z-20 grid auto-cols-fr grid-flow-col border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {[
          { key: 'process', label: '주문정리', icon: <Layers className="h-5 w-5" />, show: true },
          { key: 'analytics', label: '리포트', icon: <BarChart3 className="h-5 w-5" />, show: features.analytics },
          { key: 'products', label: '품목사전', icon: <ClipboardList className="h-5 w-5" />, show: true },
          { key: 'platforms', label: '플랫폼 설정', icon: <Grid className="h-5 w-5" />, show: true },
        ]
          .filter((t) => t.show)
          .map((t) => {
            const selected = activeTab === t.key && !isSettingsOpen;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key as typeof activeTab)}
                aria-current={selected ? 'page' : undefined}
                className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-xs font-semibold cursor-pointer ${selected ? 'text-brand-700' : 'text-slate-600'}`}
              >
                {t.icon}
                {t.label}
              </button>
            );
          })}
      </nav>

    </div>
  );
}
