import { ReactNode } from 'react';

// Design System V1：StatCard（核心指标 24-32px / bold）
export default function StatCard({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-slate-500 text-sm">{label}</p>
        {icon ? <span className="text-slate-400">{icon}</span> : null}
      </div>
      <p className="text-slate-900 text-2xl font-bold tracking-tight">{value}</p>
      {hint ? <p className="text-slate-400 text-xs mt-1.5">{hint}</p> : null}
    </div>
  );
}
