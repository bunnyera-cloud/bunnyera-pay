'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import QRCode from 'qrcode';

interface OrderDetail {
  orderNo: string;
  subject: string;
  amount: number;
  currency: string;
  channel: string;
  status: string;
  channelTradeNo: string | null;
  payData: string | null;
  paymentEnv: string | null;
  merchantName: string | null;
  storeName: string | null;
  brandName: string | null;
  createdAt: string;
  expiredAt: string | null;
  paidAt: string | null;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  CREATED: { label: '等待支付', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  PAYING: { label: '等待支付', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  PAID: { label: '支付成功', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CLOSED: { label: '已关闭 / 已过期', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  FAILED: { label: '支付失败', cls: 'bg-red-50 text-red-700 border-red-200' },
  REFUNDED: { label: '已退款', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  PARTIALLY_REFUNDED: { label: '部分退款', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
};

const fmtTime = (v?: string | null) =>
  v
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(new Date(v)).replace(/\//g, '-')
    : '—';

const fmtAmount = (n: number) =>
  `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CollectQrPage() {
  const params = useParams<{ orderNo: string }>();
  const router = useRouter();
  const orderNo = params.orderNo;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const token = () => (typeof window === 'undefined' ? '' : (localStorage.getItem('bep_merchant_token') || localStorage.getItem('bep_token')) || '');

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${orderNo}`, { headers: { Authorization: `Bearer ${token()}` } });
    const json = await res.json();
    if (!res.ok || !json.success) { setError(json.error || '订单加载失败'); return null; }
    setOrder(json.data as OrderDetail);
    return json.data as OrderDetail;
  }, [orderNo]);

  const sync = useCallback(async (manual = false) => {
    if (manual) setSyncing(true);
    try {
      await fetch(`/api/orders/${orderNo}/sync`, {
        method: 'POST', headers: { Authorization: `Bearer ${token()}` },
      });
      await load();
    } finally {
      if (manual) setSyncing(false);
    }
  }, [orderNo, load]);

  // 初始化 + 轮询
  useEffect(() => {
    if (!token()) { router.push('/login'); return; }
    load();
    timerRef.current = setInterval(() => { sync(); }, 4000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNo]);

  // 终态停止轮询
  useEffect(() => {
    if (order && order.status !== 'CREATED' && order.status !== 'PAYING' && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [order?.status]);

  // 生成二维码
  useEffect(() => {
    if (!order?.payData) { setQrDataUrl(''); return; }
    QRCode.toDataURL(order.payData, { width: 640, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => setError('二维码生成失败'));
  }, [order?.payData]);

  // 有效期倒计时
  useEffect(() => {
    if (!order?.expiredAt) { setCountdown(null); return; }
    const tick = () => {
      const left = Math.floor((new Date(order.expiredAt!).getTime() - Date.now()) / 1000);
      setCountdown(left > 0 ? left : 0);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [order?.expiredAt]);

  const status = order ? STATUS_MAP[order.status] ?? { label: order.status, cls: 'bg-gray-100 text-gray-600 border-gray-200' } : null;
  const isPending = order?.status === 'CREATED' || order?.status === 'PAYING';
  const isPreview = order?.paymentEnv === 'PREVIEW';
  const isRedirect = !!order?.payData && /^https?:\/\//i.test(order.payData) && !isPreview;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-3">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">B</span>
          </div>
          <span className="text-gray-900 font-bold">BunnyEra Pay</span>
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-gray-700 font-medium">收款二维码</h1>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6">
        {error && <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
        {!order ? (
          <div className="py-24 text-center text-gray-400">加载中...</div>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,360px)_1fr] gap-5">
            {/* 二维码卡片 */}
            <section className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <div className="text-4xl font-bold text-gray-900">{fmtAmount(order.amount)}</div>
              <div className="text-sm text-gray-500 mt-1">{order.subject}</div>

              <div className="mt-5 flex items-center justify-center">
                {order.status === 'PAID' ? (
                  <div className="w-56 h-56 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-white text-3xl">✓</div>
                    <div className="mt-3 text-emerald-700 font-semibold text-lg">支付成功</div>
                    <div className="text-xs text-emerald-600 mt-1">{fmtTime(order.paidAt)}</div>
                  </div>
                ) : !isPending ? (
                  <div className="w-56 h-56 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500">
                    {status?.label}
                  </div>
                ) : qrDataUrl ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt={`订单 ${order.orderNo} 支付二维码`} className="w-56 h-56 rounded-xl border border-gray-200" />
                  </div>
                ) : (
                  <div className="w-56 h-56 rounded-xl bg-gray-100 animate-pulse" />
                )}
              </div>

              {isPending && (
                <>
                  <p className="mt-4 text-sm text-gray-600">
                    请使用<span className="font-medium text-blue-600">支付宝</span>扫描上方二维码完成付款
                  </p>
                  {countdown !== null && (
                    <p className="mt-1 text-xs text-gray-400">
                      {countdown > 0
                        ? `二维码有效时间剩余 ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}`
                        : '二维码已过期，请重新创建收款'}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-gray-400">二维码出现不代表支付成功，需等待服务端确认结果</p>
                </>
              )}

              {isRedirect && (
                <a href={order.payData!} target="_blank" rel="noreferrer"
                  className="mt-4 inline-block text-sm text-blue-600 hover:underline">在浏览器中打开支付页面</a>
              )}

              {isPreview && isPending && (
                <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-left">
                  <div className="text-xs font-medium text-amber-800">演示预览模式（非真实收款）</div>
                  <p className="text-xs text-amber-700 mt-1">
                    支付渠道尚未配置或未审核通过，此二维码不会产生真实资金。
                  </p>
                  <button
                    onClick={async () => {
                      await fetch(`/api/orders/${orderNo}/preview-paid`, {
                        method: 'POST', headers: { Authorization: `Bearer ${token()}` },
                      });
                      load();
                    }}
                    className="mt-2 text-xs px-3 py-1.5 rounded-md bg-amber-600 text-white">
                    模拟支付成功（仅演示）
                  </button>
                </div>
              )}
            </section>

            {/* 订单详情 */}
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">订单信息</h2>
                {status && (
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${status.cls}`}>
                    {status.label}
                  </span>
                )}
              </div>

              <dl className="mt-4 divide-y divide-gray-100 text-sm">
                {[
                  ['订单编号', order.orderNo],
                  ['商品名称', order.subject],
                  ['支付金额', `CNY ${fmtAmount(order.amount)}`],
                  ['支付方式', order.channel.startsWith('ALIPAY') ? '支付宝' : order.channel],
                  ['商户', order.merchantName || '—'],
                  ['门店', order.storeName ? `${order.brandName ? order.brandName + ' - ' : ''}${order.storeName}` : '—'],
                  ['渠道交易号', order.channelTradeNo || '—'],
                  ['支付环境', order.paymentEnv === 'PRODUCTION' ? '正式生产环境' : order.paymentEnv === 'SANDBOX' ? '支付宝沙箱' : '演示预览'],
                  ['创建时间', fmtTime(order.createdAt)],
                  ['过期时间', fmtTime(order.expiredAt)],
                  ['支付时间', fmtTime(order.paidAt)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2.5">
                    <dt className="text-gray-500 shrink-0">{k}</dt>
                    <dd className="text-gray-900 text-right break-all font-medium">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={() => sync(true)} disabled={syncing}
                  className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium">
                  {syncing ? '正在刷新...' : '刷新支付状态'}
                </button>
                {isPending && (
                  <button
                    onClick={async () => {
                      await fetch(`/api/orders/${orderNo}/close`, {
                        method: 'POST', headers: { Authorization: `Bearer ${token()}` },
                      });
                      load();
                    }}
                    className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">
                    关闭订单
                  </button>
                )}
                <Link href="/dashboard/collect"
                  className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">
                  再创建一笔收款
                </Link>
              </div>

              {isPending && (
                <p className="mt-3 text-xs text-gray-400">页面每 4 秒自动向支付宝查询一次支付结果</p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
