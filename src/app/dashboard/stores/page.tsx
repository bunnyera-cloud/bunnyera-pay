'use client';

import { useEffect, useState } from 'react';
import MerchantShell from '@/components/bunnyera-pay/MerchantShell';
import Card from '@/components/bunnyera-pay/Card';
import Badge from '@/components/bunnyera-pay/Badge';
import Button from '@/components/bunnyera-pay/Button';
import Input from '@/components/bunnyera-pay/Input';
import Modal from '@/components/bunnyera-pay/Modal';
import EmptyState from '@/components/bunnyera-pay/EmptyState';
import { PlusIcon, StoreIcon } from '@/components/bunnyera-pay/icons';

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
      const token = localStorage.getItem('bep_merchant_token');
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
    const token = localStorage.getItem('bep_merchant_token');
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStores();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const token = localStorage.getItem('bep_merchant_token');
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
    <MerchantShell
      title="门店管理"
      description="管理品牌与分店，每个商户主体最多 10 个分店"
      actions={
        <Button onClick={() => setShowForm(true)}>
          <PlusIcon className="w-4 h-4" />
          新建门店
        </Button>
      }
    >
      {loading ? (
        <div className="text-slate-400 text-center py-12 text-sm">加载中...</div>
      ) : brands.length === 0 ? (
        <Card>
          <EmptyState
            icon={<StoreIcon className="w-6 h-6" />}
            title="暂无门店"
            description="创建您的第一个品牌和分店，再为分店生成收款码"
            action={<Button onClick={() => setShowForm(true)}>创建门店</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {brands.map(brand => (
            <Card key={brand.id}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div>
                  <h3 className="text-slate-900 font-semibold text-base">{brand.name}</h3>
                  <p className="text-slate-400 text-xs mt-0.5">品牌编号：{brand.code}</p>
                </div>
                <Badge tone="info">{brand.stores.length} 个门店</Badge>
              </div>
              <div className="p-5 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {brand.stores.map(store => (
                  <div key={store.id} className="border border-slate-200 rounded-xl p-4 hover:border-blue-200 transition">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-slate-900 font-medium text-sm">{store.name}</h4>
                      {store.isActive ? <Badge tone="success">营业中</Badge> : <Badge tone="muted">已停用</Badge>}
                    </div>
                    <p className="text-slate-400 text-xs mb-1">编号：{store.code}</p>
                    {store.address ? <p className="text-slate-500 text-xs mb-1">{store.address}</p> : null}
                    {store.phone ? <p className="text-slate-500 text-xs">电话：{store.phone}</p> : null}
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-slate-400 text-xs mb-1.5">{store.departments.length} 个部门</p>
                      <div className="flex flex-wrap gap-1">
                        {store.departments.map(dept => (
                          <span key={dept.id} className="text-xs bg-slate-50 border border-slate-200 text-slate-500 px-2 py-0.5 rounded">
                            {dept.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 创建门店弹窗 */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="新建门店" maxWidth="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="品牌名称"
              required
              value={form.brandName}
              onChange={e => setForm(p => ({ ...p, brandName: e.target.value }))}
              placeholder="如：奕溪咖啡"
            />
            <Input
              label="品牌编号"
              required
              value={form.brandCode}
              onChange={e => setForm(p => ({ ...p, brandCode: e.target.value }))}
              placeholder="如：YXCOFFEE"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="门店名称"
              required
              value={form.storeName}
              onChange={e => setForm(p => ({ ...p, storeName: e.target.value }))}
              placeholder="如：旗舰店"
            />
            <Input
              label="门店编号"
              required
              value={form.storeCode}
              onChange={e => setForm(p => ({ ...p, storeCode: e.target.value }))}
              placeholder="如：STORE001"
            />
          </div>
          <Input
            label="门店地址"
            value={form.address}
            onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
            placeholder="门店详细地址"
          />
          <Input
            label="联系电话"
            type="tel"
            value={form.phone}
            onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
            placeholder="门店联系电话"
          />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? '创建中...' : '创建门店'}
            </Button>
          </div>
        </form>
      </Modal>
    </MerchantShell>
  );
}
