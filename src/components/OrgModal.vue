<script setup lang="ts">
import { ref } from "vue";
import Modal from "./Modal.vue";
import Field from "./Field.vue";
import { user, activeOrgName, activeRole, canManage, myInvites, createOrg, acceptInvite } from "../stores/session";
import {
  members,
  pendingInvites,
  renameOrg,
  inviteMember,
  revokeInvite,
  setMemberRole,
  removeMember,
  leaveOrg,
  type Member,
} from "../stores/org";
import { hasLegacyData, legacyCounts, importLegacyData, discardLegacyData } from "../stores/legacy";
import { toast } from "../stores/toasts";

const emit = defineEmits<{ close: [] }>();

const orgName = ref(activeOrgName.value);
const invite = ref<{ email: string; role: "admin" | "member" }>({ email: "", role: "member" });
const newOrgName = ref("");

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

function saveName() {
  if (!orgName.value.trim() || orgName.value.trim() === activeOrgName.value) return;
  attempt(() => renameOrg(orgName.value), "Organization renamed", "Could not rename");
}

async function sendInvite() {
  const email = invite.value.email.trim().toLowerCase();
  if (!email) return;
  if (members.value.some((m) => m.email === email)) {
    toast("info", "Already a member", email);
    return;
  }
  if (await attempt(() => inviteMember(email, invite.value.role), "Invite created", "Could not invite")) {
    invite.value.email = "";
  }
}

function changeRole(m: Member, e: Event) {
  const role = (e.target as HTMLSelectElement).value as "admin" | "member";
  attempt(() => setMemberRole(m.uid, role), null, "Could not change role");
}

function remove(m: Member) {
  if (!confirm(`Remove ${m.email} from ${activeOrgName.value}?`)) return;
  attempt(() => removeMember(m.uid), "Member removed", "Could not remove member");
}

async function leave() {
  if (!confirm(`Leave ${activeOrgName.value}? You will lose access to its webhooks and drafts.`)) return;
  if (await attempt(leaveOrg, "Left organization", "Could not leave")) emit("close");
}

async function create() {
  if (!newOrgName.value.trim()) return;
  if (await attempt(() => createOrg(newOrgName.value), "Organization created", "Could not create organization")) emit("close");
}

async function runImport() {
  try {
    const n = await importLegacyData();
    toast("success", `Imported ${n} item${n === 1 ? "" : "s"}`, activeOrgName.value);
  } catch (e) {
    toast("error", "Import failed", (e as Error).message);
  }
}

function discard() {
  if (!confirm("Delete the webhooks, servers, authors and drafts stored in this browser? Data already in your organization is not affected.")) return;
  discardLegacyData();
}
</script>

<template>
  <Modal title="Organization" @close="emit('close')">
    <div class="stack">
      <section v-if="hasLegacyData" class="banner banner-info stack legacy-import" style="--gap: 8px">
        <div>
          This browser has data from before sign-in:
          {{ legacyCounts.webhooks }} webhooks, {{ legacyCounts.servers }} servers, {{ legacyCounts.authors }} authors and {{ legacyCounts.drafts }} drafts.
          <template v-if="!canManage"> Only admins can import webhooks and servers.</template>
        </div>
        <div class="row">
          <button class="btn btn-sm btn-primary" @click="runImport">Import into {{ activeOrgName }}</button>
          <button class="btn btn-sm btn-ghost" @click="discard">Discard</button>
        </div>
      </section>

      <form class="row row-nowrap" @submit.prevent="saveName">
        <Field label="Name" class="grow">
          <input v-model="orgName" class="input org-name-input" maxlength="100" :disabled="!canManage" />
        </Field>
        <button v-if="canManage" type="submit" class="btn btn-sm" style="align-self: flex-end" :disabled="!orgName.trim() || orgName.trim() === activeOrgName">
          Rename
        </button>
      </form>

      <section class="stack" style="--gap: 8px">
        <h2 style="margin: 0">Members <span class="muted" style="font-weight: 400">{{ members.length }}</span></h2>
        <div class="draft-list">
          <div v-for="m in members" :key="m.uid" class="draft member-item">
            <div class="grow">
              <span class="draft-name">{{ m.email }}</span>
              <span v-if="m.uid === user?.uid" class="tag" style="margin-left: 8px">you</span>
            </div>
            <div class="row row-nowrap">
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
              <button v-if="canManage && m.role !== 'owner' && m.uid !== user?.uid" class="btn btn-sm btn-danger" @click="remove(m)">✕</button>
            </div>
          </div>
        </div>
      </section>

      <section v-if="canManage" class="stack" style="--gap: 8px">
        <h2 style="margin: 0">Invites</h2>
        <p class="muted small" style="margin: 0">Invited people join when they next sign in with that email address.</p>
        <div v-if="pendingInvites.length" class="draft-list">
          <div v-for="i in pendingInvites" :key="i.email" class="draft pending-invite">
            <div class="grow">
              <span class="draft-name">{{ i.email }}</span>
              <span class="tag" style="margin-left: 8px">{{ i.role }}</span>
            </div>
            <button class="btn btn-sm btn-ghost" @click="attempt(() => revokeInvite(i.email), 'Invite revoked', 'Could not revoke')">Revoke</button>
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
      </section>

      <section v-if="myInvites.length" class="stack" style="--gap: 8px">
        <h2 style="margin: 0">Invitations for you</h2>
        <div class="draft-list">
          <div v-for="i in myInvites" :key="i.orgId" class="draft">
            <div class="grow">
              <span class="draft-name">{{ i.orgName }}</span>
              <span class="tag" style="margin-left: 8px">{{ i.role }}</span>
            </div>
            <button class="btn btn-sm btn-primary" @click="attempt(() => acceptInvite(i), `Joined ${i.orgName}`, 'Could not join')">Join</button>
          </div>
        </div>
      </section>

      <hr class="divider" />

      <form class="row row-nowrap" @submit.prevent="create">
        <input v-model="newOrgName" class="input grow" placeholder="New organization name" maxlength="100" />
        <button type="submit" class="btn btn-sm" :disabled="!newOrgName.trim()">Create organization</button>
      </form>

      <div v-if="activeRole !== 'owner'">
        <button class="btn btn-sm btn-danger" @click="leave">Leave {{ activeOrgName }}</button>
      </div>
    </div>
  </Modal>
</template>
