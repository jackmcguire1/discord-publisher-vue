<script setup lang="ts">
import { user, memberships, orgNames, activeOrgId, myInvites, switchOrg, acceptInvite, signOut, type Invite } from "../stores/session";
import { declineInvite } from "../stores/org";
import { toast } from "../stores/toasts";

async function join(i: Invite) {
  try {
    await acceptInvite(i);
    toast("success", `Joined ${i.orgName}`);
  } catch (e) {
    toast("error", "Could not join", (e as Error).message);
  }
}

async function decline(i: Invite) {
  try {
    await declineInvite(i);
  } catch (e) {
    toast("error", "Could not decline", (e as Error).message);
  }
}
</script>

<template>
  <div class="stack">
    <section class="row row-between">
      <div class="row">
        <span class="avatar avatar-lg">{{ (user?.email ?? "?").slice(0, 1).toUpperCase() }}</span>
        <div>
          <div class="draft-name account-email">{{ user?.email }}</div>
          <div class="muted small">Signed in with an email link</div>
        </div>
      </div>
      <button class="btn btn-sm" @click="signOut">Sign out</button>
    </section>

    <hr class="divider" />

    <section class="stack" style="--gap: 8px">
      <h2 style="margin: 0">Your organizations</h2>
      <div class="draft-list">
        <div v-for="m in memberships" :key="m.orgId" class="draft account-org" :class="{ active: m.orgId === activeOrgId }">
          <div class="grow">
            <span class="draft-name">{{ orgNames[m.orgId] || "…" }}</span>
            <span class="tag" style="margin-left: 8px">{{ m.role }}</span>
          </div>
          <span v-if="m.orgId === activeOrgId" class="tag tag-green">current</span>
          <button v-else class="btn btn-sm btn-ghost" @click="switchOrg(m.orgId)">Switch</button>
        </div>
      </div>
    </section>

    <section v-if="myInvites.length" class="stack" style="--gap: 8px">
      <h2 style="margin: 0">Invitations</h2>
      <div class="draft-list">
        <div v-for="i in myInvites" :key="i.orgId" class="draft invite-item">
          <div class="grow">
            <span class="draft-name">{{ i.orgName }}</span>
            <span class="tag" style="margin-left: 8px">{{ i.role }}</span>
          </div>
          <div class="row">
            <button class="btn btn-sm btn-primary" @click="join(i)">Join</button>
            <button class="btn btn-sm btn-ghost" @click="decline(i)">Decline</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
