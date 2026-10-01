<script setup lang="ts">
import { ref, computed } from "vue";
import Modal from "./Modal.vue";
import { drafts, deleteDraft, duplicateDraft, renameDraft, setDraftServer, exportDrafts, importDrafts, type Draft } from "../stores/drafts";
import { message, currentDraftId, replaceMessage } from "../stores/message";
import { messageLink } from "../discord/webhook";
import { webhookByDiscordId } from "../stores/webhooks";
import { servers, getServer, addServer, findServerByName, guildIdFor, type Server } from "../stores/servers";
import { downloadText, readFileAsText, slugify, formatDateTime } from "../util";
import { toast } from "../stores/toasts";

const emit = defineEmits<{ close: [] }>();

/** Drafts grouped by server (alphabetical), unassigned last. Empty servers are hidden. */
const groups = computed(() => {
  const out: { server: Server | null; drafts: Draft[] }[] = [];
  for (const s of servers.value) {
    const list = drafts.value.filter((d) => d.serverId === s.id);
    if (list.length) out.push({ server: s, drafts: list });
  }
  const loose = drafts.value.filter((d) => !d.serverId || !getServer(d.serverId));
  if (loose.length) out.push({ server: null, drafts: loose });
  return out;
});

function load(d: Draft) {
  const current = drafts.value.find((x) => x.id === currentDraftId.value)?.message;
  const unsaved = currentDraftId.value !== d.id && JSON.stringify(message.value) !== JSON.stringify(current);
  if (unsaved && !confirm("Replace the current editor contents with this draft? Unsaved changes will be lost (undo still works).")) return;
  replaceMessage(JSON.parse(JSON.stringify(d.message)), d.id);
  toast("info", "Draft loaded", d.name);
  emit("close");
}

function rename(d: Draft) {
  const name = prompt("Rename draft", d.name);
  if (name !== null) renameDraft(d.id, name);
}

function remove(d: Draft) {
  if (!confirm(`Delete draft "${d.name}"? This does not touch Discord.`)) return;
  deleteDraft(d.id);
  if (currentDraftId.value === d.id) currentDraftId.value = null;
}

function onServerChange(d: Draft, e: Event) {
  setDraftServer(d.id, (e.target as HTMLSelectElement).value || null);
}

function linkFor(d: Draft): string {
  return d.published ? messageLink(d.published, guildIdFor(d.serverId)) : "#";
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
  <Modal title="Drafts" @close="emit('close')">
    <div v-if="!drafts.length" class="empty">
      No drafts yet. Use “Save draft” in the toolbar, or publish a message and it will be tracked here automatically.
    </div>
    <div v-else class="stack" style="--gap: 12px">
      <div v-for="g in groups" :key="g.server?.id ?? 'none'" class="draft-group">
        <div class="group-label">{{ g.server ? g.server.name : servers.length ? "Unassigned" : "" }}</div>
        <div class="draft-list">
          <div v-for="d in g.drafts" :key="d.id" class="draft draft-item" :class="{ active: d.id === currentDraftId }">
            <div class="grow">
              <div class="row">
                <span class="draft-name">{{ d.name }}</span>
                <span v-if="d.id === currentDraftId" class="tag">editing</span>
                <span v-if="d.published" class="tag tag-green">published</span>
              </div>
              <div class="draft-meta">
                Updated {{ formatDateTime(d.updatedAt) }}
                · {{ d.message.embeds.length }} embed{{ d.message.embeds.length === 1 ? "" : "s" }}
                <template v-if="d.published">
                  · published {{ formatDateTime(d.published.publishedAt) }}<template v-if="webhookByDiscordId(d.published.webhookId)"> via {{ webhookByDiscordId(d.published.webhookId)!.name }}</template> ·
                  <a :href="linkFor(d)" target="_blank" rel="noreferrer">open</a>
                </template>
              </div>
            </div>
            <div class="row row-nowrap">
              <select v-if="servers.length" class="input draft-server-select" :value="d.serverId ?? ''" title="Server" @change="onServerChange(d, $event)">
                <option value="">Unassigned</option>
                <option v-for="s in servers" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <button class="btn btn-sm btn-primary" @click="load(d)">Load</button>
              <button class="btn btn-sm btn-ghost" title="Rename" @click="rename(d)">Rename</button>
              <button class="btn btn-sm btn-ghost" @click="duplicateDraft(d.id)">Duplicate</button>
              <button class="btn btn-sm btn-ghost" @click="exportOne(d)">Export</button>
              <button class="btn btn-sm btn-danger" title="Delete" @click="remove(d)">✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="btn btn-ghost" @click="fileInput?.click()">
        Import…
        <input ref="fileInput" type="file" accept=".json,application/json" multiple hidden @change="importFiles" />
      </button>
      <button class="btn" :disabled="!drafts.length" @click="exportAll">Export all</button>
    </template>
  </Modal>
</template>
