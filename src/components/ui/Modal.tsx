import { useEffect, useId, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

/*
 * 앱 공용 팝업 틀.
 * - 흰 바탕, 제목 + 한 줄 설명 + 오른쪽 위 닫기
 * - 버튼은 아래 버튼줄(footer)에 모읍니다
 * - 휴대폰(640px 미만)에서는 화면 아래에서 올라오는 창으로 보입니다
 * - 휴대폰에서는 위쪽 손잡이 막대와 제목 줄을 아래로 끌면 닫힙니다 (바깥 눌러 닫기를 허용하는 팝업만)
 * 기능은 각 팝업이 넘겨 주는 함수 그대로 씁니다. 이 틀은 모양만 맡습니다.
 */

type Size = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const SIZE: Record<Size, string> = {
  sm: 'sm:max-w-[420px]',
  md: 'sm:max-w-[520px]',
  lg: 'sm:max-w-[760px]',
  xl: 'sm:max-w-[920px]',
  full: 'sm:max-w-[1180px] sm:h-[min(860px,calc(100vh-48px))]',
};

export interface ModalProps {
  open?: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** 제목 왼쪽 작은 아이콘 (지우기 확인 등) */
  icon?: ReactNode;
  iconTone?: 'neutral' | 'danger' | 'brand' | 'warn';
  size?: Size;
  children?: ReactNode;
  footer?: ReactNode;
  /** footer 왼쪽에 놓을 보조 내용 (쪽수, 보조 링크 등) */
  footerStart?: ReactNode;
  /** Esc로 닫기. 팝업이 자기 키 처리를 따로 하면 false로 둡니다. */
  closeOnEsc?: boolean;
  /** 바깥(어두운 부분)을 눌러 닫기 */
  closeOnBackdrop?: boolean;
  /** 본문 여백 없이 (표처럼 가장자리까지 채울 때) */
  flushBody?: boolean;
  zIndex?: number;
  hideClose?: boolean;
}

const ICON_TONE = {
  neutral: 'bg-slate-100 text-slate-700',
  danger: 'bg-rose-50 text-rose-700',
  brand: 'bg-brand-50 text-brand-700',
  warn: 'bg-amber-50 text-amber-800',
};

export default function Modal({
  open = true,
  onClose,
  title,
  description,
  icon,
  iconTone = 'neutral',
  size = 'md',
  children,
  footer,
  footerStart,
  closeOnEsc = true,
  closeOnBackdrop = true,
  flushBody = false,
  zIndex = 50,
  hideClose = false,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; dy: number } | null>(null);

  // 손잡이·제목 줄을 아래로 끌어 닫기 (휴대폰 폭에서만, 바깥 눌러 닫기를 허용하는 팝업만)
  const dragProps = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (!closeOnBackdrop || !window.matchMedia('(max-width: 639px)').matches) return;
      if ((e.target as HTMLElement).closest('button')) return;
      dragRef.current = { startY: e.clientY, dy: 0 };
      e.currentTarget.setPointerCapture(e.pointerId);
      if (panelRef.current) panelRef.current.style.transition = 'none';
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const d = dragRef.current;
      if (!d) return;
      d.dy = Math.max(0, e.clientY - d.startY);
      if (panelRef.current) panelRef.current.style.transform = `translateY(${d.dy}px)`;
    },
    onPointerUp: () => {
      const d = dragRef.current;
      dragRef.current = null;
      const panel = panelRef.current;
      if (!d || !panel) return;
      panel.style.transition = 'transform 200ms ease-out';
      if (d.dy > 100) {
        panel.style.transform = `translateY(${panel.offsetHeight}px)`;
        window.setTimeout(onClose, 200);
      } else {
        panel.style.transform = '';
      }
    },
    onPointerCancel: () => {
      dragRef.current = null;
      if (panelRef.current) {
        panelRef.current.style.transition = 'transform 200ms ease-out';
        panelRef.current.style.transform = '';
      }
    },
  };

  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeOnEsc, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-end justify-center bg-slate-900/45 sm:items-center sm:p-6"
      style={{ zIndex }}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex w-full max-h-[92vh] flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl sm:max-h-[calc(100vh-48px)] sm:rounded-2xl ${SIZE[size]}`}
      >
        <div {...dragProps} className="touch-none sm:hidden">
          <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
        </div>
        <header {...dragProps} className="flex shrink-0 touch-none items-start justify-between gap-3 px-5 pt-2 pb-3 sm:px-6 sm:pt-5 sm:pb-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${ICON_TONE[iconTone]}`}>{icon}</span>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">{title}</h2>
              {description && <div className="mt-1 text-sm leading-relaxed text-slate-600">{description}</div>}
            </div>
          </div>
          {!hideClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="-mr-1.5 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </header>

        <div className={`min-h-0 flex-1 overflow-y-auto ${flushBody ? '' : 'px-5 pb-5 sm:px-6'}`}>{children}</div>

        {(footer || footerStart) && (
          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            <div className="text-[13px] text-slate-500">{footerStart}</div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end [&>*:only-child]:col-span-2">{footer}</div>
          </footer>
        )}
      </div>
    </div>
  );
}

/* ---- 버튼 모양 (팝업 안 공용) ---- */
const BTN_BASE =
  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';

export const btn = {
  primary: `${BTN_BASE} bg-brand-600 text-white hover:bg-brand-700`,
  dark: `${BTN_BASE} bg-slate-900 text-white hover:bg-slate-800`,
  danger: `${BTN_BASE} bg-rose-700 text-white hover:bg-rose-800`,
  secondary: `${BTN_BASE} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`,
  ghost: `${BTN_BASE} text-slate-700 hover:bg-slate-100`,
};

/* ---- 확인창 ---- */
export interface ConfirmDialogProps {
  open?: boolean;
  title: ReactNode;
  message?: ReactNode;
  /** 무엇이 바뀌는지 회색 상자로 보여 줄 내용 */
  detail?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'neutral' | 'danger' | 'brand';
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  zIndex?: number;
  /** 팝업을 연 화면이 Esc를 따로 처리하면 false */
  closeOnEsc?: boolean;
}

export function ConfirmDialog({
  open = true,
  title,
  message,
  detail,
  confirmLabel = '확인',
  cancelLabel = '취소',
  tone = 'neutral',
  icon,
  onConfirm,
  onCancel,
  zIndex,
  closeOnEsc = true,
}: ConfirmDialogProps) {
  const confirmClass = tone === 'danger' ? btn.danger : tone === 'brand' ? btn.primary : btn.dark;
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      icon={icon}
      iconTone={tone === 'danger' ? 'danger' : tone === 'brand' ? 'brand' : 'neutral'}
      size="sm"
      zIndex={zIndex}
      closeOnEsc={closeOnEsc}
      hideClose
      footer={
        <>
          {/* 되돌릴 수 없는 일을 묻는 창이 많아 Enter로 바로 확정되지 않게 '취소'에 먼저 포커스를 둡니다 */}
          <button type="button" onClick={onCancel} className={btn.secondary} autoFocus>{cancelLabel}</button>
          <button type="button" onClick={onConfirm} className={confirmClass}>{confirmLabel}</button>
        </>
      }
    >
      {detail && <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800 break-words">{detail}</div>}
      {message && <div className={`${detail ? 'mt-2' : ''} text-sm leading-relaxed text-slate-600`}>{message}</div>}
    </Modal>
  );
}
