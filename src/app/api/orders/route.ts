import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma, OrderStatus, PaymentChannel } from '@prisma/client';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { generateOrderNo } from '@/lib/auth';
import { resolveProvider } from '@/lib/payment/resolver';
import {
  resolveAlipayNotifyUrl,
  resolvePaymentEnv,
  resolveBaseUrl,
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
      const baseUrl = resolveBaseUrl(req.headers);
      const isConfigured = !!(paymentConfig && paymentConfig.isActive);

      // PREVIEW：渠道尚未配置或未审核通过时，生成 BunnyEra Pay 自有预览支付链接。
      if (!isConfigured || paymentEnv === 'PREVIEW') {
        const previewPayData = `${baseUrl}/preview/pay/${orderNo}`;
        const updated = await prisma.order.update({
          where: { id: order.id },
          data: { status: 'PAYING', payData: previewPayData, paymentEnv: 'PREVIEW' },
        });

        const missingReason = !isConfigured ? '渠道未配置' : '演示预览模式';
        return successResponse({
          orderId: updated.id,
          orderNo: updated.orderNo,
          status: updated.status,
          payData: previewPayData,
          paymentEnv: 'PREVIEW',
          notifyUrl: resolveAlipayNotifyUrl(req.headers, paymentConfig?.notifyUrl),
          message: missingReason,
        });
      }

      // 根据渠道类型调用 Provider（实例化统一通过 resolveProvider 收口）
      if (!data.channel.startsWith('ALIPAY') && !data.channel.startsWith('WECHAT') && !data.channel.startsWith('UNIONPAY')) {
        return errorResponse(`不支持的支付渠道: ${data.channel}`, 400);
      }

      const resolved = resolveProvider(data.channel, paymentConfig);
      if (!resolved.provider || !resolved.usable) {
        return errorResponse(`支付渠道不可用: ${resolved.missing.join(', ')}`, 502);
      }

      const notifyUrl = data.channel.startsWith('ALIPAY')
        ? resolveAlipayNotifyUrl(req.headers, paymentConfig?.notifyUrl)
        : data.channel.startsWith('WECHAT')
          ? `${baseUrl}/api/pay/wechat/notify`
          : `${baseUrl}/api/pay/unionpay/notify`;

      const payResult = await resolved.provider.createPayment({
        orderNo,
        amount: data.amount,
        subject: data.subject,
        notifyUrl,
        returnUrl: data.returnUrl,
        clientIp: data.clientIp,
        extraParams: data.extraParams,
      });

      if (payResult.success && payResult.payData) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'PAYING',
            channelTradeNo: payResult.tradeNo,
            payData: payResult.payData,
            paymentEnv,
          },
        });

        return successResponse({
          orderId: order.id,
          orderNo: order.orderNo,
          status: 'PAYING',
          payData: payResult.payData,
          tradeNo: payResult.tradeNo,
          paymentEnv,
          notifyUrl,
        });
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'FAILED', paymentEnv },
      });
      return errorResponse(`支付创建失败: ${payResult.error || '支付渠道未返回支付内容'}`, 502);
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
    const storeId = url.searchParams.get('storeId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    const where = { merchantId: ctx.user.merchantId } as Prisma.OrderWhereInput;
    if (status) where.status = status as OrderStatus;
    if (channel) where.channel = channel as PaymentChannel;
    if (orderNo) where.orderNo = { contains: orderNo };
    if (storeId) where.storeId = storeId;
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
          storeId: true,
          paidAt: true,
          expiredAt: true,
          createdAt: true,
        },
      }),
      prisma.order.count({ where }),
    ]);

    // 批量查询分店名称
    const storeIds = [...new Set(orders.map(o => o.storeId).filter((s): s is string => !!s))];
    const storeMap = new Map<string, { name: string; brandName: string }>();
    if (storeIds.length > 0) {
      const stores = await prisma.store.findMany({
        where: { id: { in: storeIds } },
        include: { brand: { select: { name: true } } },
      });
      stores.forEach(s => storeMap.set(s.id, { name: s.name, brandName: s.brand.name }));
    }

    return NextResponse.json({
      success: true,
      data: orders.map(o => ({
        ...o,
        amount: Number(o.amount),
        storeName: o.storeId ? storeMap.get(o.storeId)?.name ?? null : null,
        brandName: o.storeId ? storeMap.get(o.storeId)?.brandName ?? null : null,
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'STORE_MANAGER', 'CASHIER', 'CUSTOMER_SERVICE']);
}
