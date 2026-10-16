<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { user, isGuest, memberships, orgNames, activeOrgId, activeRole, activeOrgName, switchOrg, signOut, signInOpen } from "../stores/session";
import { route, href, navigate } from "../router";

// Top bar: brand and page links on the left, the org switcher and the account
// menu (or Sign in for guests) on the right.

const logo = `${import.meta.env.BASE_URL}logo.svg`;
const menuOpen = ref(false);
const menu = ref<HTMLElement | null>(null);
const initial = computed(() => (user.value?.email ?? "?").slice(0, 1).toUpperCase());

function onDocClick(e: MouseEvent) {
  if (menuOpen.value && menu.value && !menu.value.contains(e.target as Node)) menuOpen.value = false;
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") menuOpen.value = false;
}
onMounted(() => {
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onKey);
});
onUnmounted(() => {
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("keydown", onKey);
});

function go(path: Parameters<typeof navigate>[0]) {
  menuOpen.value = false;
  navigate(path);
}

async function logOut() {
  menuOpen.value = false;
  await signOut();
  navigate("/");
}
</script>

<template>
  <header class="navbar">
    <a :href="href('/')" class="nav-brand">
      <img :src="logo" alt="" class="nav-logo" />
      <span>Discord Publisher</span>
    </a>
    <nav class="nav-links">
      <a :href="href('/')" class="nav-link" :class="{ active: route.page === 'editor' }">Editor</a>
      <a :href="href('/messages')" class="nav-link nav-messages" :class="{ active: route.page === 'messages' }">Messages</a>
      <a :href="href('/settings/webhooks')" class="nav-link nav-settings" :class="{ active: route.page === 'settings' }">Settings</a>
    </nav>

    <div class="nav-spacer" />

    <template v-if="user">
      <select
        v-if="memberships.length > 1"
        class="nav-org org-select"
        :value="activeOrgId ?? ''"
        aria-label="Organization"
        @change="switchOrg(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="m in memberships" :key="m.orgId" :value="m.orgId">{{ orgNames[m.orgId] || "…" }}</option>
      </select>
      <span v-else-if="activeOrgId" class="nav-org org-current">{{ activeOrgName || "…" }}</span>

      <div ref="menu" class="nav-account">
        <button class="avatar-btn" aria-haspopup="menu" :aria-expanded="menuOpen" aria-label="Account menu" @click.stop="menuOpen = !menuOpen">
          <span class="avatar">{{ initial }}</span>
        </button>
        <div v-if="menuOpen" class="nav-menu" role="menu">
          <div class="nav-menu-header">
            <span class="avatar">{{ initial }}</span>
            <div class="nav-menu-who">
              <div class="nav-menu-email user-email">{{ user.email }}</div>
              <div v-if="activeOrgId" class="muted small">{{ activeOrgName }} · <span class="nav-role">{{ activeRole }}</span></div>
            </div>
          </div>
          <template v-if="activeOrgId">
            <button class="nav-menu-item" role="menuitem" @click="go('/settings/general')">Organizations</button>
            <button class="nav-menu-item" role="menuitem" @click="go('/settings/members')">Members</button>
            <button class="nav-menu-item" role="menuitem" @click="go('/settings/webhooks')">Webhooks and servers</button>
            <button class="nav-menu-item" role="menuitem" @click="go('/settings/authors')">Authors</button>
          </template>
          <button class="nav-menu-item" role="menuitem" @click="go('/settings/account')">Account</button>
          <div class="nav-menu-divider" />
          <button class="nav-menu-item" role="menuitem" @click="logOut">Sign out</button>
        </div>
      </div>
    </template>

    <template v-else-if="isGuest">
      <span class="nav-org nav-guest guest-bar">Guest</span>
      <button class="btn btn-sm nav-signin" @click="signInOpen = true">Sign in</button>
    </template>
  </header>
</template>
