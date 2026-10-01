<script setup lang="ts">
import { ref, computed } from "vue";
import { settings, webhookInfo } from "../stores/settings";
import { savedWebhooks, getWebhook, selectWebhook, webhookByDiscordId } from "../stores/webhooks";
import { message, isValid, errors, currentDraftId } from "../stores/message";
import { getDraft, createDraft, updateDraftMessage, setDraftPublished } from "../stores/drafts";
import { sendMessage, editMessage, deleteMessage, messageLink, type DiscordApiError } from "../discord/webhook";
import { toast } from "../stores/toasts";
import { formatDateTime } from "../util";
import Field from "./Field.vue";

const emit = defineEmits<{ manage: [] }>();

const showUrl = ref(false);
const selected = computed(() => getWebhook(settings.value.webhookId));
const publishedVia = computed(() => webhookByDiscordId(published.value?.webhookId));

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

/** Make sure a draft exists so the publish can be tracked. */
function ensureDraft(): string {
  if (currentDraftId.value && getDraft(currentDraftId.value)) {
    updateDraftMessage(currentDraftId.value, message.value);
    return currentDraftId.value;
  }
  const first = message.value.embeds[0];
  const name =
    first?.title || message.value.content.split("\n")[0].slice(0, 60) || `Message ${new Date().toLocaleString()}`;
  const d = createDraft(name, message.value);
  currentDraftId.value = d.id;
  toast("info", "Draft saved", `Tracking this message as "${d.name}".`);
  return d.id;
}

async function publish() {
  if (!webhookInfo.value || !isValid.value) return;
  busy.value = "send";
  try {
    const ref = await sendMessage(settings.value.webhookUrl, message.value, {
      threadId: settings.value.threadId.trim() || undefined,
    });
    const id = ensureDraft();
    setDraftPublished(id, ref);
    toast("success", "Published", `Message ${ref.messageId} sent to Discord.`);
  } catch (e) {
    toast("error", "Publish failed", describe(e), 10000);
  } finally {
    busy.value = "";
  }
}

async function update() {
  if (!published.value || !canEditPublished.value || !isValid.value) return;
  busy.value = "edit";
  try {
    const ref = await editMessage(settings.value.webhookUrl, published.value, message.value);
    const id = ensureDraft();
    setDraftPublished(id, ref);
    toast("success", "Updated", `Message ${ref.messageId} edited on Discord.`);
  } catch (e) {
    toast("error", "Update failed", describe(e), 10000);
  } finally {
    busy.value = "";
  }
}

async function remove() {
  if (!published.value || !canEditPublished.value || !currentDraftId.value) return;
  if (!confirm("Delete the published message from Discord? The draft stays here.")) return;
  busy.value = "delete";
  try {
    await deleteMessage(settings.value.webhookUrl, published.value);
    setDraftPublished(currentDraftId.value, null);
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
        <Field label="Webhook" :hint="selected?.description || (savedWebhooks.length ? `${savedWebhooks.length} saved` : 'none saved yet')">
          <div class="row row-nowrap">
            <select class="input grow" :value="settings.webhookId ?? ''" @change="onPick">
              <option value="">Custom URL</option>
              <option v-for="w in savedWebhooks" :key="w.id" :value="w.id">{{ w.name }}</option>
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
          <button v-if="!selected && webhookInfo" class="btn btn-ghost btn-sm" title="Save this URL with a nickname" @click="emit('manage')">Save…</button>
        </div>
      </Field>

      <div v-if="!isValid" class="banner banner-error">
        <span>⚠</span>
        <span>Fix {{ errorCount }} validation {{ errorCount === 1 ? "issue" : "issues" }} before publishing.</span>
      </div>

      <div class="row row-between">
        <div class="row">
          <button class="btn btn-success" :disabled="!webhookInfo || !isValid || !!busy" @click="publish">
            {{ busy === "send" ? "Publishing…" : published ? "Publish as new" : "Publish" }}
          </button>
          <button v-if="published" class="btn btn-primary" :disabled="!canEditPublished || !isValid || !!busy" :title="canEditPublished ? '' : 'Set the webhook that originally published this message'" @click="update">
            {{ busy === "edit" ? "Updating…" : "Update published" }}
          </button>
          <button v-if="published" class="btn btn-danger" :disabled="!canEditPublished || !!busy" @click="remove">
            {{ busy === "delete" ? "Deleting…" : "Delete from Discord" }}
          </button>
        </div>
      </div>

      <div v-if="published" class="banner banner-success small">
        <span>✓</span>
        <span>
          Published {{ formatDateTime(published.publishedAt) }}<template v-if="publishedVia"> via <strong>{{ publishedVia.name }}</strong></template> ·
          message <code class="mono">{{ published.messageId }}</code> ·
          <a :href="messageLink(published)" target="_blank" rel="noreferrer">open in Discord</a>
          <template v-if="!canEditPublished"> · <span class="muted">different webhook configured, editing disabled</span></template>
        </span>
      </div>
    </div>
  </section>
</template>
