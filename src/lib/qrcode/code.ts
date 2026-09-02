import { randomInt } from "node:crypto";

/** Unambiguous alphabet: no I/O/0/1 to avoid scan/transcription mix-ups. */
export const QR_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const QR_CODE_PREFIX = "QR";
/** 22 chars × log2(32) ≈ 110 bits of CSPRNG entropy. */
export const QR_CODE_RANDOM_LENGTH = 22;
export const QR_CODE_PATTERN = /^QR[A-HJ-NP-Z2-9]{22}$/;

export function generateQrCodeValue(): string {
  let rand = "";
  for (let i = 0; i < QR_CODE_RANDOM_LENGTH; i += 1) {
    rand += QR_CODE_ALPHABET[randomInt(0, QR_CODE_ALPHABET.length)];
  }
  return `${QR_CODE_PREFIX}${rand}`;
}

export function isHighEntropyQrCode(code: string): boolean {
  return QR_CODE_PATTERN.test(code);
}

export function qrCodeEntropyBits(): number {
  return QR_CODE_RANDOM_LENGTH * Math.log2(QR_CODE_ALPHABET.length);
}
