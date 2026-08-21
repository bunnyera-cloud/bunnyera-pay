import { NextRequest, NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/api-utils';

/**
 * 保留历史路由以兼容旧客户端，但禁止任何模拟支付写入。
 * PAID 只能来自已验签支付通知或官方主动查单结果。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> }
): Promise<NextResponse> {
  await params;
  return withAuth(request, async () => {
    return errorResponse('模拟支付成功功能已停用；支付结果必须来自支付机构', 410);
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'CASHIER']);
}
