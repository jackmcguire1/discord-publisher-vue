import { ref, computed, watch } from "vue";
import {
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { collection, collectionGroup, doc, onSnapshot, query, where, writeBatch } from "firebase/firestore";
import { auth, db } from "../firebase";
import { load, save } from "./persist";

// Who is signed in and which organization they are working in. Every shared
// store (webhooks, servers, authors, drafts) follows `activeOrgId`.
// This module must not import those stores; they import it.

export type Role = "owner" | "admin" | "member";

export interface Membership {
  orgId: string;
  role: Role;
}

export interface Invite {
  orgId: string;
  email: string;
  role: Exclude<Role, "owner">;
  orgName: string;
}

export const user = ref<User | null>(null);
/** False until Firebase has restored (or ruled out) a previous sign-in. */
export const authReady = ref(false);

export const memberships = ref<Membership[]>([]);
/** False until the signed-in user's memberships have loaded at least once. */
export const membershipsReady = ref(false);
export const orgNames = ref<Record<string, string>>({});
export const myInvites = ref<Invite[]>([]);

const storedOrg = ref<string | null>(load<string | null>("org", null));
watch(storedOrg, (v) => save("org", v));

/** The org currently in use: the remembered one if still a member, else the first. */
export const activeOrgId = computed<string | null>(() => {
  const ids = memberships.value.map((m) => m.orgId);
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
/** Whether a guest has asked to see the sign-in screen. */
export const signInOpen = ref(false);

export function switchOrg(orgId: string) {
  storedOrg.value = orgId;
}

export function myEmail(): string {
  return (user.value?.email ?? "").toLowerCase();
}

// --- auth ----------------------------------------------------------------------

const EMAIL_KEY = "signInEmail";

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

export function signOut() {
  return fbSignOut(auth);
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
  myInvites.value = [];
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
          .map((d) => ({ orgId: d.ref.parent.parent!.id, role: d.data().role as Role }));
        membershipsReady.value = true;
        watchOrgNames(memberships.value.map((m) => m.orgId));
      },
      (e) => console.error("memberships listener", e)
    )
  );

  if (u.email && u.emailVerified) {
    stopUser.push(
      onSnapshot(query(collectionGroup(db, "invites"), where("email", "==", u.email.toLowerCase())), (snap) => {
        myInvites.value = snap.docs.map((d) => ({ ...(d.data() as Omit<Invite, "orgId">), orgId: d.ref.parent.parent!.id }));
      }, (e) => console.error("invites listener", e))
    );
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
  });
  batch.delete(doc(db, "orgs", invite.orgId, "invites", invite.email));
  await batch.commit();
  storedOrg.value = invite.orgId;
}
