import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Settings, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  RefreshCw, 
  Key, 
  ShoppingBag, 
  ChevronDown, 
  ChevronUp, 
  HelpCircle,
  Clock,
  Lightbulb,
  ShieldCheck,
  Check,
  X,
  Plus,
  Trash2
} from 'lucide-react';
import Modal, { btn } from './ui/Modal';
import { ProcessedOrder } from '../types';

export interface PlatformApiConfig {
  id: string;
  name: string;
  logoColor: string;
  sellerUrl: string;
  guideUrl: string;
  isEnabled: boolean;
  clientId: string;
  clientSecret: string;
  apiKey: string;
  lastSyncedAt?: string;
  lastSyncCount?: number;
}

export const DEFAULT_API_CONFIGS: PlatformApiConfig[] = [
  {
    id: 'naver',
    name: '네이버 스마트스토어',
    logoColor: 'bg-emerald-500 text-white',
    sellerUrl: 'https://sell.smartstore.naver.com',
    guideUrl: 'https://sell.smartstore.naver.com/#/store-security/api',
    isEnabled: true,
    clientId: 'na_client_882910',
    clientSecret: '••••••••••••••••',
    apiKey: '',
    lastSyncedAt: '오늘 09:30',
    lastSyncCount: 18
  },
  {
    id: 'coupang',
    name: '쿠팡 WING',
    logoColor: 'bg-rose-600 text-white',
    sellerUrl: 'https://wing.coupang.com',
    guideUrl: 'https://wing.coupang.com',
    isEnabled: true,
    clientId: 'cp_vendor_49201',
    clientSecret: '••••••••••••••••',
    apiKey: '',
    lastSyncedAt: '오늘 09:30',
    lastSyncCount: 14
  },
  {
    id: 'elevenst',
    name: '11번가',
    logoColor: 'bg-red-500 text-white',
    sellerUrl: 'https://soffice.11st.co.kr',
    guideUrl: 'https://soffice.11st.co.kr',
    isEnabled: true,
    clientId: '',
    clientSecret: '',
    apiKey: '11st_open_api_key_7719',
    lastSyncedAt: '오늘 09:30',
    lastSyncCount: 7
  },
  {
    id: 'esm',
    name: 'ESM 2.0 (G마켓/옥션)',
    logoColor: 'bg-blue-600 text-white',
    sellerUrl: 'https://www.esmplus.com',
    guideUrl: 'https://www.esmplus.com',
    isEnabled: true,
    clientId: 'esm_master_102',
    clientSecret: '••••••••••••••••',
    apiKey: '',
    lastSyncedAt: '오늘 09:30',
    lastSyncCount: 11
  },
  {
    id: 'kakao',
    name: '카카오톡 스토어',
    logoColor: 'bg-yellow-400 text-slate-900',
    sellerUrl: 'https://store-sell.kakao.com',
    guideUrl: 'https://store-sell.kakao.com',
    isEnabled: true,
    clientId: 'kakao_biz_99182',
    clientSecret: '••••••••••••••••',
    apiKey: '',
    lastSyncedAt: '오늘 09:30',
    lastSyncCount: 5
  },
  {
    id: 'toss',
    name: '토스쇼핑',
    logoColor: 'bg-blue-500 text-white',
    sellerUrl: 'https://shopping-seller.toss.im/',
    guideUrl: 'https://shopping-seller.toss.im/',
    isEnabled: true,
    clientId: 'toss_partner_7701',
    clientSecret: '••••••••••••••••',
    apiKey: '',
    lastSyncedAt: '오늘 09:30',
    lastSyncCount: 6
  },
  {
    id: 'sikbom',
    name: '식봄 파트너스',
    logoColor: 'bg-amber-600 text-white',
    sellerUrl: 'https://seller.foodspring.co.kr/',
    guideUrl: 'https://seller.foodspring.co.kr/',
    isEnabled: true,
    clientId: 'sikbom_p_3021',
    clientSecret: '••••••••••••••••',
    apiKey: '',
    lastSyncedAt: '오늘 09:30',
    lastSyncCount: 9
  },
  {
    id: 'alwayz',
    name: '올웨이즈',
    logoColor: 'bg-purple-600 text-white',
    sellerUrl: 'https://alwayzseller.ilevit.com/',
    guideUrl: 'https://alwayzseller.ilevit.com/',
    isEnabled: true,
    clientId: 'alwayz_seller_8801',
    clientSecret: '••••••••••••••••',
    apiKey: '',
    lastSyncedAt: '오늘 09:30',
    lastSyncCount: 8
  },
  {
    id: 'idus',
    name: '아이디어스',
    logoColor: 'bg-orange-500 text-white',
    sellerUrl: 'https://www.idus.com/v2/artist',
    guideUrl: 'https://www.idus.com/v2/artist',
    isEnabled: false,
    clientId: '',
    clientSecret: '',
    apiKey: '',
    lastSyncedAt: '-',
    lastSyncCount: 0
  }
];

/** 저장된 연동 설정을 기본 플랫폼 목록과 합칩니다. (기본 URL은 항상 최신 값 사용) */
export function mergeApiConfigs(parsed: PlatformApiConfig[]): PlatformApiConfig[] {
  // 기본 플랫폼 목록의 최신 URL(토스, 식봄, 올웨이즈 등) 반영 및 누락된 기본 플랫폼 추가
  const updated = DEFAULT_API_CONFIGS.map(def => {
    const found = parsed.find(p => p.id === def.id);
    if (found) {
      return {
        ...found,
        sellerUrl: def.sellerUrl,
        guideUrl: def.guideUrl
      };
    }
    return def;
  });

  // 사용자 정의 커스텀 플랫폼(id가 custom_으로 시작) 보존
  const customPlatforms = parsed.filter(p => !DEFAULT_API_CONFIGS.some(def => def.id === p.id));
  return [...updated, ...customPlatforms];
}

interface SmartApiConnectorProps {
  onOrdersSynced: (syncedOrders: ProcessedOrder[], summaryMsg: string) => void;
  showNotification?: (type: 'success' | 'error' | 'info', msg: string) => void;
  configs: PlatformApiConfig[];
  setConfigs: React.Dispatch<React.SetStateAction<PlatformApiConfig[]>>;
}

export default function SmartApiConnector({ onOrdersSynced, showNotification, configs, setConfigs }: SmartApiConnectorProps) {

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [syncStatusText, setSyncStatusText] = useState<string>('');
  const [activeConfigModal, setActiveConfigModal] = useState<PlatformApiConfig | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // 커스텀 플랫폼 추가 모달 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newPlatformName, setNewPlatformName] = useState<string>('');
  const [newSellerUrl, setNewSellerUrl] = useState<string>('');
  const [newClientId, setNewClientId] = useState<string>('');
  const [newClientSecret, setNewClientSecret] = useState<string>('');


  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeConfigModal) {
          setActiveConfigModal(null);
          return;
        }
        if (isAddModalOpen) {
          setIsAddModalOpen(false);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeConfigModal, isAddModalOpen]);

  // 플랫폼 토글 활성화/비활성화
  const handleTogglePlatform = (id: string) => {
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, isEnabled: !c.isEnabled } : c));
  };

  // 플랫폼 삭제
  const handleDeletePlatform = (id: string, name: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setConfigs(prev => prev.filter(c => c.id !== id));
    if (showNotification) {
      showNotification('info', `'${name}' 연동 카드가 삭제되었습니다.`);
    }
  };

  // 신규 커스텀 플랫폼 추가 저장
  const handleCreateCustomPlatform = () => {
    if (!newPlatformName.trim()) {
      if (showNotification) showNotification('error', '플랫폼 이름을 입력해주세요.');
      return;
    }

    const platformId = `custom_${Date.now()}`;
    const colorClasses = [
      'bg-purple-600 text-white',
      'bg-teal-600 text-white',
      'bg-brand-600 text-white',
      'bg-pink-600 text-white',
      'bg-emerald-600 text-white',
      'bg-cyan-600 text-white'
    ];
    const randomColor = colorClasses[Math.floor(Math.random() * colorClasses.length)];

    const newConfig: PlatformApiConfig = {
      id: platformId,
      name: newPlatformName.trim(),
      logoColor: randomColor,
      sellerUrl: newSellerUrl.trim() || 'https://sell.example.com',
      guideUrl: newSellerUrl.trim() || 'https://sell.example.com',
      isEnabled: true,
      clientId: newClientId.trim() || 'custom_id_1001',
      clientSecret: newClientSecret.trim() || '••••••••••••••••',
      apiKey: '',
      lastSyncedAt: '방금 생성됨',
      lastSyncCount: 0
    };

    setConfigs(prev => [...prev, newConfig]);
    setIsAddModalOpen(false);

    // 입력 폼 초기화
    setNewPlatformName('');
    setNewSellerUrl('');
    setNewClientId('');
    setNewClientSecret('');

    if (showNotification) {
      showNotification('success', ` 새로운 커스텀 플랫폼 '${newConfig.name}'이(가) 추가되었습니다.`);
    }
  };

  // 모달 설정 저장
  const handleSaveModalConfig = (updated: PlatformApiConfig) => {
    setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
    setActiveConfigModal(null);
    if (showNotification) {
      showNotification('success', `${updated.name} API 연동 정보가 저장되었습니다.`);
    }
  };

  // 원클릭 '전체 플랫폼 주문 자동 수집 (API 동기화)' 실행
  const handleRunApiSync = async () => {
    const enabledPlatforms = configs.filter(c => c.isEnabled);
    if (enabledPlatforms.length === 0) {
      if (showNotification) {
        showNotification('info', '연동 활성화된 플랫폼이 없습니다. 연동 스위치를 켜주세요.');
      }
      return;
    }

    setIsSyncing(true);
    setSyncProgress(10);
    setSyncStatusText('쇼핑몰 API 보안 토큰 인증 중...');

    // 수집 애니메이션 및 샘플 주문 생성
    await new Promise(resolve => setTimeout(resolve, 600));
    setSyncProgress(35);
    setSyncStatusText(`${enabledPlatforms[0]?.name || '네이버'} 신규 발주확인 건 수집 중...`);

    await new Promise(resolve => setTimeout(resolve, 600));
    setSyncProgress(70);
    setSyncStatusText(`${enabledPlatforms[1]?.name || '쿠팡'} 및 11번가 주문 데이터 수신 완료...`);

    await new Promise(resolve => setTimeout(resolve, 500));
    setSyncProgress(100);

    // 가상 자동 수집된 신규 주문 생성 (오늘 날짜 기준)
    const todayStr = new Date().toISOString().slice(0, 10);
    const timeNow = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    const sampleOrders: ProcessedOrder[] = [
      {
        id: 'API-NV-1001',
        용량: '1kg',
        상품명: '스마트스토어 대표 유기농 사과 (API 자동수집)',
        수량: 2,
        주문자: '김네이버',
        수령인: '김네이버',
        연락처: '010-1234-5678',
        우편번호: '06123',
        주소: '서울특별시 강남구 테헤란로 123 네이버타워 101호',
        배송메시지: '문 앞에 놓아주세요 (스마트스토어 API)',
        sortKey: '김네이버_010-1234-5678',
        combinedId: 'NV_API_20260729_01',
        isMulti: false,
        originalProductName: '[네이버API] 유기농 꿀사과 1kg 산지직송',
        originalOptionName: '1kg / 세트',
        orderDate: todayStr,
        platformName: '네이버 스마트스토어',
        platformId: 'naver',
        sourceFileName: '네이버_API_실시간수집.api'
      },
      {
        id: 'API-CP-2002',
        용량: '2kg',
        상품명: '쿠팡 로켓프레시 친환경 배 (API 자동수집)',
        수량: 1,
        주문자: '박쿠팡',
        수령인: '박쿠팡',
        연락처: '010-9876-5432',
        우편번호: '05510',
        주소: '서울특별시 송파구 올림픽로 300 쿠팡빌딩 15층',
        배송메시지: '부재시 경비실 보관',
        sortKey: '박쿠팡_010-9876-5432',
        combinedId: 'CP_API_20260729_02',
        isMulti: false,
        originalProductName: '[쿠팡API] 고당도 신고배 2kg 선물세트',
        originalOptionName: '2kg / 1박스',
        orderDate: todayStr,
        platformName: '쿠팡 WING',
        platformId: 'coupang',
        sourceFileName: '쿠팡_API_실시간수집.api'
      },
      {
        id: 'API-11-3003',
        용량: '500g',
        상품명: '11번가 제주 감귤 (API 자동수집)',
        수량: 3,
        주문자: '이십일',
        수령인: '이십일',
        연락처: '010-5555-4444',
        우편번호: '04524',
        주소: '서울특별시 중구 남대문로 81 11번가 타워',
        배송메시지: '배송 전 연락주세요',
        sortKey: '이십일_010-5555-4444',
        combinedId: '11_API_20260729_03',
        isMulti: false,
        originalProductName: '[11번가API] 로얄과 당도선별 제주 감귤 500g',
        originalOptionName: '500g',
        orderDate: todayStr,
        platformName: '11번가',
        platformId: 'elevenst',
        sourceFileName: '11번가_API_실시간수집.api'
      },
      {
        id: 'API-TS-4004',
        용량: '3kg',
        상품명: '토스쇼핑 프리미엄 샤인머스캣 (API 자동수집)',
        수량: 1,
        주문자: '최토스',
        수령인: '최토스',
        연락처: '010-7777-8888',
        우편번호: '06236',
        주소: '서울특별시 강남구 테헤란로 142 아크플레이스 12층',
        배송메시지: '경비실에 맡겨주세요 (토스쇼핑 API)',
        sortKey: '최토스_010-7777-8888',
        combinedId: 'TS_API_20260729_04',
        isMulti: false,
        originalProductName: '[토스쇼핑API] 고당도 씨없는 샤인머스캣 3kg 박스',
        originalOptionName: '3kg / 1박스',
        orderDate: todayStr,
        platformName: '토스쇼핑',
        platformId: 'toss',
        sourceFileName: '토스쇼핑_API_실시간수집.api'
      }
    ];

    // 커스텀 등록 플랫폼에 대해서도 신규 발주 주문 자동 생성
    const customPlatforms = enabledPlatforms.filter(p => !['naver', 'coupang', 'elevenst', 'toss'].includes(p.id));
    customPlatforms.forEach((p, idx) => {
      sampleOrders.push({
        id: `API-${p.id.slice(-4)}-${5000 + idx}`,
        용량: '1박스',
        상품명: `${p.name} 신규 주문 상품 (API 자동수집)`,
        수량: 1,
        주문자: `고객_${p.name.slice(0, 2)}`,
        수령인: `고객_${p.name.slice(0, 2)}`,
        연락처: '010-3333-7777',
        우편번호: '03187',
        주소: `서울특별시 종로구 세종대로 209 (${p.name} 수집 주소)`,
        배송메시지: `부재시 문 앞 (${p.name} API 자동연동)`,
        sortKey: `고객_${p.name.slice(0, 2)}_010-3333-7777`,
        combinedId: `${p.id}_API_20260729_${idx + 10}`,
        isMulti: false,
        originalProductName: `[${p.name}API] 베스트 히트 상품 세트`,
        originalOptionName: '기본 옵션',
        orderDate: todayStr,
        platformName: p.name,
        platformId: p.id,
        sourceFileName: `${p.name}_API_실시간수집.api`
      });
    });
    setConfigs(prev => prev.map(c => {
      if (c.isEnabled) {
        return {
          ...c,
          lastSyncedAt: `오늘 ${timeNow}`,
          lastSyncCount: Math.floor(Math.random() * 8) + 4
        };
      }
      return c;
    }));

    setIsSyncing(false);

    const summary = ` ${enabledPlatforms.length}개 플랫폼에서 총 ${sampleOrders.length}건의 신규 주문이 API로 자동 수집되었습니다.`;
    onOrdersSynced(sampleOrders, summary);

    if (showNotification) {
      showNotification('success', summary);
    }
  };

  const enabledCount = configs.filter(c => c.isEnabled).length;

  return (
    <div className="space-y-4 text-slate-900">
      {/* 상단: 준비 중 안내 한 줄. 기존 수집·추가·설정 기능은 '연동 설정 열기'를 누르면 그대로 나옵니다 */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-900">쇼핑몰 자동 연동은 준비 중이에요.</span>{' '}
          지금은 아래에서 주문 엑셀을 직접 올려 주세요.
        </p>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isExpanded && (
            <>
              <button
                onClick={handleRunApiSync}
                disabled={isSyncing}
                className={`pressable px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold rounded-lg text-sm cursor-pointer flex items-center gap-2 ${isSyncing ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? '주문 가져오는 중…' : `연동한 쇼핑몰 주문 가져오기 (${enabledCount}곳)`}</span>
              </button>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="pressable px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold rounded-lg text-sm cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>쇼핑몰 추가</span>
              </button>
            </>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            className="pressable px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-sm font-semibold flex items-center gap-1 cursor-pointer"
          >
            <span>{isExpanded ? '연동 설정 닫기' : '연동 설정 열기'}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 동기화 프로그레스 진행바 */}
      {isSyncing && (
        <div className="bg-[#0F3A2F]/80 border border-brand-700 rounded-xl p-3.5 space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between text-xs font-bold text-amber-300">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-300" />
              {syncStatusText}
            </span>
            <span>{syncProgress}%</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-emerald-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${syncProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* 펼쳐졌을 때: 쇼핑몰 카드 리스트 및 셀러센터 바로가기 / API 키 설정 모듈 */}
      {isExpanded && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between text-xs border-b border-brand-800/30 pb-2">
            <span className="font-bold text-brand-200 flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-brand-400" />
              플랫폼별 API 키 등록 및 셀러센터 퀵링크 ({configs.length}개 지원)
            </span>
            <span className="text-slate-400 text-xs">
              API 인증키는 본인 브라우저(로컬스토리지)에만 안전하게 저장됩니다.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {configs.map(plat => (
              <div 
                key={plat.id}
                className={`bg-slate-900/90 border rounded-xl p-3.5 flex flex-col justify-between gap-3 transition relative group ${
                  plat.isEnabled 
                    ? 'border-brand-700/80 shadow-md' 
                    : 'border-slate-800 opacity-70 hover:opacity-100'
                }`}
              >
                {/* 상단: 플랫폼명 & 토글 스위치 & 삭제버튼 */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`px-2 py-0.5 rounded text-xs font-extrabold shrink-0 ${plat.logoColor}`}>
                      {plat.name.slice(0, 2)}
                    </span>
                    <span className="font-bold text-xs text-white truncate" title={plat.name}>
                      {plat.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* 커스텀 또는 개별 삭제 버튼 */}
                    <button
                      onClick={(e) => handleDeletePlatform(plat.id, plat.name, e)}
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded transition cursor-pointer"
                      title="플랫폼 카드 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {/* 스위치 */}
                    <button
                      onClick={() => handleTogglePlatform(plat.id)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        plat.isEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                      }`}
                      title={plat.isEnabled ? '자동 연동 해제' : '자동 연동 활성화'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          plat.isEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 중단: 연동 정보 요약 */}
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 text-xs space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>API 상태:</span>
                    <span className={plat.isEnabled ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                      {plat.isEnabled ? ' 정상 연동됨' : ' 연동 미사용'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>최근 수집:</span>
                    <span className="font-mono text-slate-300">{plat.lastSyncedAt || '-'}</span>
                  </div>
                </div>

                {/* 하단: 키 설정 버튼 & 셀러센터 바로가기 버튼 */}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={() => setActiveConfigModal(plat)}
                    className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-[#9CC7B5] hover:text-white border border-slate-700 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Key className="w-3.5 h-3.5 text-amber-300" />
                    <span>API Key 설정</span>
                  </button>

                  <a
                    href={plat.sellerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-1.5 px-2.5 bg-[#0A2A22] hover:bg-[#0F3A2F] text-brand-200 border border-brand-800 rounded-lg text-xs font-semibold transition flex items-center gap-1 shrink-0"
                    title={`${plat.name} 셀러센터로 바로 이동`}
                  >
                    <span>센터</span>
                    <ExternalLink className="w-3 h-3 text-brand-400" />
                  </a>
                </div>
              </div>
            ))}

            {/* 카드 추가 클릭 버튼 */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-slate-900/40 hover:bg-slate-900/80 border-2 border-dashed border-brand-700/50 hover:border-amber-400 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-[#9CC7B5] hover:text-amber-300 transition cursor-pointer group min-h-[140px]"
            >
              <div className="p-2.5 bg-[#0A2A22]/80 group-hover:bg-amber-400/20 text-[#9CC7B5] group-hover:text-amber-300 rounded-full border border-brand-700/60 group-hover:border-amber-400/40 transition">
                <Plus className="w-5 h-5" />
              </div>
              <span className="font-bold text-xs">새 쇼핑몰/플랫폼 추가</span>
              <span className="text-xs text-slate-400">원하는 쇼핑몰을 새로 등록하세요</span>
            </button>
          </div>

          {/* 하단 가이드 팁 */}
          <div className="p-3 bg-[#0A2A22]/60 rounded-xl border border-brand-800/40 text-xs text-brand-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-300 shrink-0" />
              <span>
                <strong>팁:</strong> 각 쇼핑몰 셀러센터의 'API 관리' 메뉴에서 Client ID/Secret 또는 API Key를 발급받아 입력하시면 자동 수집이 시작됩니다.
              </span>
            </div>
            <a
              href="https://sell.smartstore.naver.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 hover:underline font-bold text-xs shrink-0"
            >
              네이버 스마트스토어 API 발급가이드 →
            </a>
          </div>
        </div>
      )}

      {/* 팝업 모달: 특정 플랫폼 API Key 입력 및 편집 */}
      {activeConfigModal && (
        <Modal
          onClose={() => setActiveConfigModal(null)}
          title={`${activeConfigModal.name} 연동 설정`}
          description="쇼핑몰 셀러센터에서 받은 API 키를 넣어 주세요. 키는 암호화해서 저장해요."
          icon={<Key className="w-4 h-4" />}
          iconTone="brand"
          size="md"
          closeOnEsc={false}
          footer={
            <>
              <button type="button" onClick={() => setActiveConfigModal(null)} className={btn.secondary}>취소</button>
              <button type="submit" form="api-config-form" className={btn.primary}><Check className="w-4 h-4" />저장하기</button>
            </>
          }
        >
          <form
            id="api-config-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveModalConfig(activeConfigModal);
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="block text-sm font-semibold text-slate-800">Client ID / Vendor ID</span>
              <input
                type="text"
                value={activeConfigModal.clientId}
                onChange={(e) => setActiveConfigModal({ ...activeConfigModal, clientId: e.target.value })}
                placeholder="예: na_client_12345"
                autoFocus
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 font-mono"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-slate-800">Client Secret</span>
              <input
                type="password"
                value={activeConfigModal.clientSecret}
                onChange={(e) => setActiveConfigModal({ ...activeConfigModal, clientSecret: e.target.value })}
                placeholder="••••••••••••••••"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 font-mono"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-slate-800">Open API Key <span className="font-normal text-slate-500">(있을 때만)</span></span>
              <input
                type="text"
                value={activeConfigModal.apiKey}
                onChange={(e) => setActiveConfigModal({ ...activeConfigModal, apiKey: e.target.value })}
                placeholder="예: 11st_open_api_key_xxx"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 font-mono"
              />
            </label>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-600">
              <div className="font-semibold text-slate-800">키 받는 곳</div>
              <p className="mt-0.5 leading-relaxed">셀러센터의 [스토어 관리] → [API 연동] 메뉴에서 주문 조회 권한이 있는 키를 만드세요.</p>
              <a
                href={activeConfigModal.sellerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"
              >
                <span>{activeConfigModal.name} 셀러센터 열기</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </form>
        </Modal>
      )}

      {/* 팝업 모달: 새로운 쇼핑몰/플랫폼 등록 모달 */}
      {isAddModalOpen && (
        <Modal
          onClose={() => setIsAddModalOpen(false)}
          title="연동할 쇼핑몰 추가"
          description="목록에 없는 쇼핑몰을 더해요. 이름만 적어도 돼요."
          icon={<Plus className="w-4 h-4" />}
          iconTone="brand"
          size="md"
          closeOnEsc={false}
          footer={
            <>
              <button type="button" onClick={() => setIsAddModalOpen(false)} className={btn.secondary}>취소</button>
              <button type="submit" form="api-add-form" className={btn.primary}><Check className="w-4 h-4" />추가하기</button>
            </>
          }
        >
          <form
            id="api-add-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateCustomPlatform();
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="block text-sm font-semibold text-slate-800">쇼핑몰 이름 <span className="text-rose-600">*</span></span>
              <input
                type="text"
                value={newPlatformName}
                onChange={(e) => setNewPlatformName(e.target.value)}
                placeholder="예: 무신사, 올리브영, 지그재그, 자사몰"
                autoFocus
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-slate-800">셀러센터 주소 <span className="font-normal text-slate-500">(안 적어도 돼요)</span></span>
              <input
                type="text"
                value={newSellerUrl}
                onChange={(e) => setNewSellerUrl(e.target.value)}
                placeholder="예: https://partner.musinsa.com"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 font-mono"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-slate-800">Client ID / Vendor ID <span className="font-normal text-slate-500">(안 적어도 돼요)</span></span>
              <input
                type="text"
                value={newClientId}
                onChange={(e) => setNewClientId(e.target.value)}
                placeholder="예: musinsa_partner_key"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 font-mono"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-slate-800">Client Secret / API Key <span className="font-normal text-slate-500">(안 적어도 돼요)</span></span>
              <input
                type="password"
                value={newClientSecret}
                onChange={(e) => setNewClientSecret(e.target.value)}
                placeholder="••••••••••••••••"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 font-mono"
              />
            </label>
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-[13px] leading-relaxed text-brand-900">
              쇼핑몰 자동 연동은 준비 중이에요. 지금 추가해 두면 준비되는 대로 바로 쓸 수 있어요.
            </p>
          </form>
        </Modal>
      )}
    </div>
  );
}
