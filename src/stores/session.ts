import { ref, computed, watch, nextTick } from "vue";
import {
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { clearIndexedDbPersistence, collection, collectionGroup, doc, onSnapshot, query, terminate, where, writeBatch } from "firebase/firestore";
import { auth, db } from "../firebase";
import { load, save } from "./persist";

// Who is signed in and which organization they are working in. Every shared
// store (webhooks, servers, authors, drafts) follows `activeOrgId`.
// This module must not import those stores; they import it.

export type Role = "owner" | "admin" | "member";

export interface Membership {
  orgId: string;
  role: Role;
  /** Publish and update messages on Discord. Admins and owners always can. */
  canPublish: boolean;
  /** Delete messages from Discord and remove published ones. Admins and owners always can. */
  canDelete: boolean;
  /** Server ids this member may use, or null for all servers (always null for admins and owners). */
  servers: string[] | null;
}

/** Permission flags as stored on member and invite docs (missing means the default). */
export interface Permissions {
  canPublish: boolean;
  canDelete: boolean;
}

export interface Invite {
  orgId: string;
  email: string;
  role: Exclude<Role, "owner">;
  orgName: string;
  canPublish?: boolean;
  canDelete?: boolean;
  servers?: string[] | null;
}

/** Server ids a member may use, or null for all. Owners and admins always have all. */
export function serversFor(role: Role, data: { servers?: string[] | null }): string[] | null {
  return role === "owner" || role === "admin" ? null : Array.isArray(data.servers) ? data.servers : null;
}

/** Effective permissions for a role plus stored flags. */
export function permissionsFor(role: Role, data: { canPublish?: boolean; canDelete?: boolean }): Permissions {
  const admin = role === "owner" || role === "admin";
  return { canPublish: admin || data.canPublish !== false, canDelete: admin || data.canDelete === true };
}

export const user = ref<User | null>(null);
/** False until Firebase has restored (or ruled out) a previous sign-in. */
export const authReady = ref(false);

export const memberships = ref<Membership[]>([]);
/** False until the signed-in user's memberships have loaded at least once. */
export const membershipsReady = ref(false);
export const orgNames = ref<Record<string, string>>({});
export const myInvites = ref<Invite[]>([]);
/** False until the signed-in user's invitations have loaded at least once. */
export const invitesReady = ref(false);

const storedOrg = ref<string | null>(load<string | null>("org", null));
watch(storedOrg, (v) => save("org", v));

/** Orgs being left or deleted right now; treated as gone so their listeners detach first. */
const departing = ref<string[]>([]);

/** The org currently in use: the remembered one if still a member, else the first. */
export const activeOrgId = computed<string | null>(() => {
  const ids = memberships.value.map((m) => m.orgId).filter((id) => !departing.value.includes(id));
  if (storedOrg.value && ids.includes(storedOrg.value)) return storedOrg.value;
  return ids.sort((a, b) => (orgNames.value[a] ?? "").localeCompare(orgNames.value[b] ?? ""))[0] ?? null;
});
export const activeOrgName = computed(() => (activeOrgId.value ? orgNames.value[activeOrgId.value] ?? "" : ""));
export const activeRole = computed<Role | null>(
  () => memberships.value.find((m) => m.orgId === activeOrgId.value)?.role ?? null
);
/** Signed out: everything works from this browser's localStorage, with no org. */
export const isGuest = computed(() => authReady.value && !user.value);
/** Owners and admins manage webhooks, servers and membership; guests manage their own local data. */
export const canManage = computed(
  () => isGuest.value || activeRole.value === "owner" || activeRole.value === "admin"
);
const activeMembership = computed(() => memberships.value.find((m) => m.orgId === activeOrgId.value));
/** Servers the user may use in the active org, or null for all (guests: all). */
export const serverAccess = computed<string[] | null>(() => (isGuest.value ? null : activeMembership.value?.servers ?? null));
/** May publish and update messages on Discord (guests always can). */
export const canPublish = computed(() => isGuest.value || !!activeMembership.value?.canPublish);
/** May delete messages from Discord and remove published ones (guests always can). */
export const canDelete = computed(() => isGuest.value || !!activeMembership.value?.canDelete);

/** Whether a guest has asked to see the sign-in screen. */
export const signInOpen = ref(false);

export function switchOrg(orgId: string) {
  storedOrg.value = orgId;
}

/**
 * Run `removeMembership` for an org we are leaving or deleting, after moving
 * off it, so listeners on it stop before access is lost (otherwise each one
 * reports a permission error).
 */
export async function departOrg(orgId: string, removeMembership: () => Promise<unknown>) {
  departing.value = [...departing.value, orgId];
  await nextTick();
  try {
    await removeMembership();
  } catch (e) {
    departing.value = departing.value.filter((id) => id !== orgId);
    throw e;
  }
}

export function myEmail(): string {
  return (user.value?.email ?? "").toLowerCase();
}

// --- auth ----------------------------------------------------------------------

const EMAIL_KEY = "signInEmail";

/** Link that opens sign-in with the invited address filled in. Nothing is emailed. */
export function inviteLink(email: string): string {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  url.searchParams.set("invite", email);
  return url.toString();
}

/** Email from an invite link (`?invite=`), removed from the address bar once read. */
export function takeInviteEmail(): string | null {
  const url = new URL(window.location.href);
  const email = url.searchParams.get("invite");
  if (!email) return null;
  url.searchParams.delete("invite");
  window.history.replaceState(null, "", url.toString());
  return email.trim().toLowerCase();
}

export async function sendSignInLink(email: string) {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
  await sendSignInLinkToEmail(auth, email.trim(), { url, handleCodeInApp: true });
  save(EMAIL_KEY, email.trim());
}

/** If the page was opened from a sign-in email, finish signing in. Returns an error message on failure. */
export async function completeSignInFromLink(): Promise<string | null> {
  const href = window.location.href;
  if (!isSignInWithEmailLink(auth, href)) return null;
  let email = load<string | null>(EMAIL_KEY, null);
  // Opened on a different device than the one that asked for the link.
  if (!email) email = window.prompt("Confirm the email address you signed in with");
  if (!email) return "Sign-in cancelled";
  try {
    await signInWithEmailLink(auth, email, href);
    localStorage.removeItem(`discord-publisher:${EMAIL_KEY}`);
    return null;
  } catch (e) {
    return (e as Error).message;
  } finally {
    const clean = new URL(href);
    clean.search = "";
    window.history.replaceState(null, "", clean.toString());
  }
}

/**
 * Sign out and wipe this device's Firestore cache (messages, webhook URLs…),
 * so nothing from the org stays behind, e.g. on a shared computer. Clearing
 * needs Firestore shut down, so the page reloads into guest mode afterwards.
 */
export async function signOut() {
  await fbSignOut(auth);
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (e) {
    // Another tab may still hold the cache open; it's cleared next time.
    console.warn("Could not clear the offline cache", e);
  }
  window.location.assign(new URL(import.meta.env.BASE_URL, window.location.origin).toString());
}

// --- live listeners --------------------------------------------------------------

let stopUser: (() => void)[] = [];
let stopOrgDocs: Record<string, () => void> = {};

function stopAll() {
  stopUser.forEach((f) => f());
  stopUser = [];
  Object.values(stopOrgDocs).forEach((f) => f());
  stopOrgDocs = {};
  memberships.value = [];
  membershipsReady.value = false;
  departing.value = [];
  myInvites.value = [];
  invitesReady.value = false;
  orgNames.value = {};
}

function watchOrgNames(ids: string[]) {
  for (const [id, stop] of Object.entries(stopOrgDocs)) {
    if (!ids.includes(id)) {
      stop();
      delete stopOrgDocs[id];
    }
  }
  for (const id of ids) {
    if (stopOrgDocs[id]) continue;
    stopOrgDocs[id] = onSnapshot(
      doc(db, "orgs", id),
      (snap) => (orgNames.value = { ...orgNames.value, [id]: (snap.data()?.name as string) ?? "" }),
      () => {} // a membership can briefly outlive access while leaving an org
    );
  }
}

onAuthStateChanged(auth, (u) => {
  stopAll();
  user.value = u;
  authReady.value = true;
  if (u) signInOpen.value = false;
  if (!u) return;

  stopUser.push(
    onSnapshot(
      query(collectionGroup(db, "members"), where("uid", "==", u.uid)),
      // Metadata changes tell us when a pending membership (just created or
      // accepted) is committed. Until then the server would refuse reads of
      // that org, so it is left out.
      { includeMetadataChanges: true },
      (snap) => {
        memberships.value = snap.docs
          .filter((d) => !d.metadata.hasPendingWrites)
          .map((d) => {
            const role = d.data().role as Role;
            return { orgId: d.ref.parent.parent!.id, role, ...permissionsFor(role, d.data()), servers: serversFor(role, d.data()) };
          });
        membershipsReady.value = true;
        watchOrgNames(memberships.value.map((m) => m.orgId));
      },
      (e) => console.error("memberships listener", e)
    )
  );

  if (u.email && u.emailVerified) {
    stopUser.push(
      onSnapshot(
        query(collectionGroup(db, "invites"), where("email", "==", u.email.toLowerCase())),
        (snap) => {
          myInvites.value = snap.docs.map((d) => ({ ...(d.data() as Omit<Invite, "orgId">), orgId: d.ref.parent.parent!.id }));
          invitesReady.value = true;
        },
        (e) => {
          console.error("invites listener", e);
          invitesReady.value = true;
        }
      )
    );
  } else {
    invitesReady.value = true;
  }
});

// --- joining orgs ----------------------------------------------------------------

export async function createOrg(name: string): Promise<string> {
  const u = user.value;
  if (!u) throw new Error("Not signed in");
  const orgRef = doc(collection(db, "orgs"));
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(orgRef, { name: name.trim(), ownerUid: u.uid, createdAt: now });
  batch.set(doc(orgRef, "members", u.uid), { uid: u.uid, email: myEmail(), role: "owner", joinedAt: now });
  await batch.commit();
  storedOrg.value = orgRef.id;
  return orgRef.id;
}

export async function acceptInvite(invite: Invite) {
  const u = user.value;
  if (!u) throw new Error("Not signed in");
  const batch = writeBatch(db);
  batch.set(doc(db, "orgs", invite.orgId, "members", u.uid), {
    uid: u.uid,
    email: myEmail(),
    role: invite.role,
    joinedAt: new Date().toISOString(),
    // Copied exactly from the invite; the rules check they match.
    canPublish: invite.canPublish ?? true,
    canDelete: invite.canDelete ?? false,
    ...(Array.isArray(invite.servers) && { servers: invite.servers }),
  });
  batch.delete(doc(db, "orgs", invite.orgId, "invites", invite.email));
  await batch.commit();
  storedOrg.value = invite.orgId;
}
