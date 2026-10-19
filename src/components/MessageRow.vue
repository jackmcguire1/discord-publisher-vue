<script setup lang="ts">
import { currentDraftId } from "../stores/message";
import { statusOf, type Draft } from "../stores/drafts";
import { messageLink } from "../discord/webhook";
import { webhookByDiscordId, getWebhook } from "../stores/webhooks";
import { canDelete } from "../stores/session";
import { servers, guildIdFor } from "../stores/servers";
import { formatDateTime } from "../util";

// One message in the Messages list: a single message, or one copy inside a
// group published to several webhooks (then `copyOf` labels the copy).

defineProps<{ d: Draft; loading: string | null; justAdded: string | null; copyOf?: string }>();
const emit = defineEmits<{
  load: [d: Draft];
  history: [d: Draft];
  rename: [d: Draft];
  duplicate: [d: Draft];
  export: [d: Draft];
  remove: [d: Draft];
  server: [d: Draft, serverId: string | null];
}>();

function isHistory(d: Draft) {
  return statusOf(d) !== "draft";
}

function linkFor(d: Draft): string {
  return d.published ? messageLink(d.published, guildIdFor(d.serverId)) : "#";
}

function via(webhookId: string, savedWebhookId?: string | null) {
  return (getWebhook(savedWebhookId) ?? webhookByDiscordId(webhookId))?.name;
}
</script>

<template>
  <div
    class="draft draft-item"
    :class="{ active: d.id === currentDraftId, 'just-added': d.id === justAdded, 'copy-row': !!copyOf }"
    :data-message-id="d.id"
  >
    <div class="grow">
      <div class="row">
        <span class="draft-name">{{ d.name }}</span>
        <span v-if="copyOf" class="tag copies-tag">{{ copyOf }}</span>
        <span v-if="d.revision" class="tag revision-tag" :title="`${d.revision} revision${d.revision === 1 ? '' : 's'}`">v{{ d.revision }}</span>
        <span v-if="d.id === currentDraftId" class="tag">editing</span>
        <span v-if="d.published" class="tag tag-green">published</span>
        <span v-else-if="d.deleted" class="tag tag-red">deleted</span>
      </div>
      <div class="draft-meta">
        Updated {{ formatDateTime(d.updatedAt) }}<template v-if="d.updatedBy"> by {{ d.updatedBy }}</template>
        · {{ d.message.embeds.length }} embed{{ d.message.embeds.length === 1 ? "" : "s" }}
        <template v-if="d.published">
          · published {{ formatDateTime(d.published.publishedAt) }}<template v-if="d.published.publishedBy"> by {{ d.published.publishedBy }}</template><template v-if="via(d.published.webhookId, d.published.savedWebhookId)"> via {{ via(d.published.webhookId, d.published.savedWebhookId) }}</template> ·
          <a :href="linkFor(d)" target="_blank" rel="noreferrer">open</a>
        </template>
        <template v-else-if="d.deleted">
          · published {{ formatDateTime(d.deleted.publishedAt) }}<template v-if="via(d.deleted.webhookId, d.deleted.savedWebhookId)"> via {{ via(d.deleted.webhookId, d.deleted.savedWebhookId) }}</template>,
          deleted from Discord {{ formatDateTime(d.deleted.deletedAt) }}<template v-if="d.deleted.deletedBy"> by {{ d.deleted.deletedBy }}</template>
        </template>
      </div>
    </div>
    <div class="row row-nowrap">
      <select v-if="servers.length" class="input draft-server-select" :value="d.serverId ?? ''" title="Server" @change="emit('server', d, ($event.target as HTMLSelectElement).value || null)">
        <option value="">Unassigned</option>
        <option v-for="s in servers" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <button class="btn btn-sm btn-primary" :disabled="loading === d.id" @click="emit('load', d)">{{ loading === d.id ? "Loading…" : "Load" }}</button>
      <button class="btn btn-sm btn-ghost message-history" :disabled="!d.revision" title="Revision history" @click="emit('history', d)">History</button>
      <button class="btn btn-sm btn-ghost" title="Rename" @click="emit('rename', d)">Rename</button>
      <button class="btn btn-sm btn-ghost" @click="emit('duplicate', d)">Duplicate</button>
      <button class="btn btn-sm btn-ghost" @click="emit('export', d)">Export</button>
      <button
        class="btn btn-sm btn-danger"
        :disabled="isHistory(d) && !canDelete"
        :title="isHistory(d) ? (canDelete ? 'Remove from history' : 'You don\'t have permission to remove published messages') : 'Delete draft'"
        @click="emit('remove', d)"
      >✕</button>
    </div>
  </div>
</template>
