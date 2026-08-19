'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AdminStats {
  totalMerchants: number;
  activeMerchants: number;
  pendingMerchants: number;
  todayOrders: number;
  todayAmount: string;
  reconciliationIssues: number;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);

  const fetchStats = async (token: string) => {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setStats(json.data);
      }
    } catch {}
  };

  useEffect(() => {
    const token = localStorage.getItem('bep_platform_token') || localStorage.getItem('bep_token');
    if (!token) { router.push('/login'); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('bep_platform_token');
    localStorage.removeItem('bep_platform_user');
    localStorage.removeItem('bep_token');
    localStorage.removeItem('bep_user');
    router.push('/login');
  };

  const navItems = [
    { href: '/admin/dashboard', label: '平台总览', icon: '' },
    { href: '/admin/merchants', label: '商户管理', icon: '' },
    { href: '/admin/channels', label: '渠道管理', icon: '' },
    { href: '/admin/orders', label: '订单监控', icon: '' },
    { href: '/admin/refunds', label: '退款审核', icon: '↩️' },
    { href: '/admin/reconciliation', label: '对账异常', icon: '' },
    { href: '/admin/settlements', label: '结算状态', icon: '' },
    { href: '/admin/risk', label: '风险事件', icon: '' },
    { href: '/admin/users', label: '员工权限', icon: '' },
    { href: '/admin/api-apps', label: 'API 应用', icon: '' },
    { href: '/admin/logs', label: '系统日志', icon: '' },
    { href: '/admin/settings', label: '系统设置', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 侧边栏 */}
      <aside className="w-60 bg-white border-r border-gray-200 flex-shrink-0">
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
        <nav className="p-2 space-y-0.5">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                item.href === '/admin/dashboard'
                  ? 'bg-orange-50 text-orange-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-4 left-2 right-2">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 text-sm transition">
            <span className="text-base">🚪</span>
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="flex-1 overflow-auto">
        <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between flex-shrink-0">
          <h1 className="text-gray-900 font-semibold text-lg">平台总览</h1>
          <div className="text-gray-400 text-sm">
            {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </div>
        </header>

        <div className="p-6">
          {/* 统计卡片 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-gray-500 text-sm mb-1">总商户数</p>
              <p className="text-gray-900 text-3xl font-bold">{stats?.totalMerchants ?? '-'}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-gray-500 text-sm mb-1">活跃商户</p>
              <p className="text-green-600 text-3xl font-bold">{stats?.activeMerchants ?? '-'}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-gray-500 text-sm mb-1">今日订单</p>
              <p className="text-gray-900 text-3xl font-bold">{stats?.todayOrders ?? '-'}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-gray-500 text-sm mb-1">今日交易额</p>
              <p className="text-blue-600 text-3xl font-bold">¥{stats?.todayAmount || '0.00'}</p>
            </div>
          </div>

          {/* 待处理 */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm mb-1">待审核商户</p>
                  <p className="text-amber-600 text-2xl font-bold">{stats?.pendingMerchants ?? 0}</p>
                </div>
                <Link href="/admin/merchants?status=SUBMITTED" className="text-blue-600 text-sm font-medium hover:underline">
                  去审核 →
                </Link>
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm mb-1">对账异常</p>
                  <p className="text-red-600 text-2xl font-bold">{stats?.reconciliationIssues ?? 0}</p>
                </div>
                <Link href="/admin/reconciliation" className="text-blue-600 text-sm font-medium hover:underline">
                  去处理 →
                </Link>
              </div>
            </div>
          </div>

          {/* 快捷操作 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-gray-900 font-semibold mb-4">快捷操作</h3>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/merchants?status=SUBMITTED" className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm font-medium hover:bg-amber-100 transition">
                审核商户申请
              </Link>
              <Link href="/admin/refunds?status=PENDING" className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium hover:bg-red-100 transition">
                审核退款
              </Link>
              <Link href="/admin/reconciliation" className="px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm font-medium hover:bg-blue-100 transition">
                查看对账
              </Link>
              <Link href="/admin/logs" className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-100 transition">
                审计日志
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
