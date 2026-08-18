import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma, OrderStatus, PaymentChannel } from '@prisma/client';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { generateOrderNo } from '@/lib/auth';
import { AlipayProvider } from '@/lib/payment/alipay';
import {
  resolveAlipayConfig,
  resolveAlipayNotifyUrl,
  resolvePaymentEnv,
} from '@/lib/payment/config';
import { z } from 'zod';

const createOrderSchema = z.object({
  amount: z.number().positive('金额必须大于 0'),
  subject: z.string().min(1).max(200),
  channel: z.enum([
    'ALIPAY_BAR', 'ALIPAY_PC', 'ALIPAY_WAP',
    'WECHAT_NATIVE', 'WECHAT_H5', 'WECHAT_JSAPI', 'WECHAT_MINI',
    'UNIONPAY_GATEWAY', 'UNIONPAY_WAP', 'UNIONPAY_QR',
    'LAKALA_AGGREGATE',
  ]),
  scene: z.enum(['QR_CODE', 'CASHIER', 'ONLINE', 'H5', 'MINI_PROGRAM', 'APP']),
  brandId: z.string().optional(),
  storeId: z.string().optional(),
  departmentId: z.string().optional(),
  counterId: z.string().optional(),
  qrcodeId: z.string().optional(),
  returnUrl: z.string().url().optional(),
  clientIp: z.string().optional(),
  extraParams: z.record(z.string(), z.string()).optional(),
});

// 创建订单
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, ctx) => {
    const body = await req.json();
    const validation = createOrderSchema.safeParse(body);

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

    // 验证商户状态（拒绝和终止的商户不能下单）
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant || merchant.status === 'REJECTED' || merchant.status === 'TERMINATED') {
      return errorResponse('商户不可用', 403);
    }

    // 获取支付配置（可选，演示模式下可跳过）
    const paymentConfig = await prisma.paymentConfig.findFirst({
      where: { merchantId, channel: data.channel, isActive: true },
    });

    // 生成订单号
    const orderNo = generateOrderNo();
    const expiredAt = new Date(Date.now() + 15 * 60 * 1000); // 15分钟过期

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

    // 调用支付渠道创建支付
    try {
      const paymentEnv = resolvePaymentEnv();
      const isAlipay = data.channel.startsWith('ALIPAY');
      const alipay = resolveAlipayConfig(paymentConfig);
      const notifyUrl = resolveAlipayNotifyUrl(req.headers, paymentConfig?.notifyUrl);

      // PREVIEW：渠道尚未配置或未审核通过时，生成 BunnyEra Pay 自有预览支付链接。
      // 该二维码明确标记为非真实收款，绝不会被标记为支付成功。
      if (!isAlipay || !alipay.usable || paymentEnv === 'PREVIEW') {
        const baseUrl = notifyUrl.replace(/\/api\/pay\/alipay\/notify$/, '');
        const previewPayData = `${baseUrl}/preview/pay/${orderNo}`;
        const updated = await prisma.order.update({
          where: { id: order.id },
          data: { status: 'PAYING', payData: previewPayData, paymentEnv: 'PREVIEW' },
        });

        return successResponse({
          orderId: updated.id,
          orderNo: updated.orderNo,
          status: updated.status,
          payData: previewPayData,
          paymentEnv: 'PREVIEW',
          notifyUrl,
          message:
            alipay.missing.length > 0
              ? `演示预览模式（缺少配置: ${alipay.missing.join(', ')}）`
              : '演示预览模式',
        });
      }

      const provider = new AlipayProvider({
        appId: alipay.appId,
        privateKey: alipay.privateKey,
        publicKey: alipay.publicKey,
        gateway: alipay.gateway,
        channel: data.channel,
      });

      const result = await provider.createPayment({
        orderNo,
        amount: data.amount,
        subject: data.subject,
        notifyUrl,
        returnUrl: data.returnUrl,
        clientIp: data.clientIp,
        extraParams: data.extraParams,
      });

      if (result.success && result.payData) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'PAYING',
            channelTradeNo: result.tradeNo,
            payData: result.payData,
            paymentEnv,
          },
        });

        return successResponse({
          orderId: order.id,
          orderNo: order.orderNo,
          status: 'PAYING',
          payData: result.payData,
          tradeNo: result.tradeNo,
          paymentEnv,
          notifyUrl,
        });
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'FAILED', paymentEnv },
      });
      return errorResponse(`支付创建失败: ${result.error || '支付渠道未返回支付内容'}`, 502);
    } catch (error) {
      console.error('Payment creation error:', (error as Error).message);
      await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      return errorResponse('支付渠道调用失败', 502);
    }
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'CASHIER']);
}

// 查询订单列表
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, ctx) => {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
    const status = url.searchParams.get('status');
    const channel = url.searchParams.get('channel');
    const orderNo = url.searchParams.get('orderNo');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    const where = { merchantId: ctx.user.merchantId } as Prisma.OrderWhereInput;
    if (status) where.status = status as OrderStatus;
    if (channel) where.channel = channel as PaymentChannel;
    if (orderNo) where.orderNo = { contains: orderNo };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59');
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNo: true,
          subject: true,
          amount: true,
          refundAmount: true,
          currency: true,
          channel: true,
          scene: true,
          status: true,
          channelTradeNo: true,
          paidAt: true,
          expiredAt: true,
          createdAt: true,
        },
      }),
      prisma.order.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: orders,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'STORE_MANAGER', 'CASHIER', 'CUSTOMER_SERVICE']);
}
