'use client';

import { ReactNode } from 'react';
import { CloseIcon } from './icons';

// Design System V1：Modal（圆角 16px，浅色遮罩）
export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={`bg-white border border-slate-200 rounded-2xl shadow-lg w-full ${maxWidth} max-h-[90vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-slate-900 font-semibold text-base">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition" aria-label="关闭">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
