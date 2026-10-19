import { WEBHOOK, USER_EMAIL } from "../support/e2e";

const ANY_HOOK = /discord\.com\/api\/webhooks\/\d+\//;

describe("webhook history", () => {
  it("lists what was sent through a webhook, with a summary, and opens a message", () => {
    cy.visitClean();
    // Distinct Discord message ids per send, so the two messages stay separate.
    let n = 0;
    cy.intercept("POST", ANY_HOOK, (req) => req.reply({ id: `msg-${++n}`, channel_id: "chan" })).as("send");
    cy.intercept("PATCH", ANY_HOOK, (req) => req.reply({ id: req.url.match(/messages\/([\w-]+)/)![1], channel_id: "chan" })).as("edit");
    cy.intercept("DELETE", ANY_HOOK, { statusCode: 204, body: "" }).as("delete");

    cy.contains("button", "Manage").click();
    cy.get('.modal input[placeholder="e.g. Announcements"]').type("Announcements", { delay: 0 });
    cy.get('.modal input[placeholder^="https://discord.com/api/webhooks"]').type(WEBHOOK, { delay: 0 });
    cy.contains(".modal button", "Add webhook").click();
    cy.get("body").type("{esc}");

    // First message: published, then updated.
    cy.get("textarea").first().type("First", { delay: 0 });
    cy.contains("button", "Publish").click();
    cy.wait("@send");
    cy.get("textarea").first().type(" (edited)", { delay: 0 });
    cy.contains("button", "Update published").click();
    cy.wait("@edit");

    // Second message: published, then deleted.
    cy.contains("button", "New message").click();
    cy.get("textarea").first().type("Second", { delay: 0 });
    cy.contains("button", "Publish").click();
    cy.wait("@send");
    cy.contains("button", "Delete from Discord").click();
    cy.wait("@delete");

    cy.accountMenu("Webhooks and servers");
    cy.contains(".settings .webhook-item", "Announcements").find(".webhook-sent-count").should("have.text", "2 sent");
    cy.contains(".settings .webhook-item", "Announcements").find(".webhook-history-toggle").click();
    cy.get(".webhook-history-summary").should("contain.text", "2 sent").and("contain.text", "1 live").and("contain.text", "1 deleted");
    cy.get(".webhook-history-item").should("have.length", 2);
    cy.get(".webhook-history-item").first().should("contain.text", "deleted").and("contain.text", `by ${USER_EMAIL}`);
    // Newest activity first: the deleted one, then the (updated) first message.
    cy.get(".webhook-history-item").eq(1).should("contain.text", "updated").and("contain.text", "open in Discord");

    cy.get(".webhook-history-item").eq(1).find(".webhook-history-open").click();
    cy.toast("Message opened");
    cy.location("hash").should("eq", "");
    cy.get("textarea").first().should("have.value", "First (edited)");
    cy.get("select.webhook-select").find("option:selected").should("have.text", "Announcements");
    cy.contains("button", "Update published").should("not.be.disabled");
  });
});
