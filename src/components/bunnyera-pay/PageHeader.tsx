import { ReactNode } from 'react';

// Design System V1：PageHeader（页面主标题 24px / semibold）
export default function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-slate-900 font-semibold text-2xl">{title}</h1>
        {description ? <p className="text-slate-500 text-sm mt-1">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
