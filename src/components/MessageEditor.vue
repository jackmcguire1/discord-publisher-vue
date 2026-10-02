<script setup lang="ts">
import { message, errorAt, addEmbed } from "../stores/message";
import Field from "./Field.vue";
import EmbedEditor from "./EmbedEditor.vue";
import AuthorPicker from "./AuthorPicker.vue";
import type { Author } from "../stores/authors";

function applyIdentity(a: Author) {
  message.value.username = a.name || undefined;
  message.value.avatar_url = a.avatarUrl || undefined;
}

function inputValue(e: Event) { return (e.target as HTMLInputElement).value; }
</script>

<template>
  <div class="stack">
    <section>
      <div class="row row-between" style="margin-bottom: 8px">
        <h2 style="margin: 0">Webhook identity</h2>
        <AuthorPicker :current="{ name: message.username, avatarUrl: message.avatar_url }" @apply="applyIdentity" />
      </div>
      <div class="grid-2">
        <Field label="Username" :error="errorAt('username')" :count="message.username?.length ?? 0" :max="80">
          <input :value="message.username ?? ''" class="input" placeholder="Defaults to the webhook's name" @input="message.username = inputValue($event) || undefined" />
        </Field>
        <Field label="Avatar URL" :error="errorAt('avatar_url')">
          <input :value="message.avatar_url ?? ''" class="input" placeholder="https://" @input="message.avatar_url = inputValue($event) || undefined" />
        </Field>
      </div>
    </section>

    <section>
      <h2>Message</h2>
      <Field label="Content" :error="errorAt('content')" :count="message.content.length" :max="2000">
        <textarea v-model="message.content" class="input" rows="4" placeholder="Supports Discord markdown: **bold**, *italic*, `code`, > quotes, ||spoilers||, <t:timestamps>" />
      </Field>
      <label class="checkbox small" style="margin-top: 8px">
        <input v-model="message.tts" type="checkbox" /> Text-to-speech
      </label>
    </section>

    <section class="stack">
      <div class="row row-between">
        <h2 style="margin: 0">Embeds <span class="muted" style="font-weight: 400">{{ message.embeds.length }}/10</span></h2>
        <button class="btn btn-primary btn-sm" :disabled="message.embeds.length >= 10" @click="addEmbed">+ Add embed</button>
      </div>
      <div v-if="errorAt('embeds')" class="field-error">{{ errorAt('embeds') }}</div>
      <EmbedEditor
        v-for="(embed, i) in message.embeds"
        :key="embed.id"
        :embed="embed"
        :index="i"
        :total="message.embeds.length"
      />
    </section>
  </div>
</template>
