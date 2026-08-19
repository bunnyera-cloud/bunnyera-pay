'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import MerchantShell from '@/components/bunnyera-pay/MerchantShell';
import Card from '@/components/bunnyera-pay/Card';
import Badge from '@/components/bunnyera-pay/Badge';
import Button from '@/components/bunnyera-pay/Button';
import Select from '@/components/bunnyera-pay/Select';
import EmptyState from '@/components/bunnyera-pay/EmptyState';
import Table, { Th, Td, TableHeadRow, TableBody } from '@/components/bunnyera-pay/Table';
import { SearchIcon, OrdersIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/bunnyera-pay/icons';

interface StoreOption {
  id: string;
  name: string;
  brandName: string;
}

interface OrderRow {
  id: string;
  orderNo: string;
  subject: string;
  amount: number;
  channel: string;
  scene: string;
  status: string;
  channelTradeNo: string | null;
  storeId: string | null;
  storeName: string | null;
  brandName: string | null;
  paidAt: string | null;
  createdAt: string;
}

const CHANNEL_NAMES: Record<string, string> = {
  ALIPAY_BAR: '支付宝当面付', ALIPAY_PC: '支付宝电脑', ALIPAY_WAP: '支付宝H5',
  WECHAT_NATIVE: '微信扫码', WECHAT_H5: '微信H5', WECHAT_JSAPI: '微信JSAPI', WECHAT_MINI: '微信小程序',
  UNIONPAY_GATEWAY: '银联网关', UNIONPAY_WAP: '银联WAP', UNIONPAY_QR: '云闪付',
  LAKALA_AGGREGATE: '拉卡拉聚合',
};

const STATUS_NAMES: Record<string, string> = {
  CREATED: '待支付', PAYING: '支付中', PAID: '已支付', CLOSED: '已关闭',
  PARTIALLY_REFUNDED: '部分退款', REFUNDED: '已退款', DISPUTED: '争议', FAILED: '失败',
};

const STATUS_TONE: Record<string, 'warning' | 'info' | 'success' | 'muted' | 'purple' | 'danger'> = {
  CREATED: 'warning', PAYING: 'info', PAID: 'success', CLOSED: 'muted',
  PARTIALLY_REFUNDED: 'purple', REFUNDED: 'purple', DISPUTED: 'warning', FAILED: 'danger',
};

export default function MerchantOrdersPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeIdFilter, setStoreIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [orderNoSearch, setOrderNoSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // 加载分店列表（用于筛选）
  const fetchStores = useCallback(async (t: string) => {
    try {
      const res = await fetch('/api/stores', { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) return;
      const json = await res.json();
      const list: StoreOption[] = [];
      (json.data || []).forEach((brand: { stores?: { id: string; name: string }[]; name: string }) => {
        (brand.stores || []).forEach(s => list.push({ id: s.id, name: s.name, brandName: brand.name }));
      });
      setStores(list);
    } catch { /* ignore */ }
  }, []);

  // 加载订单（支持分店/状态筛选）
  const fetchOrders = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (storeIdFilter) params.set('storeId', storeIdFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (orderNoSearch) params.set('orderNo', orderNoSearch);
      const res = await fetch(`/api/orders?${params}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const json = await res.json();
        setOrders(json.data || []);
        setTotal(json.pagination?.total || 0);
        setTotalPages(json.pagination?.totalPages || 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, storeIdFilter, statusFilter, orderNoSearch]);

  useEffect(() => {
    const t = localStorage.getItem('bep_merchant_token');
    if (!t) { router.push('/login'); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(t);
    fetchStores(t);
  }, [router, fetchStores]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (token) fetchOrders(token);
  }, [token, fetchOrders]);

  return (
    <MerchantShell title="订单管理" description="按分店、状态查看与筛选全部收款订单">
      {/* 筛选栏 */}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-sm">分店：</span>
            <Select
              value={storeIdFilter}
              onChange={e => { setStoreIdFilter(e.target.value); setPage(1); }}
              className="!w-auto !py-1.5"
            >
              <option value="">全部分店</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.brandName} · {s.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-sm">状态：</span>
            <Select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="!w-auto !py-1.5"
            >
              <option value="">全部</option>
              {Object.entries(STATUS_NAMES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索订单号"
              value={orderNoSearch}
              onChange={e => setOrderNoSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') setPage(1); }}
              className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 w-56 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
            />
          </div>
          <div className="ml-auto text-slate-400 text-sm">共 {total} 笔订单</div>
        </div>
      </Card>

      {/* 订单列表 */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">加载中...</div>
        ) : orders.length === 0 ? (
          <EmptyState icon={<OrdersIcon className="w-6 h-6" />} title="暂无订单数据" description="顾客通过收款码完成支付后，订单会显示在这里" />
        ) : (
          <Table>
            <TableHeadRow>
              <Th>订单号</Th>
              <Th>商品</Th>
              <Th>分店</Th>
              <Th>渠道</Th>
              <Th align="right">金额</Th>
              <Th>状态</Th>
              <Th>创建时间</Th>
            </TableHeadRow>
            <TableBody>
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-slate-50/60 transition">
                  <Td className="text-slate-900 font-mono text-xs">{o.orderNo}</Td>
                  <Td className="max-w-[180px] truncate">{o.subject}</Td>
                  <Td>
                    {o.storeName ? (
                      <>
                        <div className="text-slate-700">{o.storeName}</div>
                        {o.brandName ? <div className="text-xs text-slate-400">{o.brandName}</div> : null}
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td>{CHANNEL_NAMES[o.channel] || o.channel}</Td>
                  <Td align="right" className="text-slate-900 font-semibold">¥{Number(o.amount).toFixed(2)}</Td>
                  <Td><Badge tone={STATUS_TONE[o.status] || 'muted'}>{STATUS_NAMES[o.status] || o.status}</Badge></Td>
                  <Td className="text-slate-400 text-xs">{new Date(o.createdAt).toLocaleString('zh-CN')}</Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}

        {/* 分页 */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-slate-400 text-sm">第 {page} / {totalPages} 页</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeftIcon className="w-4 h-4" />
                上一页
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                下一页
                <ChevronRightIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </MerchantShell>
  );
}
