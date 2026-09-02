'use client';

import { useEffect, useState } from 'react';
import MerchantShell from '@/components/bunnyera-pay/MerchantShell';
import Card, { CardHeader } from '@/components/bunnyera-pay/Card';
import Button from '@/components/bunnyera-pay/Button';
import { BuildingIcon, UsersIcon } from '@/components/bunnyera-pay/icons';

const KYB_STATUS_NAMES: Record<string, string> = {
  NOT_SUBMITTED: '未提交',
  PENDING: '审核中',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
};

interface MerchantUser {
  name?: string;
  email?: string;
  role?: string;
  merchantId?: string;
  merchantName?: string;
  merchantNo?: string;
  kybStatus?: string;
  merchant?: { id?: string; companyName?: string; merchantNo?: string };
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
  const [kybStatus, setKybStatus] = useState<string>('NOT_SUBMITTED');
  const [kybRejectReason, setKybRejectReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadKyb = async (merchantId: string, token: string) => {
    const res = await fetch(`/api/merchants/${merchantId}/kyb`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json.success) {
      setKybStatus(json.data.kybStatus);
      setKybRejectReason(json.data.kybRejectReason);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('bep_merchant_user');
      const parsed = raw ? JSON.parse(raw) as MerchantUser : null;
      if (parsed?.merchantName == null && parsed?.merchant?.companyName) {
        parsed.merchantName = parsed.merchant.companyName;
        parsed.merchantNo = parsed.merchant.merchantNo;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(parsed);
      const token = localStorage.getItem('bep_merchant_token');
      const merchantId = parsed?.merchantId || parsed?.merchant?.id;
      if (parsed?.kybStatus) setKybStatus(parsed.kybStatus);
      if (token && merchantId) loadKyb(merchantId, token);
    } catch {
      setUser(null);
    }
  }, []);

  const submitKyb = async () => {
    const token = localStorage.getItem('bep_merchant_token');
    const merchantId = user?.merchantId || user?.merchant?.id;
    if (!token || !merchantId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/merchants/${merchantId}/kyb`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'submit' }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '提交失败');
        return;
      }
      setKybStatus(json.data.kybStatus);
      setKybRejectReason(json.data.kybRejectReason);
    } catch {
      alert('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MerchantShell title="商户设置" description="当前商户、账号与 KYB 状态。KYB 未通过不阻止门店和收款码管理">
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

      <Card className="mt-6">
        <CardHeader title="KYB 状态" />
        <div className="px-5 py-4 space-y-3">
          <InfoRow
            label="当前状态"
            value={KYB_STATUS_NAMES[kybStatus as keyof typeof KYB_STATUS_NAMES] || kybStatus}
          />
          {kybRejectReason ? <InfoRow label="拒绝原因" value={kybRejectReason} /> : null}
          <p className="text-slate-500 text-xs">
            KYB 未批准时不能启用真实收款渠道，但不能阻止创建门店、收款码和查看后台。微信支付目前为 PENDING_CREDENTIALS，不会因缺少微信商户号阻塞平台开发。
          </p>
          {(kybStatus === 'NOT_SUBMITTED' || kybStatus === 'REJECTED') && (user?.role === 'MERCHANT_OWNER' || user?.role === 'MERCHANT_ADMIN') ? (
            <Button onClick={submitKyb} disabled={submitting}>
              {submitting ? '提交中...' : '提交 KYB'}
            </Button>
          ) : null}
        </div>
      </Card>

      <p className="text-slate-400 text-xs mt-6">
        商户资质、结算账户与支付渠道密钥等敏感信息由平台统一管理，如需变更请联系平台管理员。
      </p>
    </MerchantShell>
  );
}
