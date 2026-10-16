<script setup lang="ts">
import { ref } from "vue";
import Field from "./Field.vue";
import { user, myInvites, createOrg, acceptInvite, signOut, type Invite } from "../stores/session";
import { declineInvite } from "../stores/org";
import { isDismissed, dismiss } from "../stores/dismissed";
import { toast } from "../stores/toasts";

// Shown when a signed-in user belongs to no organization yet: accept an
// invite, or start a new org.

const name = ref("");
const busy = ref(false);

async function run(fn: () => Promise<unknown>, failTitle: string) {
  busy.value = true;
  try {
    await fn();
  } catch (e) {
    toast("error", failTitle, (e as Error).message);
  } finally {
    busy.value = false;
  }
}

const create = () => run(() => createOrg(name.value), "Could not create organization");
const accept = (i: Invite) => run(() => acceptInvite(i), "Could not accept invite");
const decline = (i: Invite) => run(() => declineInvite(i), "Could not decline invite");
</script>

<template>
  <div class="gate">
    <div class="card gate-card">
      <div class="card-body stack">
        <div class="row row-between">
          <h1 style="margin: 0">Welcome</h1>
          <button class="btn btn-ghost btn-sm" @click="signOut">Sign out</button>
        </div>
        <p class="muted small" style="margin: 0">Signed in as {{ user?.email }}</p>

        <section v-if="myInvites.length" class="stack" style="--gap: 8px">
          <h2 style="margin: 0">You've been invited</h2>
          <div class="draft-list">
            <div v-for="i in myInvites" :key="i.orgId" class="draft invite-item">
              <div class="grow">
                <span class="draft-name">{{ i.orgName }}</span>
                <span class="tag" style="margin-left: 8px">{{ i.role }}</span>
              </div>
              <div class="row">
                <button class="btn btn-sm btn-primary" :disabled="busy" @click="accept(i)">Join</button>
                <button class="btn btn-sm btn-ghost" :disabled="busy" @click="decline(i)">Decline</button>
              </div>
            </div>
          </div>
          <hr class="divider" />
        </section>
        <div v-else-if="!isDismissed('no-invites')" class="banner banner-info no-invites">
          <span class="grow">
            No invitations for <strong>{{ user?.email }}</strong>. If someone invited you, check they used exactly this
            address (including anything after a +), or ask them for the invite link.
          </span>
          <button class="banner-close" aria-label="Dismiss" title="Dismiss" @click="dismiss('no-invites', { persist: false })">✕</button>
        </div>

        <form class="stack" @submit.prevent="create">
          <h2 style="margin: 0">Create an organization</h2>
          <p class="muted small" style="margin: 0">Webhooks, authors, servers and drafts are shared with everyone in the organization.</p>
          <Field label="Organization name">
            <input v-model="name" class="input" placeholder="e.g. My Community" maxlength="100" required />
          </Field>
          <button type="submit" class="btn btn-primary" :disabled="busy || !name.trim()">Create organization</button>
        </form>
      </div>
    </div>
  </div>
</template>
