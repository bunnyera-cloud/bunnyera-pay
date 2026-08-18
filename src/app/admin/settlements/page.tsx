'use client';

import AdminLayout from '../AdminLayout';

export default function AdminSettlementsPage() {
  const settlementStatuses = [
    { label: '待结算', count: 0, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
    { label: '结算中', count: 0, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
    { label: '已结算', count: 0, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
    { label: '结算失败', count: 0, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
  ];

  return (
    <AdminLayout title="结算状态">
      {/* 概览 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {settlementStatuses.map(s => (
          <div key={s.label} className={`rounded-xl p-5 border ${s.bg}`}>
            <p className="text-gray-500 text-sm mb-1">{s.label}</p>
            <p className={`${s.color} text-3xl font-bold`}>{s.count}</p>
          </div>
        ))}
      </div>

      {/* 结算规则 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4">
        <div className="px-5 py-3 border-b border-gray-50">
          <h3 className="text-gray-900 font-semibold text-sm">结算规则</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold">T+1</div>
            <div>
              <p className="text-gray-900 font-medium text-sm">结算周期</p>
              <p className="text-gray-400 text-xs">交易日次日自动发起结算，遇节假日顺延</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-green-100 text-green-700 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold">D0</div>
            <div>
              <p className="text-gray-900 font-medium text-sm">D+0 即时到账（可选）</p>
              <p className="text-gray-400 text-xs">需额外开通 D0 通道，资金实时到商户银行卡</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center flex-shrink-0 text-sm">%</div>
            <div>
              <p className="text-gray-900 font-medium text-sm">手续费扣除</p>
              <p className="text-gray-400 text-xs">结算时自动扣除平台手续费，商户收到扣费后金额</p>
            </div>
          </div>
        </div>
      </div>

      {/* 说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 className="text-blue-900 font-semibold text-sm mb-2">结算功能说明</h3>
        <p className="text-blue-700 text-sm mb-3">
          自动结算功能需要配置商户的结算银行卡信息和手续费率。系统将在结算日自动计算并发起打款。
        </p>
        <div className="text-blue-600 text-xs space-y-1">
          <p>当前状态：结算模块已就绪，等待商户激活和银行卡配置</p>
          <p>支持通道：支付宝 T+1 / 微信 T+1 / 银联 D+1 / 拉卡拉 D+0</p>
          <p>结算银行：支持工商银行、建设银行、农业银行、招商银行等主流银行</p>
        </div>
      </div>
    </AdminLayout>
  );
}
