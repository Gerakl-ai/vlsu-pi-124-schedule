import { describe, expect, it } from "vitest";
import { mergePersonalEvents, personalEventsOnDate, validPersonalEvent, type PersonalEvent } from "./personalEvents";

const event: PersonalEvent = { id: "1", title: "Репетиция", start: "2026-09-23T23:30:00", end: "2026-09-24T01:00:00", location: "Зал", description: "Дуэт" };
describe("personal calendar events", () => {
  it("keeps both conflicting versions and makes repeated imports idempotent", () => {
    const incoming = { ...event, title: "Другая репетиция" };
    const result = mergePersonalEvents([event], [incoming]);
    expect(result.added).toBe(1);
    expect(result.conflicts).toBe(1);
    expect(result.events[0]).toEqual(event);
    expect(result.events[1].title).toBe(incoming.title);
    expect(result.events[1].id).not.toBe(event.id);
    expect(mergePersonalEvents(result.events, [incoming]).added).toBe(0);
  });
  it("does not overwrite local events when importing an empty archive", () => {
    expect(mergePersonalEvents([event], []).events).toEqual([event]);
    expect(mergePersonalEvents([event], [event]).added).toBe(0);
  });
  it("rejects invalid incoming events before merging", () => {
    expect(() => mergePersonalEvents([event], [{ ...event, end: event.start }])).toThrow();
  });
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
