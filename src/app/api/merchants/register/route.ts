import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { generateMerchantNo, signToken } from '@/lib/auth';
import { recordAuditLog } from '@/lib/audit';
import { z } from 'zod';

const registerSchema = z.object({
  country: z.string().min(2),
  companyName: z.string().min(2),
  registrationNo: z.string().min(6),
  legalPerson: z.string().min(2),
  email: z.string().email(),
  phoneCode: z.string().default('+86'),
  phone: z.string().min(6),
  registeredAddress: z.string().min(5),
  businessAddress: z.string().optional(),
  businessCategory: z.string().min(2),
  website: z.string().url().optional().or(z.literal('')),
  password: z.string().min(8),
  agreementAccepted: z.literal(true, {
    message: '必须同意商户服务协议',
  }),
});

// 商户注册
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        error: '数据验证失败',
        details: validation.error.issues,
      }, { status: 400 });
    }

    const data = validation.data;

    // 检查邮箱是否已注册
    const existing = await prisma.merchant.findUnique({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json({ error: '该邮箱已注册商户' }, { status: 409 });
    }

    // 检查统一社会信用代码是否已注册
    const existingReg = await prisma.merchant.findFirst({
      where: { registrationNo: data.registrationNo },
    });
    if (existingReg) {
      return NextResponse.json({ error: '该统一社会信用代码已注册' }, { status: 409 });
    }

    // 创建商户
    const merchantNo = generateMerchantNo();
    const passwordHash = await bcrypt.hash(data.password, 12);

    const merchant = await prisma.$transaction(async (tx) => {
      // 创建商户记录
      const newMerchant = await tx.merchant.create({
        data: {
          merchantNo,
          country: data.country,
          companyName: data.companyName,
          registrationNo: data.registrationNo,
          legalPerson: data.legalPerson,
          email: data.email,
          phoneCode: data.phoneCode,
          phone: data.phone,
          registeredAddress: data.registeredAddress,
          businessAddress: data.businessAddress,
          businessCategory: data.businessCategory,
          website: data.website || null,
          status: 'SUBMITTED',
          agreementAccepted: true,
          agreementVersion: '1.0',
        },
      });

      // 创建商户法人账号
      await tx.merchantMember.create({
        data: {
          merchantId: newMerchant.id,
          email: data.email,
          name: data.legalPerson,
          phone: data.phone,
          passwordHash,
          role: 'MERCHANT_OWNER',
          isActive: true,
        },
      });

      return newMerchant;
    });

    await recordAuditLog({
      action: 'MERCHANT_REGISTER',
      resource: 'merchant',
      resourceId: merchant.id,
      request,
      result: 'SUCCESS',
      detail: `商户 ${data.companyName} 注册成功`,
    });

    // 生成登录 Token
    const member = await prisma.merchantMember.findFirst({
      where: { merchantId: merchant.id, role: 'MERCHANT_OWNER' },
    });

    const token = member ? await signToken({
      sub: member.id,
      type: 'merchant',
      merchantId: merchant.id,
      role: member.role,
    }) : null;

    return NextResponse.json({
      success: true,
      data: {
        merchantId: merchant.id,
        merchantNo: merchant.merchantNo,
        token,
      },
      message: '商户注册成功，已提交审核，请等待平台管理员审核',
    });
  } catch (error) {
    console.error('Merchant register error:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
