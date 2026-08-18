'use client';

import AdminLayout from '../AdminLayout';

export default function AdminSettingsPage() {
  const settings = [
    {
      category: '平台信息',
      items: [
        { label: '平台名称', value: 'BunnyEra Pay', editable: true },
        { label: '平台简称', value: 'BEP', editable: true },
        { label: '客服邮箱', value: 'support@bunnyera.com', editable: true },
        { label: '客服电话', value: '400-000-0000', editable: true },
      ],
    },
    {
      category: '交易设置',
      items: [
        { label: '默认币种', value: 'CNY（人民币）', editable: false },
        { label: '订单超时', value: '15 分钟', editable: true },
        { label: '最低交易金额', value: '¥0.01', editable: true },
        { label: '单笔最高限额', value: '¥50,000', editable: true },
      ],
    },
    {
      category: '结算设置',
      items: [
        { label: '默认结算周期', value: 'T+1', editable: false },
        { label: '最低结算金额', value: '¥100.00', editable: true },
        { label: '结算手续费率', value: '0.6%', editable: true },
      ],
    },
    {
      category: '安全设置',
      items: [
        { label: '登录失败锁定', value: '5 次后锁定 30 分钟', editable: false },
        { label: 'Token 有效期', value: '24 小时', editable: true },
        { label: 'IP 白名单', value: '未启用', editable: true },
        { label: '双因素认证', value: '未启用', editable: true },
      ],
    },
  ];

  return (
    <AdminLayout title="系统设置">
      {settings.map(section => (
        <div key={section.category} className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4">
          <div className="px-5 py-3 border-b border-gray-50">
            <h3 className="text-gray-900 font-semibold text-sm">{section.category}</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {section.items.map(item => (
              <div key={item.label} className="px-5 py-3 flex items-center justify-between">
                <span className="text-gray-600 text-sm">{item.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 text-sm font-medium">{item.value}</span>
                  {item.editable && (
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded text-xs">可配置</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 说明 */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h3 className="text-gray-700 font-semibold text-sm mb-2">设置说明</h3>
        <p className="text-gray-500 text-sm">
          当前系统设置以默认值运行。标记为「可配置」的项目可在后续版本中通过管理界面直接修改。
          部分核心设置（如默认币种、安全策略）修改后需要重启服务才能生效。
        </p>
      </div>
    </AdminLayout>
  );
}
