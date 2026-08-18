import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, paginatedResponse } from '@/lib/api-utils';

// 平台管理员获取审计日志
export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '50');
    const action = url.searchParams.get('action');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          result: true,
          detail: true,
          createdAt: true,
          platformUserId: true,
          merchantMemberId: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    // 附加操作者名称
    const logsWithNames = logs.map(log => ({
      ...log,
      operatorName: log.platformUserId ? '平台管理员' : log.merchantMemberId ? '商户成员' : '系统',
    }));

    return paginatedResponse(logsWithNames, total, page, pageSize);
  }, ['PLATFORM_SUPER_ADMIN', 'PLATFORM_REVIEWER']);
}
