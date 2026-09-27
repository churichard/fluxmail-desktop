import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCacheCipher } from "../src/main/cache-cipher";

describe("cache cipher", () => {
  it("encrypts bodies with a cache-specific key and rejects changed ciphertext", () => {
    const key = randomBytes(32);
    const cipher = createCacheCipher(key);
    const encrypted = cipher.encrypt("Private message body");

    expect(encrypted.toString()).not.toContain("Private message body");
    expect(cipher.decrypt(encrypted)).toBe("Private message body");
    expect(createCacheCipher(key).decrypt(encrypted)).toBe("Private message body");
    expect(cipher.encrypt("Private message body")).not.toEqual(encrypted);
    expect(() => createCacheCipher(randomBytes(32)).decrypt(encrypted)).toThrow();

    encrypted[encrypted.length - 1] ^= 1;
    expect(() => cipher.decrypt(encrypted)).toThrow();
  });
});
