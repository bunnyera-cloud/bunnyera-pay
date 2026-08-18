import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { recordAuditLog } from '@/lib/audit';

// 微信支付回调通知处理
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // 获取回调中的商户号
    const resource = body?.resource;
    if (!resource && !body?.id) {
      return NextResponse.json({ code: 'FAIL', message: '无效回调' });
    }

    // 尝试从解密数据中获取 orderNo
    let orderNo: string | undefined;

    // 记录原始回调（先找到相关订单）
    // 微信支付 V3 需要在解密后才能获取 orderNo
    // 先记录原始数据
    
    // 验证签名
    // TODO: 从数据库获取微信平台证书进行验签
    const isVerified = true; // 暂时跳过，生产环境必须实现

    if (!isVerified) {
      return NextResponse.json({ code: 'FAIL', message: '签名验证失败' });
    }

    // 解密回调数据
    let callbackData: {
      out_trade_no?: string;
      transaction_id?: string;
      trade_state?: string;
      success_time?: string;
      amount?: { total?: number };
    } | undefined;
    try {
      // 从所有商户的支付配置中尝试解密
      const configs = await prisma.paymentConfig.findMany({
        where: { channel: { in: ['WECHAT_NATIVE', 'WECHAT_H5', 'WECHAT_JSAPI', 'WECHAT_MINI'] } },
        include: { merchant: true },
      });

      let decrypted = false;
      for (const config of configs) {
        if (!config.apiKey) continue;
        
        try {
          const crypto = await import('crypto');
          const key = crypto.createHash('sha256').update(config.apiKey).digest();
          const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(resource.nonce));
          decipher.setAAD(Buffer.from(resource.associated_data || ''));
          const ciphertextBuf = Buffer.from(resource.ciphertext, 'base64');
          const authTag = ciphertextBuf.subarray(ciphertextBuf.length - 16);
          const data = ciphertextBuf.subarray(0, ciphertextBuf.length - 16);
          decipher.setAuthTag(authTag);
          const plainText = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
          callbackData = JSON.parse(plainText);
          if (!callbackData) continue;
          orderNo = callbackData.out_trade_no;
          
          if (orderNo) {
            // 找到匹配的订单，记录回调日志
            const order = await prisma.order.findUnique({ where: { orderNo } });
            if (order) {
              await prisma.callbackLog.create({
                data: {
                  orderId: order.id,
                  channel: order.channel,
                  rawData: body as unknown as Prisma.InputJsonValue,
                  verified: true,
                  processed: false,
                },
              });

              // 幂等处理
              if (order.status === 'PAID' || order.status === 'REFUNDED' || order.status === 'PARTIALLY_REFUNDED') {
                return NextResponse.json({ code: 'SUCCESS', message: '已处理' });
              }

              // 金额校验
              const callbackAmount = (callbackData.amount?.total || 0) / 100;
              if (Math.abs(callbackAmount - Number(order.amount)) > 0.01) {
                console.error(`Wechat callback: amount mismatch - order: ${order.amount}, callback: ${callbackAmount}`);
                return NextResponse.json({ code: 'FAIL', message: '金额不一致' });
              }

              // 更新订单
              if (callbackData.trade_state === 'SUCCESS') {
                const cb = callbackData;
                await prisma.$transaction(async (tx) => {
                  const currentOrder = await tx.order.findUnique({
                    where: { id: order.id },
                    select: { status: true },
                  });

                  if (currentOrder?.status !== 'CREATED' && currentOrder?.status !== 'PAYING') {
                    return;
                  }

                  await tx.order.update({
                    where: { id: order.id },
                    data: {
                      status: 'PAID',
                      channelTradeNo: cb.transaction_id,
                      paidAt: cb.success_time ? new Date(cb.success_time) : new Date(),
                      callbackRaw: cb as unknown as Prisma.InputJsonValue,
                      callbackCount: { increment: 1 },
                    },
                  });

                  await tx.paymentRecord.create({
                    data: {
                      orderId: order.id,
                      amount: callbackAmount,
                      channel: order.channel,
                      channelTradeNo: cb.transaction_id,
                      status: 'SUCCESS',
                      rawData: cb as unknown as Prisma.InputJsonValue,
                    },
                  });
                });

                await recordAuditLog({
                  action: 'PAYMENT_CALLBACK',
                  resource: 'order',
                  resourceId: order.id,
                  result: 'SUCCESS',
                  detail: `微信支付回调 - 订单 ${orderNo}，金额 ${callbackAmount}`,
                });
              }

              decrypted = true;
              break;
            }
          }
        } catch {
          continue;
        }
      }

      if (!decrypted) {
        console.error('Wechat callback: failed to decrypt or find order');
        return NextResponse.json({ code: 'FAIL', message: '解密失败' });
      }
    } catch (error) {
      console.error('Wechat callback decrypt error:', error);
      return NextResponse.json({ code: 'FAIL', message: '处理失败' });
    }

    return NextResponse.json({ code: 'SUCCESS', message: '成功' });
  } catch (error) {
    console.error('Wechat callback error:', error);
    return NextResponse.json({ code: 'FAIL', message: '服务器错误' });
  }
}
