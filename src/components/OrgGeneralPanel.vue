<script setup lang="ts">
import { ref, watch } from "vue";
import Field from "./Field.vue";
import {
  memberships,
  orgNames,
  activeOrgId,
  activeOrgName,
  activeRole,
  canManage,
  myInvites,
  createOrg,
  acceptInvite,
  switchOrg,
  type Invite,
} from "../stores/session";
import { renameOrg, leaveOrg, deleteOrg, declineInvite } from "../stores/org";
import { hasLegacyData, legacyCounts, importLegacyData, discardLegacyData } from "../stores/legacy";
import { toast } from "../stores/toasts";

// All of the user's organizations (switch, join, create), then settings for
// the one in use: rename, and the danger zone (leave or delete).

const orgName = ref(activeOrgName.value);
watch(activeOrgName, (n) => (orgName.value = n));
const creating = ref(false);
const newOrgName = ref("");
const busy = ref(false);

async function attempt(fn: () => Promise<unknown>, ok: string | null, fail: string, detail?: string) {
  busy.value = true;
  try {
    await fn();
    if (ok) toast("success", ok, detail);
    return true;
  } catch (e) {
    toast("error", fail, (e as Error).message);
    return false;
  } finally {
    busy.value = false;
  }
}

function sortedMemberships() {
  return [...memberships.value].sort((a, b) => (orgNames.value[a.orgId] ?? "").localeCompare(orgNames.value[b.orgId] ?? ""));
}

function switchTo(id: string) {
  switchOrg(id);
  toast("info", "Switched organization", orgNames.value[id]);
}

async function create() {
  const name = newOrgName.value.trim();
  if (!name) return;
  if (await attempt(() => createOrg(name), `Created ${name}`, "Could not create organization", "You're now working in it.")) {
    newOrgName.value = "";
    creating.value = false;
  }
}

const join = (i: Invite) => attempt(() => acceptInvite(i), `Joined ${i.orgName}`, "Could not join", "You're now working in it.");
const decline = (i: Invite) => attempt(() => declineInvite(i), null, "Could not decline");

function saveName() {
  if (!orgName.value.trim() || orgName.value.trim() === activeOrgName.value) return;
  attempt(() => renameOrg(orgName.value), "Organization renamed", "Could not rename");
}

function leave() {
  const name = activeOrgName.value;
  if (!confirm(`Leave ${name}? You will lose access to its webhooks and drafts.`)) return;
  attempt(leaveOrg, `Left ${name}`, "Could not leave");
}

function remove() {
  const name = activeOrgName.value;
  const typed = prompt(
    `Delete "${name}" for everyone? Its webhooks, servers, authors, drafts, members and invites are removed permanently. Messages already on Discord are not affected.\n\nType the organization name to confirm.`
  );
  if (typed === null) return;
  if (typed.trim() !== name) {
    toast("error", "Name didn't match", "Nothing was deleted.");
    return;
  }
  attempt(deleteOrg, `Deleted ${name}`, "Could not delete organization");
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
  <div class="stack">
    <section v-if="hasLegacyData" class="banner banner-info stack legacy-import" style="--gap: 8px">
      <div>
        This browser has data saved while signed out:
        {{ legacyCounts.webhooks }} webhooks, {{ legacyCounts.servers }} servers, {{ legacyCounts.authors }} authors and {{ legacyCounts.drafts }} drafts.
        <template v-if="!canManage"> Only admins can import webhooks and servers.</template>
      </div>
      <div class="row">
        <button class="btn btn-sm btn-primary" @click="runImport">Import into {{ activeOrgName }}</button>
        <button class="btn btn-sm btn-ghost" @click="discard">Discard</button>
      </div>
    </section>

    <section class="stack" style="--gap: 8px">
      <div class="row row-between">
        <h2 style="margin: 0">Your organizations <span class="muted" style="font-weight: 400">{{ memberships.length }}</span></h2>
        <button v-if="!creating" class="btn btn-sm new-org-toggle" @click="creating = true">+ New organization</button>
      </div>
      <form v-if="creating" class="row row-nowrap new-org-form" @submit.prevent="create">
        <input v-model="newOrgName" class="input grow" placeholder="New organization name" maxlength="100" autofocus />
        <button type="submit" class="btn btn-primary btn-sm" :disabled="busy || !newOrgName.trim()">Create</button>
        <button type="button" class="btn btn-ghost btn-sm" @click="creating = false">Cancel</button>
      </form>
      <div class="draft-list">
        <div v-for="m in sortedMemberships()" :key="m.orgId" class="draft org-item" :class="{ active: m.orgId === activeOrgId }">
          <div class="grow">
            <span class="draft-name">{{ orgNames[m.orgId] || "…" }}</span>
            <span class="tag" style="margin-left: 8px">{{ m.role }}</span>
          </div>
          <span v-if="m.orgId === activeOrgId" class="tag tag-green">current</span>
          <button v-else class="btn btn-sm btn-ghost" @click="switchTo(m.orgId)">Switch</button>
        </div>
        <div v-for="i in myInvites" :key="i.orgId" class="draft invite-item">
          <div class="grow">
            <span class="draft-name">{{ i.orgName }}</span>
            <span class="tag" style="margin-left: 8px">invited as {{ i.role }}</span>
          </div>
          <div class="row">
            <button class="btn btn-sm btn-primary" :disabled="busy" @click="join(i)">Join</button>
            <button class="btn btn-sm btn-ghost" :disabled="busy" @click="decline(i)">Decline</button>
          </div>
        </div>
      </div>
    </section>

    <hr class="divider" />

    <section class="stack current-org" style="--gap: 12px">
      <h2 style="margin: 0">Current organization</h2>
      <form class="row row-nowrap" @submit.prevent="saveName">
        <Field label="Name" class="grow">
          <input v-model="orgName" class="input org-name-input" maxlength="100" :disabled="!canManage" />
        </Field>
        <button v-if="canManage" type="submit" class="btn btn-sm" style="align-self: flex-end" :disabled="!orgName.trim() || orgName.trim() === activeOrgName">
          Rename
        </button>
      </form>
      <p class="muted small" style="margin: 0">Your role: <span class="tag">{{ activeRole }}</span></p>
    </section>

    <section v-if="canManage || activeRole !== 'owner'" class="danger-zone stack" style="--gap: 12px">
      <h2 style="margin: 0">Danger zone</h2>
      <div v-if="activeRole !== 'owner'" class="row row-between">
        <div>
          <div class="draft-name">Leave {{ activeOrgName }}</div>
          <div class="muted small">You lose access to its webhooks and drafts until you're invited again.</div>
        </div>
        <button class="btn btn-sm btn-danger leave-org" :disabled="busy" @click="leave">Leave</button>
      </div>
      <div v-if="canManage" class="row row-between">
        <div>
          <div class="draft-name">Delete {{ activeOrgName }}</div>
          <div class="muted small">Removes it and everything in it for every member. This can't be undone.</div>
        </div>
        <button class="btn btn-sm btn-danger delete-org" :disabled="busy" @click="remove">Delete organization</button>
      </div>
    </section>
  </div>
</template>
