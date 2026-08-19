import { ReactNode } from 'react';

// Design System V1：Table（表头 12-13px / medium，正文 14px）
export default function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className = '', align = 'left' }: { children?: ReactNode; className?: string; align?: 'left' | 'right' }) {
  return (
    <th className={`px-5 py-3 text-slate-500 font-medium text-xs whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = '', align = 'left' }: { children?: ReactNode; className?: string; align?: 'left' | 'right' }) {
  return (
    <td className={`px-5 py-3.5 text-slate-700 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      {children}
    </td>
  );
}

export function TableHeadRow({ children }: { children: ReactNode }) {
  return <thead className="bg-slate-50 border-b border-slate-100"><tr>{children}</tr></thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}
