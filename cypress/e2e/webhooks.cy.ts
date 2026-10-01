import { WEBHOOK } from "../support/e2e";

const SECOND = "https://discord.com/api/webhooks/222222222222222222/second-token_ABC";

function addWebhook(name: string, description: string, url: string) {
  cy.get(".modal").within(() => {
    cy.get('input[placeholder="e.g. Announcements"]').clear().type(name, { delay: 0 });
    cy.get('input[placeholder="What this channel is for"]').clear();
    if (description) cy.get('input[placeholder="What this channel is for"]').type(description, { delay: 0 });
    cy.get('input[placeholder^="https://discord.com/api/webhooks"]').clear().type(url, { delay: 0 });
    cy.contains("button", "Add webhook").click();
  });
}

describe("saved webhooks", () => {
  beforeEach(() => {
    cy.visitClean();
    cy.stubDiscord();
  });

  it("starts with only the custom URL option", () => {
    cy.get("select.input option").should("have.length", 1).and("contain.text", "Custom URL");
    cy.contains(".field-label", "Webhook").should("contain.text", "none saved yet");
  });

  it("adds a webhook, auto-selects it and publishes through it", () => {
    cy.contains("button", "Manage").click();
    addWebhook("Announcements", "Main server #announcements", WEBHOOK);
    cy.toast("Webhook saved");
    cy.get(".modal .draft").should("have.length", 1).and("contain.text", "Announcements").and("contain.text", "Main server");
    cy.get(".modal .draft .tag").should("contain.text", "selected");
    cy.get("body").type("{esc}");

    cy.get("select.input").find("option:selected").should("have.text", "Announcements");
    cy.contains(".field-label", "Webhook").should("contain.text", "Main server #announcements");
    cy.contains(".field-label", "Webhook URL").should("contain.text", "from saved webhook");
    cy.get('input[placeholder^="https://discord.com/api/webhooks"]').should("have.value", WEBHOOK);

    cy.contains("button", "Publish").click();
    cy.wait("@send").its("request.url").should("include", "123456789012345678/abcDEF_test-token-xyz");
    cy.contains(".banner-success", "via").should("contain.text", "Announcements");
  });

  it("switches between saved webhooks and custom URL", () => {
    cy.contains("button", "Manage").click();
    addWebhook("Announcements", "", WEBHOOK);
    addWebhook("Staff", "Private staff channel", SECOND);
    cy.get(".modal .draft").should("have.length", 2);
    cy.get("body").type("{esc}");

    cy.get("select.input").find("option").should("have.length", 3);
    cy.get("select.input").select("Staff");
    cy.get('input[placeholder^="https://discord.com/api/webhooks"]').should("have.value", SECOND);
    cy.contains(".field-label", "Webhook").should("contain.text", "Private staff channel");

    // Typing a URL by hand detaches from the saved entry.
    cy.setWebhook("https://discord.com/api/webhooks/333333333333333333/typed");
    cy.get("select.input").find("option:selected").should("have.text", "Custom URL");
    cy.contains("button", "Save…").should("be.visible");

    cy.get("select.input").select("Announcements");
    cy.get('input[placeholder^="https://discord.com/api/webhooks"]').should("have.value", WEBHOOK);
  });

  it("offers to save a hand-typed URL and prefills it", () => {
    cy.setWebhook(SECOND);
    cy.contains("button", "Save…").click();
    cy.get('.modal input[placeholder^="https://discord.com/api/webhooks"]').should("have.value", SECOND);
    cy.get('.modal input[placeholder="e.g. Announcements"]').type("Typed one", { delay: 0 });
    cy.contains(".modal button", "Add webhook").click();
    cy.toast("Webhook saved");
    cy.get("body").type("{esc}");
    cy.get("select.input").find("option:selected").should("have.text", "Typed one");
  });

  it("validates the URL and requires a nickname", () => {
    cy.contains("button", "Manage").click();
    cy.get('.modal input[placeholder^="https://discord.com/api/webhooks"]').type("https://example.com/nope", { delay: 0 });
    cy.contains(".modal .field-error", "Not a Discord webhook URL").should("exist");
    cy.contains(".modal button", "Add webhook").should("be.disabled");
    cy.get('.modal input[placeholder^="https://discord.com/api/webhooks"]').clear().type(WEBHOOK, { delay: 0 });
    cy.contains(".modal button", "Add webhook").should("be.disabled"); // no nickname yet
    cy.get('.modal input[placeholder="e.g. Announcements"]').type("Ok", { delay: 0 });
    cy.contains(".modal button", "Add webhook").should("not.be.disabled");
  });

  it("edits a webhook and keeps the active URL in sync", () => {
    cy.contains("button", "Manage").click();
    addWebhook("Announcements", "", WEBHOOK);
    cy.contains(".modal .draft", "Announcements").contains("button", "Edit").click();
    cy.get('.modal input[placeholder="e.g. Announcements"]').clear().type("Renamed hook", { delay: 0 });
    cy.get('.modal input[placeholder^="https://discord.com/api/webhooks"]').clear().type(SECOND, { delay: 0 });
    cy.contains(".modal button", "Save changes").click();
    cy.toast("Webhook updated");
    cy.get(".modal .draft-name").should("have.text", "Renamed hook");
    cy.get("body").type("{esc}");
    cy.get("select.input").find("option:selected").should("have.text", "Renamed hook");
    cy.get('input[placeholder^="https://discord.com/api/webhooks"]').should("have.value", SECOND);
  });

  it("deletes a webhook and falls back to custom URL", () => {
    cy.contains("button", "Manage").click();
    addWebhook("Announcements", "", WEBHOOK);
    cy.get(".modal .draft .btn-danger").click();
    cy.get(".modal .draft").should("not.exist");
    cy.get("body").type("{esc}");
    cy.get("select.input").find("option").should("have.length", 1);
    cy.get("select.input").find("option:selected").should("have.text", "Custom URL");
  });

  it("persists saved webhooks and the selection across reloads", () => {
    cy.contains("button", "Manage").click();
    addWebhook("Announcements", "", WEBHOOK);
    cy.get("body").type("{esc}");
    cy.reload();
    cy.get("select.input").find("option").should("have.length", 2);
    cy.get("select.input").find("option:selected").should("have.text", "Announcements");
    cy.get('input[placeholder^="https://discord.com/api/webhooks"]').should("have.value", WEBHOOK);
  });
});
