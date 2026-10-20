import { WEBHOOK } from "../support/e2e";

describe("guest mode", () => {
  beforeEach(() => {
    cy.visitGuest();
    cy.stubDiscord();
  });

  it("uses the editor without signing in", () => {
    cy.get(".guest-bar").should("contain.text", "Guest");
    cy.get(".org-current").should("not.exist");
    cy.get(".avatar-btn").should("not.exist");
  });

  it("saves webhooks, authors and drafts in this browser and publishes", () => {
    cy.contains("button", "Manage").click();
    cy.get('.modal input[placeholder="e.g. Announcements"]').type("Guest hook", { delay: 0 });
    cy.get('.modal input[placeholder^="https://discord.com/api/webhooks"]').type(WEBHOOK, { delay: 0 });
    cy.contains(".modal button", "Add webhook").click();
    cy.toast("Webhook saved");
    cy.get("body").type("{esc}");

    cy.window().then((w) => cy.stub(w, "prompt").returns("Guest draft"));
    cy.contains("button", "Save draft").click();
    cy.toast("Draft saved");

    cy.publish();
    cy.wait("@send");

    cy.reload();
    cy.get("select.webhook-select").find("option:selected").should("have.text", "Guest hook");
    cy.openModal("Messages");
    cy.get(".draft-name").should("have.text", "Guest draft");
    cy.get(".draft .tag-green").should("have.text", "published");
  });

  it("opens and closes the sign-in screen", () => {
    cy.get(".nav-signin").click();
    cy.contains("button", "Email me a sign-in link").should("be.visible");
    cy.contains("button", "Continue as guest").click();
    cy.get(".discord-messages").should("exist");
  });

  it("imports guest data into an org after signing in", () => {
    cy.contains("button", "Manage").click();
    cy.get('.modal input[placeholder="e.g. Announcements"]').type("Guest hook", { delay: 0 });
    cy.get('.modal input[placeholder^="https://discord.com/api/webhooks"]').type(WEBHOOK, { delay: 0 });
    cy.contains(".modal button", "Add webhook").click();
    cy.get("body").type("{esc}");

    cy.signIn();
    cy.createOrg();
    cy.get(".legacy-banner").contains("Import…").click();
    cy.contains(".settings button", "Import into Test Org").click();
    cy.toast("Imported 1 item");
    cy.contains(".nav-link", "Editor").click();
    // The imported webhook is there to pick, but signing in cleared the guest's selection.
    cy.get("select.webhook-select").should("contain.text", "Guest hook");
    cy.get("select.webhook-select").find("option:selected").should("have.text", "Custom URL");

    // Signing out leaves a clean guest workspace; the data now lives in the org.
    cy.accountMenu("Sign out");
    cy.get(".guest-bar").should("be.visible");
    cy.get("select.webhook-select").find("option").should("have.length", 1);
  });
});
