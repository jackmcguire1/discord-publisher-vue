<script setup lang="ts">
import { ref, computed } from "vue";
import type { Embed } from "../discord/schema";
import { errors, errorAt, moveEmbed, duplicateEmbed, removeEmbed, addField } from "../stores/message";
import { colorIntToHex, colorHexToInt, isoToLocalInput, localInputToIso } from "../util";
import Field from "./Field.vue";
import EmbedFieldEditor from "./EmbedFieldEditor.vue";
import AuthorPicker from "./AuthorPicker.vue";
import type { Author } from "../stores/authors";

function applyAuthor(a: Author) {
  props.embed.author = {
    name: a.name,
    url: a.url || undefined,
    icon_url: a.avatarUrl || undefined,
  };
}

const props = defineProps<{ embed: Embed; index: number; total: number }>();

const open = ref(true);
const path = computed(() => `embeds.${props.index}`);

const heading = computed(
  () => props.embed.title || props.embed.author?.name || props.embed.description?.slice(0, 40) || `Embed ${props.index + 1}`
);

/** Does any error path start with this embed's prefix? Used to flag collapsed embeds. */
const hasError = computed(() => {
  const prefix = path.value + ".";
  return Object.keys(errors.value).some((k) => k.startsWith(prefix));
});

type Group = "author" | "footer" | "image" | "thumbnail";

/** Read a key from an optional nested object. */
function sub(group: Group, key: string): string {
  const g = props.embed[group] as Record<string, string | undefined> | undefined;
  return g?.[key] ?? "";
}

/** Write a key into an optional nested object, dropping the object once it is empty. */
function setSub(group: Group, key: string, value: string) {
  const current = { ...((props.embed[group] as Record<string, string | undefined>) ?? {}) };
  if (value) current[key] = value;
  else delete current[key];
  (props.embed as any)[group] = Object.keys(current).length ? current : undefined;
}

function setOptional(key: "title" | "description" | "url", value: string) {
  props.embed[key] = value || undefined;
}

const hexColor = computed({
  get: () => colorIntToHex(props.embed.color ?? 0x1f2225),
  set: (v: string) => (props.embed.color = colorHexToInt(v)),
});
const hexText = ref(props.embed.color !== undefined ? colorIntToHex(props.embed.color) : "");
function onHexText(v: string) {
  hexText.value = v;
  if (!v) { props.embed.color = undefined; return; }
  const n = colorHexToInt(v);
  if (n !== undefined) props.embed.color = n;
}
function onColorPicker(v: string) {
  hexColor.value = v;
  hexText.value = v;
}

const timestampLocal = computed({
  get: () => isoToLocalInput(props.embed.timestamp),
  set: (v: string) => (props.embed.timestamp = localInputToIso(v)),
});
function setNow() { props.embed.timestamp = new Date().toISOString(); }

function inputValue(e: Event) { return (e.target as HTMLInputElement).value; }
</script>

<template>
  <div class="card embed-card">
    <div class="card-header" @click="open = !open">
      <span class="card-accent" :style="{ background: embed.color !== undefined ? colorIntToHex(embed.color) : 'var(--border)' }" />
      <span class="chevron" :class="{ open }">▶</span>
      <span class="card-title">{{ heading }}</span>
      <span v-if="hasError" class="tag" style="color: #fa777c">errors</span>
      <div class="row" @click.stop>
        <button class="btn btn-icon btn-ghost" title="Move up" :disabled="index === 0" @click="moveEmbed(index, -1)">↑</button>
        <button class="btn btn-icon btn-ghost" title="Move down" :disabled="index === total - 1" @click="moveEmbed(index, 1)">↓</button>
        <button class="btn btn-icon btn-ghost" title="Duplicate" :disabled="total >= 10" @click="duplicateEmbed(index)">⧉</button>
        <button class="btn btn-icon btn-danger" title="Delete embed" @click="removeEmbed(index)">✕</button>
      </div>
    </div>

    <div v-if="open" class="card-body">
      <div class="grid-2">
        <Field label="Title" :error="errorAt(`${path}.title`)" :count="embed.title?.length ?? 0" :max="256">
          <input :value="embed.title ?? ''" class="input" @input="setOptional('title', inputValue($event))" />
        </Field>
        <Field label="Title URL" :error="errorAt(`${path}.url`)">
          <input :value="embed.url ?? ''" class="input" placeholder="https://" @input="setOptional('url', inputValue($event))" />
        </Field>
      </div>

      <Field label="Description" :error="errorAt(`${path}.description`)" :count="embed.description?.length ?? 0" :max="4096">
        <textarea :value="embed.description ?? ''" class="input" rows="4" @input="setOptional('description', inputValue($event))" />
      </Field>

      <div class="grid-2">
        <Field label="Colour" :error="errorAt(`${path}.color`)" hint="hex">
          <div class="color-input">
            <input type="color" :value="hexColor" @input="onColorPicker(inputValue($event))" />
            <input :value="hexText" class="input" placeholder="#5865F2" maxlength="7" @input="onHexText(inputValue($event))" />
            <button v-if="embed.color !== undefined" class="btn btn-sm btn-ghost" @click="embed.color = undefined; hexText = ''">Clear</button>
          </div>
        </Field>
        <Field label="Timestamp" :error="errorAt(`${path}.timestamp`)">
          <div class="row row-nowrap">
            <input v-model="timestampLocal" type="datetime-local" class="input grow" />
            <button class="btn btn-sm btn-ghost" @click="setNow">Now</button>
          </div>
        </Field>
      </div>

      <div class="row row-between">
        <h2 style="margin: 0">Author</h2>
        <AuthorPicker :current="{ name: embed.author?.name, url: embed.author?.url, avatarUrl: embed.author?.icon_url }" @apply="applyAuthor" />
      </div>
      <div class="grid-3">
        <Field label="Name" :error="errorAt(`${path}.author.name`)" :count="sub('author','name').length" :max="256">
          <input :value="sub('author', 'name')" class="input" @input="setSub('author', 'name', inputValue($event))" />
        </Field>
        <Field label="URL" :error="errorAt(`${path}.author.url`)">
          <input :value="sub('author', 'url')" class="input" placeholder="https://" @input="setSub('author', 'url', inputValue($event))" />
        </Field>
        <Field label="Icon URL" :error="errorAt(`${path}.author.icon_url`)">
          <input :value="sub('author', 'icon_url')" class="input" placeholder="https://" @input="setSub('author', 'icon_url', inputValue($event))" />
        </Field>
      </div>

      <h2>Images</h2>
      <div class="grid-2">
        <Field label="Image URL" :error="errorAt(`${path}.image.url`)">
          <input :value="sub('image', 'url')" class="input" placeholder="https://" @input="setSub('image', 'url', inputValue($event))" />
        </Field>
        <Field label="Thumbnail URL" :error="errorAt(`${path}.thumbnail.url`)">
          <input :value="sub('thumbnail', 'url')" class="input" placeholder="https://" @input="setSub('thumbnail', 'url', inputValue($event))" />
        </Field>
      </div>

      <h2>Footer</h2>
      <div class="grid-2">
        <Field label="Text" :error="errorAt(`${path}.footer.text`)" :count="sub('footer','text').length" :max="2048">
          <input :value="sub('footer', 'text')" class="input" @input="setSub('footer', 'text', inputValue($event))" />
        </Field>
        <Field label="Icon URL" :error="errorAt(`${path}.footer.icon_url`)">
          <input :value="sub('footer', 'icon_url')" class="input" placeholder="https://" @input="setSub('footer', 'icon_url', inputValue($event))" />
        </Field>
      </div>

      <div class="row row-between">
        <h2 style="margin: 0">Fields <span class="muted" style="font-weight: 400">{{ embed.fields.length }}/25</span></h2>
        <button class="btn btn-sm" :disabled="embed.fields.length >= 25" @click="addField(index)">+ Add field</button>
      </div>
      <div v-if="errorAt(`${path}.fields`)" class="field-error">{{ errorAt(`${path}.fields`) }}</div>
      <div class="stack" style="--gap: 8px">
        <EmbedFieldEditor
          v-for="(field, fi) in embed.fields"
          :key="field.id"
          :field="field"
          :embed-index="index"
          :index="fi"
          :total="embed.fields.length"
        />
      </div>
    </div>
  </div>
</template>
