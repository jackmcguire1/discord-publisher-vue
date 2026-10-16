<script setup lang="ts">
import { ref } from "vue";
import { user, activeOrgName, canManage } from "../stores/session";
import { members, pendingInvites, inviteMember, revokeInvite, setMemberRole, removeMember, type Member } from "../stores/org";
import { toast } from "../stores/toasts";

const invite = ref<{ email: string; role: "admin" | "member" }>({ email: "", role: "member" });

async function attempt(fn: () => Promise<unknown>, ok: string | null, fail: string) {
  try {
    await fn();
    if (ok) toast("success", ok);
    return true;
  } catch (e) {
    toast("error", fail, (e as Error).message);
    return false;
  }
}

async function sendInvite() {
  const email = invite.value.email.trim().toLowerCase();
  if (!email) return;
  if (members.value.some((m) => m.email === email)) {
    toast("info", "Already a member", email);
    return;
  }
  if (await attempt(() => inviteMember(email, invite.value.role), "Invite created", "Could not invite")) {
    invite.value.email = "";
  }
}

function changeRole(m: Member, e: Event) {
  const role = (e.target as HTMLSelectElement).value as "admin" | "member";
  attempt(() => setMemberRole(m.uid, role), null, "Could not change role");
}

function remove(m: Member) {
  if (!confirm(`Remove ${m.email} from ${activeOrgName.value}?`)) return;
  attempt(() => removeMember(m.uid), "Member removed", "Could not remove member");
}
</script>

<template>
  <div class="stack">
    <section class="stack" style="--gap: 8px">
      <h2 style="margin: 0">Members <span class="muted" style="font-weight: 400">{{ members.length }}</span></h2>
      <p class="muted small" style="margin: 0">
        Owners and admins manage webhooks, servers and people. Members publish with the shared webhooks and work on authors and drafts.
      </p>
      <div class="draft-list">
        <div v-for="m in members" :key="m.uid" class="draft member-item">
          <div class="grow">
            <span class="draft-name">{{ m.email }}</span>
            <span v-if="m.uid === user?.uid" class="tag" style="margin-left: 8px">you</span>
          </div>
          <div class="row row-nowrap">
            <select
              v-if="canManage && m.role !== 'owner' && m.uid !== user?.uid"
              class="input member-role"
              style="width: auto"
              :value="m.role"
              @change="changeRole(m, $event)"
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <span v-else class="tag member-role">{{ m.role }}</span>
            <button v-if="canManage && m.role !== 'owner' && m.uid !== user?.uid" class="btn btn-sm btn-danger" @click="remove(m)">✕</button>
          </div>
        </div>
      </div>
    </section>

    <template v-if="canManage">
      <hr class="divider" />
      <section class="stack" style="--gap: 8px">
        <h2 style="margin: 0">Invites</h2>
        <p class="muted small" style="margin: 0">Invited people join when they next sign in with that email address.</p>
        <div v-if="pendingInvites.length" class="draft-list">
          <div v-for="i in pendingInvites" :key="i.email" class="draft pending-invite">
            <div class="grow">
              <span class="draft-name">{{ i.email }}</span>
              <span class="tag" style="margin-left: 8px">{{ i.role }}</span>
            </div>
            <button class="btn btn-sm btn-ghost" @click="attempt(() => revokeInvite(i.email), 'Invite revoked', 'Could not revoke')">Revoke</button>
          </div>
        </div>
        <form class="row row-nowrap" @submit.prevent="sendInvite">
          <input v-model="invite.email" type="email" class="input grow invite-email" placeholder="teammate@example.com" required />
          <select v-model="invite.role" class="input invite-role" style="width: auto">
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" class="btn btn-primary btn-sm" :disabled="!invite.email.trim()">Invite</button>
        </form>
      </section>
    </template>
  </div>
</template>
