import { WEBHOOK, USER_EMAIL } from "../support/e2e";

const TEAMMATE = "teammate@example.com";

describe("sign-in and organizations", () => {
  it("asks for an email before showing the editor", () => {
    cy.resetEmulators();
    cy.clearLocalStorage();
    cy.visit("/");
    cy.contains("button", "Email me a sign-in link").should("be.visible");
    cy.get(".discord-messages").should("not.exist");
  });

  it("signs in, creates an org and stays signed in across reloads", () => {
    cy.visitClean();
    cy.get(".org-current").should("have.text", "Test Org");
    cy.get(".org-bar .tag").should("have.text", "owner");
    cy.get(".user-email").should("have.text", USER_EMAIL);
    cy.reload();
    cy.get(".org-current").should("have.text", "Test Org");
    cy.contains("button", "Sign out").click();
    cy.contains("button", "Email me a sign-in link").should("be.visible");
  });

  it("invites a teammate who joins as a member and shares the org's webhooks", () => {
    cy.visitClean();
    cy.contains("button", "Manage").click();
    cy.get('.modal input[placeholder="e.g. Announcements"]').type("Announcements", { delay: 0 });
    cy.get('.modal input[placeholder^="https://discord.com/api/webhooks"]').type(WEBHOOK, { delay: 0 });
    cy.contains(".modal button", "Add webhook").click();
    cy.toast("Webhook saved");
    cy.get("body").type("{esc}");

    cy.contains("button", "Organization").click();
    cy.get(".invite-email").type(TEAMMATE, { delay: 0 });
    cy.contains(".modal button", "Invite").click();
    cy.get(".pending-invite").should("contain.text", TEAMMATE);
    cy.get("body").type("{esc}");
    cy.contains("button", "Sign out").click();

    cy.signIn(TEAMMATE);
    cy.contains(".invite-item", "Test Org").contains("button", "Join").click();
    cy.get(".discord-messages").should("exist");
    cy.get(".org-bar .tag").should("have.text", "member");

    // Members use shared webhooks but cannot change them.
    cy.get("select.webhook-select").find("option").should("contain.text", "Announcements");
    cy.contains("button", "Manage").click();
    cy.get(".modal .webhook-item").should("contain.text", "Announcements").find(".btn-danger").should("not.exist");
    cy.get(".admin-only-note").should("be.visible");
    cy.get("body").type("{esc}");

    cy.contains("button", "Organization").click();
    cy.get(".member-item").should("have.length", 2);
    cy.get(".invite-email").should("not.exist");
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
    cy.get(".legacy-banner").contains("button", "Import…").click();
    cy.contains(".modal button", "Import into Test Org").click();
    cy.toast("Imported 2 items");
    cy.get(".legacy-banner").should("not.exist");
    cy.get("body").type("{esc}");
    cy.get("select.webhook-select").find("option").should("contain.text", "Old hook");
    cy.openModal("Drafts");
    cy.get(".draft-name").should("have.text", "Old draft");
  });
});
