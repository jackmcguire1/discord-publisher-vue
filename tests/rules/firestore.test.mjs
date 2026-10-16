// Security rules tests. Run with `yarn test:rules` (starts the emulators).
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

const ORG = "org1";
const WEBHOOK_URL = "https://discord.com/api/webhooks/123/abc-DEF_1";
const now = "2026-01-01T00:00:00.000Z";

let env;

const people = {
  owner: { uid: "owner", email: "owner@example.com" },
  admin: { uid: "admin", email: "admin@example.com" },
  member: { uid: "member", email: "member@example.com" },
  outsider: { uid: "outsider", email: "outsider@example.com" },
  invitee: { uid: "invitee", email: "invitee@example.com" },
  viewer: { uid: "viewer", email: "viewer@example.com" },
  deleter: { uid: "deleter", email: "deleter@example.com" },
};

/** Firestore as a signed-in user with a verified email (as email-link sign-in gives). */
function as(who, verified = true) {
  const p = people[who];
  return env.authenticatedContext(p.uid, { email: p.email, email_verified: verified }).firestore();
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-discord-publisher",
    firestore: { rules: readFileSync("firebase/firestore.rules", "utf8") },
  });
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "orgs", ORG), { name: "Org", ownerUid: "owner", createdAt: now });
    for (const role of ["owner", "admin", "member"]) {
      const p = people[role];
      await setDoc(doc(db, "orgs", ORG, "members", p.uid), { uid: p.uid, email: p.email, role, joinedAt: now });
    }
    // Members with explicit permissions: one who may not publish, one who may delete.
    await setDoc(doc(db, "orgs", ORG, "members", "viewer"), { uid: "viewer", email: people.viewer.email, role: "member", joinedAt: now, canPublish: false, canDelete: false });
    await setDoc(doc(db, "orgs", ORG, "members", "deleter"), { uid: "deleter", email: people.deleter.email, role: "member", joinedAt: now, canPublish: true, canDelete: true });
    await setDoc(doc(db, "orgs", ORG, "webhooks", "w1"), { name: "Hook", description: "", url: WEBHOOK_URL, serverId: null, createdAt: now });
    await setDoc(doc(db, "orgs", ORG, "invites", people.invitee.email), {
      email: people.invitee.email,
      role: "member",
      orgName: "Org",
      invitedBy: "owner",
      createdAt: now,
    });
  });
});

describe("org content", () => {
  it("members read webhooks, outsiders and signed-out users cannot", async () => {
    await assertSucceeds(getDoc(doc(as("member"), "orgs", ORG, "webhooks", "w1")));
    await assertFails(getDoc(doc(as("outsider"), "orgs", ORG, "webhooks", "w1")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "orgs", ORG, "webhooks", "w1")));
  });

  it("only admins write webhooks, and only valid Discord URLs", async () => {
    const hook = { name: "New", description: "", url: WEBHOOK_URL, serverId: null, createdAt: now };
    await assertFails(setDoc(doc(as("member"), "orgs", ORG, "webhooks", "w2"), hook));
    await assertSucceeds(setDoc(doc(as("admin"), "orgs", ORG, "webhooks", "w2"), hook));
    await assertFails(setDoc(doc(as("admin"), "orgs", ORG, "webhooks", "w3"), { ...hook, url: "https://evil.example/api/webhooks/1/x" }));
    await assertFails(deleteDoc(doc(as("member"), "orgs", ORG, "webhooks", "w1")));
    await assertSucceeds(deleteDoc(doc(as("owner"), "orgs", ORG, "webhooks", "w1")));
  });

  it("only admins create, edit and delete servers", async () => {
    const server = { name: "Main", guildId: "123", createdAt: now };
    await assertFails(setDoc(doc(as("member"), "orgs", ORG, "servers", "s1"), server));
    await assertSucceeds(setDoc(doc(as("admin"), "orgs", ORG, "servers", "s1"), server));
    await assertSucceeds(setDoc(doc(as("owner"), "orgs", ORG, "servers", "s2"), server));
    await assertSucceeds(updateDoc(doc(as("admin"), "orgs", ORG, "servers", "s1"), { name: "Renamed" }));
    await assertFails(updateDoc(doc(as("member"), "orgs", ORG, "servers", "s1"), { name: "Nope" }));
    await assertSucceeds(getDoc(doc(as("member"), "orgs", ORG, "servers", "s1")));
    await assertFails(deleteDoc(doc(as("member"), "orgs", ORG, "servers", "s1")));
    await assertSucceeds(deleteDoc(doc(as("admin"), "orgs", ORG, "servers", "s1")));
  });

  it("admins file webhooks under servers and edit them", async () => {
    await assertSucceeds(updateDoc(doc(as("admin"), "orgs", ORG, "webhooks", "w1"), { serverId: "s1", name: "Renamed" }));
    await assertSucceeds(updateDoc(doc(as("owner"), "orgs", ORG, "webhooks", "w1"), { serverId: null }));
    await assertFails(updateDoc(doc(as("member"), "orgs", ORG, "webhooks", "w1"), { name: "Nope" }));
  });

  it("members write drafts and authors; outsiders cannot", async () => {
    const draft = { name: "D", createdAt: now, updatedAt: now, serverId: null, message: { content: "hi", tts: false, embeds: [] } };
    await assertSucceeds(setDoc(doc(as("member"), "orgs", ORG, "drafts", "d1"), draft));
    await assertFails(setDoc(doc(as("outsider"), "orgs", ORG, "drafts", "d2"), draft));
    const author = { name: "A", url: "", avatarUrl: "", createdAt: now };
    await assertSucceeds(setDoc(doc(as("member"), "orgs", ORG, "authors", "a1"), author));
    await assertFails(setDoc(doc(as("outsider"), "orgs", ORG, "authors", "a2"), author));
  });
});

describe("creating orgs", () => {
  it("a verified user creates an org and becomes its owner in one batch", async () => {
    const db = as("outsider");
    const batch = writeBatch(db);
    batch.set(doc(db, "orgs", "org2"), { name: "Mine", ownerUid: "outsider", createdAt: now });
    batch.set(doc(db, "orgs", "org2", "members", "outsider"), { uid: "outsider", email: people.outsider.email, role: "owner", joinedAt: now });
    await assertSucceeds(batch.commit());
  });

  it("cannot claim ownership of an existing org", async () => {
    const db = as("outsider");
    await assertFails(
      setDoc(doc(db, "orgs", ORG, "members", "outsider"), { uid: "outsider", email: people.outsider.email, role: "owner", joinedAt: now })
    );
  });

  it("unverified emails cannot create orgs", async () => {
    const db = as("outsider", false);
    await assertFails(setDoc(doc(db, "orgs", "org3"), { name: "X", ownerUid: "outsider", createdAt: now }));
  });
});

describe("invites", () => {
  it("only admins invite, and never as owner", async () => {
    const invite = (email, role, invitedBy) => ({ email, role, orgName: "Org", invitedBy, createdAt: now });
    await assertFails(setDoc(doc(as("member"), "orgs", ORG, "invites", "x@example.com"), invite("x@example.com", "member", "member")));
    await assertSucceeds(setDoc(doc(as("admin"), "orgs", ORG, "invites", "x@example.com"), invite("x@example.com", "member", "admin")));
    await assertFails(setDoc(doc(as("admin"), "orgs", ORG, "invites", "y@example.com"), invite("y@example.com", "owner", "admin")));
  });

  it("the invitee sees their invite via a collection group query", async () => {
    const db = as("invitee");
    const snap = await assertSucceeds(getDocs(query(collectionGroup(db, "invites"), where("email", "==", people.invitee.email))));
    if (snap.size !== 1) throw new Error(`expected 1 invite, got ${snap.size}`);
    await assertFails(getDocs(query(collectionGroup(as("outsider"), "invites"), where("email", "==", people.invitee.email))));
  });

  it("the invitee joins with the invited role and removes the invite", async () => {
    const db = as("invitee");
    const batch = writeBatch(db);
    batch.set(doc(db, "orgs", ORG, "members", "invitee"), { uid: "invitee", email: people.invitee.email, role: "member", joinedAt: now });
    batch.delete(doc(db, "orgs", ORG, "invites", people.invitee.email));
    await assertSucceeds(batch.commit());
  });

  it("the invitee cannot upgrade their own role", async () => {
    await assertFails(
      setDoc(doc(as("invitee"), "orgs", ORG, "members", "invitee"), { uid: "invitee", email: people.invitee.email, role: "admin", joinedAt: now })
    );
  });

  it("someone without an invite cannot join", async () => {
    await assertFails(
      setDoc(doc(as("outsider"), "orgs", ORG, "members", "outsider"), { uid: "outsider", email: people.outsider.email, role: "member", joinedAt: now })
    );
  });

  it("an unverified email cannot use the invite", async () => {
    await assertFails(
      setDoc(doc(as("invitee", false), "orgs", ORG, "members", "invitee"), { uid: "invitee", email: people.invitee.email, role: "member", joinedAt: now })
    );
  });
});

describe("membership management", () => {
  it("admins change member roles, but not the owner's or their own", async () => {
    await assertSucceeds(updateDoc(doc(as("admin"), "orgs", ORG, "members", "member"), { role: "admin" }));
    await assertFails(updateDoc(doc(as("admin"), "orgs", ORG, "members", "owner"), { role: "member" }));
    await assertFails(updateDoc(doc(as("member"), "orgs", ORG, "members", "member"), { role: "admin" }));
    await assertFails(updateDoc(doc(as("admin"), "orgs", ORG, "members", "member"), { role: "owner" }));
  });

  it("admins remove members, members leave, the owner stays", async () => {
    await assertFails(deleteDoc(doc(as("member"), "orgs", ORG, "members", "admin")));
    await assertSucceeds(deleteDoc(doc(as("member"), "orgs", ORG, "members", "member")));
    await assertFails(deleteDoc(doc(as("admin"), "orgs", ORG, "members", "owner")));
    await assertFails(deleteDoc(doc(as("owner"), "orgs", ORG, "members", "owner")));
  });

  it("a user lists only their own memberships", async () => {
    await assertSucceeds(getDocs(query(collectionGroup(as("member"), "members"), where("uid", "==", "member"))));
    await assertFails(getDocs(query(collectionGroup(as("outsider"), "members"), where("uid", "==", "member"))));
  });

  it("only admins rename the org, and nobody changes its owner", async () => {
    await assertFails(updateDoc(doc(as("member"), "orgs", ORG), { name: "Hijacked" }));
    await assertSucceeds(updateDoc(doc(as("admin"), "orgs", ORG), { name: "Renamed" }));
    await assertFails(updateDoc(doc(as("admin"), "orgs", ORG), { ownerUid: "admin" }));
  });
});

describe("deleting an org", () => {
  async function seedContent() {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "orgs", ORG, "drafts", "d1"), { name: "D", message: {} });
      await setDoc(doc(db, "orgs", ORG, "servers", "s1"), { name: "S", guildId: "" });
    });
  }

  it("an admin flags the org, clears it and deletes it, removing their own membership last", async () => {
    await seedContent();
    const db = as("admin");
    await assertFails(deleteDoc(doc(db, "orgs", ORG))); // not flagged yet
    await assertSucceeds(updateDoc(doc(db, "orgs", ORG), { deleting: true }));
    for (const [col, id] of [["drafts", "d1"], ["servers", "s1"], ["webhooks", "w1"], ["invites", people.invitee.email]]) {
      await assertSucceeds(deleteDoc(doc(db, "orgs", ORG, col, id)));
    }
    await assertSucceeds(deleteDoc(doc(db, "orgs", ORG, "members", "owner")));
    await assertSucceeds(deleteDoc(doc(db, "orgs", ORG, "members", "member")));
    await assertSucceeds(deleteDoc(doc(db, "orgs", ORG)));
    await assertSucceeds(deleteDoc(doc(db, "orgs", ORG, "members", "admin")));
  });

  it("members cannot flag, delete or remove the owner during deletion", async () => {
    await assertFails(updateDoc(doc(as("member"), "orgs", ORG), { deleting: true }));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "orgs", ORG), { deleting: true }));
    await assertFails(deleteDoc(doc(as("member"), "orgs", ORG)));
    await assertFails(deleteDoc(doc(as("member"), "orgs", ORG, "members", "owner")));
    await assertFails(deleteDoc(doc(as("outsider"), "orgs", ORG)));
  });

  it("the owner's membership stays protected unless the org is being deleted", async () => {
    await assertFails(deleteDoc(doc(as("admin"), "orgs", ORG, "members", "owner")));
  });

  it("the deleting flag can't be smuggled in with a rename", async () => {
    await assertFails(updateDoc(doc(as("admin"), "orgs", ORG), { name: "X", deleting: true }));
    await assertFails(updateDoc(doc(as("admin"), "orgs", ORG), { deleting: false }));
  });
});

describe("messages: publish and delete permissions", () => {
  const ref = { messageId: "m1", channelId: "c1", webhookId: "123", publishedAt: now };
  const draft = { name: "D", createdAt: now, updatedAt: now, serverId: null, message: { content: "hi", embeds: [] } };
  const published = { ...draft, published: ref };

  async function seed(data) {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "orgs", ORG, "drafts", "d1"), data));
  }

  it("every member edits and removes plain drafts", async () => {
    await assertSucceeds(setDoc(doc(as("viewer"), "orgs", ORG, "drafts", "d1"), draft));
    await assertSucceeds(updateDoc(doc(as("viewer"), "orgs", ORG, "drafts", "d1"), { name: "Renamed" }));
    await assertSucceeds(deleteDoc(doc(as("viewer"), "orgs", ORG, "drafts", "d1")));
  });

  it("publishing needs canPublish (on by default)", async () => {
    await seed(draft);
    await assertFails(updateDoc(doc(as("viewer"), "orgs", ORG, "drafts", "d1"), { published: ref }));
    await assertSucceeds(updateDoc(doc(as("member"), "orgs", ORG, "drafts", "d1"), { published: ref }));
    await assertFails(setDoc(doc(as("viewer"), "orgs", ORG, "drafts", "d2"), published));
    await assertSucceeds(setDoc(doc(as("member"), "orgs", ORG, "drafts", "d2"), published));
  });

  it("updating a published message needs canPublish; editing its other fields doesn't", async () => {
    await seed(published);
    await assertFails(updateDoc(doc(as("viewer"), "orgs", ORG, "drafts", "d1"), { published: { ...ref, updatedAt: now } }));
    await assertSucceeds(updateDoc(doc(as("viewer"), "orgs", ORG, "drafts", "d1"), { name: "Renamed" }));
    await assertSucceeds(updateDoc(doc(as("member"), "orgs", ORG, "drafts", "d1"), { published: { ...ref, updatedAt: now } }));
  });

  it("deleting from Discord needs canDelete (off by default)", async () => {
    await seed(published);
    const markDeleted = { published: null, deleted: { ...ref, deletedAt: now } };
    await assertFails(updateDoc(doc(as("member"), "orgs", ORG, "drafts", "d1"), markDeleted));
    await assertFails(updateDoc(doc(as("member"), "orgs", ORG, "drafts", "d1"), { published: null }));
    await assertSucceeds(updateDoc(doc(as("deleter"), "orgs", ORG, "drafts", "d1"), markDeleted));
  });

  it("removing a published or deleted message from the org needs canDelete", async () => {
    await seed(published);
    await assertFails(deleteDoc(doc(as("member"), "orgs", ORG, "drafts", "d1")));
    await assertSucceeds(deleteDoc(doc(as("deleter"), "orgs", ORG, "drafts", "d1")));
    await seed({ ...draft, deleted: { ...ref, deletedAt: now } });
    await assertFails(deleteDoc(doc(as("member"), "orgs", ORG, "drafts", "d1")));
    await assertSucceeds(deleteDoc(doc(as("admin"), "orgs", ORG, "drafts", "d1")));
  });

  it("admins set member permissions; members can't grant themselves any", async () => {
    await assertSucceeds(updateDoc(doc(as("admin"), "orgs", ORG, "members", "member"), { canDelete: true }));
    await assertFails(updateDoc(doc(as("viewer"), "orgs", ORG, "members", "viewer"), { canPublish: true }));
    await assertFails(updateDoc(doc(as("admin"), "orgs", ORG, "members", "member"), { canDelete: "yes" }));
  });

  it("an invitee joins with exactly the invited permissions", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), "orgs", ORG, "invites", people.invitee.email), { canPublish: false, canDelete: false })
    );
    const member = { uid: "invitee", email: people.invitee.email, role: "member", joinedAt: now };
    await assertFails(setDoc(doc(as("invitee"), "orgs", ORG, "members", "invitee"), { ...member, canPublish: true, canDelete: false }));
    await assertFails(setDoc(doc(as("invitee"), "orgs", ORG, "members", "invitee"), member)); // missing flags default to publish=true
    await assertSucceeds(setDoc(doc(as("invitee"), "orgs", ORG, "members", "invitee"), { ...member, canPublish: false, canDelete: false }));
  });
});
