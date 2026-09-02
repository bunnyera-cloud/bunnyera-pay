const SENSITIVE_PATTERN =
  /merchantKey|PAYMENTFM_MERCHANT_KEY|privateKey|apiKey|apiV3Key|passwordHash|JWT_SECRET|DATABASE_URL|BEGIN (RSA )?PRIVATE KEY|postgresql:\/\/|redis:\/\//i;

const INTERNAL_PATTERN =
  /\b(at\s+\S+\s+\()|(?:node_modules|prisma|ECONNREFUSED|EPERM|SQLSTATE|syntax error at or near|ENOENT)/i;

export function looksSensitiveError(message: string): boolean {
  return SENSITIVE_PATTERN.test(message);
}

export function looksInternalError(message: string): boolean {
  return INTERNAL_PATTERN.test(message) || (
    (message.includes("\\") || message.includes("/")) && /\.[jt]sx?:\d+/.test(message)
  );
}

export function sanitizePublicErrorMessage(message: string, status = 400): string {
  if (!message || looksSensitiveError(message) || looksInternalError(message)) {
    return status >= 500 ? "服务器内部错误" : "请求无法处理";
  }
  if (process.env.NODE_ENV === "production" && status >= 500) {
    return "服务器内部错误";
  }
  return message;
}
