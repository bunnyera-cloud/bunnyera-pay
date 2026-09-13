/**
 * One-time Super Admin bootstrap for empty platform_users.
 * Works in development and production. Never prints passwords or the secret.
 *
 *   npm run admin:bootstrap
 *   npm run admin:bootstrap -- --status
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { configuredBootstrapSecret } from "../src/lib/platform/bootstrap";
import { runFirstSuperAdminBootstrap } from "../src/lib/platform/bootstrap-run";

function loadLocalEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const prisma = new PrismaClient();

async function main() {
  const statusOnly = process.argv.includes("--status");
  const email = (process.env.ADMIN_EMAIL || "").trim();
  const password = process.env.ADMIN_PASSWORD || "";
  const name = (process.env.ADMIN_NAME || "Super Admin").trim();
  const providedSecret = process.env.ADMIN_BOOTSTRAP_SECRET || "";
  const userCount = await prisma.platformUser.count();

  console.log("BunnyEra Pay Super Admin bootstrap");
  console.log(`platform_users count: ${userCount}`);
  console.log(`ADMIN_BOOTSTRAP_SECRET configured: ${configuredBootstrapSecret() ? "yes" : "no"}`);
  console.log(`ADMIN_EMAIL provided: ${email ? "yes" : "no"}`);
  console.log(`ADMIN_PASSWORD provided: ${password ? "yes" : "no"}`);
  if (statusOnly) {
    console.log(userCount === 0 ? "ready to create first Super Admin" : "bootstrap permanently locked");
    return;
  }

  const result = await runFirstSuperAdminBootstrap(prisma, {
    email,
    name,
    password,
    providedSecret,
  });

  if (!result.ok) {
    console.error(`bootstrap refused: HTTP ${result.status} ${result.error}`);
    process.exit(result.status === 410 ? 2 : 1);
  }

  await prisma.auditLog.create({
    data: {
      platformUserId: result.user.id,
      action: "PLATFORM_BOOTSTRAP",
      resource: "platform_user",
      resourceId: result.user.id,
      result: "SUCCESS",
      detail: "seed-admin.ts",
      afterData: { email: result.user.email, role: result.user.role },
    },
  });

  console.log("created Super Admin");
  console.log(`id: ${result.user.id}`);
  console.log(`email: ${result.user.email}`);
  console.log(`role: ${result.user.role}`);
  console.log("password was hashed and is not printed");
}

main()
  .catch((error) => {
    console.error("bootstrap failed");
    if (error instanceof Error) console.error(error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
