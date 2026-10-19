import { WEBHOOK } from "../support/e2e";

const TEAMMATE = "teammate@example.com";
const HOOK_B = "https://discord.com/api/webhooks/222222222222222222/server-b_token";
const HOOK_LOOSE = "https://discord.com/api/webhooks/333333333333333333/loose_token";
const urlInput = () => cy.get('.publish-panel input[placeholder^="https://discord.com/api/webhooks"]');

function addServer(name: string) {
  cy.get(".modal").within(() => {
    cy.contains("button", "+ Add server").click();
    cy.get('input[placeholder="Server name"]').type(name, { delay: 0 });
    cy.get(".server-form").contains("button", "Add").click();
  });
}

function addWebhook(name: string, url: string, server: string) {
  cy.get(".modal").within(() => {
    cy.get('input[placeholder="e.g. Announcements"]').clear().type(name, { delay: 0 });
    cy.get('input[placeholder^="https://discord.com/api/webhooks"]').clear().type(url, { delay: 0 });
    cy.get(".webhook-server-select").select(server);
    cy.contains("button", "Add webhook").click();
  });
}

describe("switching workspaces", () => {
  it("clears the webhook fields when switching org, but not on reload", () => {
    cy.visitClean();
    cy.setWebhook();
    cy.get('.publish-panel input[placeholder="Forum / thread id"]').type("123", { delay: 0 });
    cy.reload();
    urlInput().should("have.value", WEBHOOK);

    cy.accountMenu("Organizations");
    cy.contains("button", "+ New organization").click();
    cy.get(".new-org-form input").type("Other Org", { delay: 0 });
    cy.contains(".new-org-form button", "Create").click();
    cy.contains(".nav-link", "Editor").click();
    urlInput().should("have.value", "");
    cy.get('.publish-panel input[placeholder="Forum / thread id"]').should("have.value", "");
    cy.get("select.webhook-select").find("option:selected").should("have.text", "Custom URL");

    // Signing out to guest clears them too.
    cy.setWebhook();
    cy.accountMenu("Sign out");
    urlInput().should("have.value", "");
  });
});

describe("server access", () => {
  it("a member limited to one server only gets that server's webhooks", () => {
    cy.visitClean();
    cy.contains("button", "Manage").click();
    addServer("Server A");
    addServer("Server B");
    addWebhook("Hook A", WEBHOOK, "Server A");
    addWebhook("Hook B", HOOK_B, "Server B");
    addWebhook("Loose hook", HOOK_LOOSE, "No server");
    cy.get(".modal .webhook-item").should("have.length", 3);
    cy.get("body").type("{esc}");

    // Messages filed under each server (a draft is filed under its webhook's server), plus one unassigned.
    const saveAs = (name: string, hook: string) => {
      cy.get("select.webhook-select").select(hook);
      cy.window().then((w) => {
        (w.prompt as unknown as { restore?: () => void }).restore?.();
        cy.stub(w, "prompt").returns(name);
      });
      cy.contains("button", "Save draft").click();
      cy.toast("Draft saved");
      cy.contains("button", "New message").click();
    };
    saveAs("Msg A", "Hook A");
    saveAs("Msg B", "Hook B");
    saveAs("Msg loose", "Custom URL");

    cy.accountMenu("Members");
    cy.get(".invite-email").type(TEAMMATE, { delay: 0 });
    cy.get(".invite-servers .access-all").uncheck();
    cy.contains(".invite-servers .access-server", "Server A").find("input").check();
    cy.contains(".settings button", "Invite").click();
    cy.get(".pending-invite").should("contain.text", "Server A").and("not.contain.text", "Server B");
    cy.accountMenu("Sign out");

    cy.signIn(TEAMMATE);
    cy.contains(".invite-item", "Test Org").contains("button", "Join").click();
    cy.get(".discord-messages").should("exist");
    cy.get("select.webhook-select option").should("have.length", 2); // Custom URL + Hook A
    cy.get("select.webhook-select").should("contain.text", "Hook A").and("not.contain.text", "Hook B").and("not.contain.text", "Loose hook");
    cy.contains("button", "Manage").click();
    cy.get(".modal .server-item").should("have.length", 1).and("contain.text", "Server A");
    cy.get(".toast-error").should("not.exist");
    cy.get("body").type("{esc}");

    // Messages: their server's and unassigned ones, never Server B's.
    cy.contains(".nav-link", "Messages").click();
    cy.get(".messages-panel .draft-item").should("have.length", 2);
    cy.get(".messages-panel").should("contain.text", "Msg A").and("contain.text", "Msg loose").and("not.contain.text", "Msg B");
    cy.get(".toast-error").should("not.exist");
    cy.accountMenu("Sign out");

    // The owner widens access back to all servers.
    cy.signIn();
    cy.accountMenu("Members");
    cy.contains(".member-item", TEAMMATE).should("contain.text", "Server A");
    cy.contains(".member-item", TEAMMATE).find(".member-servers").click();
    cy.contains(".member-item", TEAMMATE).find(".access-all").check();
    cy.contains(".member-item", TEAMMATE).find(".member-permissions").should("contain.text", "all servers");
  });
});
