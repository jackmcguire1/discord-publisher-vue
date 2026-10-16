<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { route, href, navigate, type SettingsTab } from "../router";
import { user, isGuest, activeOrgName, signInOpen } from "../stores/session";
import OrgGeneralPanel from "./OrgGeneralPanel.vue";
import MembersPanel from "./MembersPanel.vue";
import WebhooksPanel from "./WebhooksPanel.vue";
import AuthorsPanel from "./AuthorsPanel.vue";
import AccountPanel from "./AccountPanel.vue";

// Organization and account settings. Guests only have their local webhooks,
// servers and authors to configure.

const ALL: { id: SettingsTab; label: string; title: string; org: boolean }[] = [
  { id: "general", label: "Organization", title: "Organization", org: true },
  { id: "members", label: "Members", title: "Members and invites", org: true },
  { id: "webhooks", label: "Webhooks and servers", title: "Webhooks and servers", org: false },
  { id: "authors", label: "Authors", title: "Authors", org: false },
  { id: "account", label: "Account", title: "Account", org: true },
];

const tabs = computed(() => ALL.filter((t) => !t.org || !!user.value));
const tab = computed(() => (route.value.page === "settings" ? route.value.tab : "webhooks"));
const current = computed(() => ALL.find((t) => t.id === tab.value)!);

// Guests asking for an org-only tab land on webhooks instead.
watchEffect(() => {
  if (isGuest.value && current.value.org) navigate("/settings/webhooks");
});
</script>

<template>
  <div class="settings">
    <aside class="settings-nav" aria-label="Settings sections">
      <div class="settings-scope muted small">{{ user ? activeOrgName : "This browser" }}</div>
      <a
        v-for="t in tabs"
        :key="t.id"
        :href="href(`/settings/${t.id}`)"
        class="settings-tab"
        :class="{ active: t.id === tab }"
        :data-tab="t.id"
      >{{ t.label }}</a>
    </aside>

    <main class="settings-main">
      <h1 class="settings-title">{{ current.title }}</h1>
      <div v-if="isGuest" class="banner banner-info row row-between guest-settings-note">
        <span>You're a guest, so these are saved in this browser only. Sign in to share them with an organization.</span>
        <button class="btn btn-sm" @click="signInOpen = true">Sign in</button>
      </div>
      <div class="card">
        <div class="card-body">
          <OrgGeneralPanel v-if="tab === 'general'" />
          <MembersPanel v-else-if="tab === 'members'" />
          <WebhooksPanel v-else-if="tab === 'webhooks'" @used="navigate('/')" />
          <AuthorsPanel v-else-if="tab === 'authors'" />
          <AccountPanel v-else-if="tab === 'account'" />
        </div>
      </div>
    </main>
  </div>
</template>
