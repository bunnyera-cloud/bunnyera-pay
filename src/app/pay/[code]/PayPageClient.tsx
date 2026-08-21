'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';

interface QRCodeInfo {
  code: string;
  type: string;
  name: string | null;
  amount: string | null;
  expiredAt: string | null;
  merchantName: string;
  storeName: string | null;
  brandName: string | null;
}

interface ChannelInfo {
  channel: string;
  name: string;
  isSandbox: boolean;
}

const CHANNEL_STYLE: Record<string, { color: string; icon: string; scanTip: string }> = {
  ALIPAY_BAR: { color: 'from-blue-400 to-blue-600', icon: '支', scanTip: '请使用支付宝扫码支付' },
  WECHAT_NATIVE: { color: 'from-green-400 to-green-600', icon: '微', scanTip: '请使用微信扫码支付' },
  UNIONPAY_QR: { color: 'from-red-400 to-red-600', icon: '云', scanTip: '请使用云闪付/银行 App 扫码支付' },
};

interface PayPageClientProps {
  qrCode: QRCodeInfo;
  channels: ChannelInfo[];
  paymentEnv: string;
  paymentEnvLabel: string;
}

export default function PayPageClient({ qrCode, channels, paymentEnv, paymentEnvLabel }: PayPageClientProps) {
  const [amount, setAmount] = useState(qrCode.amount || '');
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [qrImage, setQrImage] = useState('');
  const [payResult, setPayResult] = useState<'idle' | 'paying' | 'success' | 'failed'>('idle');
  const [orderNo, setOrderNo] = useState('');
  const [statusToken, setStatusToken] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const hasFixedAmount = !!qrCode.amount;
  const canPay = hasFixedAmount ? true : !!amount && Number(amount) > 0;

  // 轮询真实订单状态（以渠道回调落库为准，绝不本地模拟成功）
  useEffect(() => {
    if (payResult !== 'paying' || !orderNo || !statusToken) return;
    const timer = setInterval(async () => {
      try {
        const query = new URLSearchParams({ orderNo, statusToken });
        const res = await fetch(`/api/pay/cashier?${query.toString()}`);
        if (!res.ok) return;
        const json = await res.json();
        const status = json.data?.status;
        if (status === 'PAID') {
          setPayResult('success');
          setLoading(false);
          clearInterval(timer);
        } else if (status === 'CLOSED' || status === 'FAILED' || json.data?.expired) {
          setPayResult('failed');
          setErrorMsg(status === 'FAILED' ? '支付创建失败，请重新发起' : '订单已关闭或过期，请重新发起');
          setLoading(false);
          clearInterval(timer);
        }
      } catch {
        // 网络异常忽略，继续轮询
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [payResult, orderNo, statusToken]);

  const handlePay = async (channel: string) => {
    if (!canPay || loading) return;
    setLoading(true);
    setErrorMsg('');
    setSelectedChannel(channel);

    try {
      const res = await fetch('/api/pay/cashier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: qrCode.code,
          amount: hasFixedAmount ? undefined : Number(amount),
          channel,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setPayResult('failed');
        setErrorMsg(json.error || '支付创建失败，请重试');
        setLoading(false);
        return;
      }

      setOrderNo(json.data.orderNo);
      setStatusToken(json.data.statusToken);
      const payData = json.data.payData as string;
      if (payData) {
        const qr = await QRCode.toDataURL(payData, {
          width: 280,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        });
        setQrImage(qr);
      }
      setPayResult('paying');
    } catch {
      setPayResult('failed');
      setErrorMsg('网络异常，请重试');
      setLoading(false);
    }
  };

  const reset = () => {
    setPayResult('idle');
    setQrImage('');
    setOrderNo('');
    setStatusToken('');
    setErrorMsg('');
    setSelectedChannel(null);
  };

  const isPreview = paymentEnv === 'PREVIEW';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 商户信息 */}
        <div className="text-center mb-6">
          {/* 深色背景使用白色版品牌 mark，保持等比 */}
          <Image
            src="/brand/bunnyera-pay/mark/mark-white.png"
            alt="BunnyEra Pay"
            width={275}
            height={117}
            className="h-10 w-auto mx-auto mb-3"
          />
          <h1 className="text-white text-xl font-bold">{qrCode.merchantName}</h1>
          {qrCode.storeName && (
            <p className="text-gray-400 text-sm mt-1">{qrCode.brandName && `${qrCode.brandName} · `}{qrCode.storeName}</p>
          )}
          {qrCode.name && (
            <p className="text-gray-500 text-xs mt-1">{qrCode.name}</p>
          )}
          {isPreview && (
            <p className="text-amber-400 text-xs mt-2">当前为演示预览环境（{paymentEnvLabel}），不产生真实收款</p>
          )}
        </div>

        {/* 支付卡片 */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
          {payResult === 'idle' && (
            <>
              {/* 金额输入 */}
              {!hasFixedAmount && (
                <div className="mb-6">
                  <label className="block text-sm text-gray-400 mb-2">支付金额</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-2xl">¥</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-10 py-4 text-white text-3xl font-bold placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
                      placeholder="0.00"
                      step="0.01"
                      min="0.01"
                    />
                  </div>
                </div>
              )}

              {hasFixedAmount && amount && (
                <div className="text-center mb-6">
                  <p className="text-gray-400 text-sm mb-1">应付金额</p>
                  <p className="text-white text-4xl font-bold">¥{parseFloat(amount).toFixed(2)}</p>
                </div>
              )}

              {/* 支付方式（仅显示商户真实已开通且配置完整的渠道） */}
              {channels.length > 0 ? (
                <>
                  <p className="text-gray-400 text-sm mb-3">选择支付方式</p>
                  <div className="space-y-2">
                    {channels.map(ch => {
                      const style = CHANNEL_STYLE[ch.channel] || CHANNEL_STYLE.ALIPAY_BAR;
                      return (
                        <button
                          key={ch.channel}
                          onClick={() => handlePay(ch.channel)}
                          disabled={loading || !canPay}
                          className="w-full flex items-center gap-4 px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 disabled:opacity-50 transition group"
                        >
                          <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${style.color} flex items-center justify-center flex-shrink-0`}>
                            <span className="text-white font-bold text-sm">{style.icon}</span>
                          </div>
                          <span className="text-white font-medium flex-1 text-left">
                            {ch.name}
                            {ch.isSandbox && <span className="ml-2 text-xs text-amber-400">沙箱</span>}
                          </span>
                          <span className="text-gray-500 group-hover:text-white transition">→</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-300 font-medium mb-1">该商户暂未开通任何支付方式</p>
                  <p className="text-gray-500 text-xs">请联系商户开通支付宝 / 微信支付后再试</p>
                </div>
              )}
            </>
          )}

          {payResult === 'paying' && (
            <div className="text-center py-4">
              <div className="bg-white rounded-xl p-4 inline-block mb-4">
                {qrImage && <img src={qrImage} alt="支付二维码" className="w-56 h-56" />}
              </div>
              <p className="text-white font-medium mb-1">
                {selectedChannel && CHANNEL_STYLE[selectedChannel]?.scanTip}
              </p>
              <p className="text-gray-400 text-sm">订单号：{orderNo}</p>
              {amount && <p className="text-white text-xl font-bold mt-2">¥{parseFloat(amount).toFixed(2)}</p>}
              <div className="mt-4 flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-gray-500 text-xs mt-2">等待支付中，支付结果以渠道通知为准...</p>
              <button
                onClick={reset}
                className="mt-4 px-4 py-1.5 text-gray-400 text-xs border border-white/10 rounded-lg hover:bg-white/5 transition"
              >
                取消支付
              </button>
            </div>
          )}

          {payResult === 'success' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-green-400 text-3xl">✓</span>
              </div>
              <p className="text-white text-xl font-bold mb-1">支付成功</p>
              <p className="text-gray-400 text-sm">订单号：{orderNo}</p>
              {amount && <p className="text-white text-2xl font-bold mt-2">¥{parseFloat(amount).toFixed(2)}</p>}
              <p className="text-gray-500 text-xs mt-4">
                资金由持牌支付机构直接结算到商户企业账户
              </p>
            </div>
          )}

          {payResult === 'failed' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-red-400 text-3xl">✕</span>
              </div>
              <p className="text-white text-xl font-bold mb-1">支付失败</p>
              <p className="text-gray-400 text-sm">{errorMsg || '请重试或联系商户'}</p>
              <button
                onClick={reset}
                className="mt-4 px-6 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm hover:bg-white/20 transition"
              >
                重新支付
              </button>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="text-center mt-6">
          <p className="text-gray-600 text-xs">
            Powered by BunnyEra Pay · 多商户支付管理平台
          </p>
        </div>
      </div>
    </div>
  );
}
