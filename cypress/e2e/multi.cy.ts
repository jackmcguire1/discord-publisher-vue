const HOOKS = {
  A: "https://discord.com/api/webhooks/111111111111111111/token-a",
  B: "https://discord.com/api/webhooks/222222222222222222/token-b",
  C: "https://discord.com/api/webhooks/333333333333333333/token-c",
};
const ANY_HOOK = /discord\.com\/api\/webhooks\/(\d+)\//;

/** Discord stub that answers per webhook, with a distinct message id for each. */
function stubDiscordPerWebhook(failing: string[] = []) {
  const reply = (req: { url: string; reply: (r: object) => void }, status = 200) => {
    const hook = req.url.match(ANY_HOOK)![1];
    if (failing.includes(hook)) return req.reply({ statusCode: 404, body: { message: "Unknown Webhook", code: 10015 } });
    req.reply({ statusCode: status, body: status === 204 ? "" : { id: `msg-${hook}`, channel_id: `chan-${hook}` } });
  };
  cy.intercept("POST", ANY_HOOK, (req) => reply(req)).as("send");
  cy.intercept("PATCH", ANY_HOOK, (req) => reply(req)).as("edit");
  cy.intercept("DELETE", ANY_HOOK, (req) => reply(req, 204)).as("delete");
}

function setUpWebhooks() {
  cy.contains("button", "Manage").click();
  cy.get(".modal").within(() => {
    cy.contains("button", "+ Add server").click();
    cy.get('input[placeholder="Server name"]').type("Main", { delay: 0 });
    cy.get(".server-form").contains("button", "Add").click();
  });
  for (const [name, url] of [["Hook A", HOOKS.A], ["Hook B", HOOKS.B], ["Hook C", HOOKS.C]]) {
    cy.get(".modal").within(() => {
      cy.get('input[placeholder="e.g. Announcements"]').clear().type(name, { delay: 0 });
      cy.get('input[placeholder^="https://discord.com/api/webhooks"]').clear().type(url, { delay: 0 });
      cy.contains("button", "Add webhook").click();
    });
  }
  cy.get(".modal .webhook-item").should("have.length", 3);
  cy.get("body").type("{esc}");
}

function pick(...names: string[]) {
  cy.get(".mode-multi").click();
  for (const n of names) cy.contains(".destination", n).find("input").check();
}

describe("publishing to several webhooks", () => {
  beforeEach(() => {
    cy.visitClean();
    setUpWebhooks();
  });

  it("publishes a copy to each picked webhook and lists them together", () => {
    stubDiscordPerWebhook();
    pick("Hook A", "Hook C");
    cy.publish("Publish to 2 webhooks");
    cy.wait("@send");
    cy.wait("@send");
    cy.toast("Published to 2 webhooks");
    cy.get(".copy-item").should("have.length", 2);
    cy.get(".copy-item").should("contain.text", "Hook A").and("contain.text", "Hook C").and("not.contain.text", "Hook B");
    cy.contains("button", "Update all 2 copies").should("exist");
    // The editor keeps the first picked copy, with its webhook selected.
    cy.contains(".copy-item", "Hook A").find(".tag").should("contain.text", "editing");
    // Several-webhooks mode stays on after publishing; the single dropdown shows the editor's copy.
    cy.contains(".publish-mode button", "One webhook").click();
    cy.get("select.webhook-select").find("option:selected").should("have.text", "Hook A");

    cy.contains(".nav-link", "Messages").click();
    // One collapsible row for the group; expanding it shows each copy.
    cy.get(".messages-panel .message-group").should("have.length", 1).and("contain.text", "Published to 2 webhooks");
    cy.get(".messages-panel .draft-item").should("not.exist");
    cy.get(".message-group .group-toggle").click();
    cy.get(".group-children .draft-item").should("have.length", 2);
    cy.get(".group-children .copies-tag").should("contain.text", "Hook A").and("contain.text", "Hook C");
    cy.get(".message-group .group-toggle").click();
    cy.get(".group-children").should("not.exist");
  });

  it("updates and deletes every copy, or just one", () => {
    stubDiscordPerWebhook();
    pick("Hook A", "Hook B", "Hook C");
    cy.publish("Publish to 3 webhooks");
    cy.toast("Published to 3 webhooks");

    cy.get("textarea").first().type("Edited", { delay: 0 });
    cy.contains("button", "Update all 3 copies").click();
    cy.toast("Updated 3 webhooks");
    cy.get("@edit.all").should("have.length", 3);

    // Delete just Hook B's copy.
    cy.contains(".copy-item", "Hook B").find(".copy-delete").click();
    cy.toast("Deleted from 1 webhook");
    cy.contains(".copy-item", "Hook B").find(".tag-red").should("have.text", "deleted");
    cy.contains("button", "Update all 2 copies").should("exist");

    cy.contains("button", "Delete all copies").click();
    cy.toast("Deleted from 2 webhooks");
    cy.get(".copy-item .tag-red").should("have.length", 3);
  });

  it("reports a failing webhook without stopping the others", () => {
    stubDiscordPerWebhook(["222222222222222222"]);
    pick("Hook A", "Hook B", "Hook C");
    cy.publish("Publish to 3 webhooks");
    cy.contains(".toast-title", "Published to 2 of 3 webhooks").should("be.visible");
    cy.contains(".toast-message", "Hook B: Unknown Webhook (HTTP 404)").should("be.visible");
    cy.get(".copy-item").should("have.length", 2).and("not.contain.text", "Hook B");
  });

  it("opens another copy in the editor with its own webhook selected", () => {
    stubDiscordPerWebhook();
    pick("Hook A", "Hook B");
    cy.publish("Publish to 2 webhooks");
    cy.toast("Published to 2 webhooks");
    cy.contains(".copy-item", "Hook B").find(".copy-open").click();
    cy.contains(".copy-item", "Hook B").find(".tag").should("contain.text", "editing");
    // Several-webhooks mode stays on after publishing; the single dropdown shows the editor's copy.
    cy.contains(".publish-mode button", "One webhook").click();
    cy.get("select.webhook-select").find("option:selected").should("have.text", "Hook B");
  });
});
