import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ProcessedOrder } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, 
  AreaChart, Area, CartesianGrid 
} from 'recharts';
import { 
  MapPin, ShoppingBag, 
  Calendar, TrendingUp, Layers, Package,
  ChevronLeft, ChevronRight, Edit3, SlidersHorizontal, Check,
  Filter, CalendarDays, ArrowRight, X
} from 'lucide-react';
import Modal, { btn } from './ui/Modal';

interface DeliveryAnalyticsReportProps {
  orders: ProcessedOrder[];
  defaultCourierName?: string;
  onClearOrders?: () => void;
}

const COLORS = [
  '#4f46e5', '#0284c7', '#0d9488', '#16a34a', '#d97706', 
  '#dc2626', '#9333ea', '#db2777', '#475569', '#6366f1'
];

export default function DeliveryAnalyticsReport({
  orders = []
}: DeliveryAnalyticsReportProps) {
  // 1. 기간 필터 옵션: 전체('all'), 1일('1d'), 1주일('1w'), 1달('1m'), 사용자지정('custom')
  const [dateFilterType, setDateFilterType] = useState<'all' | '1d' | '1w' | '1m' | 'custom'>('all');
  
  // 가장 최신 주문 날짜를 기본 기준일로 선택
  const latestOrderDate = useMemo(() => {
    const valid = orders.map(o => o.orderDate).filter(d => d && d.match(/^\d{4}-\d{2}-\d{2}$/));
    if (valid.length > 0) {
      valid.sort().reverse();
      return valid[0];
    }
    return new Date().toISOString().slice(0, 10);
  }, [orders]);

  // 기준일 (1일, 1주, 1달 계산의 중심 기준이 되는 날짜)
  const [targetBaseDate, setTargetBaseDate] = useState<string>(latestOrderDate);

  // 사용자 지정 시작일 / 종료일
  const [customStartDate, setCustomStartDate] = useState<string>(latestOrderDate);
  const [customEndDate, setCustomEndDate] = useState<string>(latestOrderDate);

  // 캘린더 팝업 모달 열림 상태
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState<boolean>(false);

  // 캘린더에서 범위 클릭 지정을 위한 포인터
  const [rangeSelectionStep, setRangeSelectionStep] = useState<'none' | 'startSelected'>('none');
  
  // 사용자가 수동으로 변경/보정한 주문 날짜 오버라이드 Map (orderId -> YYYY-MM-DD)
  const [customDateOverrides, setCustomDateOverrides] = useState<{ [orderId: string]: string }>({});
  // 일괄 적용 날짜 입력 (초기값: 오늘 날짜)
  const [bulkDateInput, setBulkDateInput] = useState<string>(() => new Date().toISOString().slice(0, 10));
  // 보정 패널 열림 상태
  const [showAdjustPanel, setShowAdjustPanel] = useState<boolean>(false);

  // 주문 업데이트 시 기준일 동기화
  useEffect(() => {
    if (latestOrderDate) {
      setTargetBaseDate(latestOrderDate);
      setCustomStartDate(latestOrderDate);
      setCustomEndDate(latestOrderDate);
    }
  }, [latestOrderDate]);

  // 주문별 최종 적용 날짜 추출 함수
  const getEffectiveDate = (o: ProcessedOrder): string => {
    if (customDateOverrides[o.id]) return customDateOverrides[o.id];
    if (o.orderDate && o.orderDate.match(/^\d{4}-\d{2}-\d{2}$/)) return o.orderDate;
    return '';
  };

  // 2. 통합 날짜 필터링 적용 (모든 차트 및 KPI 수치에 완벽 적용)
  const filteredOrders = useMemo(() => {
    if (dateFilterType === 'all') return orders;

    return orders.filter(o => {
      const dStr = getEffectiveDate(o);
      if (!dStr) return false;

      if (dateFilterType === '1d') {
        return dStr === targetBaseDate;
      }

      if (dateFilterType === '1w') {
        // targetBaseDate 기준 이전 6일~당일 (총 7일간)
        const baseMs = new Date(targetBaseDate).getTime();
        const orderMs = new Date(dStr).getTime();
        const diffDays = (baseMs - orderMs) / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays < 7;
      }

      if (dateFilterType === '1m') {
        // targetBaseDate 기준 이전 29일~당일 (총 30일간)
        const baseMs = new Date(targetBaseDate).getTime();
        const orderMs = new Date(dStr).getTime();
        const diffDays = (baseMs - orderMs) / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays < 30;
      }

      if (dateFilterType === 'custom') {
        if (customStartDate && dStr < customStartDate) return false;
        if (customEndDate && dStr > customEndDate) return false;
        return true;
      }

      return true;
    });
  }, [orders, dateFilterType, targetBaseDate, customStartDate, customEndDate, customDateOverrides]);

  // 날짜별 전체 집계 Map (YYYY-MM-DD -> 수)
  const orderDateMap = useMemo(() => {
    const map: { [key: string]: number } = {};
    orders.forEach((o) => {
      const dStr = getEffectiveDate(o);
      if (dStr) {
        map[dStr] = (map[dStr] || 0) + 1;
      }
    });
    return map;
  }, [orders, customDateOverrides]);

  // 수집된 주문 데이터 날짜 목록 (드롭다운 선택용)
  const availableDateOptions = useMemo(() => {
    return Object.keys(orderDateMap).sort().reverse();
  }, [orderDateMap]);

  // 현재 필터 옵션에 따른 실제 시작일~종료일 텍스트
  const activeRangeText = useMemo(() => {
    if (dateFilterType === '1d') {
      return { label: targetBaseDate || '날짜 미선택', span: '1일간' };
    }
    if (dateFilterType === '1w') {
      const base = new Date(targetBaseDate);
      if (isNaN(base.getTime())) return { label: targetBaseDate, span: '7일간' };
      const start = new Date(base);
      start.setDate(start.getDate() - 6);
      const startStr = start.toISOString().slice(0, 10);
      return { label: `${startStr} ~ ${targetBaseDate}`, span: '7일간' };
    }
    if (dateFilterType === '1m') {
      const base = new Date(targetBaseDate);
      if (isNaN(base.getTime())) return { label: targetBaseDate, span: '30일간' };
      const start = new Date(base);
      start.setDate(start.getDate() - 29);
      const startStr = start.toISOString().slice(0, 10);
      return { label: `${startStr} ~ ${targetBaseDate}`, span: '30일간' };
    }
    if (dateFilterType === 'custom') {
      return {
        label: `${customStartDate || '미지정'} ~ ${customEndDate || '미지정'}`,
        span: '사용자 지정'
      };
    }
    return { label: '전체 수집 기간', span: '전체' };
  }, [dateFilterType, targetBaseDate, customStartDate, customEndDate]);

  // 날짜 미지정 건수
  const unassignedDateCount = useMemo(() => {
    return orders.filter(o => !getEffectiveDate(o)).length;
  }, [orders, customDateOverrides]);

  // 캘린더 연도 및 월 상태
  const [currentYearMonth, setCurrentYearMonth] = useState<{ year: number; month: number }>(() => {
    const today = new Date();
    let defaultYear = today.getFullYear();
    let defaultMonth = today.getMonth() + 1;

    const validDates: string[] = [];
    orders.forEach(o => {
      const dStr = getEffectiveDate(o);
      if (dStr && dStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        validDates.push(dStr);
      }
    });

    if (validDates.length > 0) {
      validDates.sort().reverse();
      const [y, m] = validDates[0].split('-').map(Number);
      if (y && m) {
        defaultYear = y;
        defaultMonth = m;
      }
    }
    return { year: defaultYear, month: defaultMonth };
  });

  const handlePrevMonth = () => {
    setCurrentYearMonth(prev => {
      if (prev.month === 1) return { year: prev.year - 1, month: 12 };
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const handleNextMonth = () => {
    setCurrentYearMonth(prev => {
      if (prev.month === 12) return { year: prev.year + 1, month: 1 };
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  // 날짜 수동 일괄 보정
  const handleApplyBulkDate = (onlyUnassigned = true) => {
    if (!bulkDateInput || !bulkDateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      alert('올바른 YYYY-MM-DD 날짜를 입력해주세요.');
      return;
    }

    const newMap = { ...customDateOverrides };
    orders.forEach(o => {
      const currentD = getEffectiveDate(o);
      if (onlyUnassigned) {
        if (!currentD) newMap[o.id] = bulkDateInput;
      } else {
        newMap[o.id] = bulkDateInput;
      }
    });

    setCustomDateOverrides(newMap);
    
    const [y, m] = bulkDateInput.split('-').map(Number);
    if (y && m) {
      setCurrentYearMonth({ year: y, month: m });
      setTargetBaseDate(bulkDateInput);
    }
  };

  const handleResetDateOverrides = () => {
    setCustomDateOverrides({});
  };

  // 캘린더 날짜 클릭 핸들러 (1일 지정 또는 범위 지정)
  const handleCalendarDayClick = (dateStr: string) => {
    // 캘린더 클릭 시 사용자 지정 모드로 전환
    setDateFilterType('custom');

    if (rangeSelectionStep === 'none') {
      setCustomStartDate(dateStr);
      setCustomEndDate(dateStr);
      setTargetBaseDate(dateStr);
      setRangeSelectionStep('startSelected');
    } else {
      if (dateStr < customStartDate) {
        setCustomEndDate(customStartDate);
        setCustomStartDate(dateStr);
      } else {
        setCustomEndDate(dateStr);
      }
      setRangeSelectionStep('none');
    }
  };

  // 한 달 전체 달력 캘린더 데이터 생성
  const monthCalendarData = useMemo(() => {
    const { year, month } = currentYearMonth;
    const firstDay = new Date(year, month - 1, 1);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    const prevMonthLastDate = new Date(year, month - 1, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);

    const daysList: Array<{
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      count: number;
    }> = [];

    // 이전 달 잔여 날짜
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDate - i;
      const prevM = month === 1 ? 12 : month - 1;
      const prevY = month === 1 ? year - 1 : year;
      const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      daysList.push({
        dayNumber: dayNum,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        count: orderDateMap[dateStr] || 0
      });
    }

    // 이번 달 날짜
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      daysList.push({
        dayNumber: dayNum,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        count: orderDateMap[dateStr] || 0
      });
    }

    // 다음 달 날짜 채우기
    const targetTotal = daysList.length > 35 ? 42 : 35;
    const neededNextDays = targetTotal - daysList.length;

    for (let dayNum = 1; dayNum <= neededNextDays; dayNum++) {
      const nextM = month === 12 ? 1 : month + 1;
      const nextY = month === 12 ? year + 1 : year;
      const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      daysList.push({
        dayNumber: dayNum,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        count: orderDateMap[dateStr] || 0
      });
    }

    return daysList;
  }, [currentYearMonth, orderDateMap]);

  // 1. 쇼핑몰별 물량 집계 (필터링된 데이터 기준)
  const platformData = useMemo(() => {
    const counts: { [key: string]: { name: string; count: number; totalQty: number } } = {};
    
    filteredOrders.forEach(o => {
      let platName = o.platformName || '알 수 없음';
      if (!platName || platName === '알 수 없음') {
        const fn = (o.sourceFileName || '').toLowerCase();
        if (fn.includes('스마트스토어') || fn.includes('naver')) platName = '네이버 스마트스토어';
        else if (fn.includes('쿠팡') || fn.includes('coupang')) platName = '쿠팡';
        else if (fn.includes('지마켓') || fn.includes('gmarket')) platName = 'G마켓';
        else if (fn.includes('옥션') || fn.includes('auction')) platName = '옥션';
        else if (fn.includes('11번가')) platName = '11번가';
        else if (fn.includes('esm')) platName = 'ESM 2.0';
      }

      if (!counts[platName]) {
        counts[platName] = { name: platName, count: 0, totalQty: 0 };
      }
      counts[platName].count += 1;
      counts[platName].totalQty += (o.수량 || 1);
    });

    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [filteredOrders]);

  // 2. 정제 후 단어 기준 판매 물량 집계 (필터링된 데이터 기준)
  const productData = useMemo(() => {
    const counts: { [key: string]: { name: string; totalQty: number; orderCount: number } } = {};

    filteredOrders.forEach(o => {
      const cleanName = (o.상품명 || o.sortKey || '미지정 상품').trim();
      if (!counts[cleanName]) {
        counts[cleanName] = { name: cleanName, totalQty: 0, orderCount: 0 };
      }
      counts[cleanName].totalQty += (o.수량 || 1);
      counts[cleanName].orderCount += 1;
    });

    return Object.values(counts).sort((a, b) => b.totalQty - a.totalQty);
  }, [filteredOrders]);

  // 3. 지역별 물량 집계 (필터링된 데이터 기준)
  const regionData = useMemo(() => {
    const counts: { [key: string]: number } = {};
    const regionNames = [
      '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산',
      '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
    ];

    filteredOrders.forEach(o => {
      const addr = (o.주소 || '').trim();
      let matchedRegion = '기타/미분류';

      for (const reg of regionNames) {
        if (addr.startsWith(reg) || addr.includes(` ${reg} `) || addr.includes(`${reg}도`) || addr.includes(`${reg}시`)) {
          matchedRegion = reg;
          break;
        }
      }

      counts[matchedRegion] = (counts[matchedRegion] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredOrders]);

  // 4. 일별 출고 추이 데이터 (0건인 날짜 포함 + 연속 일자 생성)
  const timeSeriesData = useMemo(() => {
    const counts: { [key: string]: number } = {};

    filteredOrders.forEach((o) => {
      const dateStr = getEffectiveDate(o);
      if (!dateStr) return;
      counts[dateStr] = (counts[dateStr] || 0) + 1;
    });

    // 시작일, 종료일 결정
    let startStr = '';
    let endStr = '';

    if (dateFilterType === '1d') {
      startStr = targetBaseDate;
      endStr = targetBaseDate;
    } else if (dateFilterType === '1w') {
      const base = new Date(targetBaseDate);
      if (!isNaN(base.getTime())) {
        const start = new Date(base);
        start.setDate(start.getDate() - 6);
        startStr = start.toISOString().slice(0, 10);
        endStr = targetBaseDate;
      }
    } else if (dateFilterType === '1m') {
      const base = new Date(targetBaseDate);
      if (!isNaN(base.getTime())) {
        const start = new Date(base);
        start.setDate(start.getDate() - 29);
        startStr = start.toISOString().slice(0, 10);
        endStr = targetBaseDate;
      }
    } else if (dateFilterType === 'custom') {
      startStr = customStartDate;
      endStr = customEndDate;
    } else {
      // 'all' 전체 기간
      const validDates: string[] = [];
      orders.forEach((o) => {
        const d = getEffectiveDate(o);
        if (d && d.match(/^\d{4}-\d{2}-\d{2}$/)) {
          validDates.push(d);
        }
      });
      if (validDates.length > 0) {
        validDates.sort();
        startStr = validDates[0];
        endStr = validDates[validDates.length - 1];
      }
    }

    if (!startStr || !endStr || startStr > endStr) {
      // 날짜 파싱이 어려울 경우 집계된 날짜만 반환
      return Object.entries(counts)
        .map(([dateKey, count]) => {
          const parts = dateKey.split('-');
          const displayDate = parts.length === 3 ? `${parts[1]}.${parts[2]}` : dateKey;
          return { fullDate: dateKey, date: displayDate, count, dayOfWeek: '' };
        })
        .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
    }

    // startStr 부터 endStr 까지 매일 0건 포함하여 연속 생성
    const result: Array<{ fullDate: string; date: string; count: number; dayOfWeek: string }> = [];
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    const curr = new Date(startStr);
    const end = new Date(endStr);

    let safetyCounter = 0;
    while (curr <= end && safetyCounter < 366) {
      safetyCounter++;
      const dateKey = curr.toISOString().slice(0, 10);
      const parts = dateKey.split('-');
      const displayDate = parts.length === 3 ? `${parts[1]}.${parts[2]}` : dateKey;
      const count = counts[dateKey] || 0;
      const dayOfWeek = dayNames[curr.getDay()];

      result.push({
        fullDate: dateKey,
        date: displayDate,
        count,
        dayOfWeek
      });

      curr.setDate(curr.getDate() + 1);
    }

    return result;
  }, [filteredOrders, orders, dateFilterType, targetBaseDate, customStartDate, customEndDate, customDateOverrides]);

  const chartScrollRef = useRef<HTMLDivElement>(null);

  // 차트 데이터/필터 변경 시 기본적으로 최신/오늘 날짜(맨 오른쪽)를 바라보도록 자동 스크롤
  useEffect(() => {
    if (chartScrollRef.current) {
      const timer = setTimeout(() => {
        if (chartScrollRef.current) {
          chartScrollRef.current.scrollLeft = chartScrollRef.current.scrollWidth;
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [timeSeriesData]);

  // KPI 요약 수치 (필터링된 데이터 기준)
  const totalOrdersCount = filteredOrders.length;
  const totalItemQty = filteredOrders.reduce((sum, o) => sum + (o.수량 || 1), 0);
  const topPlatform = platformData[0]?.name || '-';
  const topProduct = productData[0]?.name || '-';
  const topRegion = regionData[0]?.name || '-';

  return (
    <div className="space-y-6">
      
      {/* 타이틀 및 통합 기간 필터 컨트롤바 */}
      <div className="bg-white text-slate-900 border border-slate-200 p-5 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-brand-50 text-brand-600 rounded-lg border border-brand-200">
                <TrendingUp className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-slate-900">통합 출고 시각화 리포트</h2>
            </div>
            <p className="text-xs text-slate-600 pl-9">
              기간을 선택하거나 캘린더 모달에서 날짜를 지정하면 모든 차트와 리포트가 실시간 업데이트됩니다.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto text-xs">
            <span className="text-slate-500">전체 수집 데이터:</span>
            <span className="font-extrabold text-amber-700 text-sm">{orders.length.toLocaleString()}건</span>
          </div>
        </div>

        {/* 1일 / 1주 / 1달 / 사용자 지정 버튼 그룹 및 우측 세부 기간 지정 / 캘린더 버튼 */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-200 mt-2 text-xs">
          {/* 왼쪽: 필터 프리셋 버튼 모음 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1 shrink-0">
              <Filter className="w-3.5 h-3.5 text-brand-600" />
              조회 기간:
            </span>

            <button
              onClick={() => setDateFilterType('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                dateFilterType === 'all'
                  ? 'bg-brand-600 text-white shadow-xs ring-1 ring-brand-400'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              전체 ({orders.length}건)
            </button>

            <button
              onClick={() => setDateFilterType('1d')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                dateFilterType === '1d'
                  ? 'bg-brand-600 text-white shadow-xs ring-1 ring-brand-400'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              1일별
            </button>

            <button
              onClick={() => setDateFilterType('1w')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                dateFilterType === '1w'
                  ? 'bg-brand-600 text-white shadow-xs ring-1 ring-brand-400'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              1주일별
            </button>

            <button
              onClick={() => setDateFilterType('1m')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                dateFilterType === '1m'
                  ? 'bg-brand-600 text-white shadow-xs ring-1 ring-brand-400'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              1달별
            </button>

            <button
              onClick={() => setDateFilterType('custom')}
              className={`px-3.5 py-1.5 text-xs font-extrabold rounded-xl transition cursor-pointer ${
                dateFilterType === 'custom'
                  ? 'bg-amber-500 text-slate-900 shadow-xs ring-1 ring-amber-300'
                  : 'bg-slate-100 text-amber-700 hover:bg-slate-200'
              }`}
            >
              사용자 지정
            </button>
          </div>

          {/* 오른쪽: 기간 선택 입력 + 오늘 버튼 + 표시 건수 + 우측 캘린더 버튼 */}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {/* 오늘 날짜 즉시 지정 버튼 */}
            <button
              onClick={() => {
                const todayStr = new Date().toISOString().slice(0, 10);
                setTargetBaseDate(todayStr);
                setCustomStartDate(todayStr);
                setCustomEndDate(todayStr);
              }}
              className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer shrink-0 flex items-center gap-1"
              title="오늘 날짜로 설정"
            >
              오늘
            </button>

            {dateFilterType === '1d' || dateFilterType === '1w' || dateFilterType === '1m' ? (
              <div className="flex items-center gap-2 bg-slate-50 p-1 px-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-500 font-medium text-xs shrink-0">기준일:</span>
                <input
                  type="date"
                  value={targetBaseDate}
                  onChange={(e) => setTargetBaseDate(e.target.value)}
                  className="relative bg-white text-amber-700 font-mono font-bold px-2.5 py-1 rounded-lg border border-slate-200 outline-none cursor-pointer text-xs [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer hover:border-amber-400/70 transition"
                />
                {(dateFilterType === '1w' || dateFilterType === '1m') && (
                  <span className="text-[#9CC7B5] font-mono font-extrabold text-xs bg-[#0A2A22]/90 px-2 py-1 rounded-lg border border-brand-800/80 shrink-0">
                    적용 기간: {activeRangeText.label}
                  </span>
                )}
              </div>
            ) : dateFilterType === 'custom' ? (
              <div className="flex items-center gap-1.5 bg-slate-50 p-1 px-2.5 rounded-xl border border-slate-200">
                <input
                  type="date"
                  value={customStartDate}
                  max={customEndDate || undefined}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomStartDate(val);
                    if (customEndDate && val > customEndDate) {
                      setCustomEndDate(val);
                    }
                  }}
                  className="relative bg-white text-amber-700 font-mono font-bold px-2.5 py-1 rounded-lg border border-slate-200 outline-none cursor-pointer text-xs [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer hover:border-amber-400/70 transition"
                />
                <span className="text-amber-400 font-bold px-0.5 text-xs">~</span>
                <input
                  type="date"
                  value={customEndDate}
                  min={customStartDate || undefined}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomEndDate(val);
                    if (customStartDate && val < customStartDate) {
                      setCustomStartDate(val);
                    }
                  }}
                  className="relative bg-white text-amber-700 font-mono font-bold px-2.5 py-1 rounded-lg border border-slate-200 outline-none cursor-pointer text-xs [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer hover:border-amber-400/70 transition"
                />
              </div>
            ) : null}

            {/* 표시 건수 배지 */}
            <div className="text-[#9CC7B5] font-extrabold bg-[#0A2A22]/90 px-2.5 py-1.5 rounded-xl border border-brand-800/80 shrink-0">
              {totalOrdersCount}건
            </div>

            {/* 캘린더 보기 우측 보조 버튼 */}
            <button
              onClick={() => setIsCalendarModalOpen(true)}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-amber-700 hover:text-amber-800 font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 border border-slate-200 shrink-0"
              title="캘린더 달력 보기"
            >
              <CalendarDays className="w-3.5 h-3.5 text-amber-700" />
              <span>캘린더</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI 주요 요약 카드 4종 (필터링 데이터 반영) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        
        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>필터링 출고 건수</span>
            <div className="p-1.5 bg-brand-50 text-brand-600 rounded-md">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{totalOrdersCount.toLocaleString()}건</div>
            <div className="text-xs text-brand-600 font-semibold mt-0.5">총 {totalItemQty.toLocaleString()}개 수량</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>1위 최다 출고 쇼핑몰</span>
            <div className="p-1.5 bg-sky-50 text-sky-600 rounded-md">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900 truncate" title={topPlatform}>{topPlatform}</div>
            <div className="text-xs text-sky-600 font-semibold mt-0.5">
              {platformData[0]?.count || 0}건 ({totalOrdersCount > 0 ? Math.round(((platformData[0]?.count || 0) / totalOrdersCount) * 100) : 0}%)
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>1위 최다 판매 상품</span>
            <div className="p-1.5 bg-purple-50 text-purple-600 rounded-md">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900 truncate" title={topProduct}>{topProduct}</div>
            <div className="text-xs text-purple-600 font-semibold mt-0.5">
              총 {productData[0]?.totalQty || 0}개 출고
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>1위 배송 집중 지역</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-md">
              <MapPin className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900">{topRegion}</div>
            <div className="text-xs text-emerald-600 font-semibold mt-0.5">
              {regionData[0]?.value || 0}건 ({totalOrdersCount > 0 ? Math.round(((regionData[0]?.value || 0) / totalOrdersCount) * 100) : 0}%)
            </div>
          </div>
        </div>

      </div>

      {/* 차트 세션 Grid (2개 열) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: 쇼핑몰별 출고 건수 (Bar Chart) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-brand-600" />
              <h3 className="text-sm font-bold text-slate-800">쇼핑몰별 출고 물량 비교</h3>
            </div>
            <span className="text-xs text-slate-500">단위: 건</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const count = data.count || 0;
                      const totalQty = data.totalQty || count;
                      const pct = totalOrdersCount > 0 ? ((count / totalOrdersCount) * 100).toFixed(1) : '0';
                      return (
                        <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-xl border border-slate-700 shadow-xl text-xs space-y-1.5 min-w-[170px]">
                          <div className="font-bold text-amber-300 text-sm flex items-center gap-1.5 border-b border-slate-700/80 pb-1">
                            <span> {data.name}</span>
                          </div>
                          <div className="text-slate-200 flex items-center justify-between pt-0.5 gap-3">
                            <span className="text-slate-400">출고 물량:</span>
                            <span className="font-extrabold text-sky-300 text-sm">{count.toLocaleString()}건</span>
                          </div>
                          <div className="text-slate-300 flex items-center justify-between text-xs">
                            <span className="text-slate-400">전체 점유율:</span>
                            <span className="font-semibold text-emerald-300">{pct}%</span>
                          </div>
                          <div className="text-slate-300 flex items-center justify-between text-xs">
                            <span className="text-slate-400">총 상품 수량:</span>
                            <span className="font-semibold text-brand-200">{totalQty.toLocaleString()}개</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {platformData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 max-h-28 overflow-y-auto">
            {platformData.map((p, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="text-slate-700 font-medium truncate">{p.name}</span>
                </div>
                <span className="font-bold text-slate-900 ml-1">{p.count}건</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 2: 정제 후 단어(정제 상품명) 기준 품목별 판매 물량 시각화 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-purple-600" />
              <h3 className="text-sm font-bold text-slate-800">품목별 판매 물량 (정제 단어 기준)</h3>
            </div>
            <span className="text-xs text-purple-600 font-semibold bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
              상위 {Math.min(10, productData.length)}개 품목
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                layout="vertical" 
                data={productData.slice(0, 8)} 
                margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fontSize: 10, fill: '#334155' }} 
                  width={90}
                  tickFormatter={(value) => value.length > 8 ? `${value.substring(0, 8)}...` : value}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(147, 51, 234, 0.08)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-xl border border-slate-700 shadow-xl text-xs space-y-1.5 min-w-[180px]">
                          <div className="font-bold text-purple-300 text-sm break-words max-w-xs leading-snug">
                            {data.name}
                          </div>
                          <div className="text-slate-200 flex items-center justify-between border-t border-slate-700/80 pt-1.5 gap-2">
                            <span className="text-slate-300">총 판매 수량:</span>
                            <span className="font-extrabold text-amber-300 text-sm">{data.totalQty}개</span>
                          </div>
                          <div className="text-slate-300 flex items-center justify-between text-xs">
                            <span>주문 건수:</span>
                            <span className="font-semibold text-purple-200">{data.orderCount}건</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="totalQty" radius={[0, 6, 6, 0]}>
                  {productData.slice(0, 8).map((_, index) => (
                    <Cell key={`cell-prod-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 max-h-28 overflow-y-auto">
            {productData.map((prod, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs p-1.5 rounded bg-purple-50/40 border border-purple-100/50">
                <span className="text-slate-700 font-medium truncate" title={prod.name}>
                  {prod.name}
                </span>
                <span className="font-bold text-purple-900 shrink-0 ml-1">
                  {prod.totalQty}개 <span className="text-slate-400 font-normal">({prod.orderCount}건)</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 3: 주요 배송 지역 물량 분포 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-800">전국 주요 배송 지역별 물량</h3>
            </div>
            <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
              상위 {Math.min(8, regionData.length)}개 지역
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                layout="vertical" 
                data={regionData.slice(0, 8)} 
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} 
                  width={60}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(16, 185, 129, 0.08)' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const val = Number(payload[0].value) || 0;
                      const pct = totalOrdersCount > 0 ? ((val / totalOrdersCount) * 100).toFixed(1) : '0';
                      return (
                        <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-xl border border-slate-700 shadow-xl text-xs space-y-1">
                          <div className="font-bold text-emerald-400 flex items-center gap-1.5 text-sm">
                            {label}
                          </div>
                          <div className="text-slate-200 flex items-center gap-1.5">
                            <span>배송 물량:</span>
                            <span className="font-extrabold text-white text-sm">{val}건</span>
                            <span className="text-emerald-300 font-semibold">({pct}%)</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {regionData.slice(0, 8).map((_, index) => (
                    <Cell key={`cell-reg-${index}`} fill={COLORS[(index + 1) % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 max-h-28 overflow-y-auto">
            {regionData.map((r, idx) => {
              const pct = totalOrdersCount > 0 ? Math.round((r.value / totalOrdersCount) * 100) : 0;
              return (
                <div key={idx} className="flex items-center justify-between text-xs p-1.5 rounded bg-emerald-50/40 border border-emerald-100/50">
                  <span className="text-slate-700 font-medium truncate">{r.name}</span>
                  <span className="font-bold text-emerald-900 shrink-0 ml-1">
                    {r.value}건 <span className="text-slate-400 font-normal">({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 4: 추이 차트 뷰 (하단 캘린더 구역은 전면 제거) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-800">
                일별 출고 물량 변화 추이 그래프
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAdjustPanel(!showAdjustPanel)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition flex items-center gap-1 cursor-pointer ${
                  showAdjustPanel 
                    ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>출고일자 보정/지정</span>
                {unassignedDateCount > 0 && (
                  <span className="ml-1 bg-rose-500 text-white text-xs px-1.5 py-0.2 rounded-full font-mono">
                    {unassignedDateCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* 수동 날짜 보정 패널 */}
          {showAdjustPanel && (
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-3 text-xs animate-fadeIn">
              <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                <div className="font-bold text-amber-900 flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-amber-700" />
                  <span>수집 주문 일괄 출고 날짜 보정</span>
                </div>
                <span className="text-amber-700 text-xs">
                  날짜 누락 건수: <strong>{unassignedDateCount}건</strong> / 전체 {orders.length}건
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-amber-900 font-semibold shrink-0">변경 지정 날짜:</span>
                  <input 
                    type="date"
                    value={bulkDateInput}
                    onChange={(e) => setBulkDateInput(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-slate-800 font-mono font-bold outline-none text-xs"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto ml-auto">
                  <button
                    onClick={() => handleApplyBulkDate(true)}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition cursor-pointer shadow-2xs"
                  >
                    누락건만 ({unassignedDateCount}건) 이 날짜로 보정
                  </button>

                  <button
                    onClick={() => handleApplyBulkDate(false)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg transition cursor-pointer shadow-2xs"
                  >
                    전체 주문 ({orders.length}건) 이 날짜로 일괄 변경
                  </button>

                  {Object.keys(customDateOverrides).length > 0 && (
                    <button
                      onClick={handleResetDateOverrides}
                      className="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg transition cursor-pointer"
                    >
                      초기화
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 추이 차트 그래프 (0건 포함 + 주식 차트 스타일 가로 스크롤) */}
          <div className="space-y-3">
            {/* 요약 칩 모음 (총일수, 일평균, 최고출고일, 0건 일수) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-col justify-between">
                <span className="text-slate-500 text-xs">총 조회 기간</span>
                <span className="font-extrabold text-slate-800 text-sm mt-0.5">
                  {timeSeriesData.length}일간
                </span>
              </div>
              <div className="bg-sky-50/60 p-2.5 rounded-xl border border-sky-100 flex flex-col justify-between">
                <span className="text-sky-700 text-xs">일평균 출고량</span>
                <span className="font-extrabold text-sky-800 text-sm mt-0.5">
                  약 {Math.round(totalOrdersCount / Math.max(1, timeSeriesData.length))}건 / 일
                </span>
              </div>
              <div className="bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-100 flex flex-col justify-between">
                <span className="text-emerald-700 text-xs">최고 출고일</span>
                <span className="font-extrabold text-emerald-800 text-sm mt-0.5 truncate">
                  {(() => {
                    if (timeSeriesData.length === 0) return '-';
                    const maxItem = [...timeSeriesData].sort((a, b) => b.count - a.count)[0];
                    return maxItem && maxItem.count > 0 ? `${maxItem.date} (${maxItem.count}건)` : '-';
                  })()}
                </span>
              </div>
              <div className="bg-rose-50/60 p-2.5 rounded-xl border border-rose-100 flex flex-col justify-between">
                <span className="text-rose-700 text-xs">출고 0건인 날</span>
                <span className="font-extrabold text-rose-800 text-sm mt-0.5">
                  {timeSeriesData.filter(d => d.count === 0).length}일
                </span>
              </div>
            </div>

            {/* 가로 스크롤 차트 영역 */}
            <div 
              ref={chartScrollRef}
              className="w-full overflow-x-auto p-2 pt-3 scrollbar-thin"
            >
              <div 
                className="h-64"
                style={{
                  minWidth: `${Math.max(650, timeSeriesData.length * 36)}px`
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeSeriesData} margin={{ top: 15, right: 20, left: -10, bottom: 10 }}>
                    <defs>
                      <linearGradient id="stockGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0284c7" stopOpacity={0.45}/>
                        <stop offset="95%" stopColor="#0284c7" stopOpacity={0.02}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#e2e8f0" opacity={0.7} />
                    <XAxis 
                      dataKey="date" 
                      tick={false}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1' }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                    <Tooltip 
                      cursor={{ stroke: '#0284c7', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-xl border border-slate-700 shadow-xl text-xs space-y-1 min-w-[150px]">
                              <div className="font-bold text-amber-300 text-xs border-b border-slate-700/80 pb-1">
                                {data.fullDate} ({data.dayOfWeek || ''})
                              </div>
                              <div className="text-slate-200 flex items-center justify-between pt-1">
                                <span className="text-slate-400">출고 물량:</span>
                                <span className={`font-extrabold text-sm ${data.count > 0 ? 'text-sky-300' : 'text-slate-400'}`}>
                                  {data.count}건
                                </span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="count" 
                      stroke="#0284c7" 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#stockGradient)" 
                      dot={timeSeriesData.length <= 40 ? { r: 3, fill: '#0284c7', strokeWidth: 1, stroke: '#fff' } : false}
                      activeDot={{ r: 6, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="text-xs text-slate-400 text-right flex items-center justify-end gap-1">
              <span> 가로 스크롤로 일별 출고 흐름을 자세히 확인하세요</span>
            </div>
          </div>

        </div>

      </div>

      {/* 팝업 캘린더 모달 (Modal Popup) */}
      {isCalendarModalOpen && (
        <Modal
          onClose={() => setIsCalendarModalOpen(false)}
          title="기간 고르기"
          description="날짜를 누르면 그 기간의 출고 기록으로 리포트가 바뀌어요."
          icon={<CalendarDays className="w-4 h-4" />}
          iconTone="brand"
          size="lg"
          footerStart={
            <button
              type="button"
              onClick={() => {
                setDateFilterType('all');
                setIsCalendarModalOpen(false);
              }}
              className="text-[13px] font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900 cursor-pointer"
            >
              전체 기간으로 되돌리기
            </button>
          }
          footer={
            <button
              type="button"
              onClick={() => {
                if (customStartDate === customEndDate) {
                  setDateFilterType('1d');
                  setTargetBaseDate(customStartDate);
                } else {
                  setDateFilterType('custom');
                }
                setIsCalendarModalOpen(false);
              }}
              className={btn.primary}
            >
              <Check className="w-4 h-4" />이 기간으로 보기
            </button>
          }
        >
            <div className="space-y-4">
              
              {/* 캘린더 상단 월 이동 및 퀵 프리셋 버튼 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h4 className="text-base font-semibold text-slate-900 tracking-tight">
                    {currentYearMonth.year}년 {currentYearMonth.month}월
                  </h4>
                  <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-slate-200">
                    <button
                      onClick={handlePrevMonth}
                      className="p-1 hover:bg-slate-100 rounded-md transition text-slate-600 cursor-pointer"
                      title="이전 달"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleNextMonth}
                      className="p-1 hover:bg-slate-100 rounded-md transition text-slate-600 cursor-pointer"
                      title="다음 달"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 빠른 퀵선택 버튼 */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 mr-1">빠르게</span>
                  <button
                    onClick={() => {
                      setDateFilterType('1d');
                      setTargetBaseDate(latestOrderDate);
                      setIsCalendarModalOpen(false);
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-700 font-medium cursor-pointer"
                  >
                    마지막 날
                  </button>
                  <button
                    onClick={() => {
                      setDateFilterType('1w');
                      setTargetBaseDate(latestOrderDate);
                      setIsCalendarModalOpen(false);
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-700 font-medium cursor-pointer"
                  >
                    최근 7일
                  </button>
                  <button
                    onClick={() => {
                      setDateFilterType('1m');
                      setTargetBaseDate(latestOrderDate);
                      setIsCalendarModalOpen(false);
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-700 font-medium cursor-pointer"
                  >
                    최근 30일
                  </button>
                </div>
              </div>

              {/* 요일 헤더 */}
              <div className="grid grid-cols-7 text-center text-[12px] font-semibold text-slate-500 py-1">
                <span className="text-rose-600">일</span>
                <span>월</span>
                <span>화</span>
                <span>수</span>
                <span>목</span>
                <span>금</span>
                <span className="text-sky-600">토</span>
              </div>

              {/* 7열 캘린더 달력 그리드 */}
              <div className="grid grid-cols-7 border border-slate-200 rounded-xl overflow-hidden divide-x divide-y divide-slate-100 bg-white">
                {monthCalendarData.map((d, idx) => {
                  const isStart = d.dateStr === customStartDate;
                  const isEnd = d.dateStr === customEndDate;
                  const isInCustomRange = customStartDate && customEndDate && d.dateStr >= customStartDate && d.dateStr <= customEndDate;
                  const isSelectedBase = dateFilterType === '1d' && targetBaseDate === d.dateStr;
                  const isSelected = isSelectedBase || isStart || isEnd;
                  const isRangeMid = isInCustomRange && !isStart && !isEnd;

                  const isSun = idx % 7 === 0;
                  const isSat = idx % 7 === 6;

                  return (
                    <button
                      key={idx}
                      onClick={() => handleCalendarDayClick(d.dateStr)}
                      className={`min-h-[68px] sm:min-h-[76px] p-2 flex flex-col justify-between text-left transition cursor-pointer relative ${
                        isSelected
                          ? 'bg-brand-600 text-white font-semibold z-10'
                          : isRangeMid
                          ? 'bg-brand-50 text-brand-900'
                          : !d.isCurrentMonth
                          ? 'bg-slate-50/50 text-slate-300 hover:bg-slate-100/50'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={`text-xs font-bold ${
                            isSelected
                              ? 'text-white font-black'
                              : isRangeMid
                              ? 'text-[#0F3A2F] font-extrabold'
                              : !d.isCurrentMonth
                              ? 'text-slate-300'
                              : isSun
                              ? 'text-rose-500'
                              : isSat
                              ? 'text-sky-600'
                              : 'text-slate-700'
                          }`}
                        >
                          {d.dayNumber}일
                        </span>
                        {d.isToday && (
                          <span className={`text-xs px-1 py-0.2 rounded font-bold ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-900'
                          }`}>
                            오늘
                          </span>
                        )}
                      </div>

                      <div className="mt-1 text-right">
                        {d.count > 0 ? (
                          <div className={`inline-block px-1.5 py-0.5 rounded-md font-extrabold text-xs ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : isRangeMid
                              ? 'bg-brand-100 text-brand-900'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {d.count}건
                          </div>
                        ) : (
                          <span className={`text-xs font-normal ${isSelected ? 'text-brand-200' : 'text-slate-300'}`}>
                            0건
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 현재 선택 상태 안내 */}
              <div className="flex flex-col gap-1 rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between">
                <span className="text-slate-700">
                  고른 기간 <b className="ml-1 font-semibold tabular-nums text-slate-900">{customStartDate || '안 고름'} ~ {customEndDate || '안 고름'}</b>
                </span>
                <span className="text-slate-500">날짜를 누르면 시작일과 종료일로 기간을 정할 수 있어요.</span>
              </div>

            </div>
        </Modal>
      )}

    </div>
  );
}
