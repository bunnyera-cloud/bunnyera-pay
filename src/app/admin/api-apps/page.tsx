'use client';

import AdminLayout from '../AdminLayout';

export default function AdminApiAppsPage() {
  return (
    <AdminLayout title="API 应用">
      {/* 概览 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">应用总数</p>
          <p className="text-gray-900 text-3xl font-bold">0</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">活跃应用</p>
          <p className="text-green-600 text-3xl font-bold">0</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">今日 API 调用</p>
          <p className="text-blue-600 text-3xl font-bold">0</p>
        </div>
      </div>

      {/* 空状态 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center mb-4">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🔑</span>
        </div>
        <h3 className="text-gray-900 font-semibold mb-2">暂无 API 应用</h3>
        <p className="text-gray-400 text-sm mb-4">
          API 应用功能允许商户通过 API 接口接入 BunnyEra Pay 支付能力。
          商户激活后可在商户后台创建 API 应用，获取 AppKey 和 AppSecret。
        </p>
      </div>

      {/* 功能说明 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-3 border-b border-gray-50">
          <h3 className="text-gray-900 font-semibold text-sm">API 接入能力</h3>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center flex-shrink-0 text-sm">📡</div>
              <div>
                <p className="text-gray-900 font-medium text-sm">RESTful API</p>
                <p className="text-gray-400 text-xs">标准 REST 接口，支持创建订单、查询、退款等操作</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 text-green-700 rounded-lg flex items-center justify-center flex-shrink-0 text-sm">🔔</div>
              <div>
                <p className="text-gray-900 font-medium text-sm">异步回调</p>
                <p className="text-gray-400 text-xs">支付结果异步通知，支持验签和重试机制</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center flex-shrink-0 text-sm">🔐</div>
              <div>
                <p className="text-gray-900 font-medium text-sm">RSA 签名</p>
                <p className="text-gray-400 text-xs">请求参数 RSA-SHA256 签名验证，保障数据安全</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center flex-shrink-0 text-sm">📊</div>
              <div>
                <p className="text-gray-900 font-medium text-sm">SDK 支持</p>
                <p className="text-gray-400 text-xs">提供 Java / PHP / Python / Node.js SDK</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
