import { hkdfSync } from "node:crypto";
import { decryptString, encryptString } from "fluxmail";

export function createCacheCipher(encryptionKey: Buffer) {
  const cacheKey = Buffer.from(
    hkdfSync("sha256", encryptionKey, Buffer.alloc(0), "Fluxmail Desktop mail cache", 32),
  );

  return {
    encrypt(value: string): Buffer {
      return Buffer.from(encryptString(cacheKey, value), "base64");
    },
    decrypt(value: Buffer): string {
      return decryptString(cacheKey, value.toString("base64"));
    },
  };
}
