'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface StoreOption {
  id: string;
  name: string;
  brandName: string;
}

interface OrderRow {
  id: string;
  orderNo: string;
  subject: string;
  amount: number;
  channel: string;
  scene: string;
  status: string;
  channelTradeNo: string | null;
  storeId: string | null;
  storeName: string | null;
  brandName: string | null;
  paidAt: string | null;
  createdAt: string;
}

const CHANNEL_NAMES: Record<string, string> = {
  ALIPAY_BAR: '支付宝当面付', ALIPAY_PC: '支付宝电脑', ALIPAY_WAP: '支付宝H5',
  WECHAT_NATIVE: '微信扫码', WECHAT_H5: '微信H5', WECHAT_JSAPI: '微信JSAPI', WECHAT_MINI: '微信小程序',
  UNIONPAY_GATEWAY: '银联网关', UNIONPAY_WAP: '银联WAP', UNIONPAY_QR: '云闪付',
  LAKALA_AGGREGATE: '拉卡拉聚合',
};

const STATUS_NAMES: Record<string, string> = {
  CREATED: '待支付', PAYING: '支付中', PAID: '已支付', CLOSED: '已关闭',
  PARTIALLY_REFUNDED: '部分退款', REFUNDED: '已退款', DISPUTED: '争议', FAILED: '失败',
};

const STATUS_COLORS: Record<string, string> = {
  CREATED: 'bg-yellow-50 text-yellow-700', PAYING: 'bg-blue-50 text-blue-700',
  PAID: 'bg-green-50 text-green-700', CLOSED: 'bg-gray-100 text-gray-500',
  PARTIALLY_REFUNDED: 'bg-purple-50 text-purple-700', REFUNDED: 'bg-purple-50 text-purple-700',
  DISPUTED: 'bg-orange-50 text-orange-700', FAILED: 'bg-red-50 text-red-700',
};

export default function MerchantOrdersPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeIdFilter, setStoreIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [orderNoSearch, setOrderNoSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 加载分店列表（用于筛选）
  const fetchStores = useCallback(async (t: string) => {
    try {
      const res = await fetch('/api/stores', { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) return;
      const json = await res.json();
      const list: StoreOption[] = [];
      (json.data || []).forEach((brand: { stores?: { id: string; name: string }[]; name: string }) => {
        (brand.stores || []).forEach(s => list.push({ id: s.id, name: s.name, brandName: brand.name }));
      });
      setStores(list);
    } catch { /* ignore */ }
  }, []);

  // 加载订单（支持分店/状态筛选）
  const fetchOrders = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (storeIdFilter) params.set('storeId', storeIdFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (orderNoSearch) params.set('orderNo', orderNoSearch);
      const res = await fetch(`/api/orders?${params}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const json = await res.json();
        setOrders(json.data || []);
        setTotal(json.pagination?.total || 0);
        setTotalPages(json.pagination?.totalPages || 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, storeIdFilter, statusFilter, orderNoSearch]);

  useEffect(() => {
    const t = localStorage.getItem('bep_merchant_token');
    if (!t) { router.push('/login'); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(t);
    fetchStores(t);
  }, [router, fetchStores]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (token) fetchOrders(token);
  }, [token, fetchOrders]);

  const handleLogout = () => {
    localStorage.removeItem('bep_merchant_token');
    localStorage.removeItem('bep_merchant_user');
    router.push('/login');
  };

  const navItems = [
    { href: '/dashboard', label: '工作台', icon: '' },
    { href: '/dashboard/collect', label: '创建收款', icon: '' },
    { href: '/dashboard/orders', label: '订单管理', icon: '' },
    { href: '/dashboard/stores', label: '门店管理', icon: '' },
    { href: '/dashboard/qrcodes', label: '收款码', icon: '' },
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
                item.href === '/dashboard/orders'
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-4 left-2 right-2">
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
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-gray-600 text-lg">☰</button>
            <h1 className="text-gray-900 font-semibold text-lg">订单管理</h1>
          </div>
        </header>

        <div className="p-6">
          {/* 筛选栏 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">分店：</span>
                <select
                  value={storeIdFilter}
                  onChange={e => { setStoreIdFilter(e.target.value); setPage(1); }}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white"
                >
                  <option value="">全部分店</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.brandName} · {s.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">状态：</span>
                <select
                  value={statusFilter}
                  onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white"
                >
                  <option value="">全部</option>
                  {Object.entries(STATUS_NAMES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="搜索订单号"
                  value={orderNoSearch}
                  onChange={e => setOrderNoSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') setPage(1); }}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 w-52"
                />
              </div>
              <div className="ml-auto text-gray-400 text-sm">共 {total} 笔订单</div>
            </div>
          </div>

          {/* 订单列表 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-400">加载中...</div>
            ) : orders.length === 0 ? (
              <div className="p-12 text-center text-gray-400">暂无订单数据</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">订单号</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">商品</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">分店</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">渠道</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">金额</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">状态</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">创建时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {orders.map(o => (
                      <tr key={o.id} className="hover:bg-gray-50/50 transition">
                        <td className="px-4 py-3 text-gray-900 font-mono text-xs">{o.orderNo}</td>
                        <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">{o.subject}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {o.storeName ? (
                            <>
                              <div>{o.storeName}</div>
                              {o.brandName && <div className="text-xs text-gray-400">{o.brandName}</div>}
                            </>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{CHANNEL_NAMES[o.channel] || o.channel}</td>
                        <td className="px-4 py-3 text-gray-900 font-medium">¥{Number(o.amount).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_NAMES[o.status] || o.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {new Date(o.createdAt).toLocaleString('zh-CN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-gray-400 text-sm">第 {page} / {totalPages} 页</span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1 border border-gray-200 rounded text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition"
                  >
                    上一页
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1 border border-gray-200 rounded text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
