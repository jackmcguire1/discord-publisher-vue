<script setup lang="ts">
import { ref, watch } from "vue";
import Field from "./Field.vue";
import { activeOrgName, activeRole, canManage, createOrg } from "../stores/session";
import { renameOrg, leaveOrg } from "../stores/org";
import { hasLegacyData, legacyCounts, importLegacyData, discardLegacyData } from "../stores/legacy";
import { toast } from "../stores/toasts";

const orgName = ref(activeOrgName.value);
watch(activeOrgName, (n) => (orgName.value = n));
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

function leave() {
  if (!confirm(`Leave ${activeOrgName.value}? You will lose access to its webhooks and drafts.`)) return;
  attempt(leaveOrg, "Left organization", "Could not leave");
}

async function create() {
  if (!newOrgName.value.trim()) return;
  if (await attempt(() => createOrg(newOrgName.value), "Organization created", "Could not create organization")) newOrgName.value = "";
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

    <form class="row row-nowrap" @submit.prevent="saveName">
      <Field label="Organization name" class="grow">
        <input v-model="orgName" class="input org-name-input" maxlength="100" :disabled="!canManage" />
      </Field>
      <button v-if="canManage" type="submit" class="btn btn-sm" style="align-self: flex-end" :disabled="!orgName.trim() || orgName.trim() === activeOrgName">
        Rename
      </button>
    </form>
    <p class="muted small" style="margin: 0">Your role here: <span class="tag">{{ activeRole }}</span></p>

    <hr class="divider" />

    <section class="stack" style="--gap: 8px">
      <h2 style="margin: 0">New organization</h2>
      <p class="muted small" style="margin: 0">Create another organization, for example for a different community. Switch between them from the navigation bar.</p>
      <form class="row row-nowrap" @submit.prevent="create">
        <input v-model="newOrgName" class="input grow" placeholder="New organization name" maxlength="100" />
        <button type="submit" class="btn btn-sm" :disabled="!newOrgName.trim()">Create organization</button>
      </form>
    </section>

    <template v-if="activeRole !== 'owner'">
      <hr class="divider" />
      <div>
        <button class="btn btn-sm btn-danger" @click="leave">Leave {{ activeOrgName }}</button>
      </div>
    </template>
  </div>
</template>
