<script setup lang="ts">
import { ref, computed } from "vue";
import Modal from "./Modal.vue";
import Field from "./Field.vue";
import { savedWebhooks, addWebhook, updateWebhook, deleteWebhook, selectWebhook, type SavedWebhook } from "../stores/webhooks";
import { settings } from "../stores/settings";
import { parseWebhookUrl, maskWebhookUrl } from "../discord/webhook";
import { toast } from "../stores/toasts";

const emit = defineEmits<{ close: [] }>();

// A hand-typed URL that isn't saved yet is offered as the starting point for a new entry.
const unsavedCurrent = computed(() => {
  const url = settings.value.webhookUrl;
  if (!url || settings.value.webhookId) return "";
  const info = parseWebhookUrl(url);
  if (!info) return "";
  return savedWebhooks.value.some((w) => w.url === info.url) ? "" : info.url;
});

const editingId = ref<string | null>(null);
const form = ref({ name: "", description: "", url: unsavedCurrent.value });
const showUrl = ref(false);

const urlError = computed(() => (form.value.url && !parseWebhookUrl(form.value.url) ? "Not a Discord webhook URL" : ""));
const canSave = computed(() => !!form.value.name.trim() && !!form.value.url && !urlError.value);

function startEdit(w: SavedWebhook) {
  editingId.value = w.id;
  form.value = { name: w.name, description: w.description, url: w.url };
}

function reset() {
  editingId.value = null;
  form.value = { name: "", description: "", url: "" };
  showUrl.value = false;
}

function save() {
  if (!canSave.value) return;
  try {
    if (editingId.value) {
      updateWebhook(editingId.value, form.value);
      toast("success", "Webhook updated", form.value.name);
    } else {
      const w = addWebhook(form.value);
      if (!settings.value.webhookId) selectWebhook(w.id);
      toast("success", "Webhook saved", w.name);
    }
    reset();
  } catch (e) {
    toast("error", "Could not save webhook", (e as Error).message);
  }
}

function remove(w: SavedWebhook) {
  if (!confirm(`Delete saved webhook "${w.name}"? This does not delete it on Discord.`)) return;
  deleteWebhook(w.id);
  if (editingId.value === w.id) reset();
}

function use(w: SavedWebhook) {
  selectWebhook(w.id);
  toast("info", "Webhook selected", w.name);
  emit("close");
}
</script>

<template>
  <Modal title="Saved webhooks" @close="emit('close')">
    <div class="stack">
      <div v-if="!savedWebhooks.length && !editingId" class="empty" style="padding: 12px 0">
        No saved webhooks yet. Add one below and it becomes selectable in the publish panel.
      </div>

      <div v-else class="draft-list">
        <div v-for="w in savedWebhooks" :key="w.id" class="draft" :class="{ active: w.id === settings.webhookId }">
          <div class="grow">
            <div class="row">
              <span class="draft-name">{{ w.name }}</span>
              <span v-if="w.id === settings.webhookId" class="tag">selected</span>
            </div>
            <div v-if="w.description" class="draft-meta">{{ w.description }}</div>
            <div class="draft-meta mono">{{ maskWebhookUrl(w.url) }}</div>
          </div>
          <div class="row">
            <button class="btn btn-sm btn-primary" :disabled="w.id === settings.webhookId" @click="use(w)">Use</button>
            <button class="btn btn-sm btn-ghost" @click="startEdit(w)">Edit</button>
            <button class="btn btn-sm btn-danger" @click="remove(w)">✕</button>
          </div>
        </div>
      </div>

      <hr class="divider" />

      <form class="stack" @submit.prevent="save">
        <h2 style="margin: 0">{{ editingId ? "Edit webhook" : "Add webhook" }}</h2>
        <div class="grid-2">
          <Field label="Nickname" :count="form.name.length" :max="60">
            <input v-model="form.name" class="input" placeholder="e.g. Announcements" maxlength="60" required />
          </Field>
          <Field label="Description" hint="optional">
            <input v-model="form.description" class="input" placeholder="What this channel is for" maxlength="200" />
          </Field>
        </div>
        <Field label="Webhook URL" :error="urlError">
          <div class="row row-nowrap">
            <input
              v-model.trim="form.url"
              :type="showUrl ? 'text' : 'password'"
              class="input grow"
              placeholder="https://discord.com/api/webhooks/…"
              autocomplete="off"
              spellcheck="false"
              required
            />
            <button type="button" class="btn btn-ghost btn-sm" @click="showUrl = !showUrl">{{ showUrl ? "Hide" : "Show" }}</button>
          </div>
        </Field>
        <div class="row">
          <button type="submit" class="btn btn-primary" :disabled="!canSave">{{ editingId ? "Save changes" : "Add webhook" }}</button>
          <button v-if="editingId || form.name || form.url" type="button" class="btn btn-ghost" @click="reset">Cancel</button>
        </div>
      </form>
    </div>
  </Modal>
</template>
