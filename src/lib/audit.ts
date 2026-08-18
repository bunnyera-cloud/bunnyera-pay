import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { verifyToken } from './auth';
import prisma from './db';

// 审计日志记录
export async function recordAuditLog(params: {
  platformUserId?: string;
  merchantMemberId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  request?: NextRequest;
  beforeData?: Prisma.InputJsonValue;
  afterData?: Prisma.InputJsonValue;
  result?: string;
  detail?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        platformUserId: params.platformUserId,
        merchantMemberId: params.merchantMemberId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        ip: params.request?.headers.get('x-forwarded-for') || 
            params.request?.headers.get('x-real-ip') || 
            'unknown',
        userAgent: params.request?.headers.get('user-agent') || 'unknown',
        beforeData: params.beforeData,
        afterData: params.afterData,
        result: params.result || 'SUCCESS',
        detail: params.detail,
      },
    });
  } catch (error) {
    console.error('Failed to record audit log:', error);
  }
}

// 从请求中提取操作者信息
export async function getOperatorFromRequest(request: NextRequest): Promise<{
  platformUserId?: string;
  merchantMemberId?: string;
  merchantId?: string;
  role?: string;
}> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return {};
  
  const token = authHeader.slice(7);
  const payload = await verifyToken(token);
  
  if (!payload) return {};
  
  if (payload.type === 'platform') {
    return { platformUserId: payload.sub, role: payload.role };
  } else {
    return { merchantMemberId: payload.sub, merchantId: payload.merchantId, role: payload.role };
  }
}
