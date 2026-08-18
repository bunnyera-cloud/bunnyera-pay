'use client';

import AdminLayout from '../AdminLayout';

const roles = [
  { name: 'PLATFORM_SUPER_ADMIN', label: '超级管理员', desc: '拥有平台全部管理权限', count: 1, color: 'bg-red-100 text-red-700' },
  { name: 'PLATFORM_REVIEWER', label: '平台审核员', desc: '商户审核、退款审核权限', count: 0, color: 'bg-blue-100 text-blue-700' },
  { name: 'MERCHANT_OWNER', label: '商户法人', desc: '商户最高权限，可管理全部商户功能', count: 0, color: 'bg-purple-100 text-purple-700' },
  { name: 'MERCHANT_ADMIN', label: '商户管理员', desc: '门店管理、员工管理、数据查看', count: 0, color: 'bg-indigo-100 text-indigo-700' },
  { name: 'FINANCE', label: '财务人员', desc: '对账、结算、退款管理', count: 0, color: 'bg-green-100 text-green-700' },
  { name: 'STORE_MANAGER', label: '门店店长', desc: '门店级订单和收款码管理', count: 0, color: 'bg-cyan-100 text-cyan-700' },
  { name: 'CASHIER', label: '收银员', desc: '发起收款、查看个人订单', count: 0, color: 'bg-amber-100 text-amber-700' },
  { name: 'CUSTOMER_SERVICE', label: '客服', desc: '查看订单、发起退款', count: 0, color: 'bg-gray-100 text-gray-700' },
];

export default function AdminUsersPage() {
  return (
    <AdminLayout title="员工权限">
      {/* 概览 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">平台管理员</p>
          <p className="text-gray-900 text-3xl font-bold">1</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">商户成员总数</p>
          <p className="text-gray-900 text-3xl font-bold">-</p>
          <p className="text-gray-400 text-xs mt-1">待商户激活后统计</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">角色类型</p>
          <p className="text-blue-600 text-3xl font-bold">{roles.length}</p>
        </div>
      </div>

      {/* 角色列表 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4">
        <div className="px-5 py-3 border-b border-gray-50">
          <h3 className="text-gray-900 font-semibold text-sm">角色权限矩阵</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {roles.map(r => (
            <div key={r.name} className="px-5 py-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.color}`}>{r.label}</span>
                  <span className="text-gray-400 text-xs font-mono">{r.name}</span>
                </div>
                <p className="text-gray-400 text-xs mt-0.5">{r.desc}</p>
              </div>
              <span className="text-gray-500 text-sm">{r.count} 人</span>
            </div>
          ))}
        </div>
      </div>

      {/* 权限说明 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-3 border-b border-gray-50">
          <h3 className="text-gray-900 font-semibold text-sm">权限说明</h3>
        </div>
        <div className="p-5 text-sm text-gray-600 space-y-2">
          <p>平台管理员通过后台登录，管理商户审核、系统配置、对账结算等全局功能。</p>
          <p>商户成员由商户法人（MERCHANT_OWNER）在商户后台创建和管理，每个成员绑定一个角色。</p>
          <p>角色权限遵循最小权限原则，不同角色只能访问其职责范围内的功能模块。</p>
          <p className="text-gray-400 text-xs">后续可扩展：自定义角色、数据权限、操作审批流等高级权限管理功能。</p>
        </div>
      </div>
    </AdminLayout>
  );
}
