<script setup lang="ts">
import { ref, computed } from "vue";
import Modal from "./Modal.vue";
import Field from "./Field.vue";
import { savedWebhooks, addWebhook, updateWebhook, deleteWebhook, selectWebhook, type SavedWebhook } from "../stores/webhooks";
import { servers, addServer, updateServer, deleteServer, type Server } from "../stores/servers";
import { settings } from "../stores/settings";
import { parseWebhookUrl, maskWebhookUrl } from "../discord/webhook";
import { toast } from "../stores/toasts";

const emit = defineEmits<{ close: [] }>();

// --- servers -----------------------------------------------------------------

const serverForm = ref({ name: "", guildId: "" });
const editingServerId = ref<string | null>(null);
const showServerForm = ref(false);

function startEditServer(s: Server) {
  editingServerId.value = s.id;
  serverForm.value = { name: s.name, guildId: s.guildId };
  showServerForm.value = true;
}
function resetServerForm() {
  editingServerId.value = null;
  serverForm.value = { name: "", guildId: "" };
  showServerForm.value = false;
}
function saveServer() {
  if (!serverForm.value.name.trim()) return;
  if (editingServerId.value) {
    updateServer(editingServerId.value, serverForm.value);
    toast("success", "Server updated", serverForm.value.name);
  } else {
    const s = addServer(serverForm.value);
    toast("success", "Server added", s.name);
    // A new server is the obvious choice for the webhook being added.
    if (!editingId.value) form.value.serverId = s.id;
  }
  resetServerForm();
}
function removeServer(s: Server) {
  if (!confirm(`Delete server "${s.name}"? Its webhooks and drafts are kept but become unassigned.`)) return;
  deleteServer(s.id);
  if (editingServerId.value === s.id) resetServerForm();
}

// --- webhooks ------------------------------------------------------------------

// A hand-typed URL that isn't saved yet is offered as the starting point for a new entry.
const unsavedCurrent = computed(() => {
  const url = settings.value.webhookUrl;
  if (!url || settings.value.webhookId) return "";
  const info = parseWebhookUrl(url);
  if (!info) return "";
  return savedWebhooks.value.some((w) => w.url === info.url) ? "" : info.url;
});

const editingId = ref<string | null>(null);
const form = ref<{ name: string; description: string; url: string; serverId: string | null }>({
  name: "",
  description: "",
  url: unsavedCurrent.value,
  serverId: null,
});
const showUrl = ref(false);

const urlError = computed(() => (form.value.url && !parseWebhookUrl(form.value.url) ? "Not a Discord webhook URL" : ""));
const canSave = computed(() => !!form.value.name.trim() && !!form.value.url && !urlError.value);

/** Webhooks grouped by server, alphabetical, with ungrouped ones last. */
const groups = computed(() => {
  const out: { server: Server | null; webhooks: SavedWebhook[] }[] = [];
  for (const s of servers.value) {
    const hooks = savedWebhooks.value.filter((w) => w.serverId === s.id);
    out.push({ server: s, webhooks: hooks });
  }
  const loose = savedWebhooks.value.filter((w) => !w.serverId || !servers.value.some((s) => s.id === w.serverId));
  if (loose.length || !servers.value.length) out.push({ server: null, webhooks: loose });
  return out;
});

function startEdit(w: SavedWebhook) {
  editingId.value = w.id;
  form.value = { name: w.name, description: w.description, url: w.url, serverId: w.serverId };
}
function reset() {
  editingId.value = null;
  form.value = { name: "", description: "", url: "", serverId: null };
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
function onServerPick(e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  if (v === "__new__") {
    showServerForm.value = true;
    editingServerId.value = null;
    serverForm.value = { name: "", guildId: "" };
    (e.target as HTMLSelectElement).value = form.value.serverId ?? "";
    return;
  }
  form.value.serverId = v || null;
}
</script>

<template>
  <Modal title="Webhooks and servers" @close="emit('close')">
    <div class="stack">
      <section class="stack" style="--gap: 8px">
        <div class="row row-between">
          <h2 style="margin: 0">Servers <span class="muted" style="font-weight: 400">{{ servers.length }}</span></h2>
          <button v-if="!showServerForm" class="btn btn-sm" @click="showServerForm = true">+ Add server</button>
        </div>
        <p class="muted small" style="margin: 0">Group webhooks and drafts by Discord server. The server ID is optional and only used to build “open in Discord” links.</p>

        <form v-if="showServerForm" class="row row-nowrap server-form" @submit.prevent="saveServer">
          <input v-model="serverForm.name" class="input grow" placeholder="Server name" maxlength="60" required />
          <input v-model.trim="serverForm.guildId" class="input" style="max-width: 220px" placeholder="Discord server ID (optional)" inputmode="numeric" />
          <button type="submit" class="btn btn-primary btn-sm" :disabled="!serverForm.name.trim()">{{ editingServerId ? "Save" : "Add" }}</button>
          <button type="button" class="btn btn-ghost btn-sm" @click="resetServerForm">Cancel</button>
        </form>

        <div v-if="servers.length" class="draft-list">
          <div v-for="s in servers" :key="s.id" class="draft server-item">
            <div class="grow">
              <span class="draft-name">{{ s.name }}</span>
              <span class="draft-meta" style="margin-left: 8px">
                {{ savedWebhooks.filter((w) => w.serverId === s.id).length }} webhook{{ savedWebhooks.filter((w) => w.serverId === s.id).length === 1 ? "" : "s" }}<template v-if="s.guildId"> · id {{ s.guildId }}</template>
              </span>
            </div>
            <div class="row">
              <button class="btn btn-sm btn-ghost" @click="startEditServer(s)">Edit</button>
              <button class="btn btn-sm btn-danger" @click="removeServer(s)">✕</button>
            </div>
          </div>
        </div>
      </section>

      <hr class="divider" />

      <section class="stack" style="--gap: 8px">
        <h2 style="margin: 0">Webhooks <span class="muted" style="font-weight: 400">{{ savedWebhooks.length }}</span></h2>
        <div v-if="!savedWebhooks.length" class="empty" style="padding: 8px 0">
          No saved webhooks yet. Add one below and it becomes selectable in the publish panel.
        </div>
        <template v-for="g in groups" :key="g.server?.id ?? 'none'">
          <div v-if="g.webhooks.length" class="webhook-group">
            <div class="group-label">{{ g.server ? g.server.name : "No server" }}</div>
            <div class="draft-list">
              <div v-for="w in g.webhooks" :key="w.id" class="draft webhook-item" :class="{ active: w.id === settings.webhookId }">
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
          </div>
        </template>
      </section>

      <hr class="divider" />

      <form class="stack" @submit.prevent="save">
        <h2 style="margin: 0">{{ editingId ? "Edit webhook" : "Add webhook" }}</h2>
        <div class="grid-3">
          <Field label="Nickname" :count="form.name.length" :max="60">
            <input v-model="form.name" class="input" placeholder="e.g. Announcements" maxlength="60" required />
          </Field>
          <Field label="Description" hint="optional">
            <input v-model="form.description" class="input" placeholder="What this channel is for" maxlength="200" />
          </Field>
          <Field label="Server" hint="optional">
            <select class="input webhook-server-select" :value="form.serverId ?? ''" @change="onServerPick">
              <option value="">No server</option>
              <option v-for="s in servers" :key="s.id" :value="s.id">{{ s.name }}</option>
              <option value="__new__">+ New server…</option>
            </select>
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
