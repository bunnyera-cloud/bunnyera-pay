import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { signToken } from '@/lib/auth';
import { recordAuditLog } from '@/lib/audit';

// 平台管理员登录
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: '请输入邮箱和密码' }, { status: 400 });
    }

    const user = await prisma.platformUser.findUnique({ where: { email } });
    if (!user) {
      await recordAuditLog({
        action: 'PLATFORM_LOGIN_FAILED',
        resource: 'platform_user',
        request,
        result: 'FAILED',
        detail: `邮箱 ${email} 不存在`,
      });
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }

    // 检查是否被锁定
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return NextResponse.json({ error: '账户已锁定，请稍后再试' }, { status: 423 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const attempts = user.loginAttempts + 1;
      const maxAttempts = parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5');
      const lockoutMs = parseInt(process.env.LOGIN_LOCKOUT_MS || '900000');
      
      await prisma.platformUser.update({
        where: { id: user.id },
        data: {
          loginAttempts: attempts,
          lockedUntil: attempts >= maxAttempts ? new Date(Date.now() + lockoutMs) : undefined,
        },
      });

      await recordAuditLog({
        platformUserId: user.id,
        action: 'PLATFORM_LOGIN_FAILED',
        resource: 'platform_user',
        resourceId: user.id,
        request,
        result: 'FAILED',
        detail: '密码错误',
      });

      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }

    // 登录成功，生成 Token
    const token = await signToken({
      sub: user.id,
      type: 'platform',
      role: user.role,
    });

    // 创建会话
    await prisma.platformSession.create({
      data: {
        userId: user.id,
        token,
        device: request.headers.get('user-agent') || 'unknown',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 重置登录尝试
    await prisma.platformUser.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    await recordAuditLog({
      platformUserId: user.id,
      action: 'PLATFORM_LOGIN',
      resource: 'platform_user',
      resourceId: user.id,
      request,
      result: 'SUCCESS',
    });

    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error('Platform login error:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
