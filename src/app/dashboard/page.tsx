'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface DashboardData {
  today: {
    transactionAmount: number;
    refundAmount: number;
    orderCount: number;
    pendingRefunds: number;
    pendingReconcile: number;
    settlingAmount: number;
  };
  channelBreakdown: Array<{ channel: string; amount: number; count: number }>;
  channelStatus: Array<{ channel: string; isEnabled: boolean }>;
  recentOrders: Array<{
    id: string;
    orderNo: string;
    subject: string;
    amount: number;
    channel: string;
    status: string;
    createdAt: string;
  }>;
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
      const userStr = (localStorage.getItem('bep_merchant_user') || localStorage.getItem('bep_user'));
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
        setData(json.data);
      }
    } catch {
      console.error('Dashboard fetch error');
    }
  };

  useEffect(() => {
    const token = (localStorage.getItem('bep_merchant_token') || localStorage.getItem('bep_token'));
    if (!token) { router.push('/login'); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboard(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
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
                  <p className="text-gray-500 text-sm mb-1">今日交易金额</p>
                  <p className="text-gray-900 text-2xl font-bold">{formatAmount(Number(data.today.transactionAmount))}</p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <p className="text-gray-500 text-sm mb-1">今日订单数</p>
                  <p className="text-gray-900 text-2xl font-bold">{data.today.orderCount}</p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <p className="text-gray-500 text-sm mb-1">今日退款金额</p>
                  <p className="text-red-600 text-2xl font-bold">{formatAmount(Number(data.today.refundAmount))}</p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <p className="text-gray-500 text-sm mb-1">结算中金额</p>
                  <p className="text-blue-600 text-2xl font-bold">{formatAmount(Number(data.today.settlingAmount))}</p>
                </div>
              </div>

              {/* 待处理事项 + 渠道状态 */}
              <div className="grid lg:grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <h3 className="text-gray-900 font-semibold mb-4">待处理事项</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">↩️</span>
                        <span className="text-gray-700 text-sm font-medium">待处理退款</span>
                      </div>
                      <span className="text-red-600 font-bold text-lg">{data.today.pendingRefunds}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-lg"></span>
                        <span className="text-gray-700 text-sm font-medium">待对账订单</span>
                      </div>
                      <span className="text-amber-600 font-bold text-lg">{data.today.pendingReconcile}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <h3 className="text-gray-900 font-semibold mb-4">渠道运行状态</h3>
                  {data.channelStatus.length > 0 ? (
                    <div className="space-y-2">
                      {data.channelStatus.map(ch => (
                        <div key={ch.channel} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                          <span className="text-gray-700 text-sm font-medium">{CHANNEL_NAMES[ch.channel] || ch.channel}</span>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                            ch.isEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {ch.isEnabled ? '已启用' : '未启用'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-gray-400 text-sm mb-2">暂未配置支付渠道</p>
                      <Link href="/dashboard/channels" className="text-blue-600 text-sm font-medium hover:underline">
                        前往配置 →
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* 渠道占比 */}
              {data.channelBreakdown.length > 0 && (
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm mb-6">
                  <h3 className="text-gray-900 font-semibold mb-4">今日渠道占比</h3>
                  <div className="space-y-3">
                    {data.channelBreakdown.map(ch => {
                      const total = data.channelBreakdown.reduce((s, c) => s + Number(c.amount), 0);
                      const pct = total > 0 ? ((Number(ch.amount) / total) * 100).toFixed(1) : '0';
                      return (
                        <div key={ch.channel} className="flex items-center gap-4">
                          <span className="text-gray-600 text-sm w-24">{CHANNEL_NAMES[ch.channel] || ch.channel}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                            <div className="bg-blue-500 h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                          </div>
                          <span className="text-gray-900 text-sm font-medium w-24 text-right">{formatAmount(Number(ch.amount))}</span>
                          <span className="text-gray-400 text-xs w-12 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 最近订单 */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                  <h3 className="text-gray-900 font-semibold">最近订单</h3>
                  <Link href="/dashboard/orders" className="text-blue-600 text-sm font-medium hover:underline">查看全部 →</Link>
                </div>
                {data.recentOrders.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-400 border-b border-gray-100">
                          <th className="text-left px-5 py-3 font-medium">订单号</th>
                          <th className="text-left px-5 py-3 font-medium">商品</th>
                          <th className="text-right px-5 py-3 font-medium">金额</th>
                          <th className="text-left px-5 py-3 font-medium">渠道</th>
                          <th className="text-left px-5 py-3 font-medium">状态</th>
                          <th className="text-right px-5 py-3 font-medium">时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentOrders.map(order => (
                          <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="px-5 py-3.5 text-gray-900 font-mono text-xs">{order.orderNo}</td>
                            <td className="px-5 py-3.5 text-gray-700">{order.subject}</td>
                            <td className="px-5 py-3.5 text-gray-900 text-right font-semibold">{formatAmount(Number(order.amount))}</td>
                            <td className="px-5 py-3.5 text-gray-500">{CHANNEL_NAMES[order.channel] || order.channel}</td>
                            <td className="px-5 py-3.5">
                              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-500'}`}>
                                {STATUS_NAMES[order.status] || order.status}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-gray-400 text-right text-xs">
                              {new Date(order.createdAt).toLocaleString('zh-CN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-400 text-sm mb-3">暂无订单数据</p>
                    <Link href="/dashboard/collect" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm transition">
            <span className="text-base">＋</span>
            {sidebarOpen && <span className="font-medium">创建收款码</span>}
          </Link>
          <Link href="/cashier" className="text-blue-600 text-sm font-medium hover:underline">
                      前往收银台创建第一笔订单 →
                    </Link>
                  </div>
                )}
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
