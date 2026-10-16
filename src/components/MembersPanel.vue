<script setup lang="ts">
import { ref } from "vue";
import { user, activeOrgName, activeRole, canManage, inviteLink } from "../stores/session";
import {
  members,
  pendingInvites,
  inviteMember,
  revokeInvite,
  setMemberRole,
  setMemberPermissions,
  removeMember,
  transferOwnership,
  type Member,
} from "../stores/org";
import type { Permissions } from "../stores/session";
import { toast } from "../stores/toasts";

const invite = ref<{ email: string; role: "admin" | "member"; canPublish: boolean; canDelete: boolean }>({
  email: "",
  role: "member",
  canPublish: true,
  canDelete: false,
});

async function attempt(fn: () => Promise<unknown>, ok: string | null, fail: string) {
  try {
    await fn();
    if (ok) toast("success", ok);
    return true;
  } catch (e) {
    toast("error", fail, (e as Error).message);
    return false;
  }
}

async function sendInvite() {
  const email = invite.value.email.trim().toLowerCase();
  if (!email) return;
  if (members.value.some((m) => m.email === email)) {
    toast("info", "Already a member", email);
    return;
  }
  const perms = { canPublish: invite.value.canPublish, canDelete: invite.value.canDelete };
  if (await attempt(() => inviteMember(email, invite.value.role, perms), null, "Could not invite")) {
    invite.value.email = "";
    toast("success", "Invite created", `No email is sent. Copy the invite link and send it to ${email}, or ask them to sign in with exactly that address.`, 10000);
  }
}

async function copyLink(email: string) {
  const link = inviteLink(email);
  try {
    await navigator.clipboard.writeText(link);
    toast("success", "Invite link copied", `Send it to ${email}.`);
  } catch {
    prompt("Copy this invite link and send it to them:", link);
  }
}

function changeRole(m: Member, e: Event) {
  const role = (e.target as HTMLSelectElement).value as "admin" | "member";
  attempt(() => setMemberRole(m.uid, role), null, "Could not change role");
}

function togglePermission(m: Member, key: keyof Permissions, e: Event) {
  const value = (e.target as HTMLInputElement).checked;
  attempt(() => setMemberPermissions(m.uid, { [key]: value }), null, "Could not change permissions");
}

/** Short label for what someone may do with messages. */
function permissionSummary(p: { role: string; canPublish?: boolean; canDelete?: boolean }) {
  if (p.role !== "member") return "all permissions";
  const can = [p.canPublish !== false && "publish", p.canDelete === true && "delete"].filter(Boolean);
  return can.length ? `can ${can.join(" and ")}` : "drafts only";
}

function makeOwner(m: Member) {
  if (!confirm(`Make ${m.email} the owner of ${activeOrgName.value}? You'll become an admin, and only they will be able to hand ownership on.`)) return;
  attempt(() => transferOwnership(m.uid), `${m.email} is now the owner`, "Could not transfer ownership");
}

function remove(m: Member) {
  if (!confirm(`Remove ${m.email} from ${activeOrgName.value}?`)) return;
  attempt(() => removeMember(m.uid), "Member removed", "Could not remove member");
}
</script>

<template>
  <div class="stack">
    <section class="stack" style="--gap: 8px">
      <h2 style="margin: 0">Members <span class="muted" style="font-weight: 400">{{ members.length }}</span></h2>
      <p class="muted small" style="margin: 0">
        Owners and admins manage webhooks, servers and people, and can do everything with messages. Every member can work on
        drafts and authors; whether a member can <strong>publish &amp; edit</strong> messages on Discord, and
        <strong>delete</strong> them, is set per member.
      </p>
      <div class="draft-list">
        <div v-for="m in members" :key="m.uid" class="draft member-item">
          <div class="grow">
            <span class="draft-name">{{ m.email }}</span>
            <span v-if="m.uid === user?.uid" class="tag" style="margin-left: 8px">you</span>
            <div class="draft-meta member-permissions">{{ permissionSummary(m) }}</div>
          </div>
          <div class="row row-nowrap">
            <template v-if="canManage && m.role === 'member' && m.uid !== user?.uid">
              <label class="checkbox small perm-publish">
                <input type="checkbox" :checked="m.canPublish" @change="togglePermission(m, 'canPublish', $event)" /> Publish &amp; edit
              </label>
              <label class="checkbox small perm-delete">
                <input type="checkbox" :checked="m.canDelete" @change="togglePermission(m, 'canDelete', $event)" /> Delete
              </label>
            </template>
            <select
              v-if="canManage && m.role !== 'owner' && m.uid !== user?.uid"
              class="input member-role"
              style="width: auto"
              :value="m.role"
              @change="changeRole(m, $event)"
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <span v-else class="tag member-role">{{ m.role }}</span>
            <button
              v-if="activeRole === 'owner' && m.uid !== user?.uid"
              class="btn btn-sm btn-ghost make-owner"
              title="Transfer ownership to this member"
              @click="makeOwner(m)"
            >Make owner</button>
            <button v-if="canManage && m.role !== 'owner' && m.uid !== user?.uid" class="btn btn-sm btn-danger" @click="remove(m)">✕</button>
          </div>
        </div>
      </div>
    </section>

    <template v-if="canManage">
      <hr class="divider" />
      <section class="stack" style="--gap: 8px">
        <h2 style="margin: 0">Invites</h2>
        <p class="muted small" style="margin: 0">
          Invites aren't emailed. Invited people see the invitation when they sign in with exactly that address. The invite
          link opens sign-in with their address filled in, so send them that.
        </p>
        <div v-if="pendingInvites.length" class="draft-list">
          <div v-for="i in pendingInvites" :key="i.email" class="draft pending-invite">
            <div class="grow">
              <span class="draft-name">{{ i.email }}</span>
              <span class="tag" style="margin-left: 8px">{{ i.role }}</span>
              <div class="draft-meta">{{ permissionSummary(i) }}</div>
            </div>
            <div class="row row-nowrap">
              <button class="btn btn-sm copy-invite" @click="copyLink(i.email)">Copy invite link</button>
              <button class="btn btn-sm btn-ghost" @click="attempt(() => revokeInvite(i.email), 'Invite revoked', 'Could not revoke')">Revoke</button>
            </div>
          </div>
        </div>
        <form class="row row-nowrap" @submit.prevent="sendInvite">
          <input v-model="invite.email" type="email" class="input grow invite-email" placeholder="teammate@example.com" required />
          <select v-model="invite.role" class="input invite-role" style="width: auto">
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" class="btn btn-primary btn-sm" :disabled="!invite.email.trim()">Invite</button>
        </form>
        <div v-if="invite.role === 'member'" class="row invite-permissions">
          <span class="muted small">New member can:</span>
          <label class="checkbox small"><input v-model="invite.canPublish" type="checkbox" class="invite-can-publish" /> Publish &amp; edit</label>
          <label class="checkbox small"><input v-model="invite.canDelete" type="checkbox" class="invite-can-delete" /> Delete</label>
        </div>
      </section>
    </template>
  </div>
</template>
