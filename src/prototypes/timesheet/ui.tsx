import React, { useEffect } from 'react';
import { useI18n } from './i18n';

export interface IconProps {
  size?: number;
  className?: string;
}

const Svg: React.FC<React.PropsWithChildren<IconProps>> = ({ size = 16, className, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    {children}
  </svg>
);

export const Icon = {
  ChevronLeft: (props: IconProps) => (
    <Svg {...props}>
      <path d="m15 18-6-6 6-6" />
    </Svg>
  ),
  ChevronRight: (props: IconProps) => (
    <Svg {...props}>
      <path d="m9 18 6-6-6-6" />
    </Svg>
  ),
  ChevronDown: (props: IconProps) => (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  ),
  Plus: (props: IconProps) => (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  Minus: (props: IconProps) => (
    <Svg {...props}>
      <path d="M5 12h14" />
    </Svg>
  ),
  Copy: (props: IconProps) => (
    <Svg {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </Svg>
  ),
  CalendarPlus: (props: IconProps) => (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 11h18M12 14v5M9.5 16.5h5" />
    </Svg>
  ),
  Save: (props: IconProps) => (
    <Svg {...props}>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v6h7V3M8 21v-6h8v6" />
    </Svg>
  ),
  FileText: (props: IconProps) => (
    <Svg {...props}>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5M8 13h8M8 17h5" />
    </Svg>
  ),
  Search: (props: IconProps) => (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </Svg>
  ),
  X: (props: IconProps) => (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  ),
  Alert: (props: IconProps) => (
    <Svg {...props}>
      <path d="M12 3 2 21h20z" />
      <path d="M12 9v5M12 17.5h.01" />
    </Svg>
  ),
  Check: (props: IconProps) => (
    <Svg {...props}>
      <path d="m4 12 5 5L20 6" />
    </Svg>
  ),
  Download: (props: IconProps) => (
    <Svg {...props}>
      <path d="M12 3v12M7 11l5 5 5-5M4 21h16" />
    </Svg>
  ),
  Rotate: (props: IconProps) => (
    <Svg {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </Svg>
  ),
  Clock: (props: IconProps) => (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  ),
  MapPin: (props: IconProps) => (
    <Svg {...props}>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </Svg>
  ),
  Grid: (props: IconProps) => (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  ),
  List: (props: IconProps) => (
    <Svg {...props}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </Svg>
  ),
};

export type ToastTone = 'ok' | 'warn' | 'error';

export interface ToastState {
  id: number;
  text: string;
  tone: ToastTone;
}

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.tone}`} role="status">
      <span className="toast-icon">
        {toast.tone === 'ok' ? <Icon.Check size={15} /> : <Icon.Alert size={15} />}
      </span>
      <span>{toast.text}</span>
    </div>
  );
}

const STATUS_CLASS: Record<string, string> = {
  empty: 'pill-empty',
  partial: 'pill-partial',
  complete: 'pill-complete',
};

export function StatusPill({ status }: { status: 'empty' | 'partial' | 'complete' }) {
  const { t } = useI18n();
  return (
    <span className={`pill ${STATUS_CLASS[status]}`}>
      <span className="pill-dot" />
      {t(`status.${status}`)}
    </span>
  );
}

export interface ModalProps {
  title: string;
  subtitle?: string;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({ title, subtitle, width = 620, onClose, children, footer }: ModalProps) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('btn.close')}>
            <Icon.X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}
