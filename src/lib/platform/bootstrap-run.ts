import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import {
  configuredBootstrapSecret,
  decideBootstrap,
  isValidBootstrapEmail,
  isValidBootstrapPassword,
} from "./bootstrap";
import { toSafePlatformUser, type SafePlatformUser } from "./users";

export type BootstrapRunInput = {
  email: string;
  name: string;
  password: string;
  providedSecret: string | null | undefined;
};

export type BootstrapRunResult =
  | { ok: true; user: SafePlatformUser }
  | { ok: false; status: 400 | 403 | 410 | 500; error: string };

export async function runFirstSuperAdminBootstrap(
  prisma: PrismaClient,
  input: BootstrapRunInput,
): Promise<BootstrapRunResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!isValidBootstrapEmail(email) || !name || name.length > 100 || !isValidBootstrapPassword(input.password)) {
    return { ok: false, status: 400, error: "管理员资料无效" };
  }

  const userCount = await prisma.platformUser.count();
  const decision = decideBootstrap({
    userCount,
    configuredSecret: configuredBootstrapSecret(),
    providedSecret: input.providedSecret,
  });
  if (!decision.ok) {
    return { ok: false, status: decision.status, error: decision.error };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.platformUser.count();
      if (existing > 0) {
        throw new Error("ALREADY_BOOTSTRAPPED");
      }
      return tx.platformUser.create({
        data: {
          email,
          name,
          passwordHash: await bcrypt.hash(input.password, 12),
          role: "PLATFORM_SUPER_ADMIN",
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
    return { ok: true, user: toSafePlatformUser(created) };
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_BOOTSTRAPPED") {
      return { ok: false, status: 410, error: "Gone" };
    }
    return { ok: false, status: 500, error: "初始化失败" };
  }
}
