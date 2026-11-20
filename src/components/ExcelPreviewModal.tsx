import React, { useState, useMemo, useEffect } from 'react';
import { Search, Download, ChevronLeft, ChevronRight, Lightbulb, Truck, FileText } from 'lucide-react';
import Modal, { btn } from './ui/Modal';

export interface ExcelPreviewSheet {
  sheetName: string;
  columns: string[];
  rows: (string | number | undefined | null)[][];
}

export interface ExcelPreviewFile {
  fileName: string;
  platformName?: string;
  fileDescription?: string;
  sheets: ExcelPreviewSheet[];
  secondaryOptionColsInfo?: { index: number; letter: string; headerName: string }[];
  onDownload?: () => void;
}

interface ExcelPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  files: ExcelPreviewFile[];
  onDownloadAll?: () => void;
  downloadAllButtonText?: string;
}

// 엑셀 열 알파벳 변환 함수 (0 -> A, 1 -> B, 25 -> Z, 26 -> AA ...)
function getExcelColumnLabel(index: number): string {
  let label = '';
  let num = index;
  while (num >= 0) {
    label = String.fromCharCode((num % 26) + 65) + label;
    num = Math.floor(num / 26) - 1;
  }
  return label;
}

export default function ExcelPreviewModal({
  isOpen,
  onClose,
  title,
  subtitle = "받게 될 파일과 똑같은 내용이에요. 받기 전에 받는 사람과 수량을 한 번 훑어보세요.",
  files,
  onDownloadAll,
  downloadAllButtonText = "모두 받기"
}: ExcelPreviewModalProps) {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileTable, setMobileTable] = useState(false);
  const pageSize = 50;

  // 모달 오픈 시 또는 files 변경 시 상태 리셋
  useEffect(() => {
    setActiveFileIndex(0);
    setActiveSheetIndex(0);
    setCurrentPage(1);
    setSearchTerm('');
  }, [isOpen, files]);

  // ESC 키 및 Enter 키 처리
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        // 인풋창에 포커스가 맞춰져있지 않을 때 Enter 누르면 엑셀 다운로드 또는 모달 닫기
        const activeElem = document.activeElement;
        const isInput = activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA');
        if (!isInput) {
          if (onDownloadAll) {
            onDownloadAll();
          } else {
            onClose();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onDownloadAll]);

  // 안전한 파일 및 시트 인덱스 계산
  const currentFile = files[activeFileIndex] || files[0];
  const currentSheets = currentFile?.sheets || [];
  const currentSheet = currentSheets[activeSheetIndex] || currentSheets[0];

  const filteredRows = useMemo(() => {
    if (!currentSheet || !currentSheet.rows) return [];
    if (!searchTerm.trim()) return currentSheet.rows;

    const term = searchTerm.trim().toLowerCase();
    return currentSheet.rows.filter(row =>
      row.some(cell => cell !== null && cell !== undefined && String(cell).toLowerCase().includes(term))
    );
  }, [currentSheet, searchTerm]);

  // 페이지네이션 로직
  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  if (!isOpen || !files || files.length === 0 || !currentFile || !currentSheet) return null;

  // 파일 카드에 보일 쉬운 이름 (파일 이름은 그 아래 작게)
  const friendlyName = (file: ExcelPreviewFile) => {
    if (file.fileName.includes('품목별정렬')) return '택배사에 넣을 파일';
    if (file.fileName.includes('요약보고서')) return '상품 준비용 보고서';
    return file.platformName || file.fileName;
  };
  const fileMeta = (file: ExcelPreviewFile) => {
    const sheets = file.sheets || [];
    const rowsText = sheets.length > 1 ? `시트 ${sheets.length}개` : `${sheets[0]?.rows.length ?? 0}줄`;
    return `${file.fileName} · ${rowsText}`;
  };

  // 휴대폰 카드 보기: 받는 사람 이름이 들어 있는 칸을 카드 제목으로 씁니다
  const nameColIdx = currentSheet.columns.findIndex(c => /수령인|받는\s*사람|받는분|수취인|주문자/.test(String(c)));
  const matchBadge = (v: string) =>
    v === 'exact' ? <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[12px] font-semibold text-brand-700">정확히 맞음</span>
    : v === 'soft' ? <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[12px] font-semibold text-amber-800">비슷하게 맞음</span>
    : <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[12px] font-semibold text-rose-700">못 맞춤</span>;
  const isBadge = (v: string) => v === 'exact' || v === 'soft' || v === 'unmatched';

  return (
    <Modal
      onClose={onClose}
      title={title}
      description={subtitle}
      size="full"
      flushBody
      closeOnEsc={false}
      footerStart={
        <div className="flex items-center gap-2">
          <span>{totalRows}줄{totalPages > 1 ? ` · ${safePage}/${totalPages}쪽` : ''}</span>
          {totalPages > 1 && (
            <span className="inline-flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="grid h-8 w-8 place-items-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                aria-label="이전 쪽"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="grid h-8 w-8 place-items-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                aria-label="다음 쪽"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </span>
          )}
        </div>
      }
      footer={
        <>
          {currentFile.onDownload && (files.length > 1 || !onDownloadAll) && (
            <button type="button" onClick={currentFile.onDownload} className={btn.secondary}>
              <Download className="w-4 h-4" />이 파일 받기
            </button>
          )}
          {onDownloadAll && (
            <button type="button" onClick={onDownloadAll} className={btn.primary}>
              <Download className="w-4 h-4" />{downloadAllButtonText}
            </button>
          )}
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* 파일 고르기 */}
        {files.length > 1 && (
          <div className="grid shrink-0 grid-cols-2 gap-2 px-5 sm:gap-3 sm:px-6" role="tablist" aria-label="파일 고르기">
            {files.map((file, fIdx) => {
              const isSelected = activeFileIndex === fIdx;
              const isCourier = file.fileName.includes('품목별정렬');
              return (
                <button
                  key={fIdx}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setActiveFileIndex(fIdx);
                    setActiveSheetIndex(0);
                    setCurrentPage(1);
                  }}
                  className={`min-w-0 rounded-xl px-3 py-2.5 text-left transition cursor-pointer sm:px-4 sm:py-3 ${
                    isSelected ? 'border-2 border-brand-600 bg-brand-50' : 'border border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className={`flex items-center gap-2 text-[13px] font-semibold sm:text-sm ${isSelected ? 'text-brand-800' : 'text-slate-800'}`}>
                    {isCourier ? <Truck className="hidden w-4 h-4 shrink-0 sm:block" /> : <FileText className="hidden w-4 h-4 shrink-0 sm:block" />}
                    <span className="truncate">{friendlyName(file)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-slate-600 sm:text-[13px]">{fileMeta(file)}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* 시트 고르기 + 찾기 */}
        <div className="mt-3 flex shrink-0 flex-col gap-2 border-y border-slate-200 bg-slate-50 px-5 py-2.5 sm:mt-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-1.5 overflow-x-auto text-[13px]">
            <span className="mr-1 shrink-0 text-slate-500">시트</span>
            {currentSheets.map((sheet, sIdx) => {
              const isActive = activeSheetIndex === sIdx;
              return (
                <button
                  key={sIdx}
                  type="button"
                  onClick={() => {
                    setActiveSheetIndex(sIdx);
                    setCurrentPage(1);
                  }}
                  className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 transition cursor-pointer ${
                    isActive ? 'border border-slate-300 bg-white font-semibold text-slate-900 shadow-xs' : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  {sheet.sheetName} <span className="font-normal text-slate-500">{sheet.rows.length}줄</span>
                </button>
              );
            })}
          </div>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">이 시트에서 찾기</span>
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="이 시트에서 찾기"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  if (searchTerm) {
                    setSearchTerm('');
                  } else {
                    onClose();
                  }
                } else if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
            />
          </label>
        </div>

        {/* 옵션이 여러 칸에 나뉜 파일 안내 */}
        {currentFile.secondaryOptionColsInfo && currentFile.secondaryOptionColsInfo.length > 0 && (
          <div className="mx-5 mt-3 flex shrink-0 items-start gap-2 rounded-lg bg-brand-50 px-3 py-2 text-[13px] text-brand-900 sm:mx-6">
            <Lightbulb className="mt-0.5 w-4 h-4 shrink-0 text-brand-700" />
            <span>
              옵션이 여러 칸에 나뉘어 있어서 {currentFile.secondaryOptionColsInfo.map(s => `${s.letter}열(${s.headerName})`).join(', ')}을 옵션·용량 뒤에 붙였어요.
            </span>
          </div>
        )}

        {/* 휴대폰: 줄마다 카드 */}
        <div className={`${mobileTable ? 'hidden' : 'block'} min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 px-5 py-3 sm:hidden`}>
          {paginatedRows.map((row, rIdx) => {
            const globalRowIndex = (safePage - 1) * pageSize + rIdx + 1;
            const titleCell = nameColIdx >= 0 ? row[nameColIdx] : row[0];
            return (
              <div key={rIdx} className="rounded-xl border border-slate-200 bg-white p-3 text-[13px]">
                <div className="flex items-center justify-between gap-2">
                  <b className="truncate text-sm text-slate-900">{titleCell !== null && titleCell !== undefined && String(titleCell) !== '' ? String(titleCell) : `${globalRowIndex}번째 줄`}</b>
                  <span className="shrink-0 text-slate-500">{globalRowIndex}번째</span>
                </div>
                <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  {row.map((cell, cIdx) => {
                    if (cIdx === nameColIdx) return null;
                    const v = cell !== null && cell !== undefined ? String(cell) : '';
                    if (!v) return null;
                    return (
                      <React.Fragment key={cIdx}>
                        <dt className="text-slate-500">{currentSheet.columns[cIdx]}</dt>
                        <dd className="min-w-0 break-words text-slate-800">{isBadge(v) ? matchBadge(v) : v}</dd>
                      </React.Fragment>
                    );
                  })}
                </dl>
              </div>
            );
          })}
          {paginatedRows.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-500">찾는 내용이 없어요.</p>
          )}
          <button type="button" onClick={() => setMobileTable(true)} className="text-[13px] font-semibold text-brand-700 underline underline-offset-2 cursor-pointer">
            엑셀 표 모양으로 보기
          </button>
        </div>

        {/* 표 보기 (컴퓨터, 또는 휴대폰에서 표 모양을 고른 경우) */}
        <div className={`${mobileTable ? 'block' : 'hidden'} min-h-0 flex-1 overflow-auto px-5 py-3 sm:block sm:px-6 sm:py-4`}>
          {mobileTable && (
            <button type="button" onClick={() => setMobileTable(false)} className="mb-2 text-[13px] font-semibold text-brand-700 underline underline-offset-2 cursor-pointer sm:hidden">
              카드로 보기
            </button>
          )}
          <table className="w-full border-collapse text-sm text-slate-800">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="select-none font-mono text-[11px] text-slate-400">
                <th className="w-10" />
                {currentSheet.columns.map((_, cIdx) => (
                  <th key={cIdx} className="px-3 py-1 text-left font-normal">{getExcelColumnLabel(cIdx)}</th>
                ))}
              </tr>
              <tr className="select-none border-y border-slate-200 bg-slate-100 text-left text-[13px] font-semibold text-slate-700">
                <th className="w-10 py-2 text-center font-mono text-[11px] font-normal text-slate-400">1</th>
                {currentSheet.columns.map((col, cIdx) => (
                  <th key={cIdx} className="whitespace-nowrap px-3 py-2">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedRows.map((row, rIdx) => {
                const globalRowIndex = (safePage - 1) * pageSize + rIdx + 2;
                return (
                  <tr key={rIdx} className="hover:bg-slate-50">
                    <td className="py-2 text-center font-mono text-[11px] text-slate-400 select-none">{globalRowIndex}</td>
                    {row.map((cell, cIdx) => {
                      const cellStr = cell !== null && cell !== undefined ? String(cell) : '';
                      const isNumeric = typeof cell === 'number';
                      return (
                        <td
                          key={cIdx}
                          className={`max-w-xs truncate whitespace-nowrap px-3 py-2 ${isNumeric ? 'text-right tabular-nums' : 'text-left'}`}
                          title={cellStr}
                        >
                          {isBadge(cellStr) ? matchBadge(cellStr) : cellStr}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {paginatedRows.length === 0 && (
                <tr>
                  <td colSpan={currentSheet.columns.length + 1} className="py-16 text-center text-sm text-slate-500">
                    찾는 내용이 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
