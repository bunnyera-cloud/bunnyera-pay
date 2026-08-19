import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { verifyToken, JwtPayload } from '@/lib/auth';

// 从请求中提取并验证token
export async function getAuthFromRequest(req: NextRequest): Promise<JwtPayload | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  return await verifyToken(token);
}

// 验证是否为平台管理员
export function isPlatformUser(payload: JwtPayload): boolean {
  return payload.type === 'platform';
}

// 验证是否为商户成员
export function isMerchantUser(payload: JwtPayload): boolean {
  return payload.type === 'merchant';
}

// 检查权限：必须是平台管理员
export function requirePlatformUser(payload: JwtPayload | null): asserts payload is JwtPayload {
  if (!payload || !isPlatformUser(payload)) {
    throw new Error('Unauthorized: Platform admin required');
  }
}

// 检查权限：必须是商户成员
export function requireMerchantUser(payload: JwtPayload | null): asserts payload is JwtPayload {
  if (!payload || !isMerchantUser(payload)) {
    throw new Error('Unauthorized: Merchant member required');
  }
}

// 获取商户ID（仅适用于商户用户）
export function getMerchantId(payload: JwtPayload): string {
  if (payload.type !== 'merchant' || !payload.merchantId) {
    throw new Error('Not a merchant user or missing merchantId');
  }
  return payload.merchantId;
}