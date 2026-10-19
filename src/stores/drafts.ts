import { computed } from "vue";
import { where } from "firebase/firestore";
import { orgCollection } from "./orgCollection";
import { myEmail, serverAccess } from "./session";
import { addRevision, overwriteRevision, deleteRevisions, type RevisionKind } from "./revisions";
import type { Message } from "../discord/schema";
import { parseIncomingMessage } from "../discord/schema";
import type { PublishedRef } from "../discord/webhook";

// Messages, shared with the active org (orgs/{orgId}/drafts; localStorage for
// guests). One record follows a message through its life:
//   draft      neither `published` nor `deleted`
//   published  `published` holds the Discord reference and who published/updated it
//   deleted    removed from Discord; `deleted` keeps that reference as history
// The webhook token is never stored here, only the Discord webhook id (and the
// saved webhook's id), so we can tell which webhook owns the message.

export interface PublishInfo extends PublishedRef {
  publishedAt: string;
  publishedBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  /** Saved webhook it went through, if any. */
  savedWebhookId?: string | null;
}

export interface Draft {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  message: Message;
  /** Server this draft is filed under, or null if unassigned. */
  serverId: string | null;
  published?: PublishInfo;
  deleted?: PublishInfo & { deletedAt: string; deletedBy?: string };
  /** Number of the latest revision (see revisions.ts); 0 before the first, absent on messages from before versioning. */
  revision?: number;
  /** The name came from the content (title / first line) and follows it; false once someone names it. */
  autoName?: boolean;
  /** Shared by the copies of a message published to several webhooks at once (one copy per webhook). */
  groupId?: string;
  /** Id and kind of the latest revision, so "Update draft" can save over it. */
  revisionId?: string;
  revisionKind?: RevisionKind;
}

export type MessageStatus = "draft" | "published" | "deleted";

export function statusOf(d: Draft): MessageStatus {
  return d.published ? "published" : d.deleted ? "deleted" : "draft";
}

export interface DraftsFile {
  format: "discord-publisher-drafts";
  version: 1;
  exportedAt: string;
  drafts: Draft[];
  /** Servers referenced by the drafts, so names survive the move to another browser. */
  servers?: { id: string; name: string; guildId: string }[];
}

// Members limited to some servers see messages filed under those servers plus
// unassigned ones. The rules can't verify one `in [...servers, null]` query,
// so that's two listeners merged.
const store = orgCollection<Draft>("drafts", {
  constraints: () => {
    const access = serverAccess.value;
    if (access === null) return [];
    const unassigned = [where("serverId", "==", null)];
    return access.length ? [[where("serverId", "in", access)], unassigned] : [unassigned];
  },
  constraintsKey: () => JSON.stringify(serverAccess.value),
});
const state = store.items;

export const drafts = computed(() =>
  [...state.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
);

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function getDraft(id: string | null): Draft | undefined {
  return id ? state.value.find((d) => d.id === id) : undefined;
}

/**
 * Record a revision of a message and return the draft fields to update with
 * it (the new revision number). Numbering continues from the draft.
 */
function revise(id: string, kind: RevisionKind, message: Message, note?: string): { revision: number } {
  const number = (getDraft(id)?.revision ?? 0) + 1;
  return record(id, number, kind, message, note);
}

function record(id: string, number: number, kind: RevisionKind, message: Message, note?: string) {
  const revisionId = addRevision(id, { number, kind, message: clone(message), createdAt: new Date().toISOString(), createdBy: myEmail() || undefined, note });
  return { revision: number, revisionId, revisionKind: kind };
}

/**
 * Whether saving can overwrite the latest version rather than add one: only a
 * saved version past v1 (v1 is the starting point; published/updated versions
 * are the record of what went to Discord).
 */
export function canOverwriteVersion(d: Draft | undefined): boolean {
  return !!d && !!d.revisionId && d.revisionKind === "saved" && (d.revision ?? 0) > 1;
}

/** The name a message gets from its content: the first embed's title, else the first line of text. */
export function nameFromMessage(m: Message): string {
  return (m.embeds?.[0]?.title || m.content?.split("\n")[0] || "").trim().slice(0, 100) || "Untitled";
}

/**
 * Whether a message's name follows its content. Older messages have no flag,
 * so a name that still matches the content (optionally " (copy)") counts.
 */
export function followsContent(d: Draft): boolean {
  if (d.autoName !== undefined) return d.autoName;
  const derived = nameFromMessage(d.message);
  return d.name === derived || d.name === `${derived} (copy)`;
}

/** Name fields to write alongside new content: the new content's name, if the name follows content. */
function renamedFor(d: Draft | undefined, message: Message): Partial<Draft> {
  if (!d || !followsContent(d)) return {};
  return { name: nameFromMessage(message), autoName: true };
}

/** After a version is deleted from History: if it was the current one, the next save starts a new version. */
export function forgetRevision(id: string, revisionId: string) {
  if (getDraft(id)?.revisionId === revisionId) store.update(id, { revisionId: undefined, revisionKind: undefined });
}

export function createDraft(
  name: string,
  message: Message,
  serverId: string | null = null,
  /** Record revision 1 (pass false when a publish revision follows immediately). `autoName`: the name came from the content. */
  opts: { revision?: boolean; note?: string; autoName?: boolean } = {}
): Draft {
  const now = new Date().toISOString();
  const by = myEmail();
  const draft: Draft = {
    id: store.newId(),
    name: name.trim() || "Untitled",
    createdAt: now,
    updatedAt: now,
    message: clone(message),
    serverId,
    autoName: opts.autoName ?? false,
    ...(by && { createdBy: by, updatedBy: by }),
    // 0 = has history, nothing recorded yet (vs. undefined: from before versioning, see ensureBaseline).
    revision: 0,
  };
  store.set(draft);
  if (opts.revision !== false) store.update(draft.id, revise(draft.id, "saved", message, opts.note));
  return draft;
}

/** Save new content to a draft, as a new revision unless `revision: false`. */
/**
 * Messages from before versioning (or imported ones) have no revisions, so
 * their current content isn't in the history. Before the first change, keep
 * that content as v1 so the starting point is never lost.
 */
function ensureBaseline(id: string) {
  const d = getDraft(id);
  if (!d || d.revision !== undefined) return;
  const base = d.published ? "published" : "saved";
  store.update(id, record(id, 1, base, d.message, "Version from before history was kept"));
}

/**
 * Save new content to a draft. By default it saves over the current version
 * when that's allowed (see canOverwriteVersion), otherwise it adds one;
 * `newVersion` always adds one, and `revision: false` records none (a publish
 * revision follows).
 */
export function updateDraftMessage(
  id: string,
  message: Message,
  opts: { revision?: boolean; newVersion?: boolean } = {}
): Draft | undefined {
  const d = getDraft(id);
  if (!d) return;
  ensureBaseline(id);
  const now = new Date().toISOString();
  const by = myEmail() || undefined;
  let version = {};
  if (opts.revision !== false) {
    const current = getDraft(id);
    if (!opts.newVersion && canOverwriteVersion(current)) overwriteRevision(id, current!.revisionId!, { message: clone(message), updatedAt: now, updatedBy: by });
    else version = revise(id, "saved", message);
  }
  store.update(id, { message: clone(message), updatedAt: now, updatedBy: by, ...version, ...renamedFor(getDraft(id), message) });
  return d;
}

export function renameDraft(id: string, name: string) {
  const d = getDraft(id);
  if (!d) return;
  // Named by hand: stop following the content.
  store.update(id, { name: name.trim() || d.name, autoName: false, updatedAt: new Date().toISOString() });
}

export function setDraftServer(id: string, serverId: string | null) {
  const d = getDraft(id);
  if (!d) return;
  store.update(id, { serverId, updatedAt: new Date().toISOString() });
}

/** Unassign every draft that was filed under a deleted server. */
export function clearDraftServer(serverId: string) {
  for (const d of state.value) if (d.serverId === serverId) store.update(d.id, { serverId: null });
}

/** Record a fresh publish. Use a draft that hasn't been published before. */
export function markPublished(id: string, ref: PublishedRef, message: Message, savedWebhookId: string | null) {
  ensureBaseline(id);
  const now = new Date().toISOString();
  const by = myEmail() || undefined;
  store.update(id, {
    message: clone(message),
    published: { ...clone(ref), publishedAt: now, publishedBy: by, savedWebhookId },
    deleted: undefined,
    updatedAt: now,
    updatedBy: by,
    ...revise(id, "published", message),
    ...renamedFor(getDraft(id), message),
  });
}

/** Record an edit of the published message on Discord. */
export function markUpdated(id: string, ref: PublishedRef, message: Message) {
  const d = getDraft(id);
  if (!d?.published) return;
  ensureBaseline(id);
  const now = new Date().toISOString();
  const by = myEmail() || undefined;
  store.update(id, {
    message: clone(message),
    published: { ...d.published, ...clone(ref), updatedAt: now, updatedBy: by },
    updatedAt: now,
    updatedBy: by,
    ...revise(id, "updated", message),
    ...renamedFor(d, message),
  });
}

/** Record that the message was deleted from Discord, keeping where it had been. */
export function markDeleted(id: string) {
  const d = getDraft(id);
  if (!d?.published) return;
  const now = new Date().toISOString();
  const by = myEmail() || undefined;
  store.update(id, {
    published: undefined,
    deleted: { ...d.published, deletedAt: now, deletedBy: by },
    updatedAt: now,
    updatedBy: by,
  });
}

export function duplicateDraft(id: string, name?: string): Draft | undefined {
  const d = getDraft(id);
  if (!d) return;
  const suggested = `${d.name} (copy)`;
  const chosen = name?.trim() || suggested;
  // Keeping the suggested "(copy)" name follows the content like the original; a typed name stays.
  return createDraft(chosen, d.message, d.serverId, {
    note: `Duplicated from "${d.name}"`,
    autoName: chosen === suggested ? followsContent(d) : false,
  });
}

/** Link a message into a group of copies. */
export function setGroup(id: string, groupId: string) {
  store.update(id, { groupId });
}

/** A fresh id for a group of copies. */
export function newGroupId(): string {
  return store.newId();
}

/** The copies of a grouped message that this user can see, oldest first. */
export function groupCopies(groupId: string | undefined): Draft[] {
  if (!groupId) return [];
  return state.value.filter((d) => d.groupId === groupId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function deleteDraft(id: string) {
  // Revisions first: once the message is gone the rules can no longer tell whether they may be removed.
  deleteRevisions(id)
    .catch(() => {})
    .finally(() => store.remove(id));
}

export function exportDrafts(
  ids?: string[],
  resolveServer: (id: string) => { id: string; name: string; guildId: string } | undefined = () => undefined
): DraftsFile {
  const chosen = ids ? state.value.filter((d) => ids.includes(d.id)) : state.value;
  const serverIds = [...new Set(chosen.map((d) => d.serverId).filter((x): x is string => !!x))];
  const servers = serverIds.map(resolveServer).filter((s): s is NonNullable<typeof s> => !!s);
  return {
    format: "discord-publisher-drafts",
    version: 1,
    exportedAt: new Date().toISOString(),
    drafts: clone(chosen),
    servers: servers.length ? servers : undefined,
  };
}

/**
 * Accepts a drafts export file, a bare array of drafts, or a single raw
 * webhook payload. Returns how many drafts were added.
 */
export function importDrafts(
  raw: unknown,
  fallbackName = "Imported",
  /** Maps a server from the file to a local server id (matching by name, creating if needed). */
  mapServer: (server: { name: string; guildId?: string }) => string | null = () => null
): number {
  let incoming: unknown[] = [];
  const r = raw as any;
  const fileServers: Record<string, { name: string; guildId?: string }> = {};
  if (r && Array.isArray(r.servers)) {
    for (const s of r.servers) if (s && typeof s.id === "string" && typeof s.name === "string") fileServers[s.id] = s;
  }
  if (r && Array.isArray(r.drafts)) incoming = r.drafts;
  else if (Array.isArray(r)) incoming = r;
  else if (r && typeof r === "object") incoming = [r];

  let added = 0;
  for (const item of incoming as any[]) {
    const looksLikeDraft = item && typeof item === "object" && "message" in item;
    const message = parseIncomingMessage(looksLikeDraft ? item.message : item);
    const name = looksLikeDraft && typeof item.name === "string" ? item.name : fallbackName;
    const now = new Date().toISOString();
    const draft: Draft = {
      id: store.newId(),
      name,
      createdAt: looksLikeDraft && typeof item.createdAt === "string" ? item.createdAt : now,
      updatedAt: now,
      message,
      serverId:
        looksLikeDraft && typeof item.serverId === "string" && fileServers[item.serverId]
          ? mapServer(fileServers[item.serverId])
          : null,
      published:
        looksLikeDraft && item.published && typeof item.published.messageId === "string"
          ? item.published
          : undefined,
      deleted:
        looksLikeDraft && item.deleted && typeof item.deleted.messageId === "string" && typeof item.deleted.deletedAt === "string"
          ? item.deleted
          : undefined,
    };
    store.set(draft);
    added++;
  }
  return added;
}
