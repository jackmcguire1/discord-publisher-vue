<script setup lang="ts">
import { computed, ref } from "vue";
import { messagesForWebhook } from "../stores/webhookHistory";
import { guildIdFor } from "../stores/servers";
import { messageLink } from "../discord/webhook";
import { formatDateTime } from "../util";
import type { SavedWebhook } from "../stores/webhooks";
import type { Draft } from "../stores/drafts";

// Everything sent through one saved webhook, newest first, with a summary.
// Only messages this user can see are listed (server access applies).

const props = defineProps<{ webhook: SavedWebhook }>();
const emit = defineEmits<{ open: [d: Draft] }>();

const messages = computed(() => messagesForWebhook(props.webhook));
/** Long histories render 20 at a time. */
const PAGE = 20;
const limit = ref(PAGE);
const visible = computed(() => messages.value.slice(0, limit.value));
const live = computed(() => messages.value.filter((d) => d.published).length);
const lastUsed = computed(() => {
  const m = messages.value[0];
  const info = m?.published ?? m?.deleted;
  return info ? info.updatedAt ?? info.publishedAt : null;
});

function link(d: Draft): string {
  return d.published ? messageLink(d.published, guildIdFor(d.serverId)) : "#";
}
</script>

<template>
  <div class="webhook-history">
    <div v-if="!messages.length" class="muted small">Nothing has been published through this webhook yet.</div>
    <template v-else>
      <div class="row webhook-history-summary small">
        <span><strong>{{ messages.length }}</strong> sent</span>
        <span class="tag tag-green">{{ live }} live</span>
        <span v-if="messages.length - live" class="tag tag-red">{{ messages.length - live }} deleted</span>
        <span v-if="lastUsed" class="muted">last used {{ formatDateTime(lastUsed) }}</span>
      </div>
      <div class="draft-list">
        <div v-for="d in visible" :key="d.id" class="draft webhook-history-item">
          <div class="grow">
            <div class="row">
              <span class="draft-name">{{ d.name }}</span>
              <span v-if="d.published" class="tag tag-green">live</span>
              <span v-else class="tag tag-red">deleted</span>
              <span v-if="d.groupId" class="tag" title="Also sent to other webhooks">group</span>
            </div>
            <div v-if="d.published" class="draft-meta">
              Published {{ formatDateTime(d.published.publishedAt) }}<template v-if="d.published.publishedBy"> by {{ d.published.publishedBy }}</template>
              <template v-if="d.published.updatedAt"> · updated {{ formatDateTime(d.published.updatedAt) }}<template v-if="d.published.updatedBy"> by {{ d.published.updatedBy }}</template></template>
              · <a :href="link(d)" target="_blank" rel="noreferrer">open in Discord</a>
            </div>
            <div v-else-if="d.deleted" class="draft-meta">
              Published {{ formatDateTime(d.deleted.publishedAt) }}<template v-if="d.deleted.publishedBy"> by {{ d.deleted.publishedBy }}</template>
              · deleted {{ formatDateTime(d.deleted.deletedAt) }}<template v-if="d.deleted.deletedBy"> by {{ d.deleted.deletedBy }}</template>
            </div>
          </div>
          <button class="btn btn-sm btn-ghost webhook-history-open" @click="emit('open', d)">Open</button>
        </div>
      </div>
      <div v-if="messages.length > PAGE" class="row row-between">
        <span class="muted small">Showing {{ visible.length }} of {{ messages.length }}</span>
        <button v-if="visible.length < messages.length" class="btn btn-sm webhook-history-more" @click="limit += PAGE">Show more</button>
      </div>
    </template>
  </div>
</template>
