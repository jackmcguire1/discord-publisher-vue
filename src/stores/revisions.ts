import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { activeOrgId, isGuest } from "./session";
import { load, save } from "./persist";
import { toast } from "./toasts";
import type { Message } from "../discord/schema";

// Numbered snapshots of a message: one each time it is saved, published or
// updated on Discord. Stored under the message (orgs/{org}/drafts/{id}/revisions)
// for signed-in users, or in localStorage (`revisions`, keyed by message id) for
// guests. Revisions are immutable and loaded on demand, not kept live.
// drafts.ts decides when to record one and owns the numbering; this module
// must not import it.

export type RevisionKind = "saved" | "published" | "updated";

export interface Revision {
  id: string;
  number: number;
  kind: RevisionKind;
  message: Message;
  createdAt: string;
  createdBy?: string;
  note?: string;
  /** Set when a saved version was overwritten by "Update draft". */
  updatedAt?: string;
  updatedBy?: string;
}

const GUEST_KEY = "revisions";
type GuestRevisions = Record<string, Revision[]>;

function newLocalId(): string {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function col(draftId: string) {
  if (!activeOrgId.value) throw new Error("No organization selected");
  return collection(db, "orgs", activeOrgId.value, "drafts", draftId, "revisions");
}

function stripUndefined(rev: Record<string, unknown>) {
  const data = { ...rev };
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  return data;
}

/** Save a revision and return its id. Fire-and-forget; failures are reported as a toast. */
export function addRevision(draftId: string, rev: Omit<Revision, "id">): string {
  if (isGuest.value) {
    const id = newLocalId();
    const all = load<GuestRevisions>(GUEST_KEY, {});
    all[draftId] = [...(all[draftId] ?? []), { ...rev, id }];
    save(GUEST_KEY, all);
    return id;
  }
  const ref = doc(col(draftId));
  setDoc(ref, stripUndefined(rev)).catch((e: Error) => toast("error", "Could not save revision", e.message));
  return ref.id;
}

/** Overwrite the content of the current saved version ("Update draft"). Fire-and-forget. */
export function overwriteRevision(draftId: string, revisionId: string, change: { message: Message; updatedAt: string; updatedBy?: string }) {
  if (isGuest.value) {
    const all = load<GuestRevisions>(GUEST_KEY, {});
    all[draftId] = (all[draftId] ?? []).map((r) => (r.id === revisionId ? { ...r, ...change } : r));
    save(GUEST_KEY, all);
    return;
  }
  updateDoc(doc(col(draftId), revisionId), stripUndefined(change)).catch((e: Error) =>
    toast("error", "Could not save version", e.message)
  );
}

/** All revisions of a message, newest first. */
export async function listRevisions(draftId: string): Promise<Revision[]> {
  let list: Revision[];
  if (isGuest.value) {
    list = load<GuestRevisions>(GUEST_KEY, {})[draftId] ?? [];
  } else {
    const snap = await getDocs(col(draftId));
    list = snap.docs.map((d) => ({ ...(d.data() as Omit<Revision, "id">), id: d.id }));
  }
  return [...list].sort((a, b) => b.number - a.number || b.createdAt.localeCompare(a.createdAt));
}

/** Delete one saved revision. Published/updated ones are kept as the record of what went to Discord. */
export async function deleteRevision(draftId: string, rev: Revision) {
  if (rev.kind !== "saved") throw new Error("Published versions can't be deleted");
  if (rev.number === 1) throw new Error("The first version is kept as the message's starting point");
  if (isGuest.value) {
    const all = load<GuestRevisions>(GUEST_KEY, {});
    all[draftId] = (all[draftId] ?? []).filter((r) => r.id !== rev.id);
    save(GUEST_KEY, all);
    return;
  }
  await deleteDoc(doc(col(draftId), rev.id));
}

/** Remove every revision of a message (Firestore doesn't cascade when the message is deleted). */
export async function deleteRevisions(draftId: string) {
  if (isGuest.value) {
    const all = load<GuestRevisions>(GUEST_KEY, {});
    delete all[draftId];
    save(GUEST_KEY, all);
    return;
  }
  const snap = await getDocs(col(draftId));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/** Guest revisions waiting to be imported, by message id. */
export function guestRevisions(): GuestRevisions {
  return load<GuestRevisions>(GUEST_KEY, {});
}

export function clearGuestRevisions(draftIds: string[]) {
  const all = load<GuestRevisions>(GUEST_KEY, {});
  for (const id of draftIds) delete all[id];
  if (Object.keys(all).length) save(GUEST_KEY, all);
  else localStorage.removeItem(`discord-publisher:${GUEST_KEY}`);
}
