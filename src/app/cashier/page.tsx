'use client';

import { useState } from 'react';
import QRCode from 'qrcode';

export default function CashierPage() {
  const [mode, setMode] = useState<'fixed' | 'dynamic'>('dynamic');
  const [amount, setAmount] = useState('');
  const [subject, setSubject] = useState('');
  const [channel, setChannel] = useState('ALIPAY_BAR');
  const [qrData, setQrData] = useState('');
  const [loading, setLoading] = useState(false);
  const [orderNo, setOrderNo] = useState('');

  // 生成收银台二维码
  const generateQR = async () => {
    if (mode === 'dynamic') {
      if (!amount || !subject) return;
      setLoading(true);
      try {
        const token = localStorage.getItem('bep_merchant_token');
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount: parseFloat(amount),
            subject,
            channel,
            scene: 'CASHIER',
          }),
        });
        const data = await res.json();
        if (data.success) {
          setOrderNo(data.data.orderNo);
          // 生成二维码内容（实际项目中应该指向收银台页面 URL）
          const payUrl = data.data.payData || `${window.location.origin}/pay/${data.data.orderNo}`;
          const qr = await QRCode.toDataURL(payUrl, {
            width: 300,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
          });
          setQrData(qr);
        }
      } catch (err) {
        console.error('QR generation error:', err);
      } finally {
        setLoading(false);
      }
    } else {
      // 固定码 - 生成指向收银台的 URL
      const fixedUrl = `${window.location.origin}/cashier/pay`;
      QRCode.toDataURL(fixedUrl, {
        width: 300,
        margin: 2,
      }).then(setQrData);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-lg">B</span>
          </div>
          <h1 className="text-white text-xl font-bold">BunnyEra Pay 收银台</h1>
          <p className="text-gray-400 text-sm mt-1">扫码支付</p>
        </div>

        {/* 模式选择 */}
        <div className="flex rounded-lg bg-white/5 p-1 mb-6">
          <button
            onClick={() => setMode('dynamic')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
              mode === 'dynamic' ? 'bg-blue-500 text-white' : 'text-gray-400'
            }`}
          >
            动态订单码
          </button>
          <button
            onClick={() => setMode('fixed')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
              mode === 'fixed' ? 'bg-blue-500 text-white' : 'text-gray-400'
            }`}
          >
            固定入口码
          </button>
        </div>

        {mode === 'dynamic' && (
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm text-gray-300 mb-1">商品/服务描述</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                placeholder="如：商品名称"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">金额（元）</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-2xl font-bold placeholder-gray-500 focus:outline-none focus:border-blue-500"
                placeholder="0.00"
                step="0.01"
                min="0.01"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">支付渠道</label>
              <select
                value={channel}
                onChange={e => setChannel(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 [&>option]:bg-slate-800 [&>option]:text-white"
              >
                <option value="ALIPAY_BAR">支付宝当面付</option>
                <option value="WECHAT_NATIVE">微信扫码</option>
                <option value="UNIONPAY_QR">云闪付</option>
              </select>
            </div>
          </div>
        )}

        {mode === 'fixed' && (
          <div className="mb-6 text-center py-4">
            <p className="text-gray-400 text-sm">
              固定入口码长期有效，客户扫码后自行输入金额并选择支付方式
            </p>
          </div>
        )}

        {/* 生成按钮 */}
        <button
          onClick={generateQR}
          disabled={loading || (mode === 'dynamic' && (!amount || !subject))}
          className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-3 rounded-lg font-medium transition mb-6"
        >
          {loading ? '生成中...' : '生成收款码'}
        </button>

        {/* 二维码展示 */}
        {qrData && (
          <div className="text-center">
            <div className="bg-white rounded-xl p-4 inline-block">
              <img src={qrData} alt="收款二维码" className="w-64 h-64" />
            </div>
            {orderNo && (
              <p className="text-gray-400 text-xs mt-3 font-mono">订单号：{orderNo}</p>
            )}
            {amount && (
              <p className="text-white text-lg font-bold mt-2">¥{parseFloat(amount).toFixed(2)}</p>
            )}
            <p className="text-gray-500 text-xs mt-2">
              {mode === 'dynamic' ? '15分钟内有效' : '长期有效'}
            </p>
          </div>
        )}

        {/* 底部提示 */}
        <div className="mt-8 pt-4 border-t border-white/5 text-center">
          <p className="text-gray-500 text-xs">
            资金由持牌支付机构直接结算到商户企业账户
          </p>
          <p className="text-gray-600 text-xs mt-1">
            Powered by BunnyEra Pay
          </p>
        </div>
      </div>
    </div>
  );
}
