<script setup lang="ts">
import { user, memberships, myInvites, signOut } from "../stores/session";
import { href } from "../router";
</script>

<template>
  <div class="stack">
    <section class="row row-between">
      <div class="row">
        <span class="avatar avatar-lg">{{ (user?.email ?? "?").slice(0, 1).toUpperCase() }}</span>
        <div>
          <div class="draft-name account-email">{{ user?.email }}</div>
          <div class="muted small">Signed in with an email link</div>
        </div>
      </div>
      <button class="btn btn-sm" @click="signOut">Sign out</button>
    </section>

    <hr class="divider" />

    <p class="muted small" style="margin: 0">
      You belong to {{ memberships.length }} organization{{ memberships.length === 1 ? "" : "s" }}<template v-if="myInvites.length">
        and have {{ myInvites.length }} pending invitation{{ myInvites.length === 1 ? "" : "s" }}</template>.
      <a :href="href('/settings/general')">Manage organizations</a>
    </p>
  </div>
</template>
