<script setup lang="ts">
import { ref, computed, nextTick, watch } from "vue";
import {
  drafts,
  duplicateDraft,
  renameDraft,
  setDraftServer,
  exportDrafts,
  importDrafts,
  statusOf,
  groupCopies,
  type Draft,
  type MessageStatus,
} from "../stores/drafts";
import { currentDraftId, replaceMessage, isDirty } from "../stores/message";
import { requestNewMessage, selectWebhookFor, openHistory } from "../stores/editorActions";
import { fetchMessage, type DiscordApiError } from "../discord/webhook";
import { parseIncomingMessage } from "../discord/schema";
import { settings, webhookInfo } from "../stores/settings";
import { servers, getServer, addServer, findServerByName } from "../stores/servers";
import { downloadText, readFileAsText, slugify, formatDateTime } from "../util";
import MessageRow from "./MessageRow.vue";
import { removeMessage } from "../stores/messageActions";
import { webhookForCopy } from "../stores/fanout";
import { toast } from "../stores/toasts";

/** `loaded`: a message is now in the editor. `handoff`: another dialog opened; a modal host should close. */
const emit = defineEmits<{ loaded: []; handoff: [] }>();

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
// --- search ---------------------------------------------------------------------

const search = ref("");

/** Everything a message can be found by: name, text, embed text, webhook and server. */
function haystack(d: Draft): string {
  const m = d.message;
  const embedText = (m.embeds ?? []).flatMap((e) => [e.title, e.description, e.author?.name, e.footer?.text, ...(e.fields ?? []).flatMap((f) => [f.name, f.value])]);
  return [d.name, m.content, ...embedText, webhookForCopy(d)?.name, getServer(d.serverId)?.name].filter(Boolean).join("\n").toLowerCase();
}

const shown = computed(() => {
  const byStatus = filter.value === "all" ? drafts.value : drafts.value.filter((d) => statusOf(d) === filter.value);
  const q = search.value.trim().toLowerCase();
  return q ? byStatus.filter((d) => haystack(d).includes(q)) : byStatus;
});

/** A row in the list: one message, or the copies of a message published to several webhooks. */
type Entry = { kind: "single"; d: Draft } | { kind: "group"; id: string; copies: Draft[] };

const latest = (copies: Draft[]) => copies.reduce((m, c) => (c.updatedAt > m ? c.updatedAt : m), "");
const entryTime = (e: Entry) => (e.kind === "single" ? e.d.updatedAt : latest(e.copies));

/**
 * Sections by server (alphabetical, unassigned last). A group sits under its
 * server when all its copies share one, else in "Several servers" at the top.
 */
const sections = computed(() => {
  const byGroup = new Map<string, Draft[]>();
  const entries: { key: string; entry: Entry }[] = [];
  const sectionOf = (serverId: string | null) => (serverId && getServer(serverId) ? serverId : "none");
  for (const d of shown.value) {
    if (d.groupId && groupCopies(d.groupId).length > 1) {
      if (!byGroup.has(d.groupId)) byGroup.set(d.groupId, []);
      byGroup.get(d.groupId)!.push(d);
    } else {
      entries.push({ key: sectionOf(d.serverId), entry: { kind: "single", d } });
    }
  }
  for (const [id, copies] of byGroup) {
    copies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const keys = new Set(copies.map((c) => sectionOf(c.serverId)));
    entries.push({ key: keys.size === 1 ? [...keys][0] : "several", entry: { kind: "group", id, copies } });
  }
  const pick = (key: string) =>
    entries
      .filter((x) => x.key === key)
      .map((x) => x.entry)
      .sort((a, b) => entryTime(b).localeCompare(entryTime(a)));
  return [
    { key: "several", label: "Several servers", entries: pick("several") },
    ...servers.value.map((s) => ({ key: s.id, label: s.name, entries: pick(s.id) })),
    { key: "none", label: servers.value.length ? "Unassigned" : "", entries: pick("none") },
  ].filter((sec) => sec.entries.length);
});

// --- paging -----------------------------------------------------------------------
// Rows render 50 at a time (a group of copies is one row); all messages are
// still loaded, so groups, webhook history and search see everything.

const PAGE = 50;
const limit = ref(PAGE);
watch([filter, search], () => (limit.value = PAGE));

const totalRows = computed(() => sections.value.reduce((n, sec) => n + sec.entries.length, 0));
/** The sections cut down to the first `limit` rows, in display order. */
const pagedSections = computed(() => {
  let left = limit.value;
  const out: typeof sections.value = [];
  for (const sec of sections.value) {
    if (left <= 0) break;
    const entries = sec.entries.slice(0, left);
    left -= entries.length;
    out.push({ ...sec, entries });
  }
  return out;
});
const shownRows = computed(() => Math.min(limit.value, totalRows.value));

const expanded = ref<string[]>([]);
const isOpen = (id: string) => expanded.value.includes(id);
function toggle(id: string) {
  expanded.value = isOpen(id) ? expanded.value.filter((x) => x !== id) : [...expanded.value, id];
}
const liveIn = (copies: Draft[]) => copies.filter((c) => c.published).length;
const deletedIn = (copies: Draft[]) => copies.filter((c) => c.deleted).length;
/** Which webhook a copy belongs to, for its label in a group. */
const copyLabel = (c: Draft) => webhookForCopy(c)?.name ?? "Webhook not available to you";

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

  selectWebhookFor(d);
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
  const suggested = `${d.name} (copy)`;
  const name = prompt("Name for the copy", suggested);
  if (name == null) return;
  const copy = duplicateDraft(d.id, name);
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
  removeMessage(d);
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
      <input
        v-model="search"
        type="search"
        class="input message-search"
        placeholder="Search by name, text, webhook or server"
        aria-label="Search messages"
      />
      <div v-if="!shown.length" class="empty">{{ search.trim() ? `Nothing matches “${search.trim()}”.` : "Nothing here." }}</div>
      <div v-for="sec in pagedSections" :key="sec.key" class="draft-group">
        <div class="group-label">{{ sec.label }}</div>
        <div class="draft-list">
          <template v-for="e in sec.entries" :key="e.kind === 'single' ? e.d.id : e.id">
            <MessageRow
              v-if="e.kind === 'single'"
              :d="e.d"
              :loading="loading"
              :just-added="justAdded"
              @load="load"
              @history="(d) => { openHistory(d.id); emit('handoff'); }"
              @rename="rename"
              @duplicate="duplicate"
              @export="exportOne"
              @remove="remove"
              @server="(d, id) => setDraftServer(d.id, id)"
            />
            <div v-else class="draft message-group" :class="{ active: e.copies.some((c) => c.id === currentDraftId) }" :data-group-id="e.id">
              <button class="group-toggle" :aria-expanded="isOpen(e.id)" @click="toggle(e.id)">
                <span class="chevron" :class="{ open: isOpen(e.id) }">▸</span>
                <span class="draft-name">{{ e.copies[0].name }}</span>
                <span class="tag group-count">Published to {{ groupCopies(e.id).length }} webhooks</span>
                <span v-if="liveIn(e.copies)" class="tag tag-green">{{ liveIn(e.copies) }} published</span>
                <span v-if="deletedIn(e.copies)" class="tag tag-red">{{ deletedIn(e.copies) }} deleted</span>
                <span v-if="e.copies.some((c) => c.id === currentDraftId)" class="tag">editing</span>
              </button>
              <div class="draft-meta group-summary">
                Updated {{ formatDateTime(latest(e.copies)) }} · {{ e.copies.map(copyLabel).join(", ") }}
              </div>
              <div v-if="isOpen(e.id)" class="draft-list group-children">
                <MessageRow
                  v-for="c in e.copies"
                  :key="c.id"
                  :d="c"
                  :loading="loading"
                  :just-added="justAdded"
                  :copy-of="copyLabel(c)"
                  @load="load"
                  @history="(d) => { openHistory(d.id); emit('handoff'); }"
                  @rename="rename"
                  @duplicate="duplicate"
                  @export="exportOne"
                  @remove="remove"
                  @server="(d, id) => setDraftServer(d.id, id)"
                />
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-if="totalRows > PAGE" class="row row-between messages-paging">
      <span class="muted small paging-status">Showing {{ shownRows }} of {{ totalRows }}</span>
      <button v-if="shownRows < totalRows" class="btn btn-sm show-more" @click="limit += PAGE">
        Show {{ Math.min(PAGE, totalRows - shownRows) }} more
      </button>
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
