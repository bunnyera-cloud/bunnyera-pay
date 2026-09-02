"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface ShopOrderInfo {
  orderNo: string;
  shopOrderNo: string | null;
  amount: string;
  status: string;
  merchantName: string;
  storeName: string | null;
  expired: boolean;
}

interface WalletChannel {
  walletType: "WECHAT" | "ALIPAY" | "UNIONPAY";
  name: string;
  isSandbox: boolean;
}

const WALLET_STYLE: Record<string, { color: string; icon: string; scanTip: string }> = {
  ALIPAY: { color: "from-blue-400 to-blue-600", icon: "支", scanTip: "请使用支付宝扫码支付" },
  WECHAT: { color: "from-green-400 to-green-600", icon: "微", scanTip: "请使用微信扫码支付" },
  UNIONPAY: { color: "from-red-400 to-red-600", icon: "云", scanTip: "请使用云闪付/银行 App 扫码支付" },
};

interface ShopPayClientProps {
  order: ShopOrderInfo;
  token: string;
  channels: WalletChannel[];
  paymentEnv: string;
  paymentEnvLabel: string;
}

export default function ShopPayClient({
  order,
  token,
  channels,
  paymentEnv,
  paymentEnvLabel,
}: ShopPayClientProps) {
  const alreadyPaid = order.status === "PAID";
  const [loading, setLoading] = useState(false);
  const [qrImage, setQrImage] = useState("");
  const [payResult, setPayResult] = useState<"idle" | "paying" | "success" | "failed">(
    alreadyPaid ? "success" : order.expired ? "failed" : "idle",
  );
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState(order.expired && !alreadyPaid ? "订单已过期" : "");

  useEffect(() => {
    if (payResult !== "paying") return;
    const timer = setInterval(async () => {
      try {
        const query = new URLSearchParams({ orderNo: order.orderNo, statusToken: token });
        const res = await fetch(`/api/pay/cashier?${query.toString()}`);
        if (!res.ok) return;
        const json = await res.json();
        const status = json.data?.status;
        if (status === "PAID") {
          setPayResult("success");
          setLoading(false);
          clearInterval(timer);
        } else if (status === "CLOSED" || status === "FAILED" || json.data?.expired) {
          setPayResult("failed");
          setErrorMsg(status === "FAILED" ? "支付创建失败，请重新发起" : "订单已关闭或过期");
          setLoading(false);
          clearInterval(timer);
        }
      } catch {
        // keep polling
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [payResult, order.orderNo, token]);

  const handlePay = async (channel: WalletChannel) => {
    if (loading || alreadyPaid) return;
    setLoading(true);
    setErrorMsg("");
    setSelectedWallet(channel.walletType);
    try {
      const res = await fetch("/api/shop/checkout/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderNo: order.orderNo,
          token,
          walletType: channel.walletType,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data?.payData) {
        setPayResult("failed");
        setErrorMsg(json.error || "支付创建失败");
        setLoading(false);
        return;
      }
      const payData = String(json.data.payData);
      if (/^https?:\/\//i.test(payData)) {
        const image = await QRCode.toDataURL(payData, { width: 280, margin: 1 });
        setQrImage(image);
      } else {
        const image = await QRCode.toDataURL(payData, { width: 280, margin: 1 });
        setQrImage(image);
      }
      setPayResult("paying");
    } catch {
      setPayResult("failed");
      setErrorMsg("网络异常，请重试");
    } finally {
      setLoading(false);
    }
  };

  const isPreview = paymentEnv === "PREVIEW";

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-gray-400 text-sm">{order.merchantName}</p>
          {order.storeName && <p className="text-gray-500 text-xs mt-1">{order.storeName}</p>}
          <p className="text-white text-4xl font-bold mt-3">¥{order.amount}</p>
          <p className="text-gray-500 text-xs mt-3">支付订单号 {order.orderNo}</p>
          {order.shopOrderNo && (
            <p className="text-gray-500 text-xs mt-1">商城订单号 {order.shopOrderNo}</p>
          )}
          {isPreview && (
            <p className="text-amber-400 text-xs mt-2">
              当前为演示预览环境（{paymentEnvLabel}），不产生真实收款
            </p>
          )}
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
          {payResult === "idle" && (
            <>
              {channels.length > 0 ? (
                <>
                  <p className="text-gray-400 text-sm mb-3">选择支付方式</p>
                  <div className="space-y-2">
                    {channels.map((ch) => {
                      const style = WALLET_STYLE[ch.walletType];
                      return (
                        <button
                          key={ch.walletType}
                          onClick={() => handlePay(ch)}
                          disabled={loading}
                          className="w-full flex items-center gap-4 px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 disabled:opacity-50 transition group"
                        >
                          <div
                            className={`w-10 h-10 rounded-lg bg-gradient-to-br ${style.color} flex items-center justify-center flex-shrink-0`}
                          >
                            <span className="text-white font-bold text-sm">{style.icon}</span>
                          </div>
                          <span className="text-white font-medium flex-1 text-left">
                            {ch.name}
                            {ch.isSandbox && (
                              <span className="ml-2 text-xs text-amber-400">沙箱</span>
                            )}
                          </span>
                          <span className="text-gray-500 group-hover:text-white transition">→</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-amber-300 text-sm text-center py-6">支付渠道尚未配置</p>
              )}
            </>
          )}

          {payResult === "paying" && (
            <div className="text-center py-4">
              <div className="bg-white rounded-xl p-4 inline-block mb-4">
                {qrImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrImage} alt="支付二维码" className="w-56 h-56 object-contain" />
                )}
              </div>
              <p className="text-white font-medium mb-1">
                {selectedWallet && WALLET_STYLE[selectedWallet]?.scanTip}
              </p>
              <p className="text-gray-400 text-sm">订单号：{order.orderNo}</p>
              <p className="text-white text-xl font-bold mt-2">¥{order.amount}</p>
              <p className="text-gray-500 text-xs mt-4">等待支付中，支付结果以渠道通知为准...</p>
            </div>
          )}

          {payResult === "success" && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-green-400 text-3xl">✓</span>
              </div>
              <p className="text-white text-xl font-bold mb-1">支付成功</p>
              <p className="text-gray-400 text-sm">订单号：{order.orderNo}</p>
              <p className="text-white text-2xl font-bold mt-2">¥{order.amount}</p>
              <p className="text-gray-500 text-xs mt-4">
                资金由持牌支付机构直接结算到商户企业账户
              </p>
            </div>
          )}

          {payResult === "failed" && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-red-400 text-3xl">✕</span>
              </div>
              <p className="text-white text-xl font-bold mb-1">支付失败</p>
              <p className="text-gray-400 text-sm">{errorMsg || "请重试或联系商户"}</p>
            </div>
          )}
        </div>

        <div className="text-center mt-6">
          <p className="text-gray-600 text-xs">Powered by BunnyEra Pay · 商城订单收银台</p>
        </div>
      </div>
    </div>
  );
}
