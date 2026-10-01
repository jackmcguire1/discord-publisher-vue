<script setup lang="ts">
import { computed } from "vue";
import type { Message, Embed } from "../discord/schema";
import { toHTML } from "../discord/markdown";
import { colorIntToHex } from "../util";

const props = defineProps<{ message: Message }>();

const logo = `${import.meta.env.BASE_URL}logo.svg`;
const now = computed(() =>
  new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
);

const isEmpty = computed(
  () => !props.message.content && props.message.embeds.length === 0
);

function embedTimestamp(e: Embed): string {
  if (!e.timestamp) return "";
  const d = new Date(e.timestamp);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Discord lays inline fields out in rows of up to three. */
function fieldClass(e: Embed, index: number): string {
  const f = e.fields[index];
  if (!f.inline) return "discord-embed-field";
  let inlineBefore = 0;
  for (let i = 0; i < index; i++) if (e.fields[i].inline) inlineBefore++;
  return `discord-embed-field discord-embed-inline-field discord-embed-inline-field-${(inlineBefore % 3) + 1}`;
}

function visible(e: Embed): boolean {
  return !!(
    e.title || e.description || e.author?.name || e.footer?.text || e.timestamp ||
    e.fields.length || e.image?.url || e.thumbnail?.url
  );
}
</script>

<template>
  <div class="preview-frame">
    <div class="discord-messages" style="border: none; white-space: pre-wrap; word-wrap: break-word">
      <div class="discord-message">
        <div class="discord-message-inner">
          <div class="discord-author-avatar">
            <img :src="message.avatar_url || logo" alt="" @error="($event.target as HTMLImageElement).src = logo" />
          </div>
          <div class="discord-message-content">
            <span class="discord-author-info">
              <span class="discord-author-username">{{ message.username || "Discord Publisher" }}</span>
              <span class="discord-application-tag">APP</span>
            </span>
            <span class="discord-message-timestamp" style="padding-left: 4px">Today at {{ now }}</span>

            <div v-if="message.content" class="discord-message-body">
              <div class="discord-message-markup" v-html="toHTML(message.content)" />
            </div>
            <div v-else-if="isEmpty" class="preview-empty">Nothing to preview yet.</div>

            <div class="discord-message-compact-indent">
              <template v-for="embed in message.embeds" :key="embed.id">
                <div v-if="visible(embed)" class="discord-embed" style="overflow: hidden">
                  <div class="discord-left-border" :style="{ backgroundColor: embed.color !== undefined ? colorIntToHex(embed.color) : '#1f2225' }" />
                  <div class="discord-embed-root">
                    <div class="discord-embed-wrapper">
                      <div class="discord-embed-grid">
                        <div v-if="embed.author?.name" class="discord-embed-author" style="overflow: hidden; word-break: break-all">
                          <img v-if="embed.author.icon_url" :src="embed.author.icon_url" alt="" class="discord-author-image" />
                          <a v-if="embed.author.url" :href="embed.author.url" target="_blank" rel="noreferrer">{{ embed.author.name }}</a>
                          <template v-else>{{ embed.author.name }}</template>
                        </div>

                        <div v-if="embed.title" class="discord-embed-title" style="overflow: hidden; word-break: break-word">
                          <a v-if="embed.url" :href="embed.url" target="_blank" rel="noreferrer" v-html="toHTML(embed.title, { isTitle: true })" />
                          <span v-else v-html="toHTML(embed.title, { isTitle: true })" />
                        </div>

                        <div v-if="embed.description" class="discord-embed-description" v-html="toHTML(embed.description)" />

                        <div v-if="embed.fields.length" class="discord-embed-fields">
                          <div v-for="(field, fi) in embed.fields" :key="field.id" :class="fieldClass(embed, fi)">
                            <div class="discord-field-title" style="overflow: hidden; word-break: break-word" v-html="toHTML(field.name, { isTitle: true })" />
                            <div v-html="toHTML(field.value)" />
                          </div>
                        </div>

                        <div v-if="embed.image?.url" class="discord-embed-media">
                          <img :src="embed.image.url" alt="" class="discord-embed-image" />
                        </div>

                        <img v-if="embed.thumbnail?.url" :src="embed.thumbnail.url" alt="" class="discord-embed-thumbnail" />

                        <div v-if="embed.footer?.text || embed.timestamp" class="discord-embed-footer" style="overflow: hidden; word-break: break-word">
                          <img v-if="embed.footer?.icon_url" :src="embed.footer.icon_url" alt="" class="discord-footer-image" />
                          {{ embed.footer?.text }}
                          <div v-if="embed.footer?.text && embed.timestamp" class="discord-footer-separator">•</div>
                          <div v-if="embed.timestamp" style="flex: none">{{ embedTimestamp(embed) }}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
