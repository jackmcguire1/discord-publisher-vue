<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
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
import NavBar from "./components/NavBar.vue";
import SettingsPage from "./components/SettingsPage.vue";
import {
  user,
  authReady,
  membershipsReady,
  invitesReady,
  activeOrgId,
  completeSignInFromLink,
  isGuest,
  signInOpen,
  takeInviteEmail,
  myEmail,
} from "./stores/session";
import { toast } from "./stores/toasts";
import { hasLegacyData } from "./stores/legacy";
import { route, href } from "./router";

type View = "json" | "curl" | "drafts" | "webhooks" | null;
const view = ref<View>(null);
const draft = computed(() => getDraft(currentDraftId.value));

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
  if (typing || view.value || authorsDialog.value || route.value.page !== "editor") return; // let native undo handle text fields and modals
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

// An invite link (?invite=email) opens sign-in with that address filled in, so
// the invitee signs in with exactly the address the invite was made for.
const invitedEmail = ref(takeInviteEmail());
if (invitedEmail.value) {
  const stop = watch(
    authReady,
    (ready) => {
      if (!ready) return;
      stop();
      if (!user.value) signInOpen.value = true;
      else if (myEmail() !== invitedEmail.value)
        toast("info", `This invite is for ${invitedEmail.value}`, `You're signed in as ${myEmail()}. Sign out and sign in with the invited address to join.`, 12000);
    },
    { immediate: true }
  );
}

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div v-if="!authReady || (user && (!membershipsReady || !invitesReady))" class="gate muted">Loading…</div>
  <div v-else class="shell">
    <NavBar />
    <SignIn v-if="isGuest && signInOpen" :error="signInError" :prefill="invitedEmail" />
    <OrgSetup v-else-if="user && !activeOrgId" />
    <SettingsPage v-else-if="route.page === 'settings'" />
    <div v-else class="app">
      <div class="pane pane-editor">
        <div class="stack">
          <div v-if="user && hasLegacyData" class="banner banner-info row row-between legacy-banner">
            <span>This browser has webhooks, authors or drafts saved while signed out.</span>
            <a class="btn btn-sm" :href="href('/settings/general')">Import…</a>
          </div>
          <div class="row row-between">
            <h2 style="margin: 0">Message</h2>
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
      <AuthorsModal v-if="authorsDialog" :key="JSON.stringify(authorsDialog.prefill)" />
    </div>
  </div>
  <Toasts />
</template>
