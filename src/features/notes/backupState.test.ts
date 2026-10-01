import { afterEach, describe, expect, it, vi } from "vitest";
import { backupSignature, markBackupMade, readBackupMade } from "./backupState";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("backup confirmation", () => {
  it("only accepts the exact data version confirmed by the user", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    });

    const original = backupSignature({ notes: [{ id: "1", text: "ДЗ" }], events: [] });
    const edited = backupSignature({ notes: [{ id: "1", text: "ДЗ и проект" }], events: [] });
    expect(readBackupMade(original)).toBe(false);
    markBackupMade(original);
    expect(readBackupMade(original)).toBe(true);
    expect(readBackupMade(edited)).toBe(false);
  });
});
