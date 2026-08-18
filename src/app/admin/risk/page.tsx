'use client';

import AdminLayout from '../AdminLayout';

export default function AdminRiskPage() {
  const riskRules = [
    { name: '单笔限额', desc: '单笔交易金额超过设定阈值时触发告警', threshold: '¥50,000', status: 'active' },
    { name: '日累计限额', desc: '单商户单日交易金额超过设定阈值', threshold: '¥500,000', status: 'active' },
    { name: '高频交易', desc: '同一商户短时间内交易笔数异常增多', threshold: '100笔/小时', status: 'active' },
    { name: '同卡多刷', desc: '同一支付账户在不同商户频繁交易', threshold: '5次/天', status: 'active' },
    { name: '异地交易', desc: '交易IP/地理位置与商户注册地不匹配', threshold: '跨省', status: 'ready' },
    { name: '夜间交易', desc: '非正常营业时间的大额交易', threshold: '23:00-06:00', status: 'ready' },
    { name: '整数金额', desc: '大额整数交易（如 ¥10000, ¥50000）', threshold: '≥¥10,000', status: 'ready' },
    { name: '退款率异常', desc: '商户退款率超过正常范围', threshold: '>15%', status: 'active' },
  ];

  return (
    <AdminLayout title="风险事件">
      {/* 概览 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">今日告警</p>
          <p className="text-gray-900 text-2xl font-bold">0</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">已拦截</p>
          <p className="text-red-600 text-2xl font-bold">0</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">待处理</p>
          <p className="text-amber-600 text-2xl font-bold">0</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">风控规则</p>
          <p className="text-blue-600 text-2xl font-bold">{riskRules.length}</p>
        </div>
      </div>

      {/* 风控规则 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4">
        <div className="px-5 py-3 border-b border-gray-50">
          <h3 className="text-gray-900 font-semibold text-sm">风控规则列表</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {riskRules.map((r, i) => (
            <div key={i} className="px-5 py-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-medium text-sm">{r.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {r.status === 'active' ? '已启用' : '待激活'}
                  </span>
                </div>
                <p className="text-gray-400 text-xs mt-0.5">{r.desc}</p>
              </div>
              <span className="text-gray-500 text-sm font-mono">{r.threshold}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 说明 */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-5">
        <h3 className="text-green-900 font-semibold text-sm mb-2">风控系统状态</h3>
        <p className="text-green-700 text-sm">
          风控引擎已内置 {riskRules.length} 条规则，其中 {riskRules.filter(r => r.status === 'active').length} 条已启用。
          当交易触发风控规则时，系统会自动标记并通知平台管理员。所有风控事件记录在系统日志中，支持追溯和审计。
        </p>
      </div>
    </AdminLayout>
  );
}
