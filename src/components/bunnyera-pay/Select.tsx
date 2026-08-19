import { SelectHTMLAttributes } from 'react';
import { FIELD_CLASS } from './Input';

// Design System V1：Select（圆角 8px，浅色可见选项）
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export default function Select({ label, className = '', children, ...props }: SelectProps) {
  const field = (
    <select className={`${FIELD_CLASS} ${className}`} {...props}>
      {children}
    </select>
  );
  if (!label) return field;
  return (
    <div>
      <label className="block text-sm text-slate-600 mb-1.5">{label}</label>
      {field}
    </div>
  );
}
