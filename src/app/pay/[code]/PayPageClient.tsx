'use client';

import { useEffect, useRef, useState } from 'react';
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
  availability: 'READY' | 'PENDING' | 'MANUAL';
  confirmationMode?: string;
  isSandbox: boolean;
  walletType?: 'WECHAT' | 'ALIPAY' | 'UNIONPAY';
}

const CHANNEL_STYLE: Record<string, { color: string; icon: string; scanTip: string }> = {
  ALIPAY_BAR: { color: 'from-blue-400 to-blue-600', icon: '支', scanTip: '请使用支付宝扫码支付' },
  WECHAT_NATIVE: { color: 'from-green-400 to-green-600', icon: '微', scanTip: '请使用微信扫码支付' },
  WECHAT_EXTERNAL_QR: {
    color: 'from-green-400 to-green-600',
    icon: '微',
    scanTip: '请使用微信扫码。支付完成后由商户人工确认',
  },
  UNIONPAY_QR: { color: 'from-red-400 to-red-600', icon: '云', scanTip: '请使用云闪付/银行 App 扫码支付' },
};

interface PayPageClientProps {
  qrCode: QRCodeInfo;
  channels: ChannelInfo[];
  paymentEnv: string;
  paymentEnvLabel: string;
}

function isDirectImageSource(value: string): boolean {
  return value.startsWith('data:image/') || /^https?:\/\//i.test(value);
}

export default function PayPageClient({ qrCode, channels, paymentEnv, paymentEnvLabel }: PayPageClientProps) {
  const isFixed = qrCode.type === 'FIXED';
  const [amount, setAmount] = useState(isFixed ? (qrCode.amount || '') : '');
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [qrImage, setQrImage] = useState('');
  const [payResult, setPayResult] = useState<'idle' | 'paying' | 'success' | 'failed'>('idle');
  const [orderNo, setOrderNo] = useState('');
  const [statusToken, setStatusToken] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [manualConfirm, setManualConfirm] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');

  const canPay = isFixed ? !!qrCode.amount : !!amount && Number(amount) > 0;
  const submittingRef = useRef(false);

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

  const handlePay = async (channel: ChannelInfo) => {
    if (!canPay || loading || submittingRef.current || channel.availability === 'PENDING') return;
    submittingRef.current = true;
    setLoading(true);
    setErrorMsg('');
    setSelectedChannel(
      channel.walletType === 'ALIPAY'
        ? 'ALIPAY_BAR'
        : channel.walletType === 'WECHAT'
          ? 'WECHAT_NATIVE'
          : channel.walletType === 'UNIONPAY'
            ? 'UNIONPAY_QR'
            : channel.channel,
    );
    setManualConfirm(channel.availability === 'MANUAL');

    try {
      const res = await fetch('/api/pay/cashier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: qrCode.code,
          amount: isFixed ? undefined : Number(amount),
          channel: channel.channel,
          walletType: channel.walletType,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setPayResult('failed');
        setErrorMsg(json.error || '支付创建失败，请重试');
        setLoading(false);
        submittingRef.current = false;
        return;
      }

      setOrderNo(json.data.orderNo);
      setStatusToken(json.data.statusToken);
      setManualConfirm(json.data.confirmationMode === 'MANUAL_CONFIRMATION_REQUIRED' || channel.availability === 'MANUAL');
      setTargetUrl(typeof json.data.targetUrl === 'string' ? json.data.targetUrl : '');
      const payImageUrl = typeof json.data.payImageUrl === 'string' ? json.data.payImageUrl : '';
      const payData = typeof json.data.payData === 'string' ? json.data.payData : '';
      if (payImageUrl && isDirectImageSource(payImageUrl)) {
        setQrImage(payImageUrl);
      } else if (payData && isDirectImageSource(payData) && !payData.startsWith('http://localhost') && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(payData)) {
        setQrImage(payData);
      } else if (payData) {
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
      submittingRef.current = false;
    }
  };

  const reset = () => {
    setPayResult('idle');
    setQrImage('');
    setOrderNo('');
    setStatusToken('');
    setErrorMsg('');
    setSelectedChannel(null);
    setManualConfirm(false);
    setTargetUrl('');
    submittingRef.current = false;
  };

  const isPreview = paymentEnv === 'PREVIEW';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
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

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
          {payResult === 'idle' && (
            <>
              {!isFixed && (
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

              {isFixed && amount && (
                <div className="text-center mb-6">
                  <p className="text-gray-400 text-sm mb-1">应付金额</p>
                  <p className="text-white text-4xl font-bold">¥{parseFloat(amount).toFixed(2)}</p>
                </div>
              )}

              <p className="text-gray-400 text-sm mb-3">选择支付方式</p>
              <div className="space-y-2">
                {channels.map(ch => {
                  const styleKey =
                    ch.walletType === 'ALIPAY'
                      ? 'ALIPAY_BAR'
                      : ch.walletType === 'WECHAT'
                        ? 'WECHAT_NATIVE'
                        : ch.walletType === 'UNIONPAY'
                          ? 'UNIONPAY_QR'
                          : ch.channel;
                  const style = CHANNEL_STYLE[styleKey] || CHANNEL_STYLE.ALIPAY_BAR;
                  const pending = ch.availability === 'PENDING';
                  return (
                    <button
                      key={`${ch.channel}:${ch.walletType || ch.name}`}
                      onClick={() => handlePay(ch)}
                      disabled={loading || !canPay || pending}
                      className="w-full flex items-center gap-4 px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 disabled:opacity-50 transition group"
                    >
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${style.color} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-white font-bold text-sm">{style.icon}</span>
                      </div>
                      <span className="text-white font-medium flex-1 text-left">
                        {ch.name}
                        {pending && <span className="ml-2 text-xs text-amber-400">待开通</span>}
                        {ch.availability === 'MANUAL' && (
                          <span className="ml-2 text-xs text-amber-400">人工确认</span>
                        )}
                        {ch.isSandbox && <span className="ml-2 text-xs text-amber-400">沙箱</span>}
                      </span>
                      <span className="text-gray-500 group-hover:text-white transition">
                        {pending ? '' : '→'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {!channels.some(ch => ch.availability === 'READY' || ch.availability === 'MANUAL') && (
                <p className="text-amber-300 text-sm mt-3 text-center">
                  支付渠道尚未配置
                </p>
              )}
            </>
          )}

          {payResult === 'paying' && (
            <div className="text-center py-4">
              <div className="bg-white rounded-xl p-4 inline-block mb-4">
                {qrImage && <img src={qrImage} alt="支付二维码" className="w-56 h-56 object-contain" />}
              </div>
              <p className="text-white font-medium mb-1">
                {selectedChannel && CHANNEL_STYLE[selectedChannel]?.scanTip}
              </p>
              {manualConfirm && (
                <p className="text-amber-300 text-xs mb-2">
                  MANUAL_CONFIRMATION_REQUIRED · 系统不会自动标记已支付
                </p>
              )}
              <p className="text-gray-400 text-sm">订单号：{orderNo}</p>
              {amount && <p className="text-white text-xl font-bold mt-2">¥{parseFloat(amount).toFixed(2)}</p>}
              {targetUrl && (
                <a
                  href={targetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-3 text-blue-300 text-xs underline"
                >
                  打开微信支付链接
                </a>
              )}
              <div className="mt-4 flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-gray-500 text-xs mt-2">
                {manualConfirm ? '等待商户人工确认收款...' : '等待支付中，支付结果以渠道通知为准...'}
              </p>
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
                {manualConfirm
                  ? '商户已人工确认收到该笔款项'
                  : '资金由持牌支付机构直接结算到商户企业账户'}
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

        <div className="text-center mt-6">
          <p className="text-gray-600 text-xs">
            Powered by BunnyEra Pay · 多商户支付管理平台
          </p>
        </div>
      </div>
    </div>
  );
}
