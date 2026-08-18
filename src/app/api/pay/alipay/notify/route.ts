import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { AlipayProvider } from '@/lib/payment/alipay';
import { recordAuditLog } from '@/lib/audit';
import { resolveAlipayConfig } from '@/lib/payment/config';

// 支付宝回调通知处理
// 幂等设计：同一笔订单的回调可以重复接收，但只处理一次
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const body: Record<string, string> = {};
    formData.forEach((value, key) => {
      body[key] = value as string;
    });

    // 记录原始回调
    const orderNo = body.out_trade_no;
    if (!orderNo) {
      return new NextResponse('fail', { status: 200 });
    }

    // 查找订单
    const order = await prisma.order.findUnique({
      where: { orderNo },
      include: { merchant: { include: { paymentConfigs: true } } },
    });

    if (!order) {
      console.warn(`Alipay callback: order not found - ${orderNo}`);
      return new NextResponse('fail', { status: 200 });
    }

    // 记录回调日志
    const callbackLog = await prisma.callbackLog.create({
      data: {
        orderId: order.id,
        channel: 'ALIPAY_BAR', // 支付宝统一回调
        rawData: body as unknown as Prisma.InputJsonValue,
        signature: body.sign,
        verified: false,
        processed: false,
      },
    });

    // 验证签名
    const paymentConfig = order.merchant.paymentConfigs.find(
      c => c.channel === order.channel
    );

    const resolved = resolveAlipayConfig(paymentConfig);
    const provider = new AlipayProvider({
      appId: resolved.appId,
      privateKey: resolved.privateKey,
      publicKey: resolved.publicKey,
      gateway: resolved.gateway,
      channel: order.channel,
    });

    // 演示预览订单不接受任何外部回调
    if (order.paymentEnv === 'PREVIEW') {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { error: '演示预览订单拒绝外部回调' },
      });
      return new NextResponse('fail', { status: 200 });
    }

    // app_id 必须与服务端配置一致
    if (!resolved.appId || body.app_id !== resolved.appId) {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { error: 'app_id 与服务端配置不一致' },
      });
      return new NextResponse('fail', { status: 200 });
    }

    const isVerified = provider.verifyCallback(body, {});
    await prisma.callbackLog.update({
      where: { id: callbackLog.id },
      data: { verified: isVerified },
    });

    if (!isVerified) {
      console.warn(`Alipay callback: signature verification failed - ${orderNo}`);
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { error: '签名验证失败' },
      });
      return new NextResponse('fail', { status: 200 });
    }

    // 幂等处理：如果订单已经是 PAID 状态，直接返回成功
    if (order.status === 'PAID' || order.status === 'REFUNDED' || order.status === 'PARTIALLY_REFUNDED') {
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { processed: true, error: '订单已处理，幂等返回' },
      });
      return new NextResponse('success', { status: 200 });
    }

    // 解析回调数据
    const callbackData = provider.parseCallback(body);

    // 关键校验：金额一致性
    if (Math.abs(callbackData.amount - Number(order.amount)) > 0.01) {
      console.error(`Alipay callback: amount mismatch - order: ${order.amount}, callback: ${callbackData.amount}`);
      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { error: `金额不一致: 订单${order.amount}，回调${callbackData.amount}` },
      });
      return new NextResponse('fail', { status: 200 });
    }

    // 更新订单状态（使用事务保证原子性）
    await prisma.$transaction(async (tx) => {
      // 再次检查订单状态（防止并发）
      const currentOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: { status: true },
      });

      if (currentOrder?.status !== 'CREATED' && currentOrder?.status !== 'PAYING') {
        return; // 已被其他回调处理
      }

      if (callbackData.status === 'SUCCESS') {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'PAID',
            channelTradeNo: callbackData.tradeNo,
            paidAt: callbackData.paidAt || new Date(),
            callbackRaw: body as unknown as Prisma.InputJsonValue,
            callbackCount: { increment: 1 },
          },
        });
      } else {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'FAILED',
            callbackRaw: body as unknown as Prisma.InputJsonValue,
            callbackCount: { increment: 1 },
          },
        });
      }

      // 记录支付记录
      await tx.paymentRecord.create({
        data: {
          orderId: order.id,
          amount: callbackData.amount,
          channel: order.channel,
          channelTradeNo: callbackData.tradeNo,
          status: callbackData.status,
          rawData: body as unknown as Prisma.InputJsonValue,
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
      detail: `支付宝回调 - 订单 ${orderNo}，金额 ${callbackData.amount}`,
    });

    // 支付宝要求返回 "success"
    return new NextResponse('success', { status: 200 });
  } catch (error) {
    console.error('Alipay callback error:', error);
    return new NextResponse('fail', { status: 200 });
  }
}
