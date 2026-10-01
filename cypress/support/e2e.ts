// Shared helpers for the e2e suite.

export const WEBHOOK = "https://discord.com/api/webhooks/123456789012345678/abcDEF_test-token-xyz";
export const WEBHOOK_RE = /discord\.com\/api\/webhooks\/123456789012345678\/abcDEF_test-token-xyz/;

declare global {
  namespace Cypress {
    interface Chainable {
      /** Visit the app with a clean localStorage. */
      visitClean(): Chainable<void>;
      /** Stub the three Discord webhook endpoints so no real request leaves the test. */
      stubDiscord(): Chainable<void>;
      /** Paste the test webhook URL into the publish panel. */
      setWebhook(url?: string): Chainable<void>;
      /** Open a toolbar modal by its button label. */
      openModal(label: "JSON" | "cURL" | "Drafts"): Chainable<void>;
      /** Assert a toast with the given title is showing. */
      toast(title: string): Chainable<JQuery<HTMLElement>>;
    }
  }
}

Cypress.Commands.add("visitClean", () => {
  cy.clearLocalStorage();
  cy.visit("/");
  cy.get(".discord-messages").should("exist");
});

Cypress.Commands.add("stubDiscord", () => {
  const message = { id: "999000111222333444", channel_id: "555666777888999000" };
  cy.intercept("POST", WEBHOOK_RE, { statusCode: 200, body: message }).as("send");
  cy.intercept("PATCH", WEBHOOK_RE, { statusCode: 200, body: message }).as("edit");
  cy.intercept("DELETE", WEBHOOK_RE, { statusCode: 204, body: "" }).as("delete");
});

Cypress.Commands.add("setWebhook", (url = WEBHOOK) => {
  cy.get('input[placeholder^="https://discord.com/api/webhooks"]').clear().type(url, { delay: 0 });
});

Cypress.Commands.add("openModal", (label) => {
  cy.contains("button", label).click();
  cy.get(".modal").should("be.visible");
});

Cypress.Commands.add("toast", (title) => {
  return cy.get(".toast-title").contains(title).should("be.visible");
});
