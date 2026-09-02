import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { withRateLimitedAuth } from "@/lib/security/api-guard";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { resolveBaseUrl } from "@/lib/payment/config";
import { canAccessStore, canWriteAtStore, resolveStoreAccess } from "@/lib/store-access";
import { generateQrCodeValue } from "@/lib/qrcode/code";
import { buildAggregatePayUrl } from "@/lib/qrcode/url";
import { parsePayAmount } from "@/lib/qrcode/amount";
import {
  counterBelongsToStore,
  operatorAllowedForStore,
} from "@/lib/qrcode/access";
import {
  loadQrBindings,
  presentQrCode,
  QR_READ_ROLES,
  QR_WRITE_ROLES,
} from "@/lib/qrcode/owned";

const amountField = z
  .number()
  .positive()
  .max(1000000)
  .refine(
    (value) => new Decimal(value).decimalPlaces() <= 2,
    "金额最多保留两位小数",
  );

const createQRSchema = z
  .object({
    type: z.enum(["FIXED", "DYNAMIC"]),
    name: z.string().min(1).max(100),
    storeId: z.string().min(1, "请选择分店"),
    departmentId: z.string().optional(),
    counterId: z.string().optional(),
    operatorId: z.string().optional(),
    amount: amountField.optional(),
    fixedAmount: amountField.optional(),
  })
  .superRefine((data, ctx) => {
    const fixed = data.amount ?? data.fixedAmount;
    if (data.type === "FIXED" && fixed === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "固定收款码必须填写固定金额",
      });
    }
    if (data.type === "DYNAMIC" && fixed !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "动态收款码金额由顾客扫码后输入",
      });
    }
  });

export async function POST(request: NextRequest) {
  return withRateLimitedAuth(
    request,
    async (req, ctx) => {
      const body = await req.json();
      const validation = createQRSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: "数据验证失败", details: validation.error.issues },
          { status: 400 },
        );
      }

      const data = validation.data;
      const merchantId = ctx.user.merchantId!;
      const scope = await resolveStoreAccess(ctx.user);
      if (!canWriteAtStore(scope, data.storeId)) {
        return errorResponse("无权在该分店创建收款码", 403);
      }

      const store = await prisma.store.findFirst({
        where: { id: data.storeId, brand: { merchantId } },
        select: { id: true, isActive: true },
      });
      if (!store) {
        return errorResponse("门店不存在或不属于当前商户", 400);
      }
      if (!store.isActive) {
        return errorResponse("该门店已停用，请选择其他分店", 400);
      }

      let departmentId = data.departmentId || null;
      if (departmentId) {
        const department = await prisma.department.findFirst({
          where: { id: departmentId, storeId: store.id, isActive: true },
        });
        if (!department) {
          return errorResponse("部门不存在、不属于该门店或已停用", 400);
        }
      }

      if (data.counterId) {
        const counter = await prisma.counter.findFirst({
          where: { id: data.counterId },
          select: {
            id: true,
            isActive: true,
            departmentId: true,
            department: { select: { storeId: true } },
          },
        });
        if (
          !counter ||
          !counterBelongsToStore({
            counterStoreId: counter.department.storeId,
            storeId: store.id,
            counterActive: counter.isActive,
          })
        ) {
          return errorResponse("收银台不存在、不属于该门店或已停用", 400);
        }
        if (departmentId && counter.departmentId !== departmentId) {
          return errorResponse("收银台不属于指定部门", 400);
        }
        departmentId = counter.departmentId;
      }

      if (data.operatorId) {
        const operator = await prisma.merchantMember.findFirst({
          where: { id: data.operatorId, merchantId },
          select: {
            id: true,
            isActive: true,
            role: true,
            merchantId: true,
            storeAccesses: { select: { storeId: true } },
          },
        });
        if (
          !operator ||
          !operatorAllowedForStore({
            operatorMerchantId: operator.merchantId,
            qrMerchantId: merchantId,
            storeId: store.id,
            operatorActive: operator.isActive,
            operatorRole: operator.role,
            operatorStoreIds: operator.storeAccesses.map((item) => item.storeId),
          })
        ) {
          return errorResponse("员工不存在或不属于该门店合法范围", 400);
        }
      }

      let amount: Decimal | null = null;
      if (data.type === "FIXED") {
        const parsed = parsePayAmount(data.amount ?? data.fixedAmount);
        if (!parsed.ok) return errorResponse(parsed.error, 400);
        amount = parsed.amount;
      }

      let qrCode = null;
      for (let attempt = 0; attempt < 5 && !qrCode; attempt += 1) {
        try {
          qrCode = await prisma.qRCode.create({
            data: {
              merchantId,
              code: generateQrCodeValue(),
              type: data.type,
              name: data.name,
              storeId: data.storeId,
              departmentId,
              counterId: data.counterId || null,
              operatorId: data.operatorId || null,
              amount,
              expiredAt: null,
            },
          });
        } catch (error) {
          if (
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            error.code !== "P2002"
          ) {
            throw error;
          }
        }
      }
      if (!qrCode) return errorResponse("收款码编号生成失败，请重试", 503);

      const payUrl = buildAggregatePayUrl(resolveBaseUrl(req.headers), qrCode.code);
      return successResponse({ ...qrCode, payUrl }, "收款码创建成功");
    },
    [...QR_WRITE_ROLES],
    "qr",
  );
}

export async function GET(request: NextRequest) {
  return withRateLimitedAuth(
    request,
    async (req, ctx) => {
      const merchantId = ctx.user.merchantId!;
      const url = new URL(req.url);
      const storeId = url.searchParams.get("storeId");
      const type = url.searchParams.get("type");
      const scope = await resolveStoreAccess(ctx.user);

      if (storeId && !canAccessStore(scope, storeId)) {
        return errorResponse("无权查看该分店收款码", 403);
      }

      const where: Record<string, unknown> = { merchantId };
      if (storeId) where.storeId = storeId;
      else if (!scope.unrestricted) where.storeId = { in: scope.storeIds };
      if (type) where.type = type;

      const qrCodes = await prisma.qRCode.findMany({
        where,
        include: {
          merchant: { select: { companyName: true, merchantNo: true } },
          store: {
            select: { id: true, name: true, isActive: true, brand: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const qrIds = qrCodes.map((qr) => qr.id);
      const paidStats = qrIds.length
        ? await prisma.order.groupBy({
            by: ["qrcodeId"],
            where: {
              merchantId,
              qrcodeId: { in: qrIds },
              status: "PAID",
            },
            _count: true,
            _sum: { amount: true },
          })
        : [];
      const statsMap = new Map(
        paidStats.map((row) => [
          row.qrcodeId,
          { paidOrderCount: row._count, paidAmount: Number(row._sum.amount || 0) },
        ]),
      );

      const counterIds = [...new Set(qrCodes.map((qr) => qr.counterId).filter(Boolean))] as string[];
      const operatorIds = [...new Set(qrCodes.map((qr) => qr.operatorId).filter(Boolean))] as string[];
      const [counters, operators] = await Promise.all([
        counterIds.length
          ? prisma.counter.findMany({
              where: { id: { in: counterIds } },
              select: { id: true, name: true, code: true },
            })
          : [],
        operatorIds.length
          ? prisma.merchantMember.findMany({
              where: { id: { in: operatorIds }, merchantId },
              select: { id: true, name: true, email: true, role: true },
            })
          : [],
      ]);
      const counterMap = new Map(counters.map((item) => [item.id, item]));
      const operatorMap = new Map(operators.map((item) => [item.id, item]));
      const baseUrl = resolveBaseUrl(req.headers);

      return successResponse(
        qrCodes.map((qr) =>
          presentQrCode(qr, baseUrl, {
            counter: qr.counterId ? counterMap.get(qr.counterId) || null : null,
            operator: qr.operatorId ? operatorMap.get(qr.operatorId) || null : null,
            paidOrderCount: statsMap.get(qr.id)?.paidOrderCount || 0,
            paidAmount: statsMap.get(qr.id)?.paidAmount || 0,
          }),
        ),
      );
    },
    [...QR_READ_ROLES],
    "qr",
  );
}
