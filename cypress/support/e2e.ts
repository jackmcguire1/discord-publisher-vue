// Shared helpers for the e2e suite.

export const WEBHOOK = "https://discord.com/api/webhooks/123456789012345678/abcDEF_test-token-xyz";
export const WEBHOOK_RE = /discord\.com\/api\/webhooks\/123456789012345678\/abcDEF_test-token-xyz/;

// The suite runs against the Firebase emulators (see `yarn test`).
const PROJECT = "demo-discord-publisher";
const AUTH_EMULATOR = `http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}`;
const FIRESTORE_EMULATOR = `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;
export const USER_EMAIL = "owner@example.com";

declare global {
  namespace Cypress {
    interface Chainable {
      /** Wipe the emulators and localStorage, sign in and land in a fresh org's editor. */
      visitClean(): Chainable<void>;
      /** Wipe localStorage and open the editor signed out. */
      visitGuest(): Chainable<void>;
      /** Wipe all emulator data (users and documents). */
      resetEmulators(): Chainable<void>;
      /** Sign in through the email-link flow, using the auth emulator's outbox. */
      signIn(email?: string): Chainable<void>;
      /** From the onboarding screen, create an org and wait for the editor. */
      createOrg(name?: string): Chainable<void>;
      /** Stub the three Discord webhook endpoints so no real request leaves the test. */
      stubDiscord(): Chainable<void>;
      /** Paste the test webhook URL into the publish panel. */
      setWebhook(url?: string): Chainable<void>;
      /** Open the navbar account menu and click an item by label. */
      accountMenu(item: string): Chainable<void>;
      /** Open a toolbar modal by its button label. */
      openModal(label: "JSON" | "cURL" | "Messages"): Chainable<void>;
      /** Assert a toast with the given title is showing. */
      toast(title: string): Chainable<JQuery<HTMLElement>>;
    }
  }
}

// The app keeps a persistent Firestore cache in IndexedDB, which Cypress
// doesn't clear between tests. Tests wipe the emulators and localStorage, so a
// leftover cache would describe data that no longer exists. Every visit starts
// from an empty cache, like a fresh browser. (Deletion is queued before the
// app opens the database, so the app waits for it.)
const FIRESTORE_CACHE_DB = `firestore/[DEFAULT]/${PROJECT}/main`;
Cypress.Commands.overwrite("visit", (originalVisit, url, options) => {
  const opts = (typeof url === "object" ? url : options ?? {}) as Partial<Cypress.VisitOptions>;
  const onBeforeLoad = opts.onBeforeLoad;
  const withReset = {
    ...opts,
    onBeforeLoad(win: Cypress.AUTWindow) {
      win.indexedDB.deleteDatabase(FIRESTORE_CACHE_DB);
      onBeforeLoad?.(win);
    },
  };
  return typeof url === "object" ? originalVisit(withReset as Cypress.VisitOptions) : originalVisit(url, withReset);
});

Cypress.Commands.add("resetEmulators", () => {
  cy.request("DELETE", FIRESTORE_EMULATOR);
  cy.request("DELETE", `${AUTH_EMULATOR}/accounts`);
});

Cypress.Commands.add("signIn", (email = USER_EMAIL) => {
  cy.visit("/");
  cy.get(".nav-signin").click();
  cy.get('input[type="email"]').clear().type(email, { delay: 0 });
  cy.contains("button", "Email me a sign-in link").click();
  cy.get(".sign-in-sent").should("contain.text", email);
  cy.request(`${AUTH_EMULATOR}/oobCodes`).then(({ body }) => {
    const codes = (body.oobCodes as { email: string; oobCode: string; requestType: string }[]).filter(
      (c) => c.email === email && c.requestType === "EMAIL_SIGNIN"
    );
    const code = codes[codes.length - 1].oobCode;
    cy.visit(`/?mode=signIn&oobCode=${code}&apiKey=demo-key`);
  });
  cy.contains("Loading…").should("not.exist");
  cy.get(".sign-in-sent").should("not.exist");
});

Cypress.Commands.add("createOrg", (name = "Test Org") => {
  cy.get('input[placeholder="e.g. My Community"]').type(name, { delay: 0 });
  cy.contains("button", "Create organization").click();
  cy.get(".discord-messages").should("exist");
});

Cypress.Commands.add("visitGuest", () => {
  cy.resetEmulators();
  cy.clearLocalStorage();
  cy.visit("/");
  cy.get(".guest-bar").should("be.visible");
  cy.get(".discord-messages").should("exist");
});

Cypress.Commands.add("visitClean", () => {
  cy.resetEmulators();
  cy.clearLocalStorage();
  cy.signIn();
  cy.createOrg();
});

Cypress.Commands.add("stubDiscord", () => {
  const message = { id: "999000111222333444", channel_id: "555666777888999000" };
  cy.intercept("POST", WEBHOOK_RE, { statusCode: 200, body: message }).as("send");
  cy.intercept("PATCH", WEBHOOK_RE, { statusCode: 200, body: message }).as("edit");
  cy.intercept("DELETE", WEBHOOK_RE, { statusCode: 204, body: "" }).as("delete");
  // Loading a published message pulls its current content from Discord.
  cy.intercept("GET", WEBHOOK_RE, { statusCode: 200, body: { ...message, content: "Live from Discord", embeds: [] } }).as("fetch");
});

Cypress.Commands.add("setWebhook", (url = WEBHOOK) => {
  cy.get('input[placeholder^="https://discord.com/api/webhooks"]').clear().type(url, { delay: 0 });
});

Cypress.Commands.add("accountMenu", (item) => {
  cy.get(".avatar-btn").click();
  cy.contains(".nav-menu-item", item).click();
});

Cypress.Commands.add("openModal", (label) => {
  cy.contains("button", label).click();
  cy.get(".modal").should("be.visible");
});

Cypress.Commands.add("toast", (title) => {
  return cy.get(".toast-title").contains(title).should("be.visible");
});
