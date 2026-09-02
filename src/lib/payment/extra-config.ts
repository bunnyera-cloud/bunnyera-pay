import type { Prisma } from "@prisma/client";

export function mergePaymentExtraConfig(
  current: Prisma.JsonValue | null | undefined,
  next: Record<string, unknown>,
): Prisma.InputJsonObject {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Prisma.JsonObject) }
      : {};

  for (const [key, value] of Object.entries(next)) {
    if (Array.isArray(value)) {
      base[key] = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item, index, all) => item && all.indexOf(item) === index);
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      base[key] = value;
    }
  }

  return base as Prisma.InputJsonObject;
}
