import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { signToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: '邮箱和密码不能为空' },
        { status: 400 }
      );
    }

    // 查找商户成员
    const member = await prisma.merchantMember.findFirst({
      where: { 
        email,
        isActive: true,
        merchant: {
          status: 'ACTIVE'
        }
      },
      include: {
        merchant: {
          select: {
            id: true,
            merchantNo: true,
            companyName: true,
            status: true
          }
        }
      }
    });

    if (!member) {
      return NextResponse.json(
        { error: '邮箱或密码错误，或商户未激活' },
        { status: 401 }
      );
    }

    // 检查密码
    const isPasswordValid = await bcrypt.compare(password, member.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: '邮箱或密码错误' },
        { status: 401 }
      );
    }

    // 更新登录信息
    await prisma.merchantMember.update({
      where: { id: member.id },
      data: {
        lastLoginAt: new Date(),
        loginAttempts: 0
      }
    });

    // 生成token
    const token = await signToken({
      sub: member.id,
      type: 'merchant',
      merchantId: member.merchantId,
      role: member.role
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: member.id,
        email: member.email,
        name: member.name,
        role: member.role,
        merchant: {
          id: member.merchant.id,
          merchantNo: member.merchant.merchantNo,
          companyName: member.merchant.companyName
        }
      }
    });

  } catch (error) {
    console.error('Merchant login error:', error);
    return NextResponse.json(
      { error: '登录失败，请稍后重试' },
      { status: 500 }
    );
  }
}