import { InputHTMLAttributes, ReactNode } from 'react';

// Design System V1：Input（圆角 8px，边框 #E2E8F0）
export const FIELD_CLASS =
  'w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  required?: boolean;
}

export default function Input({ label, required, className = '', ...props }: InputProps) {
  const field = <input className={`${FIELD_CLASS} ${className}`} required={required} {...props} />;
  if (!label) return field;
  return (
    <div>
      <label className="block text-sm text-slate-600 mb-1.5">
        {label}
        {required ? <span className="text-red-600 ml-0.5">*</span> : null}
      </label>
      {field}
    </div>
  );
}

export function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm text-slate-600 mb-1.5">
      {children}
      {required ? <span className="text-red-600 ml-0.5">*</span> : null}
    </label>
  );
}
