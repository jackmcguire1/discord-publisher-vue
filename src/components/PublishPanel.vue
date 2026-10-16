<script setup lang="ts">
import { ref, computed } from "vue";
import { settings, webhookInfo } from "../stores/settings";
import { savedWebhooks, getWebhook, selectWebhook, webhookByDiscordId, selectedWebhookServerId } from "../stores/webhooks";
import { servers, getServer, guildIdFor } from "../stores/servers";
import { message, isValid, errors, currentDraftId, markClean } from "../stores/message";
import { getDraft, createDraft, updateDraftMessage, setDraftServer, markPublished, markUpdated, markDeleted } from "../stores/drafts";
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
const webhookGroups = computed(() =>
  servers.value
    .map((s) => ({ server: s, webhooks: savedWebhooks.value.filter((w) => w.serverId === s.id) }))
    .filter((g) => g.webhooks.length)
);
const ungroupedWebhooks = computed(() =>
  savedWebhooks.value.filter((w) => !w.serverId || !getServer(w.serverId))
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
function ensureDraft(): string {
  const existing = getDraft(currentDraftId.value);
  if (currentDraftId.value && existing && !existing.published && !existing.deleted) {
    // The publish that follows records the revision.
    updateDraftMessage(currentDraftId.value, message.value, { revision: false });
    // File an unassigned draft under the server of the webhook it was published through.
    if (!existing.serverId && selectedWebhookServerId()) setDraftServer(currentDraftId.value, selectedWebhookServerId());
    return currentDraftId.value;
  }
  const first = message.value.embeds[0];
  const name =
    first?.title || message.value.content.split("\n")[0].slice(0, 60) || `Message ${new Date().toLocaleString()}`;
  const d = createDraft(existing?.name ?? name, message.value, existing?.serverId ?? selectedWebhookServerId(), { revision: false });
  currentDraftId.value = d.id;
  if (!existing) toast("info", "Draft saved", `Tracking this message as "${d.name}".`);
  return d.id;
}

async function publish() {
  if (!webhookInfo.value || !isValid.value || !canPublish.value) return;
  busy.value = "send";
  try {
    const ref = await sendMessage(settings.value.webhookUrl, message.value, {
      threadId: settings.value.threadId.trim() || undefined,
    });
    const id = ensureDraft();
    markPublished(id, ref, message.value, settings.value.webhookId);
    markClean();
    toast("success", "Published", `Message ${ref.messageId} sent to Discord.`);
  } catch (e) {
    toast("error", "Publish failed", describe(e), 10000);
  } finally {
    busy.value = "";
  }
}

async function update() {
  if (!published.value || !canEditPublished.value || !isValid.value || !canPublish.value || !currentDraftId.value) return;
  busy.value = "edit";
  try {
    const ref = await editMessage(settings.value.webhookUrl, published.value, message.value);
    markUpdated(currentDraftId.value, ref, message.value);
    markClean();
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
  try {
    await deleteMessage(settings.value.webhookUrl, published.value);
    markDeleted(currentDraftId.value);
    toast("success", "Deleted", "The message was removed from Discord.");
  } catch (e) {
    toast("error", "Delete failed", describe(e), 10000);
  } finally {
    busy.value = "";
  }
}
</script>

<template>
  <section class="card">
    <div class="card-body" style="border-top: none">
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

      <div v-if="!isValid" class="banner banner-error">
        <span>⚠</span>
        <span>Fix {{ errorCount }} validation {{ errorCount === 1 ? "issue" : "issues" }} before publishing.</span>
      </div>

      <div class="row row-between">
        <div class="row">
          <button
            class="btn btn-success"
            :disabled="!webhookInfo || !isValid || !!busy || !canPublish"
            :title="canPublish ? '' : 'You don\'t have permission to publish in this organization'"
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

      <div v-if="published && !isDismissed(`published:${published.messageId}`)" class="banner banner-success small">
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
