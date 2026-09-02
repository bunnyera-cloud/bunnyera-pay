'use client';

import { useEffect, useMemo, useState } from 'react';
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
  storeId: string;
  merchant?: { companyName?: string; merchantNo?: string } | null;
  store: {
    id?: string;
    name: string;
    isActive?: boolean;
    brand?: { name: string };
  } | null;
  counter?: { id: string; name: string } | null;
  operator?: { id: string; name: string; email?: string } | null;
  paidOrderCount?: number;
  paidAmount?: number;
  createdAt: string;
}

interface CounterOption {
  id: string;
  name: string;
  departmentId: string;
}

interface Store {
  id: string;
  name: string;
  isActive?: boolean;
  brand: { name: string };
  departments?: { id: string; counters?: { id: string; name: string; isActive?: boolean }[] }[];
}

interface OperatorOption {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  storeAccesses?: { store: { id: string } }[];
}

interface QrStats {
  today: { createdOrders: number; paidOrders: number; paidAmount: number };
  lifetime: {
    paidOrders: number;
    paidAmount: number;
    wechatAmount: number;
    alipayAmount: number;
    unionpayAmount: number;
  };
}

interface QrOrderRow {
  orderNo: string;
  amount: number;
  status: string;
  walletType: string | null;
  paymentChannel: string;
  channelTradeNo: string | null;
  createdAt: string;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('bep_merchant_token');
  return { Authorization: `Bearer ${token}` };
}

async function downloadAuthenticated(path: string, filename: string) {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) throw new Error('下载失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function QRCodesPage() {
  const [qrCodes, setQrCodes] = useState<QRCodeItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState<QRCodeItem | null>(null);
  const [previewImage, setPreviewImage] = useState('');
  const [detail, setDetail] = useState<QRCodeItem | null>(null);
  const [stats, setStats] = useState<QrStats | null>(null);
  const [orders, setOrders] = useState<QrOrderRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<QRCodeItem | null>(null);
  const [editName, setEditName] = useState('');
  const [form, setForm] = useState({
    type: 'DYNAMIC' as 'FIXED' | 'DYNAMIC',
    name: '',
    storeId: '',
    counterId: '',
    operatorId: '',
    amount: '',
  });

  const counters = useMemo<CounterOption[]>(() => {
    const store = stores.find(item => item.id === form.storeId);
    if (!store) return [];
    const list: CounterOption[] = [];
    (store.departments || []).forEach(department => {
      (department.counters || [])
        .filter(counter => counter.isActive !== false)
        .forEach(counter => {
          list.push({ id: counter.id, name: counter.name, departmentId: department.id });
        });
    });
    return list;
  }, [stores, form.storeId]);

  const fetchData = async () => {
    try {
      const [qrRes, storeRes, memberRes] = await Promise.all([
        fetch('/api/qrcodes', { headers: authHeaders() }),
        fetch('/api/stores', { headers: authHeaders() }),
        fetch('/api/merchant/members', { headers: authHeaders() }),
      ]);
      if (qrRes.ok) {
        const json = await qrRes.json();
        setQrCodes(json.data);
      }
      if (storeRes.ok) {
        const json = await storeRes.json();
        const allStores: Store[] = [];
        json.data.forEach((brand: { name?: string; stores?: Store[] }) => {
          (brand.stores || []).forEach((store) => {
            allStores.push({
              ...store,
              brand: { name: brand.name || store.brand?.name || '未命名品牌' },
            });
          });
        });
        setStores(allStores);
      }
      if (memberRes.ok) {
        const json = await memberRes.json();
        setOperators(json.data || []);
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
    setPreviewImage('');
    try {
      const res = await fetch(`/api/qrcodes/${item.id}/image`, { headers: authHeaders() });
      if (!res.ok) return;
      const blob = await res.blob();
      setPreviewImage(URL.createObjectURL(blob));
    } catch {
      setPreviewImage('');
    }
  };

  const openDetail = async (item: QRCodeItem) => {
    setDetail(item);
    setStats(null);
    setOrders([]);
    try {
      const [statsRes, orderRes] = await Promise.all([
        fetch(`/api/qrcodes/${item.id}/stats`, { headers: authHeaders() }),
        fetch(`/api/qrcodes/${item.id}/orders`, { headers: authHeaders() }),
      ]);
      if (statsRes.ok) {
        const json = await statsRes.json();
        setStats(json.data);
      }
      if (orderRes.ok) {
        const json = await orderRes.json();
        setOrders(json.data || []);
      }
    } catch {
      setStats(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.storeId) {
      alert('请选择关联分店');
      return;
    }
    if (form.type === 'FIXED' && !form.amount) {
      alert('固定收款码必须填写固定金额');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/qrcodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          type: form.type,
          name: form.name,
          storeId: form.storeId,
          counterId: form.counterId || undefined,
          operatorId: form.operatorId || undefined,
          amount: form.type === 'FIXED' && form.amount ? parseFloat(form.amount) : undefined,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ type: 'DYNAMIC', name: '', storeId: '', counterId: '', operatorId: '', amount: '' });
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

  const patchQr = async (item: QRCodeItem, payload: { isActive?: boolean; name?: string }) => {
    const res = await fetch(`/api/qrcodes/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || '更新失败');
      return false;
    }
    fetchData();
    return true;
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editName.trim()) return;
    const ok = await patchQr(editing, { name: editName.trim() });
    if (ok) {
      setEditing(null);
      setEditName('');
    }
  };

  const deleteQr = async (item: QRCodeItem) => {
    if (!confirm(`停用收款码 ${item.name}？`)) return;
    const res = await fetch(`/api/qrcodes/${item.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || '删除失败');
      return;
    }
    fetchData();
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      alert('链接已复制到剪贴板');
    } catch {
      window.prompt('复制支付链接', url);
    }
  };

  const activeStores = stores.filter(store => store.isActive !== false);
  const eligibleOperators = operators.filter((member) => {
    if (!member.isActive) return false;
    if (!form.storeId) return true;
    if (['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE'].includes(member.role)) return true;
    return (member.storeAccesses || []).some(access => access.store.id === form.storeId);
  });

  return (
    <MerchantShell
      title="收款码"
      description="每个分店可生成独立聚合收款码。二维码不绑定支付渠道，顾客扫码后由系统路由当前可用渠道"
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
            description="生成您的第一个收款码。二维码不绑定某一家支付渠道"
            action={<Button onClick={() => setShowForm(true)}>生成收款码</Button>}
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {qrCodes.map(qr => (
            <Card key={qr.id} className="p-5 hover:border-blue-200 transition">
              <div className="flex items-center justify-between mb-3">
                <Badge tone={qr.type === 'FIXED' ? 'info' : 'purple'}>
                  {qr.type === 'FIXED' ? '固定金额码' : '动态金额码'}
                </Badge>
                {qr.isActive ? <Badge tone="success">有效</Badge> : <Badge tone="muted">已停用</Badge>}
              </div>
              <h3 className="text-slate-900 font-medium mb-1">{qr.name}</h3>
              {qr.store ? (
                <p className="text-slate-500 text-xs mb-1">{qr.store.brand?.name} · {qr.store.name}</p>
              ) : null}
              {qr.counter ? <p className="text-slate-500 text-xs">柜台：{qr.counter.name}</p> : null}
              {qr.operator ? <p className="text-slate-500 text-xs">员工：{qr.operator.name}</p> : null}
              {qr.amount ? (
                <p className="text-slate-900 text-2xl font-bold mt-2">¥{parseFloat(qr.amount).toFixed(2)}</p>
              ) : null}
              <p className="text-slate-500 text-xs mt-2">
                已支付 {qr.paidOrderCount || 0} 笔 · ¥{Number(qr.paidAmount || 0).toFixed(2)}
              </p>
              <p className="text-slate-400 text-xs font-mono mt-2 break-all">{qr.code}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                <Button variant="secondary" size="sm" onClick={() => openDetail(qr)}>
                  查看
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handlePreview(qr)}>
                  <EyeIcon className="w-4 h-4" />
                  预览
                </Button>
                <Button variant="secondary" size="sm" onClick={() => { setEditing(qr); setEditName(qr.name); }}>
                  编辑
                </Button>
                <Button variant="secondary" size="sm" onClick={() => copyUrl(qr.payUrl)}>
                  <CopyIcon className="w-4 h-4" />
                  复制链接
                </Button>
                <Button variant="secondary" size="sm" onClick={() => patchQr(qr, { isActive: !qr.isActive })}>
                  {qr.isActive ? '停用' : '启用'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => deleteQr(qr)}>
                  删除
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="生成收款码">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel>码类型</FieldLabel>
            <div className="flex rounded-lg bg-slate-50 border border-slate-200 p-1">
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, type: 'DYNAMIC', amount: '' }))}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition ${form.type === 'DYNAMIC' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
              >
                动态金额码
              </button>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, type: 'FIXED' }))}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition ${form.type === 'FIXED' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
              >
                固定金额码
              </button>
            </div>
          </div>
          <Input
            label="收款码名称"
            required
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="如：前台收款码 / 3号柜台 / 张三"
          />
          <div>
            <FieldLabel required>关联分店</FieldLabel>
            <Select
              value={form.storeId}
              onChange={e => setForm(p => ({ ...p, storeId: e.target.value, counterId: '', operatorId: '' }))}
              required
            >
              <option value="">请选择分店</option>
              {activeStores.map(store => (
                <option key={store.id} value={store.id}>{store.brand?.name || '未命名品牌'} - {store.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel>柜台（可选）</FieldLabel>
            <Select
              value={form.counterId}
              onChange={e => setForm(p => ({ ...p, counterId: e.target.value }))}
            >
              <option value="">门店码，不绑定柜台</option>
              {counters.map(counter => (
                <option key={counter.id} value={counter.id}>{counter.name}</option>
              ))}
            </Select>
          </div>
          {operators.length > 0 ? (
            <div>
              <FieldLabel>员工（可选）</FieldLabel>
              <Select
                value={form.operatorId}
                onChange={e => setForm(p => ({ ...p, operatorId: e.target.value }))}
              >
                <option value="">不绑定员工</option>
                {eligibleOperators.map(member => (
                  <option key={member.id} value={member.id}>{member.name} · {member.email}</option>
                ))}
              </Select>
            </div>
          ) : null}
          {form.type === 'FIXED' ? (
            <Input
              label="固定金额"
              type="number"
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              placeholder="扫码后不可修改"
              step="0.01"
              min="0.01"
              required
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

      <Modal open={!!editing} onClose={() => setEditing(null)} title="编辑收款码">
        {editing ? (
          <form onSubmit={saveEdit} className="space-y-4">
            <Input
              label="收款码名称"
              required
              value={editName}
              onChange={e => setEditName(e.target.value)}
            />
            <p className="text-slate-500 text-xs">金额、门店和归属创建后不可在此修改。</p>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditing(null)}>
                取消
              </Button>
              <Button type="submit" className="flex-1">保存</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={!!showPreview} onClose={() => setShowPreview(null)} title={showPreview?.name || '预览'}>
        {showPreview ? (
          <div className="text-center">
            <div className="bg-white border border-slate-200 rounded-xl p-4 inline-block mb-4">
              {previewImage ? <img src={previewImage} alt="收款码" className="w-56 h-56" /> : (
                <div className="w-56 h-56 bg-slate-50" />
              )}
            </div>
            <p className="text-slate-500 text-xs mb-1">
              {showPreview.type === 'FIXED' ? '固定金额码' : '动态金额码'} · 纯二维码
            </p>
            {showPreview.amount ? (
              <p className="text-slate-900 text-xl font-bold">¥{parseFloat(showPreview.amount).toFixed(2)}</p>
            ) : null}
            <p className="text-slate-400 text-xs font-mono mt-2 break-all">{showPreview.payUrl}</p>
            <div className="flex gap-2 mt-4">
              <Button className="flex-1" onClick={() => copyUrl(showPreview.payUrl)}>复制支付链接</Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => downloadAuthenticated(`/api/qrcodes/${showPreview.id}/image`, `bunnyera-pay-${showPreview.code}.png`).catch(() => alert('下载失败'))}
              >
                PNG
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => downloadAuthenticated(`/api/qrcodes/${showPreview.id}/svg`, `bunnyera-pay-${showPreview.code}.svg`).catch(() => alert('下载失败'))}
              >
                SVG
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name || '收款码详情'} maxWidth="max-w-2xl">
        {detail ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-slate-400 text-xs">商户</p>
                <p className="text-slate-900">{detail.merchant?.companyName || '-'}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">门店</p>
                <p className="text-slate-900">{detail.store ? `${detail.store.brand?.name || ''} · ${detail.store.name}` : '-'}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">柜台</p>
                <p className="text-slate-900">{detail.counter?.name || '门店码'}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">员工</p>
                <p className="text-slate-900">{detail.operator?.name || '-'}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">类型</p>
                <p className="text-slate-900">{detail.type === 'FIXED' ? '固定金额' : '动态金额'}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">固定金额</p>
                <p className="text-slate-900">{detail.amount ? `¥${parseFloat(detail.amount).toFixed(2)}` : '-'}</p>
              </div>
            </div>
            <p className="text-slate-400 text-xs font-mono break-all">{detail.payUrl}</p>
            {stats ? (
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-3">
                  <p className="text-slate-400 text-xs mb-1">今日</p>
                  <p>创建 {stats.today.createdOrders} 笔</p>
                  <p>已支付 {stats.today.paidOrders} 笔 · ¥{Number(stats.today.paidAmount).toFixed(2)}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-slate-400 text-xs mb-1">累计已支付</p>
                  <p>{stats.lifetime.paidOrders} 笔 · ¥{Number(stats.lifetime.paidAmount).toFixed(2)}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    微信 ¥{Number(stats.lifetime.wechatAmount).toFixed(2)} · 支付宝 ¥{Number(stats.lifetime.alipayAmount).toFixed(2)} · 银联 ¥{Number(stats.lifetime.unionpayAmount).toFixed(2)}
                  </p>
                </Card>
              </div>
            ) : null}
            <div>
              <p className="text-slate-500 text-xs mb-2">订单</p>
              {orders.length === 0 ? (
                <p className="text-slate-400 text-xs">暂无订单</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {orders.map(order => (
                    <div key={order.orderNo} className="flex justify-between gap-3 text-xs border-b border-slate-100 pb-2">
                      <span className="font-mono">{order.orderNo}</span>
                      <span>{order.status}</span>
                      <span>¥{Number(order.amount).toFixed(2)}</span>
                      <span>{order.walletType || order.paymentChannel}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => copyUrl(detail.payUrl)}>复制链接</Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => downloadAuthenticated(`/api/qrcodes/${detail.id}/image`, `bunnyera-pay-${detail.code}.png`).catch(() => alert('下载失败'))}
              >
                下载 PNG
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => downloadAuthenticated(`/api/qrcodes/${detail.id}/svg`, `bunnyera-pay-${detail.code}.svg`).catch(() => alert('下载失败'))}
              >
                下载 SVG
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </MerchantShell>
  );
}
