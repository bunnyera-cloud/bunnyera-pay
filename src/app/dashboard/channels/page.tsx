'use client';

import { useEffect, useState } from 'react';
import MerchantShell from '@/components/bunnyera-pay/MerchantShell';
import Card from '@/components/bunnyera-pay/Card';
import Badge from '@/components/bunnyera-pay/Badge';
import EmptyState from '@/components/bunnyera-pay/EmptyState';
import { ChannelIcon } from '@/components/bunnyera-pay/icons';

interface ChannelStatus {
  channel: string;
  isEnabled: boolean;
}

const CHANNEL_META: Record<string, { name: string; desc: string }> = {
  ALIPAY_BAR: { name: '支付宝当面付', desc: '顾客扫码或商家扫码收款' },
  ALIPAY_PC: { name: '支付宝电脑网站', desc: 'PC 网页收银' },
  ALIPAY_WAP: { name: '支付宝手机网站', desc: 'H5 网页收银' },
  WECHAT_NATIVE: { name: '微信扫码支付', desc: 'Native 二维码收款' },
  WECHAT_H5: { name: '微信 H5 支付', desc: '手机浏览器收银' },
  WECHAT_JSAPI: { name: '微信 JSAPI', desc: '公众号内支付' },
  WECHAT_MINI: { name: '微信小程序', desc: '小程序内支付' },
  UNIONPAY_GATEWAY: { name: '银联网关', desc: '借记卡 / 信用卡网银' },
  UNIONPAY_WAP: { name: '银联 WAP', desc: '手机网银收银' },
  UNIONPAY_QR: { name: '云闪付二维码', desc: '云闪付 App 扫码' },
  LAKALA_AGGREGATE: { name: '拉卡拉聚合', desc: '多渠道统一接入' },
};

export default function ChannelsPage() {
  const [channelStatus, setChannelStatus] = useState<ChannelStatus[] | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('bep_merchant_token');
    if (!token) return;
    (async () => {
      try {
        const res = await fetch('/api/merchant/dashboard', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            setChannelStatus(json.data.channelStatus || []);
          }
        }
      } catch {
        console.error('Failed to fetch channel status');
      }
    })();
  }, []);

  return (
    <MerchantShell title="支付渠道" description="查看当前商户已开通的支付渠道（渠道开通与密钥配置由平台统一管理）">
      {channelStatus === null ? (
        <div className="text-slate-400 text-center py-12 text-sm">加载中...</div>
      ) : channelStatus.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ChannelIcon className="w-6 h-6" />}
            title="尚未开通任何支付渠道"
            description="请联系平台管理员为您的商户开通支付渠道并完成密钥配置"
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channelStatus.map(c => {
            const meta = CHANNEL_META[c.channel] || { name: c.channel, desc: '' };
            return (
              <Card key={c.channel} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <span className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.isEnabled ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                    <ChannelIcon className="w-5 h-5" />
                  </span>
                  {c.isEnabled ? <Badge tone="success">已开通</Badge> : <Badge tone="muted">未开通</Badge>}
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
