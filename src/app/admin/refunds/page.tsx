'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '../AdminLayout';

interface RefundItem {
  id: string;
  refundNo: string;
  orderId: string;
  merchantId: string;
  amount: number;
  reason: string | null;
  status: string;
  requestedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  processedAt: string | null;
  createdAt: string;
  order: { orderNo: string; subject: string; amount: number } | null;
  merchant: { companyName: string; merchantNo: string } | null;
}

const statusMap: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待审核', color: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: '已批准', color: 'bg-blue-100 text-blue-700' },
  PROCESSING: { label: '处理中', color: 'bg-cyan-100 text-cyan-700' },
  SUCCESS: { label: '退款成功', color: 'bg-green-100 text-green-700' },
  FAILED: { label: '退款失败', color: 'bg-red-100 text-red-700' },
  REJECTED: { label: '已拒绝', color: 'bg-gray-100 text-gray-600' },
};

export default function AdminRefundsPage() {
  const [refunds, setRefunds] = useState<RefundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('bep_platform_token') : null;

  const fetchRefunds = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/admin/refunds?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setRefunds(json.data || []);
        setTotal(json.pagination?.total || 0);
        setTotalPages(json.pagination?.totalPages || 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRefunds();
  }, [fetchRefunds]);

  const handleAction = async (refundId: string, action: 'approve' | 'reject') => {
    const token = getToken();
    if (!token) return;
    setActionLoading(refundId);
    try {
      const res = await fetch('/api/admin/refunds', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refundId, action }),
      });
      if (res.ok) {
        fetchRefunds();
      } else {
        const json = await res.json();
        alert(json.error || '操作失败');
      }
    } catch {
      alert('操作失败');
    }
    setActionLoading(null);
  };

  const pendingCount = refunds.filter(r => r.status === 'PENDING').length;
  const totalAmount = refunds.reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <AdminLayout title="退款审核">
      {/* 统计 */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">退款总数</p>
          <p className="text-gray-900 text-2xl font-bold">{total}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">待审核</p>
          <p className="text-amber-600 text-2xl font-bold">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">当前页退款金额</p>
          <p className="text-red-600 text-2xl font-bold">¥{totalAmount.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">当前页退款</p>
          <p className="text-gray-900 text-2xl font-bold">{refunds.length}</p>
        </div>
      </div>

      {/* 筛选 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex items-center gap-3">
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
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">加载中...</div>
        ) : refunds.length === 0 ? (
          <div className="p-12 text-center text-gray-400">暂无退款数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">退款编号</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">商户</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">关联订单</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">退款金额</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">原因</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">状态</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">申请时间</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {refunds.map(r => {
                  const st = statusMap[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-600' };
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50 transition">
                      <td className="px-4 py-3 text-gray-900 font-mono text-xs">{r.refundNo}</td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900 text-sm">{r.merchant?.companyName || '-'}</div>
                        <div className="text-gray-400 text-xs font-mono">{r.merchant?.merchantNo || '-'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-600 text-xs font-mono">{r.order?.orderNo || '-'}</div>
                        <div className="text-gray-400 text-xs">{r.order?.subject || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-red-600 font-medium text-right">¥{Number(r.amount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-32 truncate">{r.reason || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(r.createdAt).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-3">
                        {r.status === 'PENDING' ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleAction(r.id, 'approve')}
                              disabled={actionLoading === r.id}
                              className="px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 transition disabled:opacity-50"
                            >
                              批准
                            </button>
                            <button
                              onClick={() => handleAction(r.id, 'reject')}
                              disabled={actionLoading === r.id}
                              className="px-2 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100 transition disabled:opacity-50"
                            >
                              拒绝
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
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
