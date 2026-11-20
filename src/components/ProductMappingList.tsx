import React, { useState, useRef } from 'react';
import { ProductMapping } from '../types';
import { 
  Search, Plus, Trash2, Edit2, Check, X, FileText, ClipboardList, Database,
  Filter, AlertTriangle, Download, Upload, FileSpreadsheet, 
  FileCode, ArrowLeft, CheckCircle2, Copy, Layers, List, Lightbulb, Zap, Info,
  ArrowRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { findBestIntelligentMatch, calculateSmartSimilarity, extractCleanProductRecommendation } from '../utils/excelProcessor';

interface ProductMappingListProps {
  mappings: ProductMapping[];
  onChange: (updated: ProductMapping[]) => void;
  defaultRawNames?: string[];
}

type ViewMode = 'list' | 'single_add' | 'bulk_add';

interface SmartMatchCandidate {
  rawName: string;
  currentMapped: string;
  suggestedMapped: string;
  confidence: number;
  reason: string;
  selected: boolean;
}

export default function ProductMappingList({ mappings, onChange, defaultRawNames }: ProductMappingListProps) {
  // 뷰 모드 ('list': 목록보기 | 'single_add': 개별 추가 | 'bulk_add': 대량 추가)
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // 검색 및 필터
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'hasMapped' | 'noMapped'>('all');

  // 개별 추가 폼
  const [newRawName, setNewRawName] = useState('');
  const [newMappedName, setNewMappedName] = useState('');
  const [recentlyAdded, setRecentlyAdded] = useState<ProductMapping[]>([]);

  // 테이블 내 항목 수정
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editRawName, setEditRawName] = useState('');
  const [editMappedName, setEditMappedName] = useState('');

  // 벌크 텍스트 & 파일 업로드
  const [bulkText, setBulkText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 알림 & 모달
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<string | null>(null);
  const [selectedRawNames, setSelectedRawNames] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState<{
    isOpen: boolean;
    type: 'selected' | 'all';
    count: number;
  } | null>(null);

  // 벌크 / 파일 파싱 후 적용 확인 모달
  const [bulkImportConfirm, setBulkImportConfirm] = useState<{
    isOpen: boolean;
    parsed: ProductMapping[];
  } | null>(null);

  // 내보내기 드롭다운
  const [showExportMenu, setShowExportMenu] = useState(false);

  // 자동 맞춤 모달 상태
  const [showSmartMatchModal, setShowSmartMatchModal] = useState(false);
  const [smartCandidates, setSmartCandidates] = useState<SmartMatchCandidate[]>([]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // 추천 산출 유틸리티
  const getSmartSuggestion = (rawInput: string) => {
    if (!rawInput || rawInput.trim().length < 2) return null;
    const match = findBestIntelligentMatch(rawInput, mappings);
    if (match.bestMapping && match.bestMapping.mappedName && match.score >= 0.55) {
      return {
        suggestedName: match.bestMapping.mappedName,
        confidence: Math.round(match.score * 100)
      };
    }
    return null;
  };

  // 자동 맞춤 실행
  const handleRunSmartMatching = () => {
    const existingMappedNames = Array.from(new Set(mappings.map(m => m.mappedName).filter(Boolean)));
    
    if (existingMappedNames.length === 0) {
      showNotification('error', "자동으로 맞추려면 바꿀 이름이 하나 이상 있어야 해요.");
      return;
    }

    const candidates: SmartMatchCandidate[] = [];
    const processedRaws = new Set<string>();

    mappings.forEach(item => {
      processedRaws.add(item.rawName);
      const result = findBestIntelligentMatch(item.rawName, mappings);
      if (result.bestMapping && result.bestMapping.mappedName && result.bestMapping.mappedName !== item.mappedName) {
        if (result.score >= 0.55) {
          candidates.push({
            rawName: item.rawName,
            currentMapped: item.mappedName || '(그대로)',
            suggestedMapped: result.bestMapping.mappedName,
            confidence: Math.round(result.score * 100),
            reason: result.matchType === 'smart_mapped' ? '이미 있는 이름과 비슷해요' : '비슷한 상품이 있어요',
            selected: true
          });
        }
      }
    });

    if (defaultRawNames && defaultRawNames.length > 0) {
      defaultRawNames.forEach(raw => {
        if (!processedRaws.has(raw)) {
          const result = findBestIntelligentMatch(raw, mappings);
          if (result.bestMapping && result.bestMapping.mappedName && result.score >= 0.55) {
            candidates.push({
              rawName: raw,
              currentMapped: '(새 상품)',
              suggestedMapped: result.bestMapping.mappedName,
              confidence: Math.round(result.score * 100),
              reason: '자동 추천',
              selected: true
            });
          }
        }
      });
    }

    if (candidates.length === 0) {
      showNotification('success', "자동으로 맞출 새 상품이 없어요.");
      return;
    }

    setSmartCandidates(candidates);
    setShowSmartMatchModal(true);
  };

  const applySmartCandidates = () => {
    const selectedToApply = smartCandidates.filter(c => c.selected);
    if (selectedToApply.length === 0) {
      showNotification('error', "고른 항목이 없어요.");
      return;
    }

    const updatedMap = new Map<string, string>();
    mappings.forEach(m => updatedMap.set(m.rawName, m.mappedName));

    selectedToApply.forEach(c => {
      updatedMap.set(c.rawName, c.suggestedMapped);
    });

    const nextMappings: ProductMapping[] = [];
    updatedMap.forEach((mappedName, rawName) => {
      nextMappings.push({ rawName, mappedName });
    });

    onChange(nextMappings);
    setShowSmartMatchModal(false);
    showNotification('success', `${selectedToApply.length}개 상품에 바꿀 이름을 넣었어요.`);
  };

  // 대치 목록 필터링
  const filteredMappings = mappings.filter(item => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (
      item.rawName.toLowerCase().includes(q) ||
      item.mappedName.toLowerCase().includes(q)
    );
    if (!matchesSearch) return false;

    if (filterType === 'hasMapped') return !!item.mappedName;
    if (filterType === 'noMapped') return !item.mappedName;
    return true;
  });

  // 개별 추가 핸들러
  const handleSingleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRawName.trim()) return;

    const trimmedRaw = newRawName.trim();
    const trimmedMapped = newMappedName.trim();

    const exists = mappings.some(m => m.rawName.trim() === trimmedRaw);
    if (exists) {
      showNotification('error', "이미 품목사전에 있는 상품명이에요.");
      return;
    }

    const newItem = { rawName: trimmedRaw, mappedName: trimmedMapped };
    const updated = [newItem, ...mappings];
    onChange(updated);

    setRecentlyAdded(prev => [newItem, ...prev].slice(0, 5));
    setNewRawName('');
    setNewMappedName('');
    showNotification('success', `'${trimmedRaw}'을(를) 품목사전에 넣었어요.`);
  };

  // 단일 항목 삭제
  const executeDelete = (rawName: string) => {
    const nextSelected = new Set(selectedRawNames);
    nextSelected.delete(rawName);
    setSelectedRawNames(nextSelected);

    onChange(mappings.filter(m => m.rawName !== rawName));
    setSingleDeleteTarget(null);
    showNotification('success', `'${rawName}'을(를) 지웠어요.`);
  };

  // 다중 선택 처리
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRawNames(new Set(filteredMappings.map(m => m.rawName)));
    } else {
      setSelectedRawNames(new Set());
    }
  };

  const handleSelectRow = (rawName: string, checked: boolean) => {
    const next = new Set(selectedRawNames);
    if (checked) next.add(rawName);
    else next.delete(rawName);
    setSelectedRawNames(next);
  };

  // 선택 삭제 / 전체 삭제
  const executeDeleteSelected = () => {
    const nextMappings = mappings.filter(m => !selectedRawNames.has(m.rawName));
    onChange(nextMappings);
    setSelectedRawNames(new Set());
    setShowDeleteModal(null);
    showNotification('success', `${selectedRawNames.size}개를 지웠어요.`);
  };

  const executeDeleteAll = () => {
    onChange([]);
    setSelectedRawNames(new Set());
    setShowDeleteModal(null);
    showNotification('success', "품목사전을 모두 지웠어요.");
  };

  // ESC 키로 모달 닫기
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSmartMatchModal) {
          setShowSmartMatchModal(false);
          return;
        }
        if (bulkImportConfirm) {
          setBulkImportConfirm(null);
          return;
        }
        if (showDeleteModal) {
          setShowDeleteModal(null);
          return;
        }
        if (singleDeleteTarget) {
          setSingleDeleteTarget(null);
          return;
        }
        if (editingIndex !== null) {
          setEditingIndex(null);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSmartMatchModal, bulkImportConfirm, showDeleteModal, singleDeleteTarget, editingIndex]);

  // 테이블 내 인라인 수정
  const startEdit = (globalIdx: number, item: ProductMapping) => {
    setEditingIndex(globalIdx);
    setEditRawName(item.rawName);
    setEditMappedName(item.mappedName);
  };

  const saveEdit = (globalIdx: number) => {
    if (!editRawName.trim()) return;

    const updated = [...mappings];
    updated[globalIdx] = {
      rawName: editRawName.trim(),
      mappedName: editMappedName.trim()
    };
    onChange(updated);
    setEditingIndex(null);
    showNotification('success', "고쳤어요.");
  };

  // --- 텍스트 / 파일 파싱 로직 ---
  const parseRawText = (text: string): ProductMapping[] => {
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

    return parsed;
  };

  // 대량 텍스트 파싱 적용 버튼
  const handleApplyBulkText = () => {
    if (!bulkText.trim()) {
      showNotification('error', "넣을 내용이 없어요.");
      return;
    }

    const parsed = parseRawText(bulkText);
    if (parsed.length === 0) {
      showNotification('error', "넣을 내용을 찾지 못했어요. 한 줄에 '원래 상품명, 바꿀 이름'으로 적어 주세요.");
      return;
    }

    setBulkImportConfirm({ isOpen: true, parsed });
  };

  // 파일 업로드 처리
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
            json.forEach(item => {
              const raw = item.rawName || item['원본'] || item['원본상품명'] || item['raw'] || '';
              const mapped = item.mappedName || item['대치'] || item['표준상품명'] || item['mapped'] || '';
              if (raw) parsed.push({ rawName: String(raw).trim(), mappedName: String(mapped).trim() });
            });
          }
          if (parsed.length > 0) {
            setBulkImportConfirm({ isOpen: true, parsed });
          } else {
            showNotification('error', "JSON 파일에서 넣을 내용을 찾지 못했어요.");
          }
        } catch {
          showNotification('error', "JSON 파일 모양이 맞지 않아요.");
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

            // 헤더 행 건너뛰기
            if (idx === 0 && (col0.includes('원본') || col0.includes('raw') || col0.includes('상품명'))) {
              return;
            }

            if (col0 && !seen.has(col0)) {
              seen.add(col0);
              parsed.push({ rawName: col0, mappedName: col1 });
            }
          });

          if (parsed.length > 0) {
            setBulkImportConfirm({ isOpen: true, parsed });
          } else {
            showNotification('error', "엑셀·CSV 파일에서 넣을 내용을 찾지 못했어요. 첫 칸에 상품명, 둘째 칸에 바꿀 이름이 있는지 확인해 주세요.");
          }
        } catch {
          showNotification('error', "파일을 읽지 못했어요.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // txt 또는 텍스트 파일
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setBulkText(text);
        const parsed = parseRawText(text);
        if (parsed.length > 0) {
          setBulkImportConfirm({ isOpen: true, parsed });
        } else {
          showNotification('error', "텍스트 파일에서 넣을 내용을 찾지 못했어요.");
        }
      };
      reader.readAsText(file);
    }

    e.target.value = '';
  };

  // 대량 파싱 수락 결정을 목록에 반영
  const handleBulkConfirmDecision = (overwrite: boolean) => {
    if (!bulkImportConfirm) return;
    const { parsed } = bulkImportConfirm;

    if (overwrite) {
      onChange(parsed);
      showNotification('success', `품목사전을 ${parsed.length}개로 바꿨어요.`);
    } else {
      const merged = [...mappings];
      let addedCount = 0;
      parsed.forEach(p => {
        if (!merged.some(m => m.rawName === p.rawName)) {
          merged.push(p);
          addedCount++;
        }
      });
      onChange(merged);
      showNotification('success', `${addedCount}개를 새로 넣었어요.`);
    }

    setBulkImportConfirm(null);
    setBulkText('');
    setViewMode('list');
  };

  // --- 내보내기 (Export) 핸들러 ---
  const handleExportExcel = () => {
    if (mappings.length === 0) {
      showNotification('error', "내보낼 내용이 없어요.");
      return;
    }
    const data = mappings.map(m => ({
      '원본 상품명 키워드': m.rawName,
      '정제 후 표준 상품명': m.mappedName
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "품목사전");
    XLSX.writeFile(wb, `품목사전_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setShowExportMenu(false);
    showNotification('success', "엑셀 파일로 내보냈어요.");
  };

  const handleExportCSV = () => {
    if (mappings.length === 0) {
      showNotification('error', "내보낼 내용이 없어요.");
      return;
    }
    const data = mappings.map(m => ({
      '원본 상품명 키워드': m.rawName,
      '정제 후 표준 상품명': m.mappedName
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `품목사전_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
    showNotification('success', "CSV 파일로 내보냈어요.");
  };

  const handleExportJSON = () => {
    if (mappings.length === 0) {
      showNotification('error', "내보낼 내용이 없어요.");
      return;
    }
    const jsonStr = JSON.stringify(mappings, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `품목사전_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
    showNotification('success', "JSON 파일로 내보냈어요.");
  };

  const handleCopyClipboardText = () => {
    if (mappings.length === 0) {
      showNotification('error', "복사할 내용이 없어요.");
      return;
    }
    const text = mappings.map(m => `'${m.rawName}' : '${m.mappedName}',`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      showNotification('success', "모두 글자로 복사했어요.");
      setShowExportMenu(false);
    });
  };

  return (
    <div id="product-mapping-container" className="space-y-6">
      
      {/* 알림 토스트 배너 */}
      {toastMsg && (
        <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-sm animate-fade-in ${
          toastMsg.type === 'error' 
            ? 'bg-rose-50 border-rose-200 text-rose-800' 
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          <div className="flex items-center gap-2">
            {toastMsg.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-slate-500 hover:text-slate-700">✕</button>
        </div>
      )}

      {/* 숨겨진 파일 선택 Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls,.csv,.json,.txt"
        className="hidden"
      />

      {/* 대량 추가 파싱 결과 확인 모달 */}
      {bulkImportConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-100">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Layers className="w-5 h-5 text-brand-600" />
              여러 개 한 번에 넣기
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              분석 결과 <strong className="text-brand-600 font-bold">{bulkImportConfirm.parsed.length}개</strong>를 읽었어요. 
              지금 목록에 어떻게 넣을까요?
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => handleBulkConfirmDecision(false)}
                className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                지금 목록에 더하기
              </button>
              <button
                onClick={() => handleBulkConfirmDecision(true)}
                className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold transition shadow-md"
              >
                지금 목록을 지우고 바꾸기
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={() => setBulkImportConfirm(null)}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 단일 항목 삭제 확인 모달 */}
      {singleDeleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 border border-slate-100">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-1.5 text-rose-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              지우기
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              '<strong className="text-slate-800">{singleDeleteTarget}</strong>'을(를) 지울까요?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSingleDeleteTarget(null)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                취소
              </button>
              <button
                onClick={() => executeDelete(singleDeleteTarget)}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition shadow-md"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄/전체 삭제 재확인 모달 */}
      {showDeleteModal?.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 border border-slate-100">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-1.5 text-rose-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              {showDeleteModal.type === 'all' ? '모두 지우기' : '고른 것 지우기'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {showDeleteModal.type === 'all' 
                ? `품목사전 ${mappings.length}개를 모두 지울까요? 되돌릴 수 없어요.`
                : `고른 ${showDeleteModal.count}개를 지울까요?`
              }
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDeleteModal(null)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                취소
              </button>
              <button
                onClick={showDeleteModal.type === 'all' ? executeDeleteAll : executeDeleteSelected}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition shadow-md"
              >
                지우기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 자동 맞춤 결과 및 승인 모달 */}
      {showSmartMatchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 border border-slate-100 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-amber-500" />
                  바꿀 이름 추천 ({smartCandidates.length}건)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  이미 있는 이름과 비슷한 상품을 찾아 바꿀 이름을 골라 두었어요. 맞는 것만 체크하세요.
                </p>
              </div>
              <button
                onClick={() => setShowSmartMatchModal(false)}
                className="p-1.5 text-slate-500 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600 bg-amber-50/70 border border-amber-200/80 p-3 rounded-xl">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <span>체크한 상품에 바꿀 이름이 들어가요.</span>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSmartCandidates(prev => prev.map(c => ({ ...c, selected: true })))}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  전체 선택
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setSmartCandidates(prev => prev.map(c => ({ ...c, selected: false })))}
                  className="text-xs font-semibold text-slate-500 hover:underline"
                >
                  전체 해제
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {smartCandidates.map((cand, idx) => (
                <div
                  key={idx}
                  className={`p-3 text-xs flex items-center justify-between gap-3 hover:bg-slate-50 transition ${
                    cand.selected ? 'bg-brand-50/10' : 'opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={cand.selected}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSmartCandidates(prev => {
                          const copy = [...prev];
                          copy[idx] = { ...copy[idx], selected: checked };
                          return copy;
                        });
                      }}
                      className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-600 cursor-pointer shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800 truncate" title={cand.rawName}>
                        {cand.rawName}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span>현재: {cand.currentMapped}</span>
                        <span>•</span>
                        <span className="text-brand-600">{cand.reason}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-lg border border-[#E0EFE8]">
                      → {cand.suggestedMapped}
                    </span>
                    <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      {cand.confidence}% 일치
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end gap-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowSmartMatchModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={applySmartCandidates}
                className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5"
              >
                <Lightbulb className="w-4 h-4 text-amber-300" />
                체크한 것 넣기 ({smartCandidates.filter(c => c.selected).length}건)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 페이지 상단 헤더 & 모드 전환 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">품목사전</h2>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed max-w-[64ch]">
              쇼핑몰마다 다른 긴 상품명을 내가 쓰는 짧은 이름으로 바꿔요. 정리된 주문 파일과 보고서에 이 짧은 이름이 쓰여요.
            </p>
            <p className="mt-2 inline-flex flex-wrap items-center gap-x-2 rounded-lg bg-slate-50 px-3 py-1.5 text-[13px] text-slate-700">
              <span className="text-slate-500">예</span>
              <span>국내제조 비린맛 없는 절단 돌산 간장 꽃게장</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-label="바꾸면" />
              <span className="font-semibold text-brand-700">게장</span>
            </p>
          </div>

          {/* 우측 태그 제거 (상단 깔끔화) */}
        </div>

        {/* 메인 탭 모드 전환 버튼 (목록 보기 / 개별 추가 / 대량 추가) */}
        <div role="tablist" aria-label="품목사전 보기" className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setViewMode('list')}
            role="tab"
            aria-selected={viewMode === 'list'}
            className={`flex min-h-[40px] items-center gap-2 px-3.5 rounded-lg text-sm font-semibold transition ${
              viewMode === 'list'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <List className="w-4 h-4" />
            목록 <span className="font-mono tabular-nums text-xs opacity-80">{mappings.length}</span>
          </button>

          <button
            onClick={() => setViewMode('single_add')}
            role="tab"
            aria-selected={viewMode === 'single_add'}
            className={`flex min-h-[40px] items-center gap-2 px-3.5 rounded-lg text-sm font-semibold transition ${
              viewMode === 'single_add'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-4 h-4" />
            하나 넣기
          </button>

          <button
            onClick={() => setViewMode('bulk_add')}
            role="tab"
            aria-selected={viewMode === 'bulk_add'}
            className={`flex min-h-[40px] items-center gap-2 px-3.5 rounded-lg text-sm font-semibold transition ${
              viewMode === 'bulk_add'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            여러 개 한 번에 넣기
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. 개별 추가 모드 (viewMode === 'single_add') - 기존 목록 안보임 */}
      {/* ========================================================= */}
      {viewMode === 'single_add' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-2xl mx-auto space-y-6 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Plus className="w-5 h-5 text-brand-600" />
                하나 넣기
              </h3>
              <p className="text-sm text-slate-600 mt-0.5">상품명에 들어 있는 말과 바꿀 이름을 적어요.</p>
            </div>
            <button
              onClick={() => setViewMode('list')}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              목록으로 돌아가기
            </button>
          </div>

          <form onSubmit={handleSingleAdd} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                상품명에 들어 있는 말 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="예: 국내제조 비린맛 없는 절단 돌산 간장 꽃게장"
                value={newRawName}
                onChange={(e) => setNewRawName(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
              />
              
              {/* 추천 스마트 실시간 태그 */}
              {getSmartSuggestion(newRawName) && (
                <button
                  type="button"
                  onClick={() => {
                    const sugg = getSmartSuggestion(newRawName);
                    if (sugg) setNewMappedName(sugg.suggestedName);
                  }}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 border border-brand-200 hover:border-brand-400 text-[#0F3A2F] rounded-xl text-xs font-semibold transition group cursor-pointer"
                >
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span> 추천: <strong className="text-brand-700">'{getSmartSuggestion(newRawName)?.suggestedName}'</strong> (유사도 {getSmartSuggestion(newRawName)?.confidence}%)</span>
                  <span className="ml-1 text-xs text-brand-600 underline font-normal group-hover:font-bold">[눌러서 넣기]</span>
                </button>
              )}

              <p className="text-xs text-slate-400 mt-1">상품명에 이 말이 들어 있으면 오른쪽 이름으로 바꿔요. 상품명을 통째로 넣어도 돼요.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                바꿀 이름
              </label>
              <input
                type="text"
                placeholder={newRawName ? `추천: "${extractCleanProductRecommendation(newRawName)}"` : "예: 게장"}
                value={newMappedName}
                onChange={(e) => setNewMappedName(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 placeholder:text-slate-400/80 placeholder:italic font-medium"
              />
              {newRawName && extractCleanProductRecommendation(newRawName) && (
                <button
                  type="button"
                  onClick={() => setNewMappedName(extractCleanProductRecommendation(newRawName))}
                  className="mt-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-2.5 py-1 flex items-center gap-1 transition"
                >
                  <Lightbulb className="w-3 h-3 text-amber-500" />
                  추천 이름 넣기: <strong>'{extractCleanProductRecommendation(newRawName)}'</strong>
                </button>
              )}
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="submit"
                className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition shadow-md"
              >
                품목사전에 넣기
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                완료 후 목록으로
              </button>
            </div>
          </form>

          {/* 이번 세션에서 새로 추가된 항목 내역 */}
          {recentlyAdded.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-600 mb-2">방금 넣은 것</h4>
              <div className="space-y-1.5">
                {recentlyAdded.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl text-xs border border-slate-100">
                    <span className="font-semibold text-slate-800">{item.rawName}</span>
                    <span className="text-brand-600 font-bold">→ {item.mappedName || '(그대로)'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. 대량 추가 모드 (viewMode === 'bulk_add') - 기존 목록 안보임 */}
      {/* ========================================================= */}
      {viewMode === 'bulk_add' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Layers className="w-5 h-5 text-brand-600" />
                여러 개 한 번에 넣기
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                엑셀 첫 칸에 원래 상품명, 둘째 칸에 바꿀 이름을 적은 파일을 올리거나, 아래 칸에 붙여 넣으세요.
              </p>
            </div>
            <button
              onClick={() => setViewMode('list')}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              목록으로 돌아가기
            </button>
          </div>

          {/* 파일 드롭존 / 선택 영역 */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-brand-200 hover:border-brand-400 bg-brand-50/30 hover:bg-brand-50/60 rounded-2xl p-6 text-center cursor-pointer transition group"
          >
            <Upload className="w-8 h-8 text-brand-600 group-hover:scale-110 transition-transform mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-700">
              눌러서 파일 고르기 (엑셀, CSV, JSON, TXT)
            </p>
            <p className="text-xs text-slate-400 mt-1">첫 칸: 원래 상품명 · 둘째 칸: 바꿀 이름</p>
          </div>

          {/* 텍스트 직접 입력 라벨 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700">직접 붙여 넣기</label>
              <span className="text-xs text-slate-400">한 줄에 하나씩 '원래 상품명, 바꿀 이름'. 엑셀에서 두 칸을 복사해 붙여 넣어도 돼요.</span>
            </div>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`국내제조 비린맛 없는 절단 돌산 간장 꽃게장, 게장\n명태품은 백명란, 명란`}
              rows={12}
              className="w-full text-xs font-mono p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => {
                setBulkText('');
                setViewMode('list');
              }}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
            >
              취소
            </button>
            <button
              onClick={handleApplyBulkText}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              읽어서 넣기
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. 목록 보기 모드 (viewMode === 'list') - 테이블 전체 표시 */}
      {/* ========================================================= */}
      {viewMode === 'list' && (
        <div className="space-y-4 animate-fade-in">
          
          {/* 검색 & 필터 & 선택 작업 바 */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-3.5">
            
            {/* 검색창 */}
            <div className="flex items-center gap-2 flex-1 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50/50">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="상품명이나 바꿀 이름으로 찾기"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs border-none outline-none bg-transparent text-slate-700"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-xs text-slate-500 hover:text-slate-700">
                  지우기
                </button>
              )}
            </div>

            {/* 필터 및 삭제 작업 */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <div className="flex items-center gap-1.5 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50/50">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={filterType}
                  onChange={(e) => {
                    setFilterType(e.target.value as any);
                    setSelectedRawNames(new Set());
                  }}
                  className="text-xs border-none bg-transparent focus:ring-0 text-slate-700 font-semibold py-0 pl-0 pr-6 outline-none"
                >
                  <option value="all">전체 ({mappings.length}개)</option>
                  <option value="hasMapped">바꿀 이름 있음 ({mappings.filter(m => m.mappedName).length})</option>
                  <option value="noMapped">비어 있음 ({mappings.filter(m => !m.mappedName).length})</option>
                </select>
              </div>

              {selectedRawNames.size > 0 && (
                <button
                  onClick={() => setShowDeleteModal({ isOpen: true, type: 'selected', count: selectedRawNames.size })}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-150 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  고른 것 지우기 ({selectedRawNames.size})
                </button>
              )}

              {mappings.length > 0 && (
                <button
                  onClick={() => setShowDeleteModal({ isOpen: true, type: 'all', count: mappings.length })}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  전체 삭제
                </button>
              )}
            </div>
          </div>

          {/* 매핑 규칙 테이블 */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-600">
                <caption className="caption-top border-b border-slate-100 px-4 py-2.5 text-left text-sm text-slate-600">
                  왼쪽 말이 상품명에 들어 있으면 오른쪽 이름으로 바꿔요. 바꿀 이름이 비어 있으면 상품명을 그대로 써요.
                </caption>
                <thead className="bg-slate-50/80 text-slate-600 text-[13px] font-semibold border-b border-slate-150">
                  <tr>
                    <th className="px-4 py-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filteredMappings.length > 0 && filteredMappings.every(m => selectedRawNames.has(m.rawName))}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="w-3.5 h-3.5 text-brand-600 border-slate-300 rounded focus:ring-brand-600 cursor-pointer"
                        title="전체 선택 / 해제"
                      />
                    </th>
                    <th className="px-4 py-3.5">상품명에 들어 있는 말</th>
                    <th className="px-4 py-3.5">바꿀 이름</th>
                    <th className="px-4 py-3.5 text-right w-28">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMappings.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-xs text-slate-400 italic">
                        {searchQuery ? "찾는 말이 들어간 항목이 없어요." : "아직 비어 있어요. 위에서 '하나 넣기'나 '여러 개 한 번에 넣기'를 눌러 보세요."}
                      </td>
                    </tr>
                  ) : (
                    filteredMappings.map((item, idx) => {
                      const globalIdx = mappings.findIndex(m => m.rawName === item.rawName);
                      const isEditing = editingIndex === globalIdx;
                      const isSelected = selectedRawNames.has(item.rawName);

                      return (
                        <tr 
                          key={`${item.rawName}-${idx}`} 
                          className={`hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-brand-50/20' : ''}`}
                        >
                          <td className="px-4 py-3.5 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleSelectRow(item.rawName, e.target.checked)}
                              className="w-3.5 h-3.5 text-brand-600 border-slate-300 rounded focus:ring-brand-600 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3.5 font-medium text-slate-800">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editRawName}
                                onChange={(e) => setEditRawName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEdit(globalIdx);
                                  else if (e.key === 'Escape') setEditingIndex(null);
                                }}
                                autoFocus
                                className="w-full text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                              />
                            ) : (
                              item.rawName
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-slate-700">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editMappedName}
                                onChange={(e) => setEditMappedName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEdit(globalIdx);
                                  else if (e.key === 'Escape') setEditingIndex(null);
                                }}
                                className="w-full text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                              />
                            ) : (
                              item.mappedName ? (
                                <span className="font-semibold text-brand-600">{item.mappedName}</span>
                              ) : (
                                <span className="text-slate-400 italic text-xs">그대로 써요</span>
                              )
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => saveEdit(globalIdx)}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                  title="저장"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingIndex(null)}
                                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                                  title="취소"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => startEdit(globalIdx, item)}
                                  className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-50 rounded-lg transition"
                                  title="수정"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setSingleDeleteTarget(item.rawName)}
                                  className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-50 rounded-lg transition"
                                  title="삭제"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>모두 {mappings.length}개</span>
              {filteredMappings.length !== mappings.length && (
                <span>· 지금 {filteredMappings.length}개 보는 중</span>
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
