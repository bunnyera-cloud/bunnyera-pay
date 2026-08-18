'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '../AdminLayout';

export default function AdminReconciliationPage() {
  const [issues, setIssues] = useState(0);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('bep_token') : null;
    if (!token) return;
    fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(json => { if (json.data) setIssues(json.data.reconciliationIssues || 0); })
      .catch(() => {});
  }, []);

  const issueTypes = [
    { code: 'MISMATCH_AMOUNT', label: '金额不一致', desc: '平台订单金额与渠道通知金额不匹配', count: 0 },
    { code: 'MISSING_IN_CHANNEL', label: '渠道侧缺失', desc: '平台有记录但渠道无对应交易', count: 0 },
    { code: 'MISSING_IN_SYSTEM', label: '系统侧缺失', desc: '渠道有记录但平台无对应订单', count: 0 },
    { code: 'DUPLICATE', label: '重复交易', desc: '同一笔交易在渠道侧出现多条记录', count: 0 },
    { code: 'REFUND_MISMATCH', label: '退款不一致', desc: '退款金额或状态与渠道记录不匹配', count: 0 },
  ];

  return (
    <AdminLayout title="对账异常">
      {/* 概览 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">异常总数</p>
          <p className="text-red-600 text-3xl font-bold">{issues}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">今日对账</p>
          <p className="text-gray-900 text-3xl font-bold">-</p>
          <p className="text-gray-400 text-xs mt-1">对账文件尚未接入</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">对账状态</p>
          <p className="text-amber-600 text-xl font-bold">等待配置</p>
          <p className="text-gray-400 text-xs mt-1">需配置渠道对账文件下载</p>
        </div>
      </div>

      {/* 异常类型 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4">
        <div className="px-5 py-3 border-b border-gray-50">
          <h3 className="text-gray-900 font-semibold text-sm">异常类型说明</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {issueTypes.map(t => (
            <div key={t.code} className="px-5 py-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-medium text-sm">{t.label}</span>
                  <span className="text-gray-400 text-xs font-mono">{t.code}</span>
                </div>
                <p className="text-gray-400 text-xs mt-0.5">{t.desc}</p>
              </div>
              <span className="text-gray-400 text-sm">{t.count} 笔</span>
            </div>
          ))}
        </div>
      </div>

      {/* 说明 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h3 className="text-amber-900 font-semibold text-sm mb-2">对账功能说明</h3>
        <p className="text-amber-700 text-sm mb-3">
          自动对账功能需要配置各支付渠道的对账文件下载。系统将在每日 T+1 自动下载前一天的对账文件，并与平台订单逐笔比对。
        </p>
        <div className="text-amber-600 text-xs space-y-1">
          <p>当前状态：对账文件下载接口尚未配置</p>
          <p>接入后支持：支付宝、微信、银联、拉卡拉对账文件自动下载</p>
          <p>对账频率：每日凌晨自动执行，支持手动触发</p>
        </div>
      </div>
    </AdminLayout>
  );
}
