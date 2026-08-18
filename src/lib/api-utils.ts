import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, JwtPayload } from './auth';

export interface AuthContext {
  user: JwtPayload;
}

// 从请求中提取并验证 JWT
export async function getAuthUser(request: NextRequest): Promise<JwtPayload | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  
  const token = authHeader.slice(7);
  return verifyToken(token);
}

// 要求认证的中间件辅助函数
export async function withAuth(
  request: NextRequest,
  handler: (req: NextRequest, ctx: AuthContext) => Promise<NextResponse>,
  requiredRoles?: string[]
): Promise<NextResponse> {
  const user = await getAuthUser(request);
  
  if (!user) {
    return NextResponse.json({ error: '未授权，请先登录' }, { status: 401 });
  }
  
  if (requiredRoles && !requiredRoles.includes(user.role)) {
    return NextResponse.json({ error: '权限不足' }, { status: 403 });
  }
  
  return handler(request, { user });
}

// 统一响应格式
export function successResponse<T>(data: T, message?: string) {
  return NextResponse.json({
    success: true,
    data,
    message: message || '操作成功',
  });
}

export function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({
    success: false,
    error: message,
  }, { status });
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return NextResponse.json({
    success: true,
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
