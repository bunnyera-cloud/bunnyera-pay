'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface StoreOption {
  id: string;
  name: string;
  brandName: string;
}

const QUICK_AMOUNTS = ['0.01', '1.00', '10.00', '100.00'];

export default function CreateCollectPage() {
  const router = useRouter();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [merchantName, setMerchantName] = useState('');
  const [amount, setAmount] = useState('0.01');
  const [subject, setSubject] = useState('支付测试');
  const [storeId, setStoreId] = useState('');
  const [channel, setChannel] = useState('ALIPAY_BAR');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async (token: string) => {
    const userStr = localStorage.getItem('bep_merchant_user');
    if (userStr) {
      try { setMerchantName(JSON.parse(userStr).merchantName || ''); } catch {}
    }
    fetch('/api/stores', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (!json?.data) return;
        const list: StoreOption[] = [];
        json.data.forEach((brand: { name: string; stores?: Array<{ id: string; name: string }> }) => {
          (brand.stores || []).forEach(s => list.push({ id: s.id, name: s.name, brandName: brand.name }));
        });
        setStores(list);
      })
      .catch(() => {});
  };

  useEffect(() => {
    const token = localStorage.getItem('bep_merchant_token');
    if (!token) { router.push('/login'); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) { setError('请输入正确的金额'); return; }
    if (!subject.trim()) { setError('请填写商品名称'); return; }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('bep_merchant_token');
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount: Math.round(value * 100) / 100,
          subject: remark.trim() ? `${subject.trim()}（${remark.trim()}）` : subject.trim(),
          channel,
          scene: 'QR_CODE',
          storeId: storeId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || '创建订单失败');
        return;
      }
      router.push(`/dashboard/collect/${json.data.orderNo}`);
    } catch {
      setError('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

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
        <h1 className="text-gray-700 font-medium">创建收款码</h1>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 sm:p-7 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">收款金额（CNY）</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-gray-400">¥</span>
              <input
                type="number" step="0.01" min="0.01" inputMode="decimal" value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full pl-10 pr-4 py-3 text-3xl font-bold text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 mt-3">
              {QUICK_AMOUNTS.map(a => (
                <button key={a} type="button" onClick={() => setAmount(a)}
                  className={`px-3 py-1.5 text-sm rounded-lg border ${amount === a ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  ¥{a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">商品名称 / 订单标题</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">商户</label>
              <input value={merchantName || '当前登录商户'} disabled
                className="w-full px-4 py-2.5 border border-gray-200 bg-gray-50 rounded-lg text-gray-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">门店</label>
              <select value={storeId} onChange={e => setStoreId(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">不指定门店</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.brandName} - {s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">支付方式</label>
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { value: 'ALIPAY_BAR', title: '支付宝扫码', desc: '当面付 · 生成二维码' },
                { value: 'ALIPAY_PC', title: '支付宝电脑网站', desc: 'PC 跳转支付' },
                { value: 'ALIPAY_WAP', title: '支付宝手机网站', desc: 'H5 跳转支付' },
              ].map(opt => (
                <button key={opt.value} type="button" onClick={() => setChannel(opt.value)}
                  className={`text-left px-4 py-3 rounded-lg border-2 transition ${channel === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="text-sm font-medium text-gray-900">{opt.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">订单备注（可选）</label>
            <input value={remark} onChange={e => setRemark(e.target.value)} maxLength={100}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {error && <div className="px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

          <button type="submit" disabled={submitting}
            className="w-full py-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-base">
            {submitting ? '正在创建订单...' : '生成支付宝收款码'}
          </button>
        </form>
      </main>
    </div>
  );
}
