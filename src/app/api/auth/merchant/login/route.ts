import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { signToken } from '@/lib/auth';
import { recordAuditLog } from '@/lib/audit';

// 商户成员登录
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: '请输入邮箱和密码' }, { status: 400 });
    }

    // 查找商户成员
    const member = await prisma.merchantMember.findFirst({
      where: { email },
      include: { merchant: true },
    });

    if (!member) {
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }

    // 检查商户状态（拒绝和终止的商户不能登录）
    if (member.merchant.status === 'REJECTED' || member.merchant.status === 'TERMINATED') {
      return NextResponse.json({ error: '商户已被拒绝或终止，请联系管理员' }, { status: 403 });
    }

    // 检查账户是否被锁定
    if (member.lockedUntil && member.lockedUntil > new Date()) {
      return NextResponse.json({ error: '账户已锁定，请稍后再试' }, { status: 423 });
    }

    if (!member.isActive) {
      return NextResponse.json({ error: '账户已被禁用' }, { status: 403 });
    }

    const valid = await bcrypt.compare(password, member.passwordHash);
    if (!valid) {
      const attempts = member.loginAttempts + 1;
      const maxAttempts = parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5');
      const lockoutMs = parseInt(process.env.LOGIN_LOCKOUT_MS || '900000');

      await prisma.merchantMember.update({
        where: { id: member.id },
        data: {
          loginAttempts: attempts,
          lockedUntil: attempts >= maxAttempts ? new Date(Date.now() + lockoutMs) : undefined,
        },
      });

      await recordAuditLog({
        merchantMemberId: member.id,
        action: 'MERCHANT_LOGIN_FAILED',
        resource: 'merchant_member',
        resourceId: member.id,
        request,
        result: 'FAILED',
        detail: '密码错误',
      });

      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }

    // 登录成功
    const token = await signToken({
      sub: member.id,
      type: 'merchant',
      merchantId: member.merchantId,
      role: member.role,
    });

    // 创建会话
    await prisma.merchantSession.create({
      data: {
        memberId: member.id,
        token,
        device: request.headers.get('user-agent') || 'unknown',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 重置登录尝试
    await prisma.merchantMember.update({
      where: { id: member.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    await recordAuditLog({
      merchantMemberId: member.id,
      action: 'MERCHANT_LOGIN',
      resource: 'merchant_member',
      resourceId: member.id,
      request,
      result: 'SUCCESS',
    });

    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: member.id,
          email: member.email,
          name: member.name,
          role: member.role,
          merchantId: member.merchantId,
          merchantName: member.merchant.companyName,
          merchantNo: member.merchant.merchantNo,
        },
      },
    });
  } catch (error) {
    console.error('Merchant login error:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
