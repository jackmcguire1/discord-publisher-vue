import { ref, watch } from "vue";
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { activeOrgId, activeOrgName, user, type Invite, type Role } from "./session";

// Membership management for the active org: who is in it, who is invited,
// and the admin actions on both.

export interface Member {
  uid: string;
  email: string;
  role: Role;
  joinedAt: string;
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
          .map((d) => d.data() as Member)
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

export function inviteMember(email: string, role: Invite["role"]) {
  const e = email.trim().toLowerCase();
  return setDoc(doc(db, "orgs", orgId(), "invites", e), {
    email: e,
    role,
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

export function removeMember(uid: string) {
  return deleteDoc(doc(db, "orgs", orgId(), "members", uid));
}

export function leaveOrg() {
  return removeMember(user.value!.uid);
}
