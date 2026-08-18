'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminLayout from '../AdminLayout';

interface Merchant {
  id: string;
  merchantNo: string;
  companyName: string;
  registrationNo: string;
  legalPerson: string;
  email: string;
  phone: string;
  phoneCode: string;
  country: string;
  businessCategory: string;
  status: string;
  rejectReason: string | null;
  approvedAt: string | null;
  createdAt: string;
  _count: { orders: number };
}

const statusMap: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'bg-gray-100 text-gray-600' },
  SUBMITTED: { label: '待审核', color: 'bg-amber-100 text-amber-700' },
  REVIEWING: { label: '审核中', color: 'bg-blue-100 text-blue-700' },
  SUPPLEMENTARY: { label: '待补充', color: 'bg-purple-100 text-purple-700' },
  APPROVED: { label: '已批准', color: 'bg-green-100 text-green-700' },
  CHANNEL_PROVISION: { label: '渠道配置中', color: 'bg-cyan-100 text-cyan-700' },
  ACTIVE: { label: '已激活', color: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: '已拒绝', color: 'bg-red-100 text-red-700' },
  SUSPENDED: { label: '已暂停', color: 'bg-orange-100 text-orange-700' },
  TERMINATED: { label: '已终止', color: 'bg-gray-300 text-gray-700' },
};

export default function AdminMerchantsPage() {
  return (
    <Suspense fallback={<AdminLayout title="商户管理"><div className="p-12 text-center text-gray-400">加载中...</div></AdminLayout>}>
      <MerchantsContent />
    </Suspense>
  );
}

function MerchantsContent() {
  const searchParams = useSearchParams();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [search, setSearch] = useState('');
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);
  const [reviewAction, setReviewAction] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('bep_token') : null;

  const fetchMerchants = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/merchants?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setMerchants(json.data || []);
        setTotal(json.pagination?.total || 0);
        setTotalPages(json.pagination?.totalPages || 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, statusFilter, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMerchants();
  }, [fetchMerchants]);

  const fetchDetail = async (id: string) => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/merchants/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setDetailData(json.data);
        setShowDetailModal(true);
      }
    } catch { /* ignore */ }
  };

  const handleReview = async (action: string) => {
    if (!selectedMerchant) return;
    const token = getToken();
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/merchants/${selectedMerchant.id}/review`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, rejectReason: action === 'reject' ? rejectReason : undefined }),
      });
      if (res.ok) {
        setShowReviewModal(false);
        setRejectReason('');
        setSelectedMerchant(null);
        fetchMerchants();
      } else {
        const json = await res.json();
        alert(json.error || '操作失败');
      }
    } catch {
      alert('操作失败');
    }
    setActionLoading(false);
  };

  const openReview = (m: Merchant, action: string) => {
    setSelectedMerchant(m);
    setReviewAction(action);
    setShowReviewModal(true);
  };

  const getActions = (status: string) => {
    const actions: { key: string; label: string; color: string }[] = [];
    if (status === 'SUBMITTED') {
      actions.push({ key: 'review', label: '开始审核', color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' });
      actions.push({ key: 'approve', label: '直接通过', color: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' });
      actions.push({ key: 'reject', label: '拒绝', color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' });
      actions.push({ key: 'supplement', label: '要求补充', color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' });
    }
    if (status === 'REVIEWING') {
      actions.push({ key: 'approve', label: '通过', color: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' });
      actions.push({ key: 'reject', label: '拒绝', color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' });
      actions.push({ key: 'supplement', label: '要求补充', color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' });
    }
    if (status === 'SUPPLEMENTARY') {
      actions.push({ key: 'review', label: '重新审核', color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' });
      actions.push({ key: 'reject', label: '拒绝', color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' });
    }
    if (status === 'APPROVED') {
      actions.push({ key: 'activate', label: '激活', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' });
    }
    if (status === 'ACTIVE') {
      actions.push({ key: 'suspend', label: '暂停', color: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100' });
    }
    if (status === 'SUSPENDED') {
      actions.push({ key: 'resume', label: '恢复', color: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' });
      actions.push({ key: 'terminate', label: '终止', color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' });
    }
    return actions;
  };

  return (
    <AdminLayout title="商户管理">
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
            <input
              type="text"
              placeholder="搜索商户名称/编号/邮箱"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchMerchants(); } }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 w-64"
            />
            <button
              onClick={() => { setPage(1); fetchMerchants(); }}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
            >
              搜索
            </button>
          </div>
          <div className="ml-auto text-gray-400 text-sm">
            共 {total} 个商户
          </div>
        </div>
      </div>

      {/* 商户列表 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">加载中...</div>
        ) : merchants.length === 0 ? (
          <div className="p-12 text-center text-gray-400">暂无商户数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">商户编号</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">公司名称</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">法人</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">联系方式</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">行业</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">状态</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">订单</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">注册时间</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {merchants.map(m => {
                  const st = statusMap[m.status] || { label: m.status, color: 'bg-gray-100 text-gray-600' };
                  return (
                    <tr key={m.id} className="hover:bg-gray-50/50 transition">
                      <td className="px-4 py-3 text-gray-900 font-mono text-xs">{m.merchantNo}</td>
                      <td className="px-4 py-3 text-gray-900 font-medium">{m.companyName}</td>
                      <td className="px-4 py-3 text-gray-600">{m.legalPerson}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <div className="text-xs">{m.phoneCode}{m.phone}</div>
                        <div className="text-xs text-gray-400">{m.email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{m.businessCategory}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{m._count.orders}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(m.createdAt).toLocaleDateString('zh-CN')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => fetchDetail(m.id)}
                            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition"
                          >
                            详情
                          </button>
                          {getActions(m.status).map(a => (
                            <button
                              key={a.key}
                              onClick={() => openReview(m, a.key)}
                              className={`px-2 py-1 text-xs border rounded transition ${a.color}`}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

      {/* 审核弹窗 */}
      {showReviewModal && selectedMerchant && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-gray-900 font-semibold text-lg mb-4">
              {reviewAction === 'approve' ? '通过审核' : reviewAction === 'reject' ? '拒绝审核' : reviewAction === 'supplement' ? '要求补充资料' : '确认操作'}
            </h3>
            <p className="text-gray-600 text-sm mb-4">
              商户：<span className="font-medium text-gray-900">{selectedMerchant.companyName}</span>
              <span className="ml-2 text-gray-400">({selectedMerchant.merchantNo})</span>
            </p>
            {reviewAction === 'reject' && (
              <div className="mb-4">
                <label className="text-gray-700 text-sm block mb-1">拒绝原因</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700"
                  rows={3}
                  placeholder="请输入拒绝原因"
                />
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowReviewModal(false); setRejectReason(''); }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 text-sm hover:bg-gray-50 transition"
              >
                取消
              </button>
              <button
                onClick={() => handleReview(reviewAction)}
                disabled={actionLoading}
                className={`px-4 py-2 rounded-lg text-white text-sm transition ${
                  reviewAction === 'approve' ? 'bg-green-600 hover:bg-green-700' :
                  reviewAction === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                  'bg-blue-600 hover:bg-blue-700'
                } disabled:opacity-50`}
              >
                {actionLoading ? '处理中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      {showDetailModal && detailData && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900 font-semibold text-lg">商户详情</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-gray-400">商户编号：</span><span className="text-gray-900 font-mono">{String(detailData.merchantNo)}</span></div>
                <div><span className="text-gray-400">公司名称：</span><span className="text-gray-900">{String(detailData.companyName)}</span></div>
                <div><span className="text-gray-400">法人：</span><span className="text-gray-900">{String(detailData.legalPerson)}</span></div>
                <div><span className="text-gray-400">邮箱：</span><span className="text-gray-900">{String(detailData.email)}</span></div>
                <div><span className="text-gray-400">行业：</span><span className="text-gray-900">{String(detailData.businessCategory)}</span></div>
                <div><span className="text-gray-400">状态：</span><span className="text-gray-900">{String(detailData.status)}</span></div>
              </div>
              {Array.isArray(detailData.members) && (detailData.members as Record<string, unknown>[]).length > 0 && (
                <div>
                  <h4 className="text-gray-700 font-medium mt-4 mb-2">成员 ({(detailData.members as Record<string, unknown>[]).length})</h4>
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 text-gray-500">姓名</th>
                          <th className="text-left px-3 py-2 text-gray-500">邮箱</th>
                          <th className="text-left px-3 py-2 text-gray-500">角色</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detailData.members as Record<string, unknown>[]).map((mem, i) => (
                          <tr key={i} className="border-t border-gray-50">
                            <td className="px-3 py-2 text-gray-900">{String(mem.name)}</td>
                            <td className="px-3 py-2 text-gray-600">{String(mem.email)}</td>
                            <td className="px-3 py-2 text-gray-600">{String(mem.role)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {Array.isArray(detailData.channels) && (detailData.channels as Record<string, unknown>[]).length > 0 && (
                <div>
                  <h4 className="text-gray-700 font-medium mt-4 mb-2">渠道配置</h4>
                  <div className="flex flex-wrap gap-2">
                    {(detailData.channels as Record<string, unknown>[]).map((ch, i) => (
                      <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">{String(ch.channel)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
