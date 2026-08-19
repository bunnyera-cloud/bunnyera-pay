import { HTMLAttributes, ReactNode } from 'react';

// Design System V1：Card（圆角 12px，轻 shadow-sm，边框 #E2E8F0）
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export default function Card({ className = '', children, ...props }: CardProps) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-sm ${className}`} {...props}>
      {children}
    </div>
  );
}

// 卡片标题区（16px / semibold）
export function CardHeader({ title, action, className = '' }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between px-5 py-4 border-b border-slate-100 ${className}`}>
      <h3 className="text-slate-900 font-semibold text-base">{title}</h3>
      {action}
    </div>
  );
}

export function CardBody({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

// SectionHeader：区块标题（用于非卡片区块）
export function SectionHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-slate-900 font-semibold text-base">{title}</h2>
        {description ? <p className="text-slate-500 text-sm mt-0.5">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
