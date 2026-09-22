import { describe, expect, it } from "vitest";
import { personalEventsOnDate, validPersonalEvent, type PersonalEvent } from "./personalEvents";

const event: PersonalEvent = { id: "1", title: "Репетиция", start: "2026-09-23T23:30:00", end: "2026-09-24T01:00:00", location: "Зал", description: "Дуэт" };
describe("personal calendar events", () => {
  it("requires a title and a positive time interval", () => {
    expect(validPersonalEvent(event)).toBe(true);
    expect(validPersonalEvent({ ...event, title: " " })).toBe(false);
    expect(validPersonalEvent({ ...event, end: event.start })).toBe(false);
    expect(validPersonalEvent({ ...event, start: "invalid" })).toBe(false);
  });
  it("includes an overnight event on both days, but not after its end", () => {
    expect(personalEventsOnDate([event], new Date(2026, 8, 23))).toEqual([event]);
    expect(personalEventsOnDate([event], new Date(2026, 8, 24))).toEqual([event]);
    expect(personalEventsOnDate([event], new Date(2026, 8, 25))).toEqual([]);
    expect(personalEventsOnDate([{ ...event, end: "2026-09-24T00:00:00" }], new Date(2026, 8, 24))).toEqual([]);
  });
});
