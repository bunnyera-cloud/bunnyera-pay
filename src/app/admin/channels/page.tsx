"use client";

import AdminLayout from "../AdminLayout";

const channels = [
  {
    name: "支付宝条码",
    code: "ALIPAY_BAR",
    category: "支付宝",
    status: "ready",
    desc: "线下扫码收款，用户出示付款码",
  },
  {
    name: "支付宝PC",
    code: "ALIPAY_PC",
    category: "支付宝",
    status: "ready",
    desc: "PC网页扫码支付",
  },
  {
    name: "支付宝WAP",
    code: "ALIPAY_WAP",
    category: "支付宝",
    status: "ready",
    desc: "手机网页支付",
  },
  {
    name: "微信Native",
    code: "WECHAT_NATIVE",
    category: "微信支付",
    status: "ready",
    desc: "扫码支付（自动生成二维码）",
  },
  {
    name: "微信H5",
    code: "WECHAT_H5",
    category: "微信支付",
    status: "ready",
    desc: "手机浏览器内微信支付",
  },
  {
    name: "微信JSAPI",
    code: "WECHAT_JSAPI",
    category: "微信支付",
    status: "ready",
    desc: "微信公众号/小程序内支付",
  },
  {
    name: "微信小程序",
    code: "WECHAT_MINI",
    category: "微信支付",
    status: "ready",
    desc: "微信小程序内支付",
  },
  {
    name: "银联网关",
    code: "UNIONPAY_GATEWAY",
    category: "银联",
    status: "draft",
    desc: "Provider 尚未完成签名、查单与验签",
  },
  {
    name: "银联WAP",
    code: "UNIONPAY_WAP",
    category: "银联",
    status: "draft",
    desc: "Provider 尚未完成签名、查单与验签",
  },
  {
    name: "银联二维码",
    code: "UNIONPAY_QR",
    category: "银联",
    status: "draft",
    desc: "Provider 尚未完成签名、查单与验签",
  },
  {
    name: "拉卡拉聚合",
    code: "LAKALA_AGGREGATE",
    category: "拉卡拉",
    status: "draft",
    desc: "尚未接入 Provider Adapter",
  },
];

export default function AdminChannelsPage() {
  const categories = [...new Set(channels.map((c) => c.category))];

  return (
    <AdminLayout title="渠道管理">
      {/* 概览 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">支付渠道总数</p>
          <p className="text-gray-900 text-2xl font-bold">{channels.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">Provider 已就绪</p>
          <p className="text-green-600 text-2xl font-bold">
            {channels.filter((c) => c.status === "ready").length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">已配置商户</p>
          <p className="text-blue-600 text-2xl font-bold">-</p>
          <p className="text-gray-400 text-xs mt-1">需配置凭证</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-500 text-xs mb-1">运行状态</p>
          <p className="text-amber-600 text-2xl font-bold">待凭据</p>
          <p className="text-gray-400 text-xs mt-1">以商户实际配置为准</p>
        </div>
      </div>

      {/* 渠道列表 */}
      {categories.map((cat) => (
        <div
          key={cat}
          className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4"
        >
          <div className="px-5 py-3 border-b border-gray-50">
            <h3 className="text-gray-900 font-semibold text-sm">{cat}</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {channels
              .filter((c) => c.category === cat)
              .map((ch) => (
                <div
                  key={ch.code}
                  className="px-5 py-3 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900 font-medium text-sm">
                        {ch.name}
                      </span>
                      <span className="text-gray-400 text-xs font-mono">
                        {ch.code}
                      </span>
                    </div>
                    <p className="text-gray-400 text-xs mt-0.5">{ch.desc}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {ch.status === "ready" ? (
                      <>
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          代码链路就绪
                        </span>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                          待配置凭证
                        </span>
                      </>
                    ) : (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                        Provider 未完成
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}

      {/* 说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 className="text-blue-900 font-semibold text-sm mb-2">
          接入真实支付通道
        </h3>
        <p className="text-blue-700 text-sm mb-3">
          支付宝与微信支付已具备 fail-closed
          代码链路，但仍需真实商户凭据与平台证书；银联和拉卡拉 Provider
          尚未完成。
        </p>
        <div className="text-blue-600 text-xs space-y-1">
          <p>支付宝：需要 AppID、应用私钥、支付宝平台公钥或证书</p>
          <p>
            微信支付：需要 AppID、商户号、APIv3
            Key、商户私钥/序列号、微信平台公钥/序列号
          </p>
          <p>银联：当前禁止真实下单，待完成官方签名、查单、退款与通知验签</p>
          <p>拉卡拉：当前尚无 Provider Adapter</p>
        </div>
      </div>
    </AdminLayout>
  );
}
