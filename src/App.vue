<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { message, currentDraftId, undo, redo } from "./stores/message";
import { getDraft } from "./stores/drafts";
import Toolbar from "./components/Toolbar.vue";
import PublishPanel from "./components/PublishPanel.vue";
import MessageEditor from "./components/MessageEditor.vue";
import MessagePreview from "./components/MessagePreview.vue";
import JsonModal from "./components/JsonModal.vue";
import CurlModal from "./components/CurlModal.vue";
import DraftsModal from "./components/DraftsModal.vue";
import WebhooksModal from "./components/WebhooksModal.vue";
import AuthorsModal from "./components/AuthorsModal.vue";
import { authorsDialog } from "./stores/authors";
import Toasts from "./components/Toasts.vue";
import SignIn from "./components/SignIn.vue";
import OrgSetup from "./components/OrgSetup.vue";
import OrgModal from "./components/OrgModal.vue";
import {
  user,
  authReady,
  membershipsReady,
  memberships,
  orgNames,
  activeOrgId,
  activeRole,
  switchOrg,
  signOut,
  completeSignInFromLink,
  isGuest,
  signInOpen,
} from "./stores/session";
import { hasLegacyData } from "./stores/legacy";

type View = "json" | "curl" | "drafts" | "webhooks" | "org" | null;
const view = ref<View>(null);
const draft = computed(() => getDraft(currentDraftId.value));

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
  if (typing || view.value || authorsDialog.value) return; // let native undo handle text fields and modals
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "z") {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  }
}
const signInError = ref<string | null>(null);
completeSignInFromLink().then((err) => {
  signInError.value = err;
  if (err) signInOpen.value = true;
});

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div v-if="!authReady || (user && !membershipsReady)" class="gate muted">Loading…</div>
  <SignIn v-else-if="isGuest && signInOpen" :error="signInError" />
  <OrgSetup v-else-if="user && !activeOrgId" />
  <div v-else class="app">
    <div class="pane pane-editor">
      <div class="stack">
        <div v-if="isGuest" class="row row-between org-bar guest-bar">
          <div class="row">
            <strong>Guest</strong>
            <span class="muted small">Saved in this browser only. Sign in to share webhooks and drafts with a team.</span>
          </div>
          <button class="btn btn-primary btn-sm" @click="signInOpen = true">Sign in</button>
        </div>
        <div v-else-if="user" class="row row-between org-bar">
          <div class="row">
            <select
              v-if="memberships.length > 1"
              class="input org-select"
              style="width: auto"
              :value="activeOrgId ?? ''"
              @change="switchOrg(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="m in memberships" :key="m.orgId" :value="m.orgId">{{ orgNames[m.orgId] || "…" }}</option>
            </select>
            <strong v-else class="org-current">{{ orgNames[activeOrgId ?? ""] || "…" }}</strong>
            <span class="tag">{{ activeRole }}</span>
            <button class="btn btn-ghost btn-sm" @click="view = 'org'">Organization</button>
          </div>
          <div class="row">
            <span class="muted small user-email">{{ user.email }}</span>
            <button class="btn btn-ghost btn-sm" @click="signOut">Sign out</button>
          </div>
        </div>
        <div v-if="user && hasLegacyData" class="banner banner-info row row-between legacy-banner">
          <span>This browser has webhooks, authors or drafts saved while signed out.</span>
          <button class="btn btn-sm" @click="view = 'org'">Import…</button>
        </div>
        <div class="row row-between">
          <h1>Discord Publisher</h1>
          <span v-if="draft" class="muted small">Draft: <strong>{{ draft.name }}</strong></span>
          <span v-else class="muted small">Unsaved message</span>
        </div>
        <PublishPanel @manage="view = 'webhooks'" />
        <Toolbar @open="view = $event" />
        <hr class="divider" />
        <MessageEditor />
      </div>
    </div>

    <div class="pane pane-preview">
      <h2>Preview</h2>
      <MessagePreview :message="message" />
    </div>

    <JsonModal v-if="view === 'json'" @close="view = null" />
    <CurlModal v-if="view === 'curl'" @close="view = null" />
    <DraftsModal v-if="view === 'drafts'" @close="view = null" />
    <WebhooksModal v-if="view === 'webhooks'" @close="view = null" />
    <OrgModal v-if="view === 'org'" @close="view = null" />
    <AuthorsModal v-if="authorsDialog" :key="JSON.stringify(authorsDialog.prefill)" />
  </div>
  <Toasts />
</template>
