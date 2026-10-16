import { WEBHOOK } from "../support/e2e";

describe("dismissible banners", () => {
  it("closes the published banner for that message, and it stays closed after a reload", () => {
    cy.visitClean();
    cy.stubDiscord();
    cy.setWebhook();
    cy.contains("button", "Publish").click();
    cy.wait("@send");
    cy.get(".banner-success").should("contain.text", "open in Discord").find(".banner-close").click();
    cy.get(".banner-success").should("not.exist");
    // The published actions are still there; only the notice is gone.
    cy.contains("button", "Update published").should("exist");
    cy.reload();
    cy.contains("button", "Update published").should("exist");
    cy.get(".banner-success").should("not.exist");
  });

  it("remembers a closed guest note but brings the import prompt back next visit", () => {
    cy.visitGuest();
    cy.contains(".nav-link", "Settings").click();
    cy.get(".guest-settings-note .banner-close").click();
    cy.get(".guest-settings-note").should("not.exist");
    cy.reload();
    cy.get(".settings-tab").should("exist");
    cy.get(".guest-settings-note").should("not.exist");

    // Guest data, then sign in: the import prompt can be closed for now.
    cy.contains(".settings button", "+ Add server").should("exist");
    cy.get(".settings input[placeholder='e.g. Announcements']").type("Guest hook", { delay: 0 });
    cy.get(".settings input[placeholder^='https://discord.com/api/webhooks']").type(WEBHOOK, { delay: 0 });
    cy.contains(".settings button", "Add webhook").click();
    cy.signIn();
    cy.createOrg();
    cy.get(".legacy-banner .banner-close").click();
    cy.get(".legacy-banner").should("not.exist");
    cy.reload();
    cy.get(".legacy-banner").should("be.visible");
  });
});
