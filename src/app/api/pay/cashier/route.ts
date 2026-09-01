import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-utils';
import { generateOrderNo } from '@/lib/auth';
import { resolveProvider } from '@/lib/payment/resolver';
import {
  resolveAlipayNotifyUrl,
  resolvePaymentEnv,
  resolveBaseUrl,
} from '@/lib/payment/config';
import {
  MANUAL_CONFIRMATION_REQUIRED,
  canStartNewProviderPayment,
  isManualConfirmationChannel,
  resolveChannelNotifyPath,
} from '@/lib/payment/channel-policy';
import { z } from 'zod';
import Decimal from 'decimal.js';

/**
 * 聚合收款码收银台 API（顾客扫码访问，无需商户登录态）。
 * 订单归属完全由收款码决定：merchantId / brandId / storeId / qrcodeId / channel。
 * 仅受理真实已配置渠道；未配置一律拒绝，绝不模拟支付成功。
 * WECHAT_EXTERNAL_QR 只展示/跳转外部静态码，必须人工确认，禁止自动 PAID。
 */

const cashierPaySchema = z.object({
  code: z.string().min(1).max(64),
  amount: z.number().positive('金额必须大于 0').max(1000000).refine(
    value => new Decimal(value).decimalPlaces() <= 2,
    '金额最多保留两位小数'
  ).optional(),
  channel: z.enum(['ALIPAY_BAR', 'WECHAT_NATIVE', 'UNIONPAY_QR', 'WECHAT_EXTERNAL_QR']),
});

function isDirectImageSource(value: string): boolean {
  return value.startsWith('data:image/') || /^https?:\/\//i.test(value);
}

// 创建收银订单
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('请求体格式错误', 400);
  }
  const validation = cashierPaySchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: '数据验证失败', details: validation.error.issues },
      { status: 400 }
    );
  }
  const data = validation.data;
  const manualChannel = isManualConfirmationChannel(data.channel);

  // 查找收款码
  const qrCode = await prisma.qRCode.findUnique({
    where: { code: data.code },
    include: {
      merchant: { select: { id: true, companyName: true, status: true, kybStatus: true } },
    },
  });

  if (!qrCode || !qrCode.isActive) {
    return errorResponse('收款码不存在或已停用', 404);
  }
  if (qrCode.expiredAt && qrCode.expiredAt.getTime() < Date.now()) {
    return errorResponse('收款码已过期', 400);
  }
  // 聚合码必须绑定分店
  if (!qrCode.storeId) {
    return errorResponse('该收款码未绑定分店，无法收款', 400);
  }
  const store = await prisma.store.findUnique({
    where: { id: qrCode.storeId },
    select: {
      id: true,
      isActive: true,
      brandId: true,
      brand: { select: { merchantId: true } },
    },
  });
  if (!store) {
    return errorResponse('收款码绑定的分店不存在', 400);
  }
  if (!store.isActive) {
    return errorResponse('该分店已停用，无法收款', 400);
  }
  if (store.brand.merchantId !== qrCode.merchantId) {
    return errorResponse('收款码与分店归属不一致', 400);
  }

  const merchant = qrCode.merchant;
  if (merchant.status !== 'ACTIVE') {
    return errorResponse('商户不可用', 403);
  }
  if (!manualChannel) {
    const paymentGate = canStartNewProviderPayment(data.channel, merchant.kybStatus);
    if (!paymentGate.ok) {
      return errorResponse(paymentGate.error, 400);
    }
  }

  // 固定入口码由顾客输入金额；动态订单码金额由服务端收款码记录决定。
  const amount = qrCode.type === 'DYNAMIC' ? Number(qrCode.amount) : data.amount;
  if (!amount || amount <= 0) {
    return errorResponse('请输入支付金额', 400);
  }
  if (new Decimal(amount).decimalPlaces() > 2 || amount > 1000000) {
    return errorResponse('支付金额格式错误', 400);
  }
  if (qrCode.type === 'DYNAMIC' && qrCode.orderId) {
    return errorResponse('该动态收款码已创建过订单', 409);
  }

  if (manualChannel) {
    const target = await prisma.externalPaymentTarget.findFirst({
      where: {
        merchantId: merchant.id,
        storeId: store.id,
        channel: 'WECHAT_EXTERNAL_QR',
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!target || (!target.qrImageUrl && !target.targetUrl)) {
      return errorResponse('该分店尚未配置微信外部收款码', 400);
    }

    const orderNo = generateOrderNo();
    let order;
    try {
      order = await prisma.$transaction(async tx => {
        const created = await tx.order.create({
          data: {
            orderNo,
            merchantId: merchant.id,
            brandId: store.brandId,
            storeId: store.id,
            departmentId: qrCode.departmentId,
            counterId: qrCode.counterId,
            qrcodeId: qrCode.id,
            subject: qrCode.name || `${merchant.companyName}收款`,
            amount,
            currency: 'CNY',
            channel: data.channel,
            scene: 'QR_CODE',
            status: 'PAYING',
            paymentEnv: 'MANUAL',
            confirmationMode: MANUAL_CONFIRMATION_REQUIRED,
            payData: target.targetUrl || target.qrImageUrl,
            expiredAt: new Date(Date.now() + 15 * 60 * 1000),
            clientIp: getClientIp(request),
            userAgent: request.headers.get('user-agent'),
          },
        });
        if (qrCode.type === 'DYNAMIC') {
          const claimed = await tx.qRCode.updateMany({
            where: { id: qrCode.id, orderId: null },
            data: { orderId: created.id },
          });
          if (claimed.count === 0) throw new Error('DYNAMIC_QR_ALREADY_USED');
        }
        return created;
      });
    } catch (error) {
      if ((error as Error).message === 'DYNAMIC_QR_ALREADY_USED') {
        return errorResponse('该动态收款码已创建过订单', 409);
      }
      throw error;
    }

    const payImageUrl = target.qrImageUrl && isDirectImageSource(target.qrImageUrl)
      ? target.qrImageUrl
      : null;
    return successResponse({
      orderNo,
      status: 'PAYING',
      payData: target.targetUrl || target.qrImageUrl,
      payImageUrl,
      targetUrl: target.targetUrl,
      displayName: target.displayName,
      paymentEnv: 'MANUAL',
      confirmationMode: MANUAL_CONFIRMATION_REQUIRED,
      statusToken: order.id,
      message: '请使用微信扫码。支付完成后由商户人工确认，系统不会自动标记已支付',
    });
  }

  // 渠道配置校验（fail closed：未配置/不可用一律拒绝）
  // Provider 实例化统一通过 resolveProvider 收口
  const [paymentConfig, merchantChannel] = await Promise.all([
    prisma.paymentConfig.findFirst({
      where: { merchantId: merchant.id, channel: data.channel, isActive: true },
    }),
    prisma.merchantChannel.findUnique({
      where: {
        merchantId_channel: {
          merchantId: merchant.id,
          channel: data.channel,
        },
      },
      select: { isEnabled: true },
    }),
  ]);
  if (!paymentConfig) {
    return errorResponse('该支付方式未开通', 400);
  }

  const resolved = resolveProvider(data.channel, paymentConfig, {
    merchantChannel,
  });
  if (!resolved.provider || !resolved.usable) {
    return errorResponse('该支付方式未开通', 400);
  }

  // 创建订单：写入 merchantId / brandId / storeId / qrcodeId / channel
  const orderNo = generateOrderNo();
  let order;
  try {
    order = await prisma.$transaction(async tx => {
      const created = await tx.order.create({
        data: {
          orderNo,
          merchantId: merchant.id,
          brandId: store.brandId,
          storeId: store.id,
          departmentId: qrCode.departmentId,
          counterId: qrCode.counterId,
          qrcodeId: qrCode.id,
          subject: qrCode.name || `${merchant.companyName}收款`,
          amount,
          currency: 'CNY',
          channel: data.channel,
          scene: 'QR_CODE',
          status: 'CREATED',
          expiredAt: new Date(Date.now() + 15 * 60 * 1000),
          clientIp: getClientIp(request),
          userAgent: request.headers.get('user-agent'),
        },
      });
      if (qrCode.type === 'DYNAMIC') {
        const claimed = await tx.qRCode.updateMany({
          where: { id: qrCode.id, orderId: null },
          data: { orderId: created.id },
        });
        if (claimed.count === 0) throw new Error('DYNAMIC_QR_ALREADY_USED');
      }
      return created;
    });
  } catch (error) {
    if ((error as Error).message === 'DYNAMIC_QR_ALREADY_USED') {
      return errorResponse('该动态收款码已创建过订单', 409);
    }
    throw error;
  }

  const paymentEnv = resolvePaymentEnv();
  const baseUrl = resolveBaseUrl(request.headers);

  // PREVIEW 演示环境：生成平台预览支付链接（页面明确标注非真实收款）
  if (paymentEnv === 'PREVIEW') {
    const previewPayData = `${baseUrl}/preview/pay/${orderNo}`;
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAYING', payData: previewPayData, paymentEnv: 'PREVIEW' },
    });
    return successResponse({
      orderNo,
      status: 'PAYING',
      payData: previewPayData,
      paymentEnv: 'PREVIEW',
      statusToken: order.id,
      message: '演示预览模式（非真实收款）',
    });
  }

  // 调用真实支付渠道
  try {
    const notifyUrl = data.channel.startsWith('ALIPAY')
      ? resolveAlipayNotifyUrl(request.headers, paymentConfig.notifyUrl)
      : resolveChannelNotifyPath(data.channel, baseUrl);

    const payResult = await resolved.provider.createPayment({
      orderNo,
      amount,
      subject: order.subject,
      currency: 'CNY',
      notifyUrl,
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
        orderNo,
        status: 'PAYING',
        payData: payResult.payData,
        tradeNo: payResult.tradeNo,
        paymentEnv,
      statusToken: order.id,
      });
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'FAILED', paymentEnv },
    });
    return errorResponse(`支付创建失败: ${payResult.error || '支付渠道未返回支付内容'}`, 502);
  } catch (error) {
    console.error('Cashier payment creation error:', (error as Error).message);
    await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
    return errorResponse('支付渠道调用失败', 502);
  }
}

// 收银台订单状态轮询（公开接口，仅返回最小字段）
export async function GET(request: NextRequest): Promise<NextResponse> {
  const orderNo = new URL(request.url).searchParams.get('orderNo');
  const statusToken = new URL(request.url).searchParams.get('statusToken');
  if (!orderNo || !statusToken) {
    return errorResponse('缺少订单状态凭证', 400);
  }

  const order = await prisma.order.findUnique({
    where: { orderNo },
    select: {
      id: true,
      orderNo: true,
      status: true,
      amount: true,
      expiredAt: true,
      confirmationMode: true,
    },
  });
  if (!order) {
    return errorResponse('订单不存在', 404);
  }
  if (order.id !== statusToken) {
    return errorResponse('订单不存在', 404);
  }

  return successResponse({
    orderNo: order.orderNo,
    status: order.status,
    amount: Number(order.amount),
    expired: order.expiredAt ? order.expiredAt.getTime() < Date.now() : false,
    confirmationMode: order.confirmationMode,
  });
}

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip');
}
