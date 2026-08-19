'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface DashboardData {
  totalOrders: number;
  todayOrders: number;
  totalAmount: number;
  todayAmount: number;
  successRate: number;
  activeChannels: number;
}

const CHANNEL_NAMES: Record<string, string> = {
  ALIPAY_BAR: '支付宝当面付', ALIPAY_PC: '支付宝电脑', ALIPAY_WAP: '支付宝H5',
  WECHAT_NATIVE: '微信扫码', WECHAT_H5: '微信H5', WECHAT_JSAPI: '微信JSAPI',
  UNIONPAY_GATEWAY: '银联网关', UNIONPAY_WAP: '银联WAP', UNIONPAY_QR: '云闪付',
};

const STATUS_NAMES: Record<string, string> = {
  CREATED: '待支付', PAYING: '支付中', PAID: '已支付', CLOSED: '已关闭',
  PARTIALLY_REFUNDED: '部分退款', REFUNDED: '已退款', DISPUTED: '争议', FAILED: '失败',
};

const STATUS_COLORS: Record<string, string> = {
  CREATED: 'bg-yellow-50 text-yellow-700', PAYING: 'bg-blue-50 text-blue-700', PAID: 'bg-green-50 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-500', REFUNDED: 'bg-purple-50 text-purple-700', FAILED: 'bg-red-50 text-red-700',
};

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [user] = useState<Record<string, string> | null>(() => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('bep_merchant_user');
      return userStr ? JSON.parse(userStr) : null;
    }
    return null;
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const fetchDashboard = async (token: string) => {
    try {
      const res = await fetch('/api/merchant/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      }
    } catch {
      console.error('Dashboard fetch error');
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('bep_merchant_token');
    if (!token) { router.push('/login'); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboard(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('bep_merchant_token');
    localStorage.removeItem('bep_merchant_user');
    localStorage.removeItem('bep_token');
    localStorage.removeItem('bep_user');
    router.push('/login');
  };

  const formatAmount = (n: number) => `¥${Number(n).toFixed(2)}`;

  const navItems = [
    { href: '/dashboard', label: '工作台', icon: '' },
    { href: '/dashboard/collect', label: '创建收款', icon: '' },
    { href: '/dashboard/orders', label: '订单管理', icon: '' },
    { href: '/dashboard/refunds', label: '退款管理', icon: '↩️' },
    { href: '/dashboard/stores', label: '门店管理', icon: '' },
    { href: '/dashboard/qrcodes', label: '收款码', icon: '' },
    { href: '/dashboard/channels', label: '支付渠道', icon: '' },
    { href: '/dashboard/employees', label: '员工管理', icon: '' },
    { href: '/dashboard/finance', label: '对账结算', icon: '' },
    { href: '/dashboard/settings', label: '商户设置', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 侧边栏 */}
      <aside className={`bg-white border-r border-gray-200 flex-shrink-0 transition-all duration-200 ${sidebarOpen ? 'w-60' : 'w-16'}`}>
        <div className="h-16 flex items-center px-4 border-b border-gray-100">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            {sidebarOpen && <span className="text-gray-900 font-bold">BunnyEra Pay</span>}
          </Link>
        </div>
        <nav className="p-2 space-y-0.5">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                item.href === '/dashboard'
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-4 left-2 right-2 space-y-1">
          <Link href="/dashboard/collect" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm transition">
            <span className="text-base">＋</span>
            {sidebarOpen && <span className="font-medium">创建收款码</span>}
          </Link>
          <Link href="/cashier" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-blue-600 hover:bg-blue-50 text-sm transition">
            <span className="text-base">️</span>
            {sidebarOpen && <span className="font-medium">打开收银台</span>}
          </Link>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 text-sm transition">
            <span className="text-base">🚪</span>
            {sidebarOpen && <span>退出登录</span>}
          </button>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="flex-1 overflow-auto">
        <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-gray-600 text-lg">
              ☰
            </button>
            <h1 className="text-gray-900 font-semibold text-lg">工作台</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-gray-900 text-sm font-medium">{user?.name || '商户'}</p>
              <p className="text-gray-400 text-xs">{user?.merchantName || user?.merchantNo}</p>
            </div>
          </div>
        </header>

        <div className="p-6">
          {data ? (
            <>
              {/* 统计卡片 */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <p className="text-gray-500 text-sm mb-1">总订单数</p>
                  <p className="text-gray-900 text-2xl font-bold">{data.totalOrders}</p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <p className="text-gray-500 text-sm mb-1">今日订单数</p>
                  <p className="text-gray-900 text-2xl font-bold">{data.todayOrders}</p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <p className="text-gray-500 text-sm mb-1">总交易金额</p>
                  <p className="text-gray-900 text-2xl font-bold">{formatAmount(Number(data.totalAmount))}</p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <p className="text-gray-500 text-sm mb-1">今日交易金额</p>
                  <p className="text-gray-900 text-2xl font-bold">{formatAmount(Number(data.todayAmount))}</p>
                </div>
              </div>

              {/* 其他统计 */}
              <div className="grid lg:grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <h3 className="text-gray-900 font-semibold mb-4">支付成功率</h3>
                  <div className="flex items-center justify-center">
                    <div className="text-4xl font-bold text-green-600">{data.successRate}%</div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <h3 className="text-gray-900 font-semibold mb-4">活跃支付渠道</h3>
                  <div className="flex items-center justify-center">
                    <div className="text-4xl font-bold text-blue-600">{data.activeChannels}</div>
                  </div>
                </div>
              </div>

              {/* 快速操作 */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                  <h3 className="text-gray-900 font-semibold">快速操作</h3>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Link href="/dashboard/collect" className="flex flex-col items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition">
                    <span className="text-2xl mb-2">💰</span>
                    <span className="text-blue-700 font-medium">创建收款</span>
                  </Link>
                  <Link href="/cashier" className="flex flex-col items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition">
                    <span className="text-2xl mb-2">🧾</span>
                    <span className="text-green-700 font-medium">打开收银台</span>
                  </Link>
                  <Link href="/dashboard/orders" className="flex flex-col items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition">
                    <span className="text-2xl mb-2">📋</span>
                    <span className="text-purple-700 font-medium">订单管理</span>
                  </Link>
                  <Link href="/dashboard/channels" className="flex flex-col items-center p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition">
                    <span className="text-2xl mb-2">🔧</span>
                    <span className="text-orange-700 font-medium">渠道配置</span>
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-400">加载中...</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
