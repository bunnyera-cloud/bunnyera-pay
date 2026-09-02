'use client';

import { useEffect, useState } from 'react';
import MerchantShell from '@/components/bunnyera-pay/MerchantShell';
import Card from '@/components/bunnyera-pay/Card';
import Badge from '@/components/bunnyera-pay/Badge';
import Button from '@/components/bunnyera-pay/Button';
import EmptyState from '@/components/bunnyera-pay/EmptyState';
import { ChannelIcon } from '@/components/bunnyera-pay/icons';

interface ChannelStatus {
  channel: string;
  isEnabled: boolean;
  productionStatus?: string;
}

interface PaymentFmHealth {
  status: 'NOT_CONFIGURED' | 'CONFIGURED' | 'ACTIVE' | 'ERROR';
  merchantNumMasked: string;
  apiHost: string;
  notifyUrl: string;
  isEnabled?: boolean;
  enabledWallets: Array<'ALIPAY' | 'WECHAT' | 'UNIONPAY'> | null;
  payTypes: string[] | null;
  supportedWalletTypes: string[];
  cashierWalletTypes?: string[];
  healthCheckedAt: string;
  missing: string[];
}

const WALLET_OPTIONS = [
  { id: 'ALIPAY' as const, label: '支付宝', payType: 'aloop' },
  { id: 'WECHAT' as const, label: '微信支付', payType: 'tloop' },
  { id: 'UNIONPAY' as const, label: '云闪付/银联', payType: 'bloop' },
];

const CHANNEL_META: Record<string, { name: string; desc: string }> = {
  ALIPAY_BAR: { name: '支付宝当面付', desc: '顾客扫码或商家扫码收款' },
  ALIPAY_PC: { name: '支付宝电脑网站', desc: 'PC 网页收银' },
  ALIPAY_WAP: { name: '支付宝手机网站', desc: 'H5 网页收银' },
  WECHAT_NATIVE: { name: '微信扫码支付', desc: 'Native 二维码收款（生产凭证待开通）' },
  WECHAT_H5: { name: '微信 H5 支付', desc: '手机浏览器收银' },
  WECHAT_JSAPI: { name: '微信 JSAPI', desc: '公众号内支付' },
  WECHAT_MINI: { name: '微信小程序', desc: '小程序内支付' },
  UNIONPAY_GATEWAY: { name: '银联网关', desc: '借记卡 / 信用卡网银' },
  UNIONPAY_WAP: { name: '银联 WAP', desc: '手机网银收银' },
  UNIONPAY_QR: { name: '云闪付二维码', desc: '云闪付 App 扫码' },
  LAKALA_AGGREGATE: { name: '拉卡拉聚合', desc: '多渠道统一接入' },
  PAYMENTFM_AGGREGATE: { name: '支付FM聚合', desc: 'BunnyEra 店码入口，凭证未开通时 fail-closed' },
};

export default function ChannelsPage() {
  const [channelStatus, setChannelStatus] = useState<ChannelStatus[] | null>(null);
  const [paymentFm, setPaymentFm] = useState<PaymentFmHealth | null>(null);
  const [selectedWallets, setSelectedWallets] = useState<Array<'ALIPAY' | 'WECHAT' | 'UNIONPAY'>>([]);
  const [selectedPayTypes, setSelectedPayTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  const load = async () => {
    const token = localStorage.getItem('bep_merchant_token');
    if (!token) return;
    try {
      const [dashRes, fmRes] = await Promise.all([
        fetch('/api/merchant/dashboard', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/merchant/channels/paymentfm', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (dashRes.ok) {
        const json = await dashRes.json();
        if (json.success) setChannelStatus(json.data.channelStatus || []);
      } else {
        setChannelStatus([]);
      }
      if (fmRes.ok) {
        const json = await fmRes.json();
        if (json.success) {
          const data = json.data as PaymentFmHealth;
          setPaymentFm(data);
          setSelectedWallets(
            Array.isArray(data.enabledWallets)
              ? data.enabledWallets
              : ['ALIPAY', 'WECHAT', 'UNIONPAY'],
          );
          setSelectedPayTypes(
            Array.isArray(data.payTypes)
              ? data.payTypes
              : WALLET_OPTIONS.map(option => option.payType),
          );
        }
      }
    } catch {
      console.error('Failed to fetch channel status');
      setChannelStatus((current) => current ?? []);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('bep_merchant_user');
      const user = raw ? JSON.parse(raw) as { role?: string } : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanEdit(user?.role === 'MERCHANT_OWNER' || user?.role === 'MERCHANT_ADMIN');
    } catch {
      setCanEdit(false);
    }
    const token = localStorage.getItem('bep_merchant_token');
    if (!token) return;
    load();
  }, []);

  const toggleWallet = (wallet: 'ALIPAY' | 'WECHAT' | 'UNIONPAY') => {
    setSelectedWallets(current =>
      current.includes(wallet)
        ? current.filter(item => item !== wallet)
        : [...current, wallet],
    );
  };

  const togglePayType = (payType: string) => {
    setSelectedPayTypes(current =>
      current.includes(payType)
        ? current.filter(item => item !== payType)
        : [...current, payType],
    );
  };

  const saveWallets = async () => {
    const token = localStorage.getItem('bep_merchant_token');
    setSaving(true);
    try {
      const res = await fetch('/api/merchant/channels/paymentfm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          enabledWallets: selectedWallets,
          payTypes: selectedPayTypes,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '保存失败');
        return;
      }
      setPaymentFm(json.data);
      const data = json.data as PaymentFmHealth;
      setSelectedWallets(
        Array.isArray(data.enabledWallets) ? data.enabledWallets : selectedWallets,
      );
      setSelectedPayTypes(
        Array.isArray(data.payTypes) ? data.payTypes : selectedPayTypes,
      );
      alert('已保存。扫码页只展示当前可用且已勾选的钱包。');
    } catch {
      alert('网络错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MerchantShell title="支付渠道" description="二维码不绑定渠道。顾客扫码后由 Provider / Router 选择当前已批准且可用的渠道">
      {paymentFm && (
        <Card className="p-5 mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-slate-900 font-medium text-sm">支付FM聚合</h3>
              <p className="text-slate-500 text-xs mt-1">BunnyEra 店码入口。底层收单机构由 PaymentFM 配置，不印在二维码上。</p>
            </div>
            <Badge tone={paymentFm.status === 'ACTIVE' ? 'success' : 'muted'}>{paymentFm.status}</Badge>
          </div>
          <dl className="grid sm:grid-cols-2 gap-2 text-xs text-slate-600">
            <div>商户号：{paymentFm.merchantNumMasked || '未配置'}</div>
            <div>API Host：{paymentFm.apiHost || '未配置'}</div>
            <div className="sm:col-span-2 break-all">Notify：{paymentFm.notifyUrl || '未配置'}</div>
            <div>配置钱包：{Array.isArray(paymentFm.enabledWallets) ? (paymentFm.enabledWallets.join(' / ') || '无（显式关闭）') : '未配置（默认三钱包）'}</div>
            <div>扫码页可展示：{(paymentFm.cashierWalletTypes || []).join(' / ') || '无（fail-closed）'}</div>
            <div>健康检查：{new Date(paymentFm.healthCheckedAt).toLocaleString()}</div>
          </dl>
          {paymentFm.missing.length > 0 && (
            <p className="text-amber-700 text-xs mt-3">缺少：{paymentFm.missing.join(', ')}</p>
          )}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-slate-700 text-xs font-medium mb-2">收银台钱包（enabledWallets）</p>
            <p className="text-slate-500 text-xs mb-2">取消全部勾选并保存后，扫码页不展示任何钱包。</p>
            <div className="flex flex-wrap gap-3 mb-3">
              {WALLET_OPTIONS.map(option => (
                <label key={option.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedWallets.includes(option.id)}
                    disabled={!canEdit}
                    onChange={() => toggleWallet(option.id)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <p className="text-slate-700 text-xs font-medium mb-2">PaymentFM payType</p>
            <p className="text-slate-500 text-xs mb-2">仅展示项目已确认映射的轮询 payType。钱包必须同时被 payType 允许才会出现在扫码页。</p>
            <div className="flex flex-wrap gap-3 mb-3">
              {WALLET_OPTIONS.map(option => (
                <label key={option.payType} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedPayTypes.includes(option.payType)}
                    disabled={!canEdit}
                    onChange={() => togglePayType(option.payType)}
                  />
                  {option.payType} · {option.label}
                </label>
              ))}
            </div>
            {canEdit ? (
              <Button size="sm" disabled={saving} onClick={saveWallets}>
                {saving ? '保存中...' : '保存钱包配置'}
              </Button>
            ) : null}
          </div>
        </Card>
      )}
      {channelStatus === null ? (
        <div className="text-slate-400 text-center py-12 text-sm">加载中...</div>
      ) : channelStatus.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ChannelIcon className="w-6 h-6" />}
            title="收款渠道待开通"
            description="可继续管理门店和收款码。微信 Native 目前为 PENDING_CREDENTIALS，缺少商户号不会阻塞平台开发。Oceanpayment 等渠道在官方凭证到位后可插拔接入。"
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channelStatus.map(c => {
            const meta = CHANNEL_META[c.channel] || { name: c.channel, desc: '' };
            const pending = c.productionStatus === 'PENDING_CREDENTIALS';
            return (
              <Card key={c.channel} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <span className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.isEnabled && !pending ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                    <ChannelIcon className="w-5 h-5" />
                  </span>
                  {pending ? <Badge tone="muted">凭证待开通</Badge> : c.isEnabled ? <Badge tone="success">已开通</Badge> : <Badge tone="muted">未开通</Badge>}
                </div>
                <h3 className="text-slate-900 font-medium text-sm">{meta.name}</h3>
                <p className="text-slate-500 text-xs mt-1">{meta.desc || '—'}</p>
              </Card>
            );
          })}
        </div>
      )}
    </MerchantShell>
  );
}
