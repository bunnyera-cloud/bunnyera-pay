import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { recordAuditLog } from '@/lib/audit';
import { resolveProvider } from '@/lib/payment/resolver';
import { amountToFen } from '@/lib/payment/config';
import { sanitizePaymentPayload } from '@/lib/payment/sanitize';

// 支付宝回调通知处理
// 统一 Webhook contract：读取请求 -> resolve provider -> provider.handleWebhook() -> 幂等更新
// 幂等设计：同一笔订单的回调可以重复接收，但只处理一次
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const body: Record<string, string> = {};
    formData.forEach((value, key) => {
      body[key] = value as string;
    });
    const sanitizedBody = sanitizePaymentPayload(body) as Prisma.InputJsonValue;

    // 记录原始回调
    const orderNo = body.out_trade_no;
    if (!orderNo) {
      return new NextResponse('fail', { status: 200 });
    }

    // 查找订单（含门店归属信息）
    const order = await prisma.order.findUnique({
      where: { orderNo },
      include: {
        merchant: { include: { paymentConfigs: true } },
      },
    });

    if (!order) {
      console.warn(`Alipay callback: order not found - ${orderNo}`);
      return new NextResponse('fail', { status: 200 });
    }

    // 校验必要字段
    const tradeStatus = body.trade_status;
    if (!tradeStatus) {
      return new NextResponse('fail', { status: 200 });
    }

    // 记录回调日志（使用订单真实 channel，禁止写死 ALIPAY_BAR）
    const callbackLog = await prisma.callbackLog.create({
      data: {
        orderId: order.id,
        channel: order.channel,
        rawData: sanitizedBody,
        signature: body.sign ? '[PRESENT]' : null,
        verified: false,
        processed: false,
      },
    });

    // 解析 Provider，调用统一 handleWebhook（RSA2 验签 + app_id/seller_id 一致性 + 解析均收敛到 Provider）
    const paymentConfig = order.merchant.paymentConfigs.find(
      c => c.channel === order.channel
    );

    // 演示预览订单不接受任何外部回调
    if (order.paymentEnv === 'PREVIEW') {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { error: '演示预览订单拒绝外部回调' },
      });
      return new NextResponse('fail', { status: 200 });
    }

    const resolved = resolveProvider(order.channel, paymentConfig);
    if (!resolved.provider || !resolved.usable) {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { error: '支付渠道不可用，无法验证回调' },
      });
      return new NextResponse('fail', { status: 200 });
    }

    // 验签失败必须拒绝处理，禁止兼容性假成功
    const webhook = await resolved.provider.handleWebhook({ body, headers: {} });
    await prisma.callbackLog.update({
      where: { id: callbackLog.id },
      data: { verified: webhook.verified },
    });

    if (!webhook.verified || !webhook.data) {
      console.warn(`Alipay callback: webhook verification failed - ${orderNo} - ${webhook.error || 'unknown'}`);
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { error: webhook.error || '签名验证失败' },
      });
      return new NextResponse('fail', { status: 200 });
    }

    // 幂等处理：订单已终态（PAID / REFUNDED / PARTIALLY_REFUNDED / CLOSED / FAILED），直接返回成功
    if (order.status !== 'CREATED' && order.status !== 'PAYING') {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { processed: true, error: `订单状态(${order.status})已终态，幂等返回` },
      });
      return new NextResponse('success', { status: 200 });
    }

    const callbackData = webhook.data;

    // 关键校验：金额一致性 — 使用整数分精确比较，禁止 JS 浮点
    // （callbackData.amount 由 Provider parseCallback 转为整数分）
    const orderAmountFen = amountToFen(order.amount.toString());
    const callbackAmountFen = callbackData.amount;
    if (orderAmountFen !== callbackAmountFen) {
      console.error(
        `Alipay callback: amount mismatch - order: ${order.amount} (${orderAmountFen}分), callback: ${body.total_amount} (${callbackAmountFen}分)`
      );
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { error: `金额不一致: 订单${order.amount}元(${orderAmountFen}分)，回调${body.total_amount}元(${callbackAmountFen}分)` },
      });
      return new NextResponse('fail', { status: 200 });
    }

    // 非支付成功通知只做审计并确认接收，不得把订单误标为 FAILED。
    if (callbackData.status !== 'SUCCESS') {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { processed: true, error: `非支付成功状态: ${tradeStatus}` },
      });
      return new NextResponse('success', { status: 200 });
    }

    // 更新订单状态：条件更新是并发执行权锁，只有一个重复回调能创建支付记录。
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: { in: ['CREATED', 'PAYING'] } },
        data: {
          status: 'PAID',
          channelTradeNo: callbackData.tradeNo,
          paidAt: callbackData.paidAt || new Date(),
          callbackRaw: sanitizedBody,
          callbackCount: { increment: 1 },
        },
      });
      if (claimed.count === 0) return;

      // 记录支付记录
      await tx.paymentRecord.create({
        data: {
          orderId: order.id,
          amount: (callbackData.amount / 100).toFixed(2),
          channel: order.channel,
          channelTradeNo: callbackData.tradeNo,
          status: 'SUCCESS',
          rawData: sanitizedBody,
        },
      });
    });

    await prisma.callbackLog.update({
      where: { id: callbackLog.id },
      data: { processed: true },
    });

    await recordAuditLog({
      action: 'PAYMENT_CALLBACK',
      resource: 'order',
      resourceId: order.id,
      result: callbackData.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      detail: `支付宝回调 - 订单 ${orderNo}，金额 ${body.total_amount}`,
    });

    // 支付宝要求返回 "success"
    return new NextResponse('success', { status: 200 });
  } catch (error) {
    console.error('Alipay callback error:', error);
    return new NextResponse('fail', { status: 200 });
  }
}
