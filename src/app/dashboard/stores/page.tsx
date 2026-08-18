'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Brand {
  id: string;
  name: string;
  code: string;
  stores: Store[];
}

interface Store {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  departments: Department[];
}

interface Department {
  id: string;
  name: string;
  code: string;
}

export default function StoresPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    brandName: '',
    brandCode: '',
    storeName: '',
    storeCode: '',
    address: '',
    phone: '',
  });

  const fetchStores = async () => {
    try {
      const token = (localStorage.getItem('bep_merchant_token') || localStorage.getItem('bep_token'));
      const res = await fetch('/api/stores', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setBrands(json.data);
      }
    } catch {
      console.error('Failed to fetch stores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = (localStorage.getItem('bep_merchant_token') || localStorage.getItem('bep_token'));
    if (!token) { router.push('/login'); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const token = (localStorage.getItem('bep_merchant_token') || localStorage.getItem('bep_token'));
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          departments: [{ name: '默认部门', code: 'DEPT001' }],
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ brandName: '', brandCode: '', storeName: '', storeCode: '', address: '', phone: '' });
        fetchStores();
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
            { href: '/dashboard', label: '工作台', icon: '📊' },
            { href: '/dashboard/orders', label: '订单管理', icon: '📋' },
            { href: '/dashboard/refunds', label: '退款管理', icon: '↩️' },
            { href: '/dashboard/stores', label: '门店管理', icon: '🏪' },
            { href: '/dashboard/qrcodes', label: '收款码', icon: '📱' },
            { href: '/dashboard/channels', label: '支付渠道', icon: '💳' },
            { href: '/dashboard/employees', label: '员工管理', icon: '👥' },
            { href: '/dashboard/finance', label: '对账结算', icon: '💰' },
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
            <span>🖥️</span>
            <span>收银台</span>
          </Link>
          <button onClick={() => { localStorage.removeItem('bep_token'); localStorage.removeItem('bep_user'); router.push('/login'); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white text-sm transition">
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
            <h1 className="text-white font-semibold text-lg">门店管理</h1>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            + 新建门店
          </button>
        </header>

        <div className="p-6">
          {loading ? (
            <div className="text-gray-400 text-center py-12">加载中...</div>
          ) : brands.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-lg mb-2">暂无门店</p>
              <p className="text-gray-500 text-sm mb-6">创建您的第一个门店和收款码</p>
              <button
                onClick={() => setShowForm(true)}
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition"
              >
                创建门店
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {brands.map(brand => (
                <div key={brand.id} className="bg-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-white font-semibold text-lg">{brand.name}</h3>
                      <p className="text-gray-500 text-xs">品牌编号：{brand.code}</p>
                    </div>
                    <span className="text-gray-400 text-sm">{brand.stores.length} 个门店</span>
                  </div>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {brand.stores.map(store => (
                      <div key={store.id} className="bg-white/5 border border-white/10 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-white font-medium">{store.name}</h4>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${store.isActive ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}`}>
                            {store.isActive ? '营业中' : '已停用'}
                          </span>
                        </div>
                        <p className="text-gray-500 text-xs mb-1">编号：{store.code}</p>
                        {store.address && <p className="text-gray-400 text-xs mb-1"> {store.address}</p>}
                        {store.phone && <p className="text-gray-400 text-xs">📞 {store.phone}</p>}
                        <div className="mt-3 pt-3 border-t border-white/5">
                          <p className="text-gray-500 text-xs mb-1">{store.departments.length} 个部门</p>
                          <div className="flex flex-wrap gap-1">
                            {store.departments.map(dept => (
                              <span key={dept.id} className="text-xs bg-white/5 text-gray-400 px-2 py-0.5 rounded">
                                {dept.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 创建门店弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-semibold text-lg">新建门店</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">品牌名称 *</label>
                  <input
                    type="text"
                    value={form.brandName}
                    onChange={e => setForm(p => ({ ...p, brandName: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    placeholder="如：奕溪咖啡"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">品牌编号 *</label>
                  <input
                    type="text"
                    value={form.brandCode}
                    onChange={e => setForm(p => ({ ...p, brandCode: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    placeholder="如：YXCOFFEE"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">门店名称 *</label>
                  <input
                    type="text"
                    value={form.storeName}
                    onChange={e => setForm(p => ({ ...p, storeName: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    placeholder="如：旗舰店"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">门店编号 *</label>
                  <input
                    type="text"
                    value={form.storeCode}
                    onChange={e => setForm(p => ({ ...p, storeCode: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    placeholder="如：STORE001"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">门店地址</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="门店详细地址"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">联系电话</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="门店联系电话"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-white/20 text-white py-2.5 rounded-lg font-medium hover:bg-white/5 transition">
                  取消
                </button>
                <button type="submit" disabled={submitting} className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition">
                  {submitting ? '创建中...' : '创建门店'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
