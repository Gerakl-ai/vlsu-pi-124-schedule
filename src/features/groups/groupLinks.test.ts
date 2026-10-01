import { describe, expect, it } from "vitest";
import { groupLinkUrl, parseGroupLink } from "./groupLinks";
import { LEGACY_PI124_GROUP } from "./groupTypes";

describe("group deep links", () => {
  it("parses a transparent group reference", () => {
    expect(parseGroupLink("?group=abc&institute=iite&tab=week")).toEqual({ nrec: "abc", instituteId: "iite" });
    expect(parseGroupLink("?tab=week")).toBeNull();
  });

  it("preserves the selected tab and removes one-shot compose state", () => {
    const url = new URL(groupLinkUrl(LEGACY_PI124_GROUP, "https://schedule.example/?tab=week&compose=1"));
    expect(url.searchParams.get("tab")).toBe("week");
    expect(url.searchParams.get("compose")).toBeNull();
    expect(url.searchParams.get("group")).toBe(LEGACY_PI124_GROUP.nrec);
    expect(url.searchParams.get("institute")).toBe(LEGACY_PI124_GROUP.instituteId);
  });
});
