'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MerchantShell from '@/components/bunnyera-pay/MerchantShell';
import StatCard from '@/components/bunnyera-pay/StatCard';
import Card, { CardHeader } from '@/components/bunnyera-pay/Card';
import Badge from '@/components/bunnyera-pay/Badge';
import EmptyState from '@/components/bunnyera-pay/EmptyState';
import Table, { Th, Td, TableHeadRow, TableBody } from '@/components/bunnyera-pay/Table';
import { WalletIcon, CashierIcon, OrdersIcon, ChannelIcon, StoreIcon } from '@/components/bunnyera-pay/icons';

interface StoreStat {
  storeId: string;
  storeName: string;
  brandName: string;
  isActive: boolean;
  totalOrders: number;
  totalAmount: number;
  todayOrders: number;
  todayAmount: number;
}

interface DashboardData {
  storeCount: number;
  maxStores: number;
  totalOrders: number;
  totalPaidAmount: number;
  today: {
    transactionAmount: number | string;
    refundAmount: number | string;
    orderCount: number;
    pendingRefunds: number;
    pendingReconcile: number;
    settlingAmount: number | string;
  };
  channelBreakdown: { channel: string; amount: number | string; count: number }[];
  channelStatus: { channel: string; isEnabled: boolean }[];
  recentOrders: { id: string; orderNo: string; subject: string; amount: number | string; channel: string; status: string; createdAt: string }[];
  storeStats: StoreStat[];
}

const formatAmount = (n: number) => `¥${Number(n).toFixed(2)}`;

const QUICK_ACTIONS = [
  { href: '/dashboard/collect', label: '创建收款', desc: '生成一笔待支付订单', Icon: WalletIcon },
  { href: '/cashier', label: '打开收银台', desc: '面向顾客的收款页面', Icon: CashierIcon },
  { href: '/dashboard/orders', label: '订单管理', desc: '按分店查看与筛选订单', Icon: OrdersIcon },
  { href: '/dashboard/channels', label: '渠道配置', desc: '查看已开通支付渠道', Icon: ChannelIcon },
];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  const fetchDashboard = async (token: string) => {
    try {
      const res = await fetch('/api/merchant/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      }
    } catch {
      console.error('Dashboard fetch error');
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('bep_merchant_token');
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboard(token);
  }, []);

  const activeChannels = data ? data.channelStatus.filter(c => c.isEnabled).length : 0;

  return (
    <MerchantShell title="工作台" description="商户经营总览：全分店订单与交易汇总">
      {!data ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-slate-400 text-sm">加载中...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 核心指标 */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="总订单数" value={data.totalOrders} icon={<OrdersIcon className="w-5 h-5" />} />
            <StatCard label="今日订单" value={data.today.orderCount} />
            <StatCard label="总交易金额" value={formatAmount(Number(data.totalPaidAmount))} />
            <StatCard label="今日交易金额" value={formatAmount(Number(data.today.transactionAmount))} />
            <StatCard
              label="分店数量"
              value={`${data.storeCount} / ${data.maxStores}`}
              hint={`每个商户主体最多 ${data.maxStores} 个分店`}
              icon={<StoreIcon className="w-5 h-5" />}
            />
            <StatCard
              label="活跃支付渠道"
              value={activeChannels}
              hint={activeChannels > 0 ? '渠道已开通并可用' : '尚未开通渠道'}
              icon={<ChannelIcon className="w-5 h-5" />}
            />
          </div>

          {/* 分店汇总（按累计交易金额排名，无数据显示 0）*/}
          <Card>
            <CardHeader
              title="分店汇总"
              action={<Link href="/dashboard/orders" className="text-blue-600 text-sm hover:text-blue-700">查看全部订单 →</Link>}
            />
            {data.storeStats.length === 0 ? (
              <EmptyState
                icon={<StoreIcon className="w-6 h-6" />}
                title="尚未创建分店"
                description="请先前往门店管理创建分店，再为分店生成收款码"
                action={<Link href="/dashboard/stores" className="inline-flex px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition">去创建分店</Link>}
              />
            ) : (
              <Table>
                <TableHeadRow>
                  <Th>排名</Th>
                  <Th>分店</Th>
                  <Th>状态</Th>
                  <Th align="right">今日订单</Th>
                  <Th align="right">今日金额</Th>
                  <Th align="right">累计订单</Th>
                  <Th align="right">累计金额</Th>
                </TableHeadRow>
                <TableBody>
                  {[...data.storeStats]
                    .sort((a, b) => b.totalAmount - a.totalAmount)
                    .map((s, i) => (
                      <tr key={s.storeId} className="hover:bg-slate-50/60 transition">
                        <Td className="text-slate-400">{i + 1}</Td>
                        <Td>
                          <span className="text-slate-900 font-medium">{s.storeName}</span>
                          <span className="text-slate-400 text-xs ml-2">{s.brandName}</span>
                        </Td>
                        <Td>{s.isActive ? <Badge tone="success">营业中</Badge> : <Badge tone="muted">已停用</Badge>}</Td>
                        <Td align="right">{s.todayOrders}</Td>
                        <Td align="right">{formatAmount(s.todayAmount)}</Td>
                        <Td align="right">{s.totalOrders}</Td>
                        <Td align="right" className="text-slate-900 font-semibold">{formatAmount(s.totalAmount)}</Td>
                      </tr>
                    ))}
                </TableBody>
              </Table>
            )}
          </Card>

          {/* 快速操作（统一 SVG 图标，不使用 emoji）*/}
          <Card>
            <CardHeader title="快速操作" />
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {QUICK_ACTIONS.map(({ href, label, desc, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/40 transition"
                >
                  <span className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5" />
                  </span>
                  <span>
                    <span className="block text-slate-900 font-medium text-sm">{label}</span>
                    <span className="block text-slate-500 text-xs mt-0.5">{desc}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}
    </MerchantShell>
  );
}
