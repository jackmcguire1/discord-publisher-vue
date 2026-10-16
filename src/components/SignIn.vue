<script setup lang="ts">
import { ref } from "vue";
import Field from "./Field.vue";
import { sendSignInLink, signInOpen } from "../stores/session";
import { usingEmulators } from "../firebase";

const props = defineProps<{ error?: string | null; prefill?: string | null }>();

const email = ref(props.prefill ?? "");
const sentTo = ref("");
const sending = ref(false);
const failure = ref("");

async function send() {
  if (!email.value.trim()) return;
  sending.value = true;
  failure.value = "";
  try {
    await sendSignInLink(email.value);
    sentTo.value = email.value.trim();
  } catch (e) {
    failure.value = (e as Error).message;
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="gate">
    <div class="card gate-card">
      <div class="card-body stack">
        <div class="row row-between">
          <h1 style="margin: 0">Discord Publisher</h1>
          <button class="btn btn-ghost btn-sm" @click="signInOpen = false">Continue as guest</button>
        </div>
        <div v-if="error" class="banner banner-error">{{ error }}</div>

        <template v-if="sentTo">
          <div class="banner banner-success sign-in-sent">
            Check <strong>{{ sentTo }}</strong> for a sign-in link. Open it in this browser to continue.
          </div>
          <p v-if="usingEmulators" class="muted small" style="margin: 0">
            Emulator: the link is printed in the <code>yarn emulators</code> output, not emailed.
          </p>
          <button class="btn btn-ghost btn-sm" @click="sentTo = ''">Use a different email</button>
        </template>

        <form v-else class="stack" @submit.prevent="send">
          <div v-if="prefill" class="banner banner-info invite-prefill">
            You've been invited to an organization. Sign in as <strong>{{ prefill }}</strong> to join it.
          </div>
          <p class="muted small" style="margin: 0">
            Sign in with your email. We'll send you a link, no password needed. Signing in lets you create or join an
            organization and share webhooks, authors and drafts with it. Anything you saved as a guest can be imported.
          </p>
          <Field label="Email" :error="failure">
            <input v-model="email" type="email" class="input" placeholder="you@example.com" autocomplete="email" required />
          </Field>
          <button type="submit" class="btn btn-primary" :disabled="sending || !email.trim()">
            {{ sending ? "Sending…" : "Email me a sign-in link" }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
