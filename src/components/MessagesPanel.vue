<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import {
  drafts,
  deleteDraft,
  duplicateDraft,
  renameDraft,
  setDraftServer,
  exportDrafts,
  importDrafts,
  statusOf,
  type Draft,
  type MessageStatus,
} from "../stores/drafts";
import { currentDraftId, replaceMessage, isDirty } from "../stores/message";
import { requestNewMessage } from "../stores/editorActions";
import { messageLink, fetchMessage, type DiscordApiError } from "../discord/webhook";
import { parseIncomingMessage } from "../discord/schema";
import { webhookByDiscordId, getWebhook, selectWebhook } from "../stores/webhooks";
import { settings, webhookInfo } from "../stores/settings";
import { canDelete } from "../stores/session";
import { servers, getServer, addServer, findServerByName, guildIdFor, type Server } from "../stores/servers";
import { downloadText, readFileAsText, slugify, formatDateTime } from "../util";
import { toast } from "../stores/toasts";

const emit = defineEmits<{ loaded: [] }>();

type Filter = "all" | MessageStatus;
const filter = ref<Filter>("all");
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "published", label: "Published" },
  { id: "deleted", label: "Deleted" },
];
const counts = computed(() => {
  const c: Record<Filter, number> = { all: drafts.value.length, draft: 0, published: 0, deleted: 0 };
  for (const d of drafts.value) c[statusOf(d)]++;
  return c;
});
const shown = computed(() => (filter.value === "all" ? drafts.value : drafts.value.filter((d) => statusOf(d) === filter.value)));

/** Messages grouped by server (alphabetical), unassigned last. Empty servers are hidden. */
const groups = computed(() => {
  const out: { server: Server | null; drafts: Draft[] }[] = [];
  for (const s of servers.value) {
    const list = shown.value.filter((d) => d.serverId === s.id);
    if (list.length) out.push({ server: s, drafts: list });
  }
  const loose = shown.value.filter((d) => !d.serverId || !getServer(d.serverId));
  if (loose.length) out.push({ server: null, drafts: loose });
  return out;
});

const loading = ref<string | null>(null);

/**
 * Load a message into the editor. A published one also selects the webhook it
 * went through and pulls its current content from Discord (it may have been
 * edited since), falling back to the stored copy.
 */
async function load(d: Draft) {
  if (isDirty.value && currentDraftId.value !== d.id && !confirm("Replace the current editor contents with this message? Unsaved changes will be lost (undo still works).")) return;

  let next = JSON.parse(JSON.stringify(d.message));
  const info = d.published;
  if (!info) {
    replaceMessage(next, d.id);
    toast("info", statusOf(d) === "deleted" ? "Deleted message loaded" : "Draft loaded", d.name);
    emit("loaded");
    return;
  }

  const hook = getWebhook(info.savedWebhookId) ?? webhookByDiscordId(info.webhookId);
  if (hook) selectWebhook(hook.id);
  settings.value.threadId = info.threadId ?? "";
  if (webhookInfo.value?.id !== info.webhookId) {
    replaceMessage(next, d.id);
    toast("info", "Loaded the saved copy", "The webhook that published it isn't available here, so it can't be refreshed from Discord or edited.");
    emit("loaded");
    return;
  }

  loading.value = d.id;
  try {
    const live = parseIncomingMessage(await fetchMessage(settings.value.webhookUrl, info.messageId, info.threadId));
    // Discord doesn't return the webhook identity overrides; keep ours.
    next = { ...live, username: next.username, avatar_url: next.avatar_url };
    replaceMessage(next, d.id);
    toast("success", "Loaded from Discord", d.name);
  } catch (e) {
    replaceMessage(next, d.id);
    const err = e as DiscordApiError;
    if (err?.status === 404) toast("error", "Not found on Discord", "It may have been deleted outside this app. Loaded the saved copy.", 10000);
    else toast("info", "Loaded the saved copy", `Couldn't reach Discord: ${err?.message ?? e}`);
  } finally {
    loading.value = null;
  }
  emit("loaded");
}

/** Id of a just-created copy, highlighted for a moment so it's easy to spot. */
const justAdded = ref<string | null>(null);

async function duplicate(d: Draft) {
  const copy = duplicateDraft(d.id);
  if (!copy) return;
  // A copy is always a plain draft, so leave a filter that would hide it.
  if (filter.value !== "all" && filter.value !== "draft") filter.value = "all";
  toast("success", "Message duplicated", isHistory(d) ? `"${copy.name}" is a new draft; the original keeps its publish history.` : `"${copy.name}"`);
  justAdded.value = copy.id;
  await nextTick();
  document.querySelector(`[data-message-id="${copy.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  setTimeout(() => {
    if (justAdded.value === copy.id) justAdded.value = null;
  }, 2500);
}

function isHistory(d: Draft) {
  return statusOf(d) !== "draft";
}

function rename(d: Draft) {
  const name = prompt("Rename draft", d.name);
  if (name !== null) renameDraft(d.id, name);
}

function remove(d: Draft) {
  const what = isHistory(d) ? `Remove "${d.name}" and its publish history from this organization?` : `Delete draft "${d.name}"?`;
  if (!confirm(`${what} This does not touch Discord.`)) return;
  deleteDraft(d.id);
  if (currentDraftId.value === d.id) currentDraftId.value = null;
}

function onServerChange(d: Draft, e: Event) {
  setDraftServer(d.id, (e.target as HTMLSelectElement).value || null);
}

function linkFor(d: Draft): string {
  return d.published ? messageLink(d.published, guildIdFor(d.serverId)) : "#";
}

function via(webhookId: string, savedWebhookId?: string | null) {
  return (getWebhook(savedWebhookId) ?? webhookByDiscordId(webhookId))?.name;
}

const resolveServer = (id: string) => {
  const s = getServer(id);
  return s ? { id: s.id, name: s.name, guildId: s.guildId } : undefined;
};

function exportOne(d: Draft) {
  downloadText(`${slugify(d.name)}.draft.json`, JSON.stringify(exportDrafts([d.id], resolveServer), null, 2));
}

function exportAll() {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`discord-publisher-drafts-${stamp}.json`, JSON.stringify(exportDrafts(undefined, resolveServer), null, 2));
}

/** Servers in an import file are matched to local ones by name, or created. */
function mapServer(s: { name: string; guildId?: string }): string | null {
  const existing = findServerByName(s.name);
  if (existing) return existing.id;
  return addServer({ name: s.name, guildId: s.guildId }).id;
}

const fileInput = ref<HTMLInputElement>();
async function importFiles(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? []);
  let total = 0;
  for (const file of files) {
    try {
      total += importDrafts(JSON.parse(await readFileAsText(file)), file.name.replace(/\.json$/i, ""), mapServer);
    } catch (err) {
      toast("error", `Could not import ${file.name}`, (err as Error).message);
    }
  }
  if (total) toast("success", `Imported ${total} draft${total === 1 ? "" : "s"}`);
  if (fileInput.value) fileInput.value.value = "";
}
</script>

<template>
  <div class="stack messages-panel" style="--gap: 12px">
    <div class="row row-between">
      <span class="muted small">{{ drafts.length }} message{{ drafts.length === 1 ? "" : "s" }}</span>
      <button class="btn btn-primary btn-sm new-message" @click="requestNewMessage(() => emit('loaded'))">+ New message</button>
    </div>
    <div v-if="!drafts.length" class="empty">
      No messages yet. Use “Save draft” in the toolbar, or publish a message and it will be tracked here automatically.
    </div>
    <div v-else class="stack" style="--gap: 12px">
      <div class="row message-filters" role="tablist">
        <button
          v-for="f in FILTERS"
          :key="f.id"
          class="btn btn-sm"
          :class="filter === f.id ? 'btn-primary' : 'btn-ghost'"
          :data-filter="f.id"
          role="tab"
          :aria-selected="filter === f.id"
          @click="filter = f.id"
        >
          {{ f.label }} <span class="tag">{{ counts[f.id] }}</span>
        </button>
      </div>
      <div v-if="!shown.length" class="empty">Nothing here.</div>
      <div v-for="g in groups" :key="g.server?.id ?? 'none'" class="draft-group">
        <div class="group-label">{{ g.server ? g.server.name : servers.length ? "Unassigned" : "" }}</div>
        <div class="draft-list">
          <div
            v-for="d in g.drafts"
            :key="d.id"
            class="draft draft-item"
            :class="{ active: d.id === currentDraftId, 'just-added': d.id === justAdded }"
            :data-message-id="d.id"
          >
            <div class="grow">
              <div class="row">
                <span class="draft-name">{{ d.name }}</span>
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
              <select v-if="servers.length" class="input draft-server-select" :value="d.serverId ?? ''" title="Server" @change="onServerChange(d, $event)">
                <option value="">Unassigned</option>
                <option v-for="s in servers" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <button class="btn btn-sm btn-primary" :disabled="loading === d.id" @click="load(d)">{{ loading === d.id ? "Loading…" : "Load" }}</button>
              <button class="btn btn-sm btn-ghost" title="Rename" @click="rename(d)">Rename</button>
              <button class="btn btn-sm btn-ghost" @click="duplicate(d)">Duplicate</button>
              <button class="btn btn-sm btn-ghost" @click="exportOne(d)">Export</button>
              <button
                class="btn btn-sm btn-danger"
                :disabled="isHistory(d) && !canDelete"
                :title="isHistory(d) ? (canDelete ? 'Remove from history' : 'You don\'t have permission to remove published messages') : 'Delete draft'"
                @click="remove(d)"
              >✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="row messages-actions">
      <button class="btn btn-ghost" @click="fileInput?.click()">
        Import…
        <input ref="fileInput" type="file" accept=".json,application/json" multiple hidden @change="importFiles" />
      </button>
      <button class="btn" :disabled="!drafts.length" @click="exportAll">Export all</button>
    </div>
  </div>
</template>
