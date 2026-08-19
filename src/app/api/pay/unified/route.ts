import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { generateOrderNo } from '@/lib/auth';
import { PaymentFactory } from '@/lib/payment/provider';
import { AlipayProvider } from '@/lib/payment/alipay';
import { WechatPayProvider } from '@/lib/payment/wechat';
import { UnionPayProvider } from '@/lib/payment/unionpay';
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

    // 如果指定了渠道，验证渠道配置
    if (data.channel) {
      const paymentConfig = await prisma.paymentConfig.findFirst({
        where: { merchantId, channel: data.channel, isActive: true },
      });

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

      // 演示模式：无支付配置时直接返回
      if (!paymentConfig) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: 'PAYING' },
        });

        return successResponse({
          orderId: order.id,
          orderNo: order.orderNo,
          status: 'PAYING',
          mode: 'demo',
          message: '订单已创建（演示模式，未配置支付渠道）',
        });
      }

      // 调用支付渠道
      try {
        // 将 null 转换为 undefined 以匹配 getProvider 参数类型
        const configForProvider = {
          channel: paymentConfig.channel,
          appId: paymentConfig.appId || undefined,
          privateKey: paymentConfig.privateKey || undefined,
          publicKey: paymentConfig.publicKey || undefined,
          gateway: paymentConfig.gateway || undefined,
          mchId: paymentConfig.mchId || undefined,
          apiKey: paymentConfig.apiKey || undefined,
          serialNo: paymentConfig.serialNo || undefined,
          certPath: paymentConfig.certPath || undefined,
          unionpayMchId: paymentConfig.unionpayMchId || undefined,
          unionpayCert: paymentConfig.unionpayCert || undefined,
          notifyUrl: paymentConfig.notifyUrl || undefined,
        };
        const provider = getProvider(configForProvider, data.channel);
        if (!provider) {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: 'PAYING' },
          });

          return successResponse({
            orderId: order.id,
            orderNo: order.orderNo,
            status: 'CREATED',
            message: '订单已创建，等待支付渠道配置完成',
          });
        }

        const notifyUrl = paymentConfig.notifyUrl || process.env.ALIPAY_NOTIFY_URL || '';
        const result = await provider.createPayment({
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
        } else {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: 'FAILED' },
          });

          return errorResponse(`支付创建失败: ${result.error}`, 502);
        }
      } catch (error) {
        console.error('Payment creation error:', error);
        return errorResponse('支付渠道调用失败', 502);
      }
    }

    // 未指定渠道：返回可用渠道列表
    const configs = await prisma.paymentConfig.findMany({
      where: { merchantId, isActive: true },
      select: { channel: true, isSandbox: true },
    });

    const availableChannels = configs.map(c => ({
      channel: c.channel,
      channelName: getChannelName(c.channel),
      isSandbox: c.isSandbox,
    }));

    // 如果没有任何配置，返回演示模式提示
    if (availableChannels.length === 0) {
      return successResponse({
        mode: 'demo',
        availableChannels: getAllChannels(),
        message: '未配置任何支付渠道，以下为全部可用渠道（演示模式）',
      });
    }

    return successResponse({
      availableChannels,
      message: `该商户已开通 ${availableChannels.length} 个支付渠道`,
    });
  }, ['MERCHANT_OWNER', 'MERCHANT_ADMIN', 'FINANCE', 'CASHIER']);
}

// 获取支付提供者实例
function getProvider(config: { channel: string; appId?: string; privateKey?: string; publicKey?: string; gateway?: string; mchId?: string; apiKey?: string; serialNo?: string; certPath?: string; unionpayMchId?: string; unionpayCert?: string; notifyUrl?: string }, channel: string) {
  // 先检查工厂注册
  const registered = PaymentFactory.getProvider(channel as never);
  if (registered) return registered;

  // 根据渠道类型动态创建
  if (channel.startsWith('ALIPAY')) {
    return new AlipayProvider({
      appId: config.appId || process.env.ALIPAY_APP_ID || '',
      privateKey: config.privateKey || process.env.ALIPAY_PRIVATE_KEY || '',
      publicKey: config.publicKey || process.env.ALIPAY_PUBLIC_KEY || '',
      gateway: config.gateway || process.env.ALIPAY_GATEWAY || '',
      channel: channel as never,
    });
  }

  if (channel.startsWith('WECHAT')) {
    return new WechatPayProvider({
      appId: config.appId || process.env.WECHAT_APP_ID || '',
      mchId: config.mchId || process.env.WECHAT_MCH_ID || '',
      apiKey: config.apiKey || process.env.WECHAT_API_KEY || '',
      serialNo: config.serialNo || process.env.WECHAT_SERIAL_NO || '',
      privateKey: config.privateKey || '',
      channel: channel as never,
    });
  }

  if (channel.startsWith('UNIONPAY')) {
    return new UnionPayProvider({
      merId: config.unionpayMchId || config.mchId || process.env.UNIONPAY_MCH_ID || '',
      certPath: config.unionpayCert || config.certPath || process.env.UNIONPAY_CERT_PATH || '',
      certPass: process.env.UNIONPAY_CERT_PASSWORD || '',
      gateway: config.gateway || process.env.UNIONPAY_GATEWAY || 'https://gateway.95516.com',
      channel: channel as never,
    });
  }

  return null;
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

function getAllChannels() {
  return [
    { channel: 'ALIPAY_BAR', channelName: '支付宝条码' },
    { channel: 'ALIPAY_PC', channelName: '支付宝PC' },
    { channel: 'ALIPAY_WAP', channelName: '支付宝WAP' },
    { channel: 'WECHAT_NATIVE', channelName: '微信Native' },
    { channel: 'WECHAT_H5', channelName: '微信H5' },
    { channel: 'WECHAT_JSAPI', channelName: '微信JSAPI' },
    { channel: 'WECHAT_MINI', channelName: '微信小程序' },
    { channel: 'UNIONPAY_GATEWAY', channelName: '银联网关' },
    { channel: 'UNIONPAY_WAP', channelName: '银联WAP' },
    { channel: 'UNIONPAY_QR', channelName: '银联二维码' },
    { channel: 'LAKALA_AGGREGATE', channelName: '拉卡拉聚合' },
  ];
}
