import { WEBHOOK } from "../support/e2e";

describe("publishing", () => {
  beforeEach(() => {
    cy.visitClean();
    cy.stubDiscord();
  });

  it("disables publish until a valid webhook URL is set", () => {
    cy.contains("button", "Publish").should("be.disabled");
    cy.setWebhook("https://example.com/not-a-webhook");
    cy.contains(".field-error", "Not a Discord webhook URL").should("exist");
    cy.contains("button", "Publish").should("be.disabled");
    cy.setWebhook();
    cy.contains("button", "Publish").should("not.be.disabled");
  });

  it("publishes with wait=true, records the message and auto-creates a draft", () => {
    cy.setWebhook();
    cy.contains("button", "Publish").click();

    cy.wait("@send").then(({ request }) => {
      expect(request.url).to.include("?wait=true");
      expect(request.body.username).to.eq("Stat-Milestones");
      expect(request.body.embeds).to.have.length(1);
      expect(request.body.embeds[0]).to.not.have.property("id");
      expect(request.body.embeds[0].fields[0]).to.not.have.property("id");
    });

    cy.toast("Published");
    cy.toast("Draft saved");
    cy.contains(".banner-success", "999000111222333444").should("exist");
    cy.contains("a", "open in Discord")
      .should("have.attr", "href")
      .and("include", "/555666777888999000/999000111222333444");
    cy.contains("Draft:").should("contain.text", "v1.8.2");
    cy.contains("button", "Drafts").find(".tag").should("have.text", "1");
  });

  it("includes the thread id when set", () => {
    cy.setWebhook();
    cy.get('input[placeholder="Forum / thread id"]').type("42", { delay: 0 });
    cy.contains("button", "Publish").click();
    cy.wait("@send").its("request.url").should("include", "thread_id=42");
  });

  it("updates a published message with PATCH and no identity fields", () => {
    cy.setWebhook();
    cy.contains("button", "Publish").click();
    cy.wait("@send");

    cy.get(".embed-card").first().find("input").first().clear().type("Edited title", { delay: 0 });
    cy.contains("button", "Update published").click();

    cy.wait("@edit").then(({ request }) => {
      expect(request.url).to.match(/\/messages\/999000111222333444$/);
      expect(request.body.embeds[0].title).to.eq("Edited title");
      expect(request.body).to.not.have.property("username");
      expect(request.body).to.not.have.property("avatar_url");
      expect(request.body).to.have.property("content");
    });
    cy.toast("Updated");
  });

  it("deletes a published message and clears the published state", () => {
    cy.setWebhook();
    cy.contains("button", "Publish").click();
    cy.wait("@send");

    cy.contains("button", "Delete from Discord").click();
    cy.wait("@delete").its("request.method").should("eq", "DELETE");
    cy.toast("Deleted");
    cy.contains("button", "Update published").should("not.exist");
    cy.contains("button", "Publish").should("exist");
  });

  it("disables editing when a different webhook is configured", () => {
    cy.setWebhook();
    cy.contains("button", "Publish").click();
    cy.wait("@send");

    cy.setWebhook(WEBHOOK.replace("123456789012345678", "000000000000000001"));
    cy.contains("button", "Update published").should("be.disabled");
    cy.contains("different webhook configured").should("exist");
  });

  it("shows Discord's error when publishing fails", () => {
    cy.intercept("POST", /discord\.com\/api\/webhooks/, {
      statusCode: 400,
      body: { code: 50035, message: "Invalid Form Body", errors: { embeds: {} } },
    }).as("fail");
    cy.setWebhook();
    cy.contains("button", "Publish").click();
    cy.wait("@fail");
    cy.toast("Publish failed");
    cy.contains(".toast-message", "Invalid Form Body").should("contain.text", "HTTP 400");
  });
});
