import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { generateOrderNo } from '@/lib/auth';
import { resolveProvider } from '@/lib/payment/resolver';
import { resolveAlipayNotifyUrl, resolveBaseUrl } from '@/lib/payment/config';
import { z } from 'zod';

// 统一聚合支付请求
const unifiedPaySchema = z.object({
  amount: z.number().positive('金额必须大于 0'),
  subject: z.string().min(1).max(200),
  // 可选：指定渠道，不指定则返回可用渠道列表
  channel: z.enum([
    'ALIPAY_BAR', 'ALIPAY_PC', 'ALIPAY_WAP',
    'WECHAT_NATIVE', 'WECHAT_H5', 'WECHAT_JSAPI', 'WECHAT_MINI',
    'UNIONPAY_GATEWAY', 'UNIONPAY_WAP', 'UNIONPAY_QR',
    'LAKALA_AGGREGATE',
  ]).optional(),
  scene: z.enum(['QR_CODE', 'CASHIER', 'ONLINE', 'H5', 'MINI_PROGRAM', 'APP']),
  brandId: z.string().optional(),
  storeId: z.string().optional(),
  departmentId: z.string().optional(),
  counterId: z.string().optional(),
  qrcodeId: z.string().optional(),
  returnUrl: z.string().url().optional(),
  clientIp: z.string().optional(),
});

// 创建统一支付订单
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, ctx) => {
    const body = await req.json();
    const validation = unifiedPaySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        error: '数据验证失败',
        details: validation.error.issues,
      }, { status: 400 });
    }

    const data = validation.data;
    const merchantId = ctx.user.merchantId;

    if (!merchantId) {
      return errorResponse('商户 ID 缺失', 400);
    }

    // 验证商户状态
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant || merchant.status === 'REJECTED' || merchant.status === 'TERMINATED') {
      return errorResponse('商户不可用', 403);
    }

    // 指定渠道：先确认渠道配置可用（fail-closed），再创建订单，绝不创建 demo 订单
    if (data.channel) {
      const paymentConfig = await prisma.paymentConfig.findFirst({
        where: { merchantId, channel: data.channel, isActive: true },
      });

      const resolved = resolveProvider(data.channel, paymentConfig);
      if (!paymentConfig || !resolved.provider || !resolved.usable) {
        return errorResponse(
          `支付渠道不可用: ${resolved.missing.join(', ') || '该渠道尚未配置'}`,
          400
        );
      }

      // 生成订单号
      const orderNo = generateOrderNo();
      const expiredAt = new Date(Date.now() + 15 * 60 * 1000);

      // 创建订单
      const order = await prisma.order.create({
        data: {
          orderNo,
          merchantId,
          brandId: data.brandId,
          storeId: data.storeId,
          departmentId: data.departmentId,
          counterId: data.counterId,
          operatorId: ctx.user.sub,
          subject: data.subject,
          amount: data.amount,
          currency: 'CNY',
          channel: data.channel,
          scene: data.scene,
          status: 'CREATED',
          qrcodeId: data.qrcodeId,
          expiredAt,
          clientIp: data.clientIp || req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
          userAgent: req.headers.get('user-agent'),
        },
      });

      // 调用真实支付渠道
      try {
        const baseUrl = resolveBaseUrl(req.headers);
        const notifyUrl = data.channel.startsWith('ALIPAY')
          ? resolveAlipayNotifyUrl(req.headers, paymentConfig.notifyUrl)
          : data.channel.startsWith('WECHAT')
            ? `${baseUrl}/api/pay/wechat/notify`
            : `${baseUrl}/api/pay/unionpay/notify`;

        const result = await resolved.provider.createPayment({
          orderNo,
          amount: data.amount,
          subject: data.subject,
          notifyUrl,
          returnUrl: data.returnUrl,
          clientIp: data.clientIp,
        });

        if (result.success) {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: 'PAYING', channelTradeNo: result.tradeNo },
          });

          return successResponse({
            orderId: order.id,
            orderNo: order.orderNo,
            status: 'PAYING',
            payData: result.payData,
            tradeNo: result.tradeNo,
            channel: data.channel,
          });
        }

        await prisma.order.update({
          where: { id: order.id },
          data: { status: 'FAILED' },
        });
        return errorResponse(`支付创建失败: ${result.error}`, 502);
      } catch (error) {
        console.error('Payment creation error:', (error as Error).message);
        await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
        return errorResponse('支付渠道调用失败', 502);
      }
    }

    // 未指定渠道：返回商户已配置且可用的渠道列表；无任何配置时返回明确业务错误
    const configs = await prisma.paymentConfig.findMany({
      where: { merchantId, isActive: true },
      select: { channel: true, isSandbox: true },
    });

    const availableChannels = configs.map(c => ({
      channel: c.channel,
      channelName: getChannelName(c.channel),
      isSandbox: c.isSandbox,
    }));

    if (availableChannels.length === 0) {
      return errorResponse('该商户尚未配置任何支付渠道', 400);
    }

    return successResponse({
      availableChannels,
      message: `该商户已开通 ${availableChannels.length} 个支付渠道`,
    });
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'CASHIER']);
}

function getChannelName(channel: string): string {
  const names: Record<string, string> = {
    ALIPAY_BAR: '支付宝条码',
    ALIPAY_PC: '支付宝PC',
    ALIPAY_WAP: '支付宝WAP',
    WECHAT_NATIVE: '微信Native',
    WECHAT_H5: '微信H5',
    WECHAT_JSAPI: '微信JSAPI',
    WECHAT_MINI: '微信小程序',
    UNIONPAY_GATEWAY: '银联网关',
    UNIONPAY_WAP: '银联WAP',
    UNIONPAY_QR: '银联二维码',
    LAKALA_AGGREGATE: '拉卡拉聚合',
  };
  return names[channel] || channel;
}
