import { ReactNode } from 'react';
import { InboxIcon } from './icons';

// Design System V1：EmptyState
export default function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-16 px-6">
      <div className="w-12 h-12 mx-auto mb-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-slate-400">
        {icon || <InboxIcon className="w-6 h-6" />}
      </div>
      <p className="text-slate-900 font-medium mb-1">{title}</p>
      {description ? <p className="text-slate-500 text-sm mb-5">{description}</p> : null}
      {action}
    </div>
  );
}
