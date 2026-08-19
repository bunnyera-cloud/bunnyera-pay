import { ReactNode } from 'react';

// Design System V1：Badge（状态色：Success/Warning/Danger/Info/Muted）
type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'purple';

const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-blue-50 text-blue-700',
  muted: 'bg-slate-100 text-slate-500',
  purple: 'bg-purple-50 text-purple-700',
};

export default function Badge({ tone = 'muted', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TONE_CLASS[tone]} ${className}`}>
      {children}
    </span>
  );
}
