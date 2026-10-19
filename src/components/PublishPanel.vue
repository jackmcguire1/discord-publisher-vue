<script setup lang="ts">
import { ref, computed } from "vue";
import { settings, webhookInfo } from "../stores/settings";
import { savedWebhooks, getWebhook, selectWebhook, webhookByDiscordId, selectedWebhookServerId } from "../stores/webhooks";
import { servers, getServer, guildIdFor } from "../stores/servers";
import { message, isValid, errors, showErrors, currentDraftId, markClean, replaceMessage } from "../stores/message";
import type { Message } from "../discord/schema";
import {
  getDraft,
  createDraft,
  updateDraftMessage,
  setDraftServer,
  markPublished,
  markUpdated,
  markDeleted,
  groupCopies,
  nameFromMessage,
  followsContent,
  type Draft,
} from "../stores/drafts";
import { publishToMany, updateCopies, deleteCopies, summarize, webhookForCopy, type Outcome } from "../stores/fanout";
import { selectWebhookFor } from "../stores/editorActions";
import { sendMessage, editMessage, deleteMessage, messageLink, type DiscordApiError } from "../discord/webhook";
import { toast } from "../stores/toasts";
import { canManage, canPublish, canDelete } from "../stores/session";
import { isDismissed, dismiss } from "../stores/dismissed";
import { formatDateTime } from "../util";
import Field from "./Field.vue";

const emit = defineEmits<{ manage: [] }>();

const showUrl = ref(false);
const selected = computed(() => getWebhook(settings.value.webhookId));
const publishedVia = computed(() => webhookByDiscordId(published.value?.webhookId));
const selectedServer = computed(() => getServer(selected.value?.serverId));

/** Webhooks grouped by server for the <optgroup> dropdown; ungrouped ones listed flat. */
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const webhookGroups = computed(() =>
  servers.value
    .map((s) => ({ server: s, webhooks: savedWebhooks.value.filter((w) => w.serverId === s.id).sort(byName) }))
    .filter((g) => g.webhooks.length)
);
const ungroupedWebhooks = computed(() =>
  savedWebhooks.value.filter((w) => !w.serverId || !getServer(w.serverId)).sort(byName)
);
const publishedLink = computed(() =>
  published.value ? messageLink(published.value, guildIdFor(draft.value?.serverId)) : "#"
);

function onPick(e: Event) {
  selectWebhook((e.target as HTMLSelectElement).value || null);
}

/** Typing a URL by hand detaches it from any saved webhook. */
function onUrlInput(e: Event) {
  settings.value.webhookUrl = (e.target as HTMLInputElement).value.trim();
  settings.value.webhookId = null;
}
const busy = ref<"" | "send" | "edit" | "delete">("");

const draft = computed(() => getDraft(currentDraftId.value));
const published = computed(() => draft.value?.published);
const deletedInfo = computed(() => draft.value?.deleted);
/** The published message can only be edited through the webhook that created it. */
const canEditPublished = computed(
  () => !!published.value && !!webhookInfo.value && published.value.webhookId === webhookInfo.value.id
);
const errorCount = computed(() => Object.keys(errors.value).length);

function describe(e: unknown): string {
  const err = e as DiscordApiError;
  if (!err || typeof err !== "object") return String(e);
  const detail = err.errors ? ` ${JSON.stringify(err.errors)}` : "";
  return `${err.message}${err.status ? ` (HTTP ${err.status})` : ""}${detail}`.slice(0, 400);
}


/**
 * Make sure there is a draft to track this publish. A message that has
 * already been published (or deleted from Discord) keeps its history, so
 * publishing it again starts a new record.
 */
/**
 * What a publish or update works from: the message and draft as they were
 * when the button was clicked. Discord calls take a moment, and the editor
 * may change meanwhile (New message, Load…); records must describe what was
 * actually sent, not whatever the editor holds when Discord answers.
 */
interface Start {
  msg: Message;
  json: string;
  draftId: string | null;
  serverId: string | null;
}

function capture(): Start {
  const json = JSON.stringify(message.value);
  return { msg: JSON.parse(json), json, draftId: currentDraftId.value, serverId: selectedWebhookServerId() };
}

/** After a Discord call: point the editor at `id` and mark it saved, but only if it still holds what was sent. */
function settle(start: Start, id: string): boolean {
  if (currentDraftId.value !== start.draftId || JSON.stringify(message.value) !== start.json) return false;
  currentDraftId.value = id;
  markClean();
  return true;
}

function ensureDraft(start: Start): string {
  const existing = getDraft(start.draftId);
  if (start.draftId && existing && !existing.published && !existing.deleted) {
    // The publish that follows records the revision.
    updateDraftMessage(start.draftId, start.msg, { revision: false });
    // File an unassigned draft under the server of the webhook it was published through.
    if (!existing.serverId && start.serverId) setDraftServer(start.draftId, start.serverId);
    return start.draftId;
  }
  // A new record for a published/deleted message keeps its name (and whether it follows the content).
  const d = createDraft(existing?.name ?? nameFromMessage(start.msg), start.msg, existing?.serverId ?? start.serverId, {
    revision: false,
    autoName: existing ? followsContent(existing) : true,
  });
  if (!existing) toast("info", "Draft saved", `Tracking this message as "${d.name}".`);
  return d.id;
}

async function publish() {
  if (!webhookInfo.value || !isValid.value || !canPublish.value) return;
  busy.value = "send";
  const start = capture();
  const webhookId = settings.value.webhookId;
  try {
    const ref = await sendMessage(settings.value.webhookUrl, start.msg, {
      threadId: settings.value.threadId.trim() || undefined,
    });
    const id = ensureDraft(start);
    markPublished(id, ref, start.msg, webhookId);
    settle(start, id);
    toast("success", "Published", `Message ${ref.messageId} sent to Discord.`);
  } catch (e) {
    toast("error", "Publish failed", describe(e), 10000);
  } finally {
    busy.value = "";
  }
}

// --- several webhooks at once ------------------------------------------------

/** Publishing to a picked set of saved webhooks instead of the single one above. */
const multi = ref(false);
const destinations = ref<string[]>([]);
/** Checklist sections: each accessible server with its webhooks, then unfiled ones. */
const checklist = computed(() => [
  ...webhookGroups.value.map((g) => ({ label: g.server.name, webhooks: g.webhooks })),
  ...(ungroupedWebhooks.value.length ? [{ label: "No server", webhooks: ungroupedWebhooks.value }] : []),
]);
/** Picked webhooks in checklist order, so the editor keeps the first one's copy predictably. */
const destinationWebhooks = computed(() =>
  checklist.value.flatMap((g) => g.webhooks).filter((w) => destinations.value.includes(w.id))
);

function toggleDestination(id: string, on: boolean) {
  destinations.value = on ? [...new Set([...destinations.value, id])] : destinations.value.filter((x) => x !== id);
}

/** The copies of the message being edited, when it was published to several webhooks. */
const copies = computed(() => groupCopies(draft.value?.groupId));
const grouped = computed(() => copies.value.length > 1);
const liveCopies = computed(() => copies.value.filter((c) => c.published));

function report(action: string, outcomes: Outcome[]) {
  if (!outcomes.length) return;
  const { ok, total, detail } = summarize(outcomes);
  if (ok === total) toast("success", `${action} ${total} webhook${total === 1 ? "" : "s"}`);
  else toast(ok ? "info" : "error", `${action} ${ok} of ${total} webhooks`, detail, 12000);
}

async function publishMany() {
  if (!destinationWebhooks.value.length || !isValid.value || !canPublish.value) return;
  busy.value = "send";
  try {
    const start = capture();
    const current = draft.value;
    const name = current?.name ?? nameFromMessage(start.msg);
    const autoName = current ? followsContent(current) : true;
    const { outcomes, editorDraftId } = await publishToMany(destinationWebhooks.value, start.msg, { name, autoName }, () => ensureDraft(start));
    if (editorDraftId) {
      destinations.value = [];
      multi.value = false;
      // The editor holds the first copy; select its webhook so single actions match it.
      const d = getDraft(editorDraftId);
      if (settle(start, editorDraftId) && d) selectWebhookFor(d);
    }
    report("Published to", outcomes);
  } finally {
    busy.value = "";
  }
}

async function updateAll() {
  if (!liveCopies.value.length || !isValid.value || !canPublish.value) return;
  busy.value = "edit";
  try {
    const start = capture();
    const outcomes = await updateCopies(liveCopies.value, start.msg);
    if (outcomes.some((o) => o.ok) && start.draftId) settle(start, start.draftId);
    report("Updated", outcomes);
  } finally {
    busy.value = "";
  }
}

async function deleteAll() {
  if (!liveCopies.value.length || !canDelete.value) return;
  if (!confirm(`Delete this message from all ${liveCopies.value.length} webhooks on Discord? The copies stay in Messages as deleted.`)) return;
  busy.value = "delete";
  try {
    report("Deleted from", await deleteCopies(liveCopies.value));
  } finally {
    busy.value = "";
  }
}

async function updateOne(c: Draft) {
  busy.value = "edit";
  try {
    report("Updated", await updateCopies([c], capture().msg));
  } finally {
    busy.value = "";
  }
}

async function deleteOne(c: Draft) {
  if (!confirm(`Delete the copy sent to ${webhookForCopy(c)?.name ?? "this webhook"} from Discord?`)) return;
  busy.value = "delete";
  try {
    report("Deleted from", await deleteCopies([c]));
  } finally {
    busy.value = "";
  }
}

/** Switch the editor to another copy (its own webhook gets selected). */
function openCopy(c: Draft) {
  replaceMessage(JSON.parse(JSON.stringify(c.message)), c.id);
  selectWebhookFor(c);
}

function copyLink(c: Draft): string {
  return c.published ? messageLink(c.published, guildIdFor(c.serverId)) : "#";
}

async function update() {
  if (!published.value || !canEditPublished.value || !isValid.value || !canPublish.value || !currentDraftId.value) return;
  busy.value = "edit";
  const start = capture();
  const id = currentDraftId.value;
  try {
    const ref = await editMessage(settings.value.webhookUrl, published.value, start.msg);
    markUpdated(id, ref, start.msg);
    settle(start, id);
    toast("success", "Updated", `Message ${ref.messageId} edited on Discord.`);
  } catch (e) {
    toast("error", "Update failed", describe(e), 10000);
  } finally {
    busy.value = "";
  }
}

async function remove() {
  if (!published.value || !canEditPublished.value || !currentDraftId.value || !canDelete.value) return;
  if (!confirm("Delete the published message from Discord? It stays in Messages as deleted, so you can see what it was or publish it again.")) return;
  busy.value = "delete";
  const id = currentDraftId.value;
  try {
    await deleteMessage(settings.value.webhookUrl, published.value);
    markDeleted(id);
    toast("success", "Deleted", "The message was removed from Discord.");
  } catch (e) {
    toast("error", "Delete failed", describe(e), 10000);
  } finally {
    busy.value = "";
  }
}
</script>

<template>
  <section class="panel publish-panel">
    <header class="panel-header">
      <div class="panel-heading">
        <h2 class="panel-title">Publish</h2>
        <span class="editing-meta">Where this message goes on Discord</span>
      </div>
    </header>
    <div class="panel-body">
      <div v-if="savedWebhooks.length > 1" class="row row-between publish-mode">
        <div class="btn-group" role="tablist" aria-label="Destination">
          <button class="btn btn-sm" :class="multi ? 'btn-ghost' : 'btn-primary'" role="tab" :aria-selected="!multi" @click="multi = false">One webhook</button>
          <button class="btn btn-sm mode-multi" :class="multi ? 'btn-primary' : 'btn-ghost'" role="tab" :aria-selected="multi" @click="multi = true">Several webhooks</button>
        </div>
        <span v-if="multi" class="muted small">{{ destinations.length }} selected</span>
      </div>

      <div v-if="multi" class="destinations">
        <div v-for="g in checklist" :key="g.label" class="destination-group">
          <div class="group-label">{{ g.label }}</div>
          <label v-for="w in g.webhooks" :key="w.id" class="checkbox destination">
            <input type="checkbox" :value="w.id" :checked="destinations.includes(w.id)" @change="toggleDestination(w.id, ($event.target as HTMLInputElement).checked)" />
            {{ w.name }}<span v-if="w.description" class="muted small"> · {{ w.description }}</span>
          </label>
        </div>
        <p class="muted small" style="margin: 0">Each webhook gets its own copy, linked together so you can update or delete them all later. Thread IDs aren't used here.</p>
      </div>

      <template v-else>
      <div class="publish-grid">
        <Field label="Webhook" :hint="[selectedServer?.name, selected?.description].filter(Boolean).join(' · ') || (savedWebhooks.length ? `${savedWebhooks.length} saved` : 'none saved yet')">
          <div class="row row-nowrap">
            <select class="input grow webhook-select" :value="settings.webhookId ?? ''" @change="onPick">
              <option value="">Custom URL</option>
              <optgroup v-for="g in webhookGroups" :key="g.server.id" :label="g.server.name">
                <option v-for="w in g.webhooks" :key="w.id" :value="w.id">{{ w.name }}</option>
              </optgroup>
              <template v-if="ungroupedWebhooks.length">
                <optgroup v-if="webhookGroups.length" label="No server">
                  <option v-for="w in ungroupedWebhooks" :key="w.id" :value="w.id">{{ w.name }}</option>
                </optgroup>
                <template v-else>
                  <option v-for="w in ungroupedWebhooks" :key="w.id" :value="w.id">{{ w.name }}</option>
                </template>
              </template>
            </select>
            <button class="btn btn-ghost btn-sm" @click="emit('manage')">Manage</button>
          </div>
        </Field>
        <Field label="Thread ID" hint="optional">
          <input v-model.trim="settings.threadId" class="input" placeholder="Forum / thread id" inputmode="numeric" />
        </Field>
      </div>

      <Field
        label="Webhook URL"
        :error="settings.webhookUrl && !webhookInfo ? 'Not a Discord webhook URL' : undefined"
        :hint="selected ? `from saved webhook “${selected.name}”` : 'stored in this browser only'"
      >
        <div class="row row-nowrap">
          <input
            :value="settings.webhookUrl"
            :type="showUrl ? 'text' : 'password'"
            class="input grow"
            placeholder="https://discord.com/api/webhooks/…"
            autocomplete="off"
            spellcheck="false"
            @input="onUrlInput"
          />
          <button class="btn btn-ghost btn-sm" @click="showUrl = !showUrl">{{ showUrl ? "Hide" : "Show" }}</button>
          <button v-if="canManage && !selected && webhookInfo" class="btn btn-ghost btn-sm" title="Save this URL with a nickname" @click="emit('manage')">Save…</button>
        </div>
      </Field>
      </template>

      <div v-if="!isValid && showErrors" class="banner banner-error">
        <span>⚠</span>
        <span>Fix {{ errorCount }} validation {{ errorCount === 1 ? "issue" : "issues" }} before publishing.</span>
      </div>

      <div class="row row-between">
        <div v-if="multi" class="row">
          <button
            class="btn btn-success publish-many"
            :disabled="!destinations.length || !isValid || !!busy || !canPublish"
            :title="!canPublish ? 'You don\'t have permission to publish in this organization' : ''"
            @click="publishMany"
          >
            {{ busy === "send" ? "Publishing…" : `Publish to ${destinations.length} webhook${destinations.length === 1 ? "" : "s"}` }}
          </button>
        </div>
        <div v-else-if="grouped" class="row">
          <button class="btn btn-success" :disabled="!webhookInfo || !isValid || !!busy || !canPublish" @click="publish">
            {{ busy === "send" ? "Publishing…" : "Publish as new" }}
          </button>
          <button
            v-if="liveCopies.length"
            class="btn btn-primary update-all"
            :disabled="!isValid || !!busy || !canPublish"
            :title="canPublish ? 'Edit every copy on Discord' : 'You don\'t have permission to publish in this organization'"
            @click="updateAll"
          >
            {{ busy === "edit" ? "Updating…" : `Update all ${liveCopies.length} copies` }}
          </button>
          <button
            v-if="liveCopies.length"
            class="btn btn-danger delete-all"
            :disabled="!!busy || !canDelete"
            :title="canDelete ? '' : 'You don\'t have permission to delete messages in this organization'"
            @click="deleteAll"
          >
            {{ busy === "delete" ? "Deleting…" : "Delete all copies" }}
          </button>
        </div>
        <div v-else class="row">
          <button
            class="btn btn-success"
            :disabled="!webhookInfo || !isValid || !!busy || !canPublish"
            :title="!canPublish ? 'You don\'t have permission to publish in this organization' : !isValid && !showErrors ? 'Add some content or an embed first' : ''"
            @click="publish"
          >
            {{ busy === "send" ? "Publishing…" : published || deletedInfo ? "Publish as new" : "Publish" }}
          </button>
          <button
            v-if="published"
            class="btn btn-primary"
            :disabled="!canEditPublished || !isValid || !!busy || !canPublish"
            :title="!canPublish ? 'You don\'t have permission to publish in this organization' : canEditPublished ? '' : 'Set the webhook that originally published this message'"
            @click="update"
          >
            {{ busy === "edit" ? "Updating…" : "Update published" }}
          </button>
          <button
            v-if="published"
            class="btn btn-danger"
            :disabled="!canEditPublished || !!busy || !canDelete"
            :title="canDelete ? '' : 'You don\'t have permission to delete messages in this organization'"
            @click="remove"
          >
            {{ busy === "delete" ? "Deleting…" : "Delete from Discord" }}
          </button>
        </div>
      </div>

      <div v-if="grouped" class="group-copies">
        <div class="group-label">Published to {{ copies.length }} webhooks</div>
        <div class="draft-list">
          <div v-for="c in copies" :key="c.id" class="draft copy-item" :class="{ active: c.id === draft?.id }">
            <div class="grow">
              <div class="row">
                <span class="draft-name">{{ webhookForCopy(c)?.name ?? "Webhook not available to you" }}</span>
                <span v-if="getServer(c.serverId)" class="muted small">{{ getServer(c.serverId)!.name }}</span>
                <span v-if="c.published" class="tag tag-green">published</span>
                <span v-else-if="c.deleted" class="tag tag-red">deleted</span>
                <span v-if="c.id === draft?.id" class="tag">editing</span>
              </div>
              <div class="draft-meta">
                <template v-if="c.published">
                  {{ formatDateTime(c.published.updatedAt ?? c.published.publishedAt) }}
                  · <a :href="copyLink(c)" target="_blank" rel="noreferrer">open in Discord</a>
                </template>
                <template v-else-if="c.deleted">deleted {{ formatDateTime(c.deleted.deletedAt) }}</template>
              </div>
            </div>
            <div class="row row-nowrap">
              <button v-if="c.id !== draft?.id" class="btn btn-sm btn-ghost copy-open" @click="openCopy(c)">Open</button>
              <template v-if="c.published && webhookForCopy(c)">
                <button class="btn btn-sm btn-ghost copy-update" :disabled="!!busy || !canPublish || !isValid" @click="updateOne(c)">Update</button>
                <button class="btn btn-sm btn-danger copy-delete" :disabled="!!busy || !canDelete" @click="deleteOne(c)">✕</button>
              </template>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="published && !isDismissed(`published:${published.messageId}`)" class="banner banner-success small">
        <span>✓</span>
        <span>
          Published {{ formatDateTime(published.publishedAt) }}<template v-if="published.publishedBy"> by {{ published.publishedBy }}</template><template v-if="publishedVia"> via <strong>{{ publishedVia.name }}</strong></template> ·
          <template v-if="published.updatedAt">updated {{ formatDateTime(published.updatedAt) }}<template v-if="published.updatedBy"> by {{ published.updatedBy }}</template> · </template>
          message <code class="mono">{{ published.messageId }}</code> ·
          <a :href="publishedLink" target="_blank" rel="noreferrer">open in Discord</a>
          <template v-if="!canEditPublished"> · <span class="muted">different webhook configured, editing disabled</span></template>
        </span>
        <button class="banner-close" aria-label="Dismiss" title="Dismiss" @click="dismiss(`published:${published.messageId}`)">✕</button>
      </div>
      <div v-else-if="deletedInfo && !isDismissed(`deleted:${deletedInfo.messageId}`)" class="banner banner-info small deleted-banner">
        <span class="grow">
          Deleted from Discord {{ formatDateTime(deletedInfo.deletedAt) }}<template v-if="deletedInfo.deletedBy"> by {{ deletedInfo.deletedBy }}</template>.
          It was published {{ formatDateTime(deletedInfo.publishedAt) }}<template v-if="deletedInfo.publishedBy"> by {{ deletedInfo.publishedBy }}</template>.
          Publishing again creates a new message.
        </span>
        <button class="banner-close" aria-label="Dismiss" title="Dismiss" @click="dismiss(`deleted:${deletedInfo.messageId}`)">✕</button>
      </div>
    </div>
  </section>
</template>
