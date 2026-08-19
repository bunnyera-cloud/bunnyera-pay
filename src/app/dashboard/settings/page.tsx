'use client';

import { useEffect, useState } from 'react';
import MerchantShell from '@/components/bunnyera-pay/MerchantShell';
import Card, { CardHeader } from '@/components/bunnyera-pay/Card';
import { BuildingIcon, UsersIcon } from '@/components/bunnyera-pay/icons';

interface MerchantUser {
  name?: string;
  email?: string;
  role?: string;
  merchantName?: string;
  merchantNo?: string;
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

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-b-0">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className="text-slate-900 text-sm font-medium">{value || '—'}</span>
    </div>
  );
}

export default function SettingsPage() {
  const [user, setUser] = useState<MerchantUser | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('bep_merchant_user');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(raw ? JSON.parse(raw) : null);
    } catch {
      setUser(null);
    }
  }, []);

  return (
    <MerchantShell title="商户设置" description="当前商户与账号基本信息（资料变更请联系平台管理员）">
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title="商户信息"
            action={<span className="text-slate-400"><BuildingIcon className="w-5 h-5" /></span>}
          />
          <div className="px-5 py-2">
            <InfoRow label="商户名称" value={user?.merchantName} />
            <InfoRow label="商户编号" value={user?.merchantNo} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="当前账号"
            action={<span className="text-slate-400"><UsersIcon className="w-5 h-5" /></span>}
          />
          <div className="px-5 py-2">
            <InfoRow label="姓名" value={user?.name} />
            <InfoRow label="邮箱" value={user?.email} />
            <InfoRow label="角色" value={user?.role ? ROLE_NAMES[user.role] || user.role : undefined} />
          </div>
        </Card>
      </div>

      <p className="text-slate-400 text-xs mt-6">
        商户资质、结算账户与支付渠道密钥等敏感信息由平台统一管理，如需变更请联系平台管理员。
      </p>
    </MerchantShell>
  );
}
