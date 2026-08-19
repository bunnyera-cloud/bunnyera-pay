'use client';

import { useEffect, useState } from 'react';
import MerchantShell from '@/components/bunnyera-pay/MerchantShell';
import Card from '@/components/bunnyera-pay/Card';
import Badge from '@/components/bunnyera-pay/Badge';
import EmptyState from '@/components/bunnyera-pay/EmptyState';
import Table, { Th, Td, TableHeadRow, TableBody } from '@/components/bunnyera-pay/Table';
import { RefundIcon } from '@/components/bunnyera-pay/icons';

interface RefundRow {
  id: string;
  refundNo: string;
  amount: number | string;
  reason: string | null;
  status: string;
  createdAt: string;
  order: { orderNo: string; subject: string; amount: number | string } | null;
}

const STATUS_NAMES: Record<string, string> = {
  PENDING: '待审核', APPROVED: '已批准', PROCESSING: '处理中',
  SUCCESS: '退款成功', FAILED: '退款失败', REJECTED: '已拒绝',
};

const STATUS_TONE: Record<string, 'warning' | 'info' | 'success' | 'muted' | 'danger'> = {
  PENDING: 'warning', APPROVED: 'info', PROCESSING: 'info',
  SUCCESS: 'success', FAILED: 'danger', REJECTED: 'muted',
};

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('bep_merchant_token');
    if (!token) return;
    (async () => {
      try {
        const res = await fetch('/api/refunds', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setRefunds(json.data || []);
        }
      } catch {
        console.error('Failed to fetch refunds');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <MerchantShell title="退款管理" description="查看退款申请与处理进度（退款发起在订单管理中操作）">
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">加载中...</div>
        ) : refunds.length === 0 ? (
          <EmptyState
            icon={<RefundIcon className="w-6 h-6" />}
            title="暂无退款记录"
            description="已支付订单发起退款后，会在这里显示处理进度"
          />
        ) : (
          <Table>
            <TableHeadRow>
              <Th>退款单号</Th>
              <Th>关联订单</Th>
              <Th align="right">退款金额</Th>
              <Th>原因</Th>
              <Th>状态</Th>
              <Th>申请时间</Th>
            </TableHeadRow>
            <TableBody>
              {refunds.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/60 transition">
                  <Td className="text-slate-900 font-mono text-xs">{r.refundNo}</Td>
                  <Td>
                    {r.order ? (
                      <>
                        <div className="text-slate-700 font-mono text-xs">{r.order.orderNo}</div>
                        <div className="text-xs text-slate-400 truncate max-w-[180px]">{r.order.subject}</div>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td align="right" className="text-slate-900 font-semibold">¥{Number(r.amount).toFixed(2)}</Td>
                  <Td className="text-slate-500 max-w-[200px] truncate">{r.reason || '—'}</Td>
                  <Td><Badge tone={STATUS_TONE[r.status] || 'muted'}>{STATUS_NAMES[r.status] || r.status}</Badge></Td>
                  <Td className="text-slate-400 text-xs">{new Date(r.createdAt).toLocaleString('zh-CN')}</Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </MerchantShell>
  );
}
