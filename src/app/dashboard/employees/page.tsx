'use client';

import { useEffect, useState } from 'react';
import MerchantShell from '@/components/bunnyera-pay/MerchantShell';
import Card from '@/components/bunnyera-pay/Card';
import Badge from '@/components/bunnyera-pay/Badge';
import Button from '@/components/bunnyera-pay/Button';
import Input from '@/components/bunnyera-pay/Input';
import Select from '@/components/bunnyera-pay/Select';
import Modal from '@/components/bunnyera-pay/Modal';
import EmptyState from '@/components/bunnyera-pay/EmptyState';
import { PlusIcon, UsersIcon } from '@/components/bunnyera-pay/icons';

interface Member {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  storeAccesses: {
    store: { id: string; name: string; brand: { name: string } };
  }[];
}

interface StoreOption {
  id: string;
  name: string;
  brandName: string;
}

const ROLE_NAMES: Record<string, string> = {
  MERCHANT_OWNER: '商户法人',
  MERCHANT_ADMIN: '商户管理员',
  FINANCE: '财务',
  STORE_MANAGER: '店长',
  CASHIER: '收银员',
  CUSTOMER_SERVICE: '客服',
  AUDITOR: '审计员',
};

const BRANCH_ROLES = new Set(['STORE_MANAGER', 'CASHIER', 'CUSTOMER_SERVICE', 'AUDITOR']);

export default function EmployeesPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'STORE_MANAGER',
    storeIds: [] as string[],
  });

  const token = () => localStorage.getItem('bep_merchant_token');

  const fetchData = async () => {
    try {
      const auth = { Authorization: `Bearer ${token()}` };
      const [memberRes, storeRes] = await Promise.all([
        fetch('/api/merchant/members', { headers: auth }),
        fetch('/api/stores', { headers: auth }),
      ]);
      if (memberRes.ok) {
        const json = await memberRes.json();
        setMembers(json.data || []);
      }
      if (storeRes.ok) {
        const json = await storeRes.json();
        const allStores: StoreOption[] = [];
        (json.data || []).forEach((brand: { name?: string; stores?: { id: string; name: string }[] }) => {
          (brand.stores || []).forEach((store) => {
            allStores.push({ id: store.id, name: store.name, brandName: brand.name || '未命名品牌' });
          });
        });
        setStores(allStores);
      }
    } catch {
      console.error('Failed to fetch members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('bep_merchant_user');
      const user = raw ? JSON.parse(raw) as { role?: string } : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanManage(user?.role === 'MERCHANT_OWNER' || user?.role === 'MERCHANT_ADMIN');
    } catch {
      setCanManage(false);
    }
    if (!token()) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBranchRole = BRANCH_ROLES.has(form.role);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/merchant/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          password: form.password,
          role: form.role,
          storeIds: isBranchRole ? form.storeIds : [],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '创建失败');
        return;
      }
      setShowForm(false);
      setForm({ name: '', email: '', phone: '', password: '', role: 'STORE_MANAGER', storeIds: [] });
      fetchData();
    } catch {
      alert('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStore = (storeId: string) => {
    setForm((prev) => ({
      ...prev,
      storeIds: prev.storeIds.includes(storeId)
        ? prev.storeIds.filter((id) => id !== storeId)
        : [...prev.storeIds, storeId],
    }));
  };

  return (
    <MerchantShell
      title="员工管理"
      description="总部账号查看全部分店；分店账号只能访问已授权门店"
      actions={
        canManage ? (
          <Button onClick={() => setShowForm(true)}>
            <PlusIcon className="w-4 h-4" />
            新建成员
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <div className="text-slate-400 text-center py-12 text-sm">加载中...</div>
      ) : members.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UsersIcon className="w-6 h-6" />}
            title="暂无成员"
            description="创建店长或收银员账号，并授权可访问的分店"
            action={canManage ? <Button onClick={() => setShowForm(true)}>新建成员</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <Card key={member.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-slate-900 font-medium">{member.name}</h3>
                  <p className="text-slate-500 text-xs mt-1">{member.email}</p>
                  {member.storeAccesses.length > 0 ? (
                    <p className="text-slate-500 text-xs mt-2">
                      授权分店：{member.storeAccesses.map((access) => `${access.store.brand.name} · ${access.store.name}`).join('、')}
                    </p>
                  ) : (
                    <p className="text-slate-400 text-xs mt-2">总部角色，默认可查看全部分店</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="info">{ROLE_NAMES[member.role] || member.role}</Badge>
                  {member.isActive ? <Badge tone="success">有效</Badge> : <Badge tone="muted">停用</Badge>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="新建成员">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="姓名" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Input label="邮箱" type="email" required value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          <Input label="手机" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          <Input
            label="初始密码"
            type="password"
            required
            minLength={12}
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            placeholder="至少 12 位"
          />
          <Select
            label="角色"
            value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value, storeIds: [] }))}
          >
            <option value="MERCHANT_ADMIN">商户管理员（总部）</option>
            <option value="FINANCE">财务（总部）</option>
            <option value="STORE_MANAGER">店长</option>
            <option value="CASHIER">收银员</option>
            <option value="CUSTOMER_SERVICE">客服</option>
            <option value="AUDITOR">审计员</option>
          </Select>
          {isBranchRole ? (
            <div>
              <p className="text-sm text-slate-600 mb-2">授权分店</p>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-3">
                {stores.length === 0 ? (
                  <p className="text-slate-400 text-xs">请先创建分店</p>
                ) : stores.map((store) => (
                  <label key={store.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.storeIds.includes(store.id)}
                      onChange={() => toggleStore(store.id)}
                    />
                    {store.brandName} · {store.name}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">总部角色默认可查看全部分店，无需单独授权。</p>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>取消</Button>
            <Button type="submit" disabled={submitting} className="flex-1">{submitting ? '创建中...' : '创建成员'}</Button>
          </div>
        </form>
      </Modal>
    </MerchantShell>
  );
}
