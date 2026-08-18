'use client';

import { useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
}

const navItems = [
  { href: '/admin/dashboard', label: '平台总览', icon: '📊' },
  { href: '/admin/merchants', label: '商户管理', icon: '🏢' },
  { href: '/admin/channels', label: '渠道管理', icon: '🔗' },
  { href: '/admin/orders', label: '订单监控', icon: '📋' },
  { href: '/admin/refunds', label: '退款审核', icon: '↩️' },
  { href: '/admin/reconciliation', label: '对账异常', icon: '📑' },
  { href: '/admin/settlements', label: '结算状态', icon: '💰' },
  { href: '/admin/risk', label: '风险事件', icon: '🛡️' },
  { href: '/admin/users', label: '员工权限', icon: '👥' },
  { href: '/admin/api-apps', label: 'API 应用', icon: '🔑' },
  { href: '/admin/logs', label: '系统日志', icon: '📝' },
  { href: '/admin/settings', label: '系统设置', icon: '⚙️' },
];

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem('bep_token');
    if (!token) {
      router.push('/login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('bep_token');
    localStorage.removeItem('bep_user');
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 侧边栏 */}
      <aside className="w-60 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col">
        <div className="h-16 flex items-center px-4 border-b border-gray-100">
          <Link href="/admin/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <div>
              <span className="text-gray-900 font-bold text-sm">BunnyEra Pay</span>
              <p className="text-gray-400 text-xs">平台管理后台</p>
            </div>
          </Link>
        </div>
        <nav className="p-2 space-y-0.5 flex-1">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                pathname === item.href
                  ? 'bg-orange-50 text-orange-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t border-gray-100">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 text-sm transition">
            <span className="text-base">🚪</span>
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="flex-1 overflow-auto">
        <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between flex-shrink-0">
          <h1 className="text-gray-900 font-semibold text-lg">{title}</h1>
          <div className="text-gray-400 text-sm">
            {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </div>
        </header>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
