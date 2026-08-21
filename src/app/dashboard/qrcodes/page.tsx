'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import MerchantShell from '@/components/bunnyera-pay/MerchantShell';
import Card from '@/components/bunnyera-pay/Card';
import Badge from '@/components/bunnyera-pay/Badge';
import Button from '@/components/bunnyera-pay/Button';
import Input, { FieldLabel } from '@/components/bunnyera-pay/Input';
import Select from '@/components/bunnyera-pay/Select';
import Modal from '@/components/bunnyera-pay/Modal';
import EmptyState from '@/components/bunnyera-pay/EmptyState';
import { PlusIcon, QrIcon, EyeIcon, CopyIcon } from '@/components/bunnyera-pay/icons';

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
        // Flatten stores from brands（API 返回 brands[].stores[] 嵌套结构，展平时携带所属品牌名）
        const allStores: Store[] = [];
        json.data.forEach((brand: { name?: string; stores?: Store[] }) => {
          (brand.stores || []).forEach((s: Store) => allStores.push({ ...s, brand: { name: brand.name || '未命名品牌' } }));
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
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, []);

  const handlePreview = async (item: QRCodeItem) => {
    setShowPreview(item);
    try {
      const img = await QRCode.toDataURL(item.payUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#0F172A', light: '#ffffff' },
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
    <MerchantShell
      title="收款码"
      description="每个分店拥有独立聚合收款码，支持支付宝、微信支付"
      actions={
        <Button onClick={() => setShowForm(true)}>
          <PlusIcon className="w-4 h-4" />
          生成收款码
        </Button>
      }
    >
      {loading ? (
        <div className="text-slate-400 text-center py-12 text-sm">加载中...</div>
      ) : qrCodes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<QrIcon className="w-6 h-6" />}
            title="暂无收款码"
            description="生成您的第一个收款码，支持支付宝、微信、云闪付"
            action={<Button onClick={() => setShowForm(true)}>生成收款码</Button>}
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {qrCodes.map(qr => (
            <Card key={qr.id} className="p-5 hover:border-blue-200 transition">
              <div className="flex items-center justify-between mb-3">
                <Badge tone={qr.type === 'FIXED' ? 'info' : 'purple'}>
                  {qr.type === 'FIXED' ? '固定码' : '动态码'}
                </Badge>
                {qr.isActive ? <Badge tone="success">有效</Badge> : <Badge tone="muted">已停用</Badge>}
              </div>
              <h3 className="text-slate-900 font-medium mb-1">{qr.name}</h3>
              {qr.store ? (
                <p className="text-slate-500 text-xs mb-1">{qr.store.brand.name} · {qr.store.name}</p>
              ) : null}
              {qr.amount ? (
                <p className="text-slate-900 text-2xl font-bold mt-2">¥{parseFloat(qr.amount).toFixed(2)}</p>
              ) : null}
              <p className="text-slate-400 text-xs font-mono mt-2 break-all">{qr.code}</p>
              <div className="flex gap-2 mt-4">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => handlePreview(qr)}>
                  <EyeIcon className="w-4 h-4" />
                  预览二维码
                </Button>
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => copyUrl(qr.payUrl)}>
                  <CopyIcon className="w-4 h-4" />
                  复制链接
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 创建收款码弹窗 */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="生成收款码">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel>码类型</FieldLabel>
            <div className="flex rounded-lg bg-slate-50 border border-slate-200 p-1">
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, type: 'FIXED' }))}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition ${form.type === 'FIXED' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
              >
                固定入口码
              </button>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, type: 'DYNAMIC' }))}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition ${form.type === 'DYNAMIC' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
              >
                动态订单码
              </button>
            </div>
          </div>
          <Input
            label="收款码名称"
            required
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="如：前台收款码"
          />
          <div>
            <FieldLabel required>关联分店</FieldLabel>
            <Select
              value={form.storeId}
              onChange={e => setForm(p => ({ ...p, storeId: e.target.value }))}
              required
            >
              <option value="">请选择分店</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.brand?.name || '未命名品牌'} - {s.name}</option>
              ))}
            </Select>
          </div>
          {form.type === 'DYNAMIC' ? (
            <Input
              label="固定金额（可选）"
              type="number"
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              placeholder="留空则顾客自行输入金额"
              step="0.01"
              min="0.01"
            />
          ) : null}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? '生成中...' : '生成收款码'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 二维码预览弹窗 */}
      <Modal open={!!showPreview} onClose={() => setShowPreview(null)} title={showPreview?.name || '预览'}>
        {showPreview ? (
          <div className="text-center">
            <div className="bg-white border border-slate-200 rounded-xl p-4 inline-block mb-4">
              {previewImage ? <img src={previewImage} alt="收款码" className="w-56 h-56" /> : null}
            </div>
            <p className="text-slate-500 text-xs mb-1">
              {showPreview.type === 'FIXED' ? '固定入口码 · 长期有效' : '动态订单码 · 24小时有效'}
            </p>
            {showPreview.amount ? (
              <p className="text-slate-900 text-xl font-bold">¥{parseFloat(showPreview.amount).toFixed(2)}</p>
            ) : null}
            <p className="text-slate-400 text-xs font-mono mt-2 break-all">{showPreview.payUrl}</p>
            <Button className="mt-4 w-full" onClick={() => copyUrl(showPreview.payUrl)}>
              复制支付链接
            </Button>
          </div>
        ) : null}
      </Modal>
    </MerchantShell>
  );
}
