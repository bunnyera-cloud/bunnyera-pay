'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '../AdminLayout';

interface LogEntry {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  result: string;
  detail: string | null;
  createdAt: string;
  operatorName: string | null;
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('bep_platform_token') : null;
    if (!token) return;
    fetch('/api/admin/logs', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(json => {
        if (json.data) setLogs(json.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const actionLabels: Record<string, string> = {
    MERCHANT_REVIEW: '商户审核',
    MERCHANT_APPROVE: '商户通过',
    MERCHANT_REJECT: '商户拒绝',
    MERCHANT_ACTIVATE: '商户激活',
    MERCHANT_SUSPEND: '商户暂停',
    MERCHANT_UPDATE: '商户更新',
    REFUND_APPROVE: '退款批准',
    REFUND_REJECT: '退款拒绝',
    PLATFORM_LOGIN: '平台登录',
  };

  return (
    <AdminLayout title="系统日志">
      {/* 概览 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">日志总数</p>
          <p className="text-gray-900 text-2xl font-bold">{loading ? '-' : logs.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">今日操作</p>
          <p className="text-blue-600 text-2xl font-bold">
            {loading ? '-' : logs.filter(l => new Date(l.createdAt).toDateString() === new Date().toDateString()).length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">操作类型</p>
          <p className="text-gray-900 text-2xl font-bold">{Object.keys(actionLabels).length}</p>
        </div>
      </div>

      {/* 日志列表 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">加载中...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📝</span>
            </div>
            <p>暂无审计日志</p>
            <p className="text-xs mt-1">商户审核、退款操作等关键动作将自动记录在此</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">时间</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">操作人</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">操作</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">资源</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">结果</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">详情</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{new Date(l.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3 text-gray-900 text-sm">{l.operatorName || '系统'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                        {actionLabels[l.action] || l.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      <span className="font-mono">{l.resource}:{l.resourceId.slice(0, 8)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        l.result === 'SUCCESS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {l.result === 'SUCCESS' ? '成功' : '失败'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-32 truncate">{l.detail || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
