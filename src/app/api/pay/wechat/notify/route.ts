import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { recordAuditLog } from '@/lib/audit';
import { resolveProvider } from '@/lib/payment/resolver';
import { amountToFen } from '@/lib/payment/config';

// 微信支付回调通知处理
// 统一 Webhook contract：读取请求 -> resolve provider -> provider.handleWebhook() -> 幂等更新
// 验签 fail-closed：微信平台证书接入前，一切回调拒绝处理（已移除 isVerified=true 假验签）
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ code: 'FAIL', message: '无效回调体' }, { status: 400 });
    }

    const typedBody = body as { id?: string; resource?: unknown };
    if (!typedBody.resource && !typedBody.id) {
      return NextResponse.json({ code: 'FAIL', message: '无效回调' });
    }

    // 微信 V3：orderNo 解密后才可获得。遍历该商户组的 active 微信配置，
    // 逐个经 resolveProvider -> handleWebhook 验签解析，匹配订单后幂等处理
    const configs = await prisma.paymentConfig.findMany({
      where: {
        channel: { in: ['WECHAT_NATIVE', 'WECHAT_H5', 'WECHAT_JSAPI', 'WECHAT_MINI'] },
        isActive: true,
      },
    });

    for (const config of configs) {
      const resolved = resolveProvider(config.channel, config);
      if (!resolved.provider || !resolved.usable) continue;

      // 验签失败必须拒绝处理，禁止兼容性假成功
      const webhook = await resolved.provider.handleWebhook({ body, headers });
      if (!webhook.verified || !webhook.data || !webhook.data.orderNo) continue;

      const callbackData = webhook.data;
      const order = await prisma.order.findUnique({ where: { orderNo: callbackData.orderNo } });
      // 订单必须归属于当前验签通过的商户配置
      if (!order || order.merchantId !== config.merchantId) continue;

      // 记录回调日志
      const callbackLog = await prisma.callbackLog.create({
        data: {
          orderId: order.id,
          channel: order.channel,
          rawData: body as unknown as Prisma.InputJsonValue,
          signature: headers['wechatpay-signature'],
          verified: true,
          processed: false,
        },
      });

      // 演示预览订单不接受任何外部回调
      if (order.paymentEnv === 'PREVIEW') {
        await prisma.callbackLog.update({
          where: { id: callbackLog.id },
          data: { error: '演示预览订单拒绝外部回调' },
        });
        return NextResponse.json({ code: 'FAIL', message: '演示预览订单拒绝外部回调' });
      }

      // 幂等处理：订单已终态，直接返回成功
      if (order.status !== 'CREATED' && order.status !== 'PAYING') {
        await prisma.callbackLog.update({
          where: { id: callbackLog.id },
          data: { processed: true, error: `订单状态(${order.status})已终态，幂等返回` },
        });
        return NextResponse.json({ code: 'SUCCESS', message: '已处理' });
      }

      // 金额一致性校验 — 使用整数分精确比较，禁止 JS 浮点
      const orderAmountFen = amountToFen(order.amount.toString());
      const callbackAmountFen = Math.round(callbackData.amount * 100);
      if (orderAmountFen !== callbackAmountFen) {
        console.error(
          `Wechat callback: amount mismatch - order: ${order.amount} (${orderAmountFen}分), callback: ${callbackAmountFen}分`
        );
        await prisma.callbackLog.update({
          where: { id: callbackLog.id },
          data: { error: `金额不一致: 订单${order.amount}元(${orderAmountFen}分)，回调${callbackAmountFen}分` },
        });
        return NextResponse.json({ code: 'FAIL', message: '金额不一致' });
      }

      // 更新订单状态（事务保证原子性，并发安全）
      if (callbackData.status === 'SUCCESS') {
        await prisma.$transaction(async (tx) => {
          const currentOrder = await tx.order.findUnique({
            where: { id: order.id },
            select: { status: true },
          });
          if (currentOrder?.status !== 'CREATED' && currentOrder?.status !== 'PAYING') {
            return; // 已被其他回调处理
          }

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

          await tx.paymentRecord.create({
            data: {
              orderId: order.id,
              amount: callbackData.amount,
              channel: order.channel,
              channelTradeNo: callbackData.tradeNo,
              status: 'SUCCESS',
              rawData: callbackData.raw as unknown as Prisma.InputJsonValue,
            },
          });
        });

        await recordAuditLog({
          action: 'PAYMENT_CALLBACK',
          resource: 'order',
          resourceId: order.id,
          result: 'SUCCESS',
          detail: `微信支付回调 - 订单 ${callbackData.orderNo}，金额 ${callbackData.amount}`,
        });
      }

      await prisma.callbackLog.update({
        where: { id: callbackLog.id },
        data: { processed: true },
      });
      return NextResponse.json({ code: 'SUCCESS', message: '成功' });
    }

    // 无任何配置验签通过并匹配订单：fail-closed 拒绝
    console.error('Wechat callback: verification failed or no matching order');
    return NextResponse.json({ code: 'FAIL', message: '验签失败或无匹配订单' });
  } catch (error) {
    console.error('Wechat callback error:', error);
    return NextResponse.json({ code: 'FAIL', message: '服务器错误' });
  }
}
