import { afterEach, describe, expect, it, vi } from "vitest";
import { readReminderSettings, writeReminderSettings } from "./storage";

function storageMock() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear())
  };
}

describe("reminder storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("copies legacy settings to the generic key without deleting the old value", () => {
    vi.stubGlobal("localStorage", storageMock());
    vi.stubGlobal("Notification", { permission: "granted" });
    localStorage.setItem("pi124.reminder.settings", JSON.stringify({ enabled: true, minutesBefore: 15 }));

    expect(readReminderSettings()).toMatchObject({ enabled: true, minutesBefore: 15, permission: "granted" });
    expect(localStorage.getItem("lad.reminder.settings.v2")).toBeTruthy();
    expect(localStorage.getItem("pi124.reminder.settings")).toBeTruthy();
  });

  it("writes new settings only to the versioned generic key", () => {
    vi.stubGlobal("localStorage", storageMock());
    writeReminderSettings({ enabled: false, minutesBefore: 10, permission: "default" });

    expect(localStorage.getItem("lad.reminder.settings.v2")).toBeTruthy();
    expect(localStorage.getItem("pi124.reminder.settings")).toBeNull();
  });
});
