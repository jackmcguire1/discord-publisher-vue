import { WEBHOOK, USER_EMAIL } from "../support/e2e";

const TEAMMATE = "teammate@example.com";

describe("sign-in and organizations", () => {
  it("signs in, creates an org and stays signed in across reloads", () => {
    cy.visitClean();
    cy.get(".org-current").should("have.text", "Test Org");
    cy.get(".avatar-btn").click();
    cy.get(".nav-menu .user-email").should("have.text", USER_EMAIL);
    cy.get(".nav-menu .nav-role").should("have.text", "owner");
    cy.get("body").type("{esc}");
    cy.reload();
    cy.get(".org-current").should("have.text", "Test Org");
    cy.accountMenu("Sign out");
    cy.get(".guest-bar").should("be.visible");
  });

  it("invites a teammate who joins as a member and shares the org's webhooks", () => {
    cy.visitClean();
    cy.contains("button", "Manage").click();
    cy.get('.modal input[placeholder="e.g. Announcements"]').type("Announcements", { delay: 0 });
    cy.get('.modal input[placeholder^="https://discord.com/api/webhooks"]').type(WEBHOOK, { delay: 0 });
    cy.contains(".modal button", "Add webhook").click();
    cy.toast("Webhook saved");
    cy.get("body").type("{esc}");

    cy.accountMenu("Members");
    cy.get(".invite-email").type(TEAMMATE, { delay: 0 });
    cy.contains(".settings button", "Invite").click();
    cy.get(".pending-invite").should("contain.text", TEAMMATE);

    // The invite link carries the address; opening it pre-fills sign-in.
    cy.window().then((w) => cy.stub(w.navigator.clipboard, "writeText").as("copy").resolves());
    cy.contains(".pending-invite", TEAMMATE).find(".copy-invite").click();
    cy.toast("Invite link copied");
    cy.get("@copy").should("have.been.calledWithMatch", /\?invite=teammate%40example\.com$/);
    cy.accountMenu("Sign out");
    cy.visit("/?invite=teammate%40example.com");
    cy.get(".invite-prefill").should("contain.text", TEAMMATE);
    cy.get('input[type="email"]').should("have.value", TEAMMATE);
    cy.location("search").should("eq", "");

    // Signing in with a different address finds nothing, and says why.
    cy.signIn("someone-else@example.com");
    cy.get(".no-invites").should("contain.text", "someone-else@example.com");
    cy.get(".invite-item").should("not.exist");
    cy.contains("button", "Sign out").click();

    cy.signIn(TEAMMATE);
    cy.contains(".invite-item", "Test Org").contains("button", "Join").click();
    cy.get(".discord-messages").should("exist");
    cy.get(".avatar-btn").click();
    cy.get(".nav-menu .nav-role").should("have.text", "member");
    cy.get("body").type("{esc}");

    // Members use shared webhooks but cannot change them.
    cy.get("select.webhook-select").find("option").should("contain.text", "Announcements");
    cy.contains("button", "Manage").click();
    cy.get(".modal .webhook-item").should("contain.text", "Announcements").find(".btn-danger").should("not.exist");
    cy.get(".admin-only-note").should("be.visible");
    cy.get("body").type("{esc}");

    cy.accountMenu("Members");
    cy.get(".member-item").should("have.length", 2);
    cy.get(".invite-email").should("not.exist");

    // Members can leave (Cypress accepts the confirm), landing back on the welcome screen cleanly.
    cy.contains(".settings-tab", "Organizations").click();
    cy.get(".delete-org").should("not.exist");
    cy.get(".leave-org").click();
    cy.toast("Left Test Org");
    cy.contains("h2", "Create an organization").should("be.visible");
    cy.get(".toast-error").should("not.exist");
  });

  it("imports webhooks and drafts saved in this browser before sign-in", () => {
    cy.resetEmulators();
    cy.clearLocalStorage();
    cy.window().then(() => {
      localStorage.setItem(
        "discord-publisher:webhooks",
        JSON.stringify([{ id: "legacy-hook", name: "Old hook", description: "", url: WEBHOOK, serverId: null, createdAt: "2026-01-01T00:00:00.000Z" }])
      );
      localStorage.setItem(
        "discord-publisher:drafts",
        JSON.stringify([
          {
            id: "legacy-draft",
            name: "Old draft",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            serverId: null,
            message: { content: "hello", tts: false, embeds: [] },
          },
        ])
      );
    });
    cy.signIn();
    cy.createOrg();
    cy.get(".legacy-banner").contains("Import…").click();
    cy.contains(".settings button", "Import into Test Org").click();
    cy.toast("Imported 2 items");
    cy.get(".legacy-import").should("not.exist");
    cy.contains(".nav-link", "Editor").click();
    cy.get(".legacy-banner").should("not.exist");
    cy.get("select.webhook-select").find("option").should("contain.text", "Old hook");
    cy.openModal("Messages");
    cy.get(".draft-name").should("have.text", "Old draft");
  });
});
