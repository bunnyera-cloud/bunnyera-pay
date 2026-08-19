'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';

interface QRCodeItem {
  id: string;
  code: string;
  type: string;
  name: string;
  amount: string | null;
  isActive: boolean;
  payUrl: string;
  store: {
    name: string;
    brand: { name: string };
  } | null;
  createdAt: string;
}

interface Store {
  id: string;
  name: string;
  brand: { name: string };
}

export default function QRCodesPage() {
  const router = useRouter();
  const [qrCodes, setQrCodes] = useState<QRCodeItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState<QRCodeItem | null>(null);
  const [previewImage, setPreviewImage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: 'FIXED' as 'FIXED' | 'DYNAMIC',
    name: '',
    storeId: '',
    amount: '',
  });

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('bep_merchant_token');
      const [qrRes, storeRes] = await Promise.all([
        fetch('/api/qrcodes', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/stores', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (qrRes.ok) {
        const json = await qrRes.json();
        setQrCodes(json.data);
      }
      if (storeRes.ok) {
        const json = await storeRes.json();
        // Flatten stores from brands
        const allStores: Store[] = [];
        json.data.forEach((brand: { stores: Store[] }) => {
          brand.stores.forEach((s: Store) => allStores.push(s));
        });
        setStores(allStores);
      }
    } catch {
      console.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('bep_merchant_token');
    if (!token) { router.push('/login'); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePreview = async (item: QRCodeItem) => {
    setShowPreview(item);
    try {
      const img = await QRCode.toDataURL(item.payUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setPreviewImage(img);
    } catch {
      setPreviewImage('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.storeId) {
      alert('请选择关联分店');
      return;
    }
    setSubmitting(true);
    try {
      const token = localStorage.getItem('bep_merchant_token');
      const res = await fetch('/api/qrcodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: form.type,
          name: form.name,
          storeId: form.storeId,
          amount: form.amount ? parseFloat(form.amount) : undefined,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ type: 'FIXED', name: '', storeId: '', amount: '' });
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || '创建失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    alert('链接已复制到剪贴板');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* 侧边栏 */}
      <aside className="w-64 bg-slate-800/50 border-r border-white/5 flex-shrink-0">
        <div className="p-4 border-b border-white/5">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span className="text-white font-semibold">BunnyEra Pay</span>
          </Link>
        </div>
        <nav className="p-2 space-y-1">
          {[
            { href: '/dashboard', label: '工作台', icon: '' },
            { href: '/dashboard/orders', label: '订单管理', icon: '' },
            { href: '/dashboard/refunds', label: '退款管理', icon: '↩️' },
            { href: '/dashboard/stores', label: '门店管理', icon: '' },
            { href: '/dashboard/qrcodes', label: '收款码', icon: '' },
            { href: '/dashboard/channels', label: '支付渠道', icon: '' },
            { href: '/dashboard/employees', label: '员工管理', icon: '' },
            { href: '/dashboard/finance', label: '对账结算', icon: '' },
            { href: '/dashboard/settings', label: '商户设置', icon: '⚙️' },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:bg-white/5 hover:text-white text-sm transition"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-4 left-2 right-2">
          <Link href="/cashier" className="flex items-center gap-3 px-3 py-2 rounded-lg text-blue-400 hover:bg-white/5 text-sm transition mb-1">
            <span>️</span>
            <span>收银台</span>
          </Link>
          <button onClick={() => { localStorage.removeItem('bep_merchant_token'); localStorage.removeItem('bep_merchant_user'); router.push('/login'); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white text-sm transition">
            <span>🚪</span>
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="flex-1 overflow-auto">
        <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-gray-400 hover:text-white">←</Link>
            <h1 className="text-white font-semibold text-lg">收款码管理</h1>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            + 生成收款码
          </button>
        </header>

        <div className="p-6">
          {loading ? (
            <div className="text-gray-400 text-center py-12">加载中...</div>
          ) : qrCodes.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">📱</div>
              <p className="text-gray-400 text-lg mb-2">暂无收款码</p>
              <p className="text-gray-500 text-sm mb-6">生成您的第一个收款码，支持支付宝、微信、云闪付</p>
              <button
                onClick={() => setShowForm(true)}
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition"
              >
                生成收款码
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {qrCodes.map(qr => (
                <div key={qr.id} className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/8 transition">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      qr.type === 'FIXED' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                    }`}>
                      {qr.type === 'FIXED' ? '固定码' : '动态码'}
                    </span>
                    <span className={`text-xs ${qr.isActive ? 'text-green-400' : 'text-gray-500'}`}>
                      {qr.isActive ? '● 有效' : '○ 已停用'}
                    </span>
                  </div>
                  <h3 className="text-white font-medium mb-1">{qr.name}</h3>
                  {qr.store && (
                    <p className="text-gray-400 text-xs mb-1">{qr.store.brand.name} · {qr.store.name}</p>
                  )}
                  {qr.amount && (
                    <p className="text-white text-lg font-bold mt-2">¥{parseFloat(qr.amount).toFixed(2)}</p>
                  )}
                  <p className="text-gray-500 text-xs font-mono mt-2 break-all">{qr.code}</p>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => handlePreview(qr)}
                      className="flex-1 bg-white/5 border border-white/10 text-white text-xs py-2 rounded-lg hover:bg-white/10 transition"
                    >
                      预览二维码
                    </button>
                    <button
                      onClick={() => copyUrl(qr.payUrl)}
                      className="flex-1 bg-white/5 border border-white/10 text-white text-xs py-2 rounded-lg hover:bg-white/10 transition"
                    >
                      复制链接
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 创建收款码弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-semibold text-lg">生成收款码</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">码类型</label>
                <div className="flex rounded-lg bg-white/5 p-1">
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, type: 'FIXED' }))}
                    className={`flex-1 py-2 rounded-md text-sm font-medium transition ${form.type === 'FIXED' ? 'bg-blue-500 text-white' : 'text-gray-400'}`}
                  >
                    固定入口码
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, type: 'DYNAMIC' }))}
                    className={`flex-1 py-2 rounded-md text-sm font-medium transition ${form.type === 'DYNAMIC' ? 'bg-blue-500 text-white' : 'text-gray-400'}`}
                  >
                    动态订单码
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">收款码名称 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="如：前台收款码"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">关联分店（必选）</label>
                <select
                  value={form.storeId}
                  onChange={e => setForm(p => ({ ...p, storeId: e.target.value }))}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 [&>option]:bg-slate-800 [&>option]:text-white"
                >
                  <option value="">请选择分店</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.brand.name} - {s.name}</option>
                  ))}
                </select>
              </div>
              {form.type === 'DYNAMIC' && (
                <div>
                  <label className="block text-sm text-gray-300 mb-1">固定金额（可选）</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    placeholder="留空则顾客自行输入金额"
                    step="0.01"
                    min="0.01"
                  />
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-white/20 text-white py-2.5 rounded-lg font-medium hover:bg-white/5 transition">
                  取消
                </button>
                <button type="submit" disabled={submitting} className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition">
                  {submitting ? '生成中...' : '生成收款码'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 二维码预览弹窗 */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-sm text-center">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">{showPreview.name}</h3>
              <button onClick={() => setShowPreview(null)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="bg-white rounded-xl p-4 inline-block mb-4">
              {previewImage && <img src={previewImage} alt="收款码" className="w-56 h-56" />}
            </div>
            <p className="text-gray-400 text-xs mb-1">
              {showPreview.type === 'FIXED' ? '固定入口码 · 长期有效' : '动态订单码 · 24小时有效'}
            </p>
            {showPreview.amount && (
              <p className="text-white text-xl font-bold">¥{parseFloat(showPreview.amount).toFixed(2)}</p>
            )}
            <p className="text-gray-500 text-xs font-mono mt-2 break-all">{showPreview.payUrl}</p>
            <button
              onClick={() => copyUrl(showPreview.payUrl)}
              className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg text-sm font-medium transition"
            >
              复制支付链接
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
