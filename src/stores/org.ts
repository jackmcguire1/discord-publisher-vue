import { ref, watch } from "vue";
import { collection, deleteDoc, doc, getDocs, onSnapshot, setDoc, updateDoc, writeBatch, type DocumentReference } from "firebase/firestore";
import { db } from "../firebase";
import { activeOrgId, activeOrgName, user, departOrg, permissionsFor, serversFor, type Invite, type Permissions, type Role } from "./session";

// Membership management for the active org: who is in it, who is invited,
// and the admin actions on both.

export interface Member extends Permissions {
  uid: string;
  email: string;
  role: Role;
  joinedAt: string;
  /** Server ids they may use, or null for all servers. */
  servers: string[] | null;
}

export const members = ref<Member[]>([]);
export const pendingInvites = ref<Invite[]>([]);

let stop: (() => void)[] = [];
watch(
  activeOrgId,
  (orgId) => {
    stop.forEach((f) => f());
    stop = [];
    members.value = [];
    pendingInvites.value = [];
    if (!orgId) return;
    stop.push(
      onSnapshot(collection(db, "orgs", orgId, "members"), (snap) => {
        const order: Record<Role, number> = { owner: 0, admin: 1, member: 2 };
        members.value = snap.docs
          .map((d) => {
            const data = d.data() as Member;
            return { ...data, ...permissionsFor(data.role, data), servers: serversFor(data.role, data) };
          })
          .sort((a, b) => order[a.role] - order[b.role] || a.email.localeCompare(b.email));
      }, (e) => console.error("members listener", e)),
      onSnapshot(
        collection(db, "orgs", orgId, "invites"),
        (snap) => (pendingInvites.value = snap.docs.map((d) => ({ ...(d.data() as Omit<Invite, "orgId">), orgId }))),
        () => (pendingInvites.value = [])
      )
    );
  },
  { immediate: true }
);

function orgId(): string {
  if (!activeOrgId.value) throw new Error("No organization selected");
  return activeOrgId.value;
}

export function renameOrg(name: string) {
  return updateDoc(doc(db, "orgs", orgId()), { name: name.trim() });
}

export function inviteMember(
  email: string,
  role: Invite["role"],
  perms: Permissions = { canPublish: true, canDelete: false },
  /** Server ids for a limited member, or null for all servers. */
  servers: string[] | null = null
) {
  const e = email.trim().toLowerCase();
  return setDoc(doc(db, "orgs", orgId(), "invites", e), {
    email: e,
    role,
    canPublish: perms.canPublish,
    canDelete: perms.canDelete,
    ...(role === "member" && servers && { servers }),
    orgName: activeOrgName.value,
    invitedBy: user.value!.uid,
    createdAt: new Date().toISOString(),
  });
}

export function revokeInvite(email: string) {
  return deleteDoc(doc(db, "orgs", orgId(), "invites", email));
}

export function declineInvite(invite: Invite) {
  return deleteDoc(doc(db, "orgs", invite.orgId, "invites", invite.email));
}

export function setMemberRole(uid: string, role: Exclude<Role, "owner">) {
  return updateDoc(doc(db, "orgs", orgId(), "members", uid), { role });
}

/** Limit a member to some servers, or pass null for all servers. */
export function setMemberServers(uid: string, servers: string[] | null) {
  return updateDoc(doc(db, "orgs", orgId(), "members", uid), { servers });
}

export function setMemberPermissions(uid: string, patch: Partial<Permissions>) {
  return updateDoc(doc(db, "orgs", orgId(), "members", uid), patch);
}

/** Make another member the owner; the current owner becomes an admin. One batch, as the rules require. */
export function transferOwnership(uid: string) {
  const id = orgId();
  const me = user.value!.uid;
  const batch = writeBatch(db);
  batch.update(doc(db, "orgs", id), { ownerUid: uid });
  batch.update(doc(db, "orgs", id, "members", uid), { role: "owner" });
  batch.update(doc(db, "orgs", id, "members", me), { role: "admin" });
  return batch.commit();
}

export function removeMember(uid: string) {
  return deleteDoc(doc(db, "orgs", orgId(), "members", uid));
}

export function leaveOrg() {
  const id = orgId();
  return departOrg(id, () => deleteDoc(doc(db, "orgs", id, "members", user.value!.uid)));
}

/**
 * Delete the active org and everything in it. Firestore doesn't cascade, so
 * the rules expect this order: flag `deleting`, remove every subcollection doc
 * (other members included), delete the org doc, then our own membership.
 */
export async function deleteOrg() {
  const id = orgId();
  const me = user.value!.uid;
  const org = doc(db, "orgs", id);
  await updateDoc(org, { deleting: true });

  const refs: DocumentReference[] = [];
  // Revisions live under each message and aren't removed with it.
  for (const draft of (await getDocs(collection(org, "drafts"))).docs) {
    refs.push(...(await getDocs(collection(draft.ref, "revisions"))).docs.map((d) => d.ref));
  }
  for (const name of ["drafts", "authors", "webhooks", "servers", "invites", "members"]) {
    const snap = await getDocs(collection(org, name));
    refs.push(...snap.docs.map((d) => d.ref).filter((r) => !(name === "members" && r.id === me)));
  }
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  await departOrg(id, async () => {
    await deleteDoc(org);
    await deleteDoc(doc(org, "members", me));
  });
}
