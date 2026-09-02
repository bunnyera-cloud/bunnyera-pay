import QRCode from "qrcode";
import { PNG } from "pngjs";
import { assertPayUrlHasNoSecrets } from "./url";

export const PLAIN_QR_PNG_SIZE = 1024;
export const PLAIN_QR_ERROR_CORRECTION = "H" as const;

const PLAIN_QR_OPTIONS = {
  errorCorrectionLevel: PLAIN_QR_ERROR_CORRECTION,
  margin: 4,
  color: { dark: "#000000", light: "#FFFFFF" },
};

export function qrDownloadFilename(code: string, ext: "png" | "svg"): string {
  return `bunnyera-pay-${code}.${ext}`;
}

export async function renderPlainQrPng(payUrl: string): Promise<Buffer> {
  assertPayUrlHasNoSecrets(payUrl);
  const buffer = await QRCode.toBuffer(payUrl, {
    ...PLAIN_QR_OPTIONS,
    type: "png",
    width: PLAIN_QR_PNG_SIZE,
  });
  const png = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return padPngToExactSize(png, PLAIN_QR_PNG_SIZE);
}

function padPngToExactSize(png: Buffer, size: number): Buffer {
  const source = PNG.sync.read(png);
  if (source.width === size && source.height === size) return png;
  const canvas = new PNG({ width: size, height: size });
  canvas.data.fill(255);
  for (let i = 3; i < canvas.data.length; i += 4) {
    canvas.data[i] = 255;
  }
  const offsetX = Math.max(0, Math.floor((size - source.width) / 2));
  const offsetY = Math.max(0, Math.floor((size - source.height) / 2));
  const copyWidth = Math.min(source.width, size);
  const copyHeight = Math.min(source.height, size);
  PNG.bitblt(source, canvas, 0, 0, copyWidth, copyHeight, offsetX, offsetY);
  return PNG.sync.write(canvas);
}

export async function renderPlainQrSvg(payUrl: string): Promise<string> {
  assertPayUrlHasNoSecrets(payUrl);
  return QRCode.toString(payUrl, {
    ...PLAIN_QR_OPTIONS,
    type: "svg",
  });
}

export function assertPlainQrSvg(svg: string): void {
  if (!svg.includes("<svg")) {
    throw new Error("SVG QR is missing root element");
  }
  if (/<image\b/i.test(svg) || /logo/i.test(svg)) {
    throw new Error("Plain QR SVG must not embed a logo");
  }
}
