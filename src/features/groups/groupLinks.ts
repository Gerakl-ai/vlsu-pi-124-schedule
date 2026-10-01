import { loadGroups, loadInstitutes } from "../../lib/scheduleApi";
import {
  readGroupCatalog,
  readInstituteCatalog,
  readKnownGroup,
  writeGroupCatalog,
  writeInstituteCatalog
} from "./groupStorage";
import { toGroupProfile, type GroupProfile } from "./groupTypes";

export interface GroupLinkReference {
  nrec: string;
  instituteId?: string;
}

export function parseGroupLink(search: string): GroupLinkReference | null {
  const params = new URLSearchParams(search);
  const nrec = params.get("group")?.trim();
  const instituteId = params.get("institute")?.trim();
  if (!nrec) return null;
  return { nrec, ...(instituteId ? { instituteId } : {}) };
}

export function groupLinkUrl(group: GroupProfile, href: string) {
  const url = new URL(href);
  url.searchParams.set("group", group.nrec);
  url.searchParams.set("institute", group.instituteId);
  url.searchParams.delete("compose");
  return url.toString();
}

export function syncGroupLink(group: GroupProfile) {
  const url = groupLinkUrl(group, window.location.href);
  window.history.replaceState(window.history.state, "", url);
}

export async function resolveGroupLink(reference: GroupLinkReference): Promise<GroupProfile | null> {
  const known = readKnownGroup(reference.nrec, reference.instituteId);
  if (known) return known;
  if (!reference.instituteId) return null;

  let institutes = readInstituteCatalog()?.items ?? [];
  if (!institutes.some((item) => item.id === reference.instituteId)) {
    institutes = await loadInstitutes();
    if (institutes.length) writeInstituteCatalog(institutes);
  }
  const institute = institutes.find((item) => item.id === reference.instituteId);
  if (!institute) return null;

  let groups = readGroupCatalog(institute.id)?.items ?? [];
  if (!groups.some((item) => item.nrec === reference.nrec)) {
    groups = await loadGroups(institute.id);
    if (groups.length) writeGroupCatalog(institute.id, groups);
  }
  const group = groups.find((item) => item.nrec === reference.nrec);
  return group ? toGroupProfile(institute, group) : null;
}
