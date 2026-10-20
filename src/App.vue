<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import { message, undo, redo } from "./stores/message";
import Toolbar from "./components/Toolbar.vue";
import PublishPanel from "./components/PublishPanel.vue";
import MessageEditor from "./components/MessageEditor.vue";
import MessagePreview from "./components/MessagePreview.vue";
import JsonModal from "./components/JsonModal.vue";
import CurlModal from "./components/CurlModal.vue";
import MessagesModal from "./components/MessagesModal.vue";
import WebhooksModal from "./components/WebhooksModal.vue";
import AuthorsModal from "./components/AuthorsModal.vue";
import { authorsDialog } from "./stores/authors";
import Toasts from "./components/Toasts.vue";
import SignIn from "./components/SignIn.vue";
import OrgSetup from "./components/OrgSetup.vue";
import NavBar from "./components/NavBar.vue";
import SettingsPage from "./components/SettingsPage.vue";
import MessagesPage from "./components/MessagesPage.vue";
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
// Clears the webhook fields when switching org or signing in/out.
import "./stores/workspace";
import { isDismissed, dismiss } from "./stores/dismissed";
import NewMessageDialog from "./components/NewMessageDialog.vue";
import ChoiceDialog from "./components/ChoiceDialog.vue";
import { pendingQuestion } from "./stores/dialog";
import { newMessageDialog, historyFor } from "./stores/editorActions";
import HistoryModal from "./components/HistoryModal.vue";
import { route, href } from "./router";

type View = "json" | "curl" | "drafts" | "webhooks" | null;
const view = ref<View>(null);

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
  if (typing || view.value || authorsDialog.value || newMessageDialog.value || historyFor.value || pendingQuestion.value || route.value.page !== "editor") return; // let native undo handle text fields and modals
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
    <MessagesPage v-else-if="route.page === 'messages'" />
    <div v-else class="app">
      <div class="pane pane-editor">
        <div class="stack">
          <div v-if="user && hasLegacyData && !isDismissed('legacy-import')" class="banner banner-info legacy-banner">
            <span class="grow">This browser has webhooks, authors or drafts saved while signed out.</span>
            <a class="btn btn-sm" :href="href('/settings/general')">Import…</a>
            <button class="banner-close" aria-label="Dismiss" title="Dismiss" @click="dismiss('legacy-import', { persist: false })">✕</button>
          </div>
          <PublishPanel @manage="view = 'webhooks'" />
          <section class="panel message-panel">
            <Toolbar @open="view = $event" />
            <div class="panel-body">
              <MessageEditor />
            </div>
          </section>
        </div>
      </div>

      <div class="pane pane-preview">
        <h2>Preview</h2>
        <MessagePreview :message="message" />
      </div>

      <JsonModal v-if="view === 'json'" @close="view = null" />
      <CurlModal v-if="view === 'curl'" @close="view = null" />
      <MessagesModal v-if="view === 'drafts'" @close="view = null" />
      <WebhooksModal v-if="view === 'webhooks'" @close="view = null" />
      <AuthorsModal v-if="authorsDialog" :key="JSON.stringify(authorsDialog.prefill)" />
    </div>
  </div>
  <NewMessageDialog v-if="newMessageDialog" />
  <ChoiceDialog />
  <HistoryModal v-if="historyFor" :key="historyFor" />
  <Toasts />
</template>
