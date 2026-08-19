'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '../AdminLayout';

interface OrderItem {
  id: string;
  orderNo: string;
  subject: string;
  amount: number;
  refundAmount: number;
  currency: string;
  channel: string;
  scene: string;
  status: string;
  channelTradeNo: string | null;
  paidAt: string | null;
  createdAt: string;
  merchant: { companyName: string; merchantNo: string };
}

const statusMap: Record<string, { label: string; color: string }> = {
  CREATED: { label: '已创建', color: 'bg-gray-100 text-gray-600' },
  PAYING: { label: '支付中', color: 'bg-blue-100 text-blue-700' },
  PAID: { label: '已支付', color: 'bg-green-100 text-green-700' },
  FAILED: { label: '支付失败', color: 'bg-red-100 text-red-700' },
  CLOSED: { label: '已关闭', color: 'bg-gray-100 text-gray-500' },
  EXPIRED: { label: '已过期', color: 'bg-gray-100 text-gray-400' },
  REFUNDED: { label: '已退款', color: 'bg-purple-100 text-purple-700' },
  PARTIALLY_REFUNDED: { label: '部分退款', color: 'bg-amber-100 text-amber-700' },
};

const channelLabels: Record<string, string> = {
  ALIPAY_BAR: '支付宝条码', ALIPAY_PC: '支付宝PC', ALIPAY_WAP: '支付宝WAP',
  WECHAT_NATIVE: '微信Native', WECHAT_H5: '微信H5', WECHAT_JSAPI: '微信JSAPI', WECHAT_MINI: '微信小程序',
  UNIONPAY_GATEWAY: '银联网关', UNIONPAY_WAP: '银联WAP', UNIONPAY_QR: '银联二维码',
  LAKALA_AGGREGATE: '拉卡拉聚合',
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [orderNoSearch, setOrderNoSearch] = useState('');

  const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('bep_platform_token') : null;

  const fetchOrders = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (channelFilter) params.set('channel', channelFilter);
      if (orderNoSearch) params.set('orderNo', orderNoSearch);
      const res = await fetch(`/api/admin/orders?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setOrders(json.data || []);
        setTotal(json.pagination?.total || 0);
        setTotalPages(json.pagination?.totalPages || 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, statusFilter, channelFilter, orderNoSearch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOrders();
  }, [fetchOrders]);

  // 计算汇总
  const totalAmount = orders.reduce((sum, o) => sum + Number(o.amount), 0);
  const paidCount = orders.filter(o => o.status === 'PAID').length;

  return (
    <AdminLayout title="订单监控">
      {/* 统计概览 */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">订单总数</p>
          <p className="text-gray-900 text-2xl font-bold">{total}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">已支付</p>
          <p className="text-green-600 text-2xl font-bold">{paidCount}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">当前页金额</p>
          <p className="text-blue-600 text-2xl font-bold">¥{totalAmount.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">当前页订单</p>
          <p className="text-gray-900 text-2xl font-bold">{orders.length}</p>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm">状态：</span>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white [&>option]:bg-white [&>option]:text-gray-700"
            >
              <option value="">全部</option>
              {Object.entries(statusMap).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm">渠道：</span>
            <select
              value={channelFilter}
              onChange={(e) => { setChannelFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white [&>option]:bg-white [&>option]:text-gray-700"
            >
              <option value="">全部</option>
              {Object.entries(channelLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="订单号搜索"
              value={orderNoSearch}
              onChange={(e) => setOrderNoSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchOrders(); } }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 w-48"
            />
            <button
              onClick={() => { setPage(1); fetchOrders(); }}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
            >
              搜索
            </button>
          </div>
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
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">商户</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">商品</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">金额</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">渠道</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">状态</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">创建时间</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">支付时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map(o => {
                  const st = statusMap[o.status] || { label: o.status, color: 'bg-gray-100 text-gray-600' };
                  return (
                    <tr key={o.id} className="hover:bg-gray-50/50 transition">
                      <td className="px-4 py-3 text-gray-900 font-mono text-xs">{o.orderNo}</td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900 text-sm">{o.merchant?.companyName || '-'}</div>
                        <div className="text-gray-400 text-xs font-mono">{o.merchant?.merchantNo || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-40 truncate">{o.subject}</td>
                      <td className="px-4 py-3 text-gray-900 font-medium text-right">¥{Number(o.amount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{channelLabels[o.channel] || o.channel}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(o.createdAt).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{o.paidAt ? new Date(o.paidAt).toLocaleString('zh-CN') : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-gray-400 text-sm">第 {page} / {totalPages} 页，共 {total} 条</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border border-gray-200 rounded text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition">上一页</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border border-gray-200 rounded text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition">下一页</button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
