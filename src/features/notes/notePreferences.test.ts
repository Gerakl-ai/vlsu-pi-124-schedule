import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAiConsent, readAiEnabled, writeAiConsent, writeAiEnabled } from "./notePreferences";

describe("note cloud preferences", () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key)
      }
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("keeps cloud AI and consent disabled by default", () => {
    expect(readAiEnabled()).toBe(false);
    expect(readAiConsent()).toBe(false);
  });

  it("persists and revokes separate cloud consent", () => {
    writeAiConsent(true);
    writeAiEnabled(true);
    expect(readAiConsent()).toBe(true);
    expect(readAiEnabled()).toBe(true);

    writeAiConsent(false);
    expect(readAiConsent()).toBe(false);
  });
});
