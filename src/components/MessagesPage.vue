<script setup lang="ts">
import MessagesPanel from "./MessagesPanel.vue";
import { navigate } from "../router";
import { user, activeOrgName } from "../stores/session";
</script>

<template>
  <div class="page">
    <div class="page-inner">
      <div class="row row-between">
        <h1 class="settings-title">Messages</h1>
        <span class="muted small">{{ user ? activeOrgName : "Saved in this browser" }}</span>
      </div>
      <p class="muted small" style="margin: 0">
        Drafts, published messages and messages deleted from Discord. Load one to keep working on it, or to update or delete it on Discord.
      </p>
      <div class="card">
        <div class="card-body">
          <MessagesPanel @loaded="navigate('/')" />
        </div>
      </div>
    </div>
  </div>
</template>
