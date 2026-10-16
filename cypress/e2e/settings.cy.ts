import { WEBHOOK } from "../support/e2e";

describe("navigation and settings", () => {
  it("shows guests only the settings that live in this browser", () => {
    cy.visitGuest();
    cy.contains(".nav-link", "Settings").click();
    cy.get(".settings-tab").should("have.length", 2);
    cy.get('.settings-tab[data-tab="webhooks"]').should("have.class", "active");
    cy.get(".guest-settings-note").should("be.visible");

    // Org-only tabs bounce guests back to webhooks.
    cy.visit("/#/settings/members");
    cy.get('.settings-tab[data-tab="webhooks"]').should("have.class", "active");
  });

  it("manages webhooks from the settings page and uses one in the editor", () => {
    cy.visitClean();
    cy.contains(".nav-link", "Settings").click();
    cy.get(".settings-tab").should("have.length", 5);
    cy.get(".settings input[placeholder='e.g. Announcements']").type("From settings", { delay: 0 });
    cy.get(".settings input[placeholder^='https://discord.com/api/webhooks']").type(WEBHOOK, { delay: 0 });
    cy.contains(".settings button", "Add webhook").click();
    cy.toast("Webhook saved");
    cy.contains(".settings .webhook-item", "From settings").contains("button", "Use").should("be.disabled");

    cy.contains(".nav-link", "Editor").click();
    cy.get("select.webhook-select").find("option:selected").should("have.text", "From settings");
  });

  it("opens each section from the account menu and keeps the tab in the URL", () => {
    cy.visitClean();
    cy.accountMenu("Authors");
    cy.get(".settings-title").should("have.text", "Authors");
    cy.location("hash").should("eq", "#/settings/authors");

    cy.accountMenu("Organization");
    cy.get(".org-name-input").should("have.value", "Test Org");

    cy.accountMenu("Account");
    cy.get(".account-email").should("contain.text", "@");
    cy.get(".account-org").should("have.length", 1).and("contain.text", "current");

    cy.reload();
    cy.get(".settings-title").should("have.text", "Account");
  });

  it("renames the organization and the navbar follows", () => {
    cy.visitClean();
    cy.accountMenu("Organization");
    cy.get(".org-name-input").clear().type("Renamed Org", { delay: 0 });
    cy.contains(".settings button", "Rename").click();
    cy.toast("Organization renamed");
    cy.get(".org-current").should("have.text", "Renamed Org");
  });
});
