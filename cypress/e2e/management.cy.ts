import { WEBHOOK } from "../support/e2e";

const HOOK_B = "https://discord.com/api/webhooks/222222222222222222/token-b";
const ANY_HOOK = /discord\.com\/api\/webhooks\/(\d+)\//;

function addWebhook(name: string, url: string) {
  cy.contains("button", "Manage").click();
  cy.get('.modal input[placeholder="e.g. Announcements"]').type(name, { delay: 0 });
  cy.get('.modal input[placeholder^="https://discord.com/api/webhooks"]').type(url, { delay: 0 });
  cy.contains(".modal button", "Add webhook").click();
  cy.get("body").type("{esc}");
}

describe("saving before publishing", () => {
  beforeEach(() => {
    cy.visitClean();
    cy.stubDiscord();
    cy.setWebhook();
  });

  it("asks to save unsaved work; cancelling sends nothing", () => {
    cy.contains("button", /^\s*Publish\s*$/).click();
    cy.get(".modal").should("contain.text", "hasn't been saved");
    cy.get('.choice-button[data-choice="cancel"]').click();
    cy.get("@send.all").should("have.length", 0);
    cy.get(".editing-name").should("have.text", "Not saved yet");
  });

  it("saves the draft, then publishes it", () => {
    cy.contains("button", /^\s*Publish\s*$/).click();
    cy.get('.choice-button[data-choice="save"]').should("contain.text", "Save draft & publish").click();
    cy.wait("@send");
    cy.get(".editing-name").should("contain.text", "Stat-Milestones v1.8.2 is live").and("not.contain.text", "unsaved");
    cy.contains("button", "Update published").should("exist");
  });

  it("asks again when a saved draft has new changes", () => {
    cy.window().then((w) => cy.stub(w, "prompt").returns("Saved one"));
    cy.contains("button", "Save draft").click();
    cy.get("textarea").first().type("more", { delay: 0 });
    cy.contains("button", /^\s*Publish\s*$/).click();
    cy.get(".modal").should("contain.text", "aren't saved");
    cy.get('.choice-button[data-choice="save"]').should("contain.text", "Update draft & publish").click();
    cy.wait("@send");
  });
});

describe("removing messages", () => {
  beforeEach(() => {
    cy.visitClean();
    cy.stubDiscord();
    addWebhook("Announcements", WEBHOOK);
    cy.publish();
    cy.wait("@send");
    cy.openModal("Messages");
  });

  it("a live message: delete it from Discord as well", () => {
    cy.rowAction("published", "Delete…");
    cy.get(".modal").should("contain.text", "still live on Discord via Announcements");
    cy.get('.choice-button[data-choice="both"]').click();
    cy.wait("@delete");
    cy.toast("Deleted from Discord and removed");
    cy.get(".draft-item").should("not.exist");
  });

  it("a live message: remove only the record, leaving it on Discord", () => {
    cy.rowAction("published", "Delete…");
    cy.get('.choice-button[data-choice="record"]').click();
    cy.toast("Removed");
    cy.get("@delete.all").should("have.length", 0);
    cy.get(".draft-item").should("not.exist");
  });

  it("cancelling keeps everything", () => {
    cy.rowAction("published", "Delete…");
    cy.get('.choice-button[data-choice="cancel"]').click();
    cy.get(".draft-item").should("have.length", 1);
    cy.get("@delete.all").should("have.length", 0);
  });
});

describe("adding webhooks to a live message", () => {
  it("stays in several-webhooks mode and adds copies to the same group", () => {
    cy.visitClean();
    cy.intercept("POST", ANY_HOOK, (req) => req.reply({ id: `msg-${req.url.match(ANY_HOOK)![1]}`, channel_id: "c" })).as("send");
    addWebhook("Hook A", WEBHOOK);
    addWebhook("Hook B", HOOK_B);

    // Published to A on its own first.
    cy.get(".mode-multi").click();
    cy.contains(".destination", "Hook A").find("input").check();
    cy.publish("Publish to 1 webhook");
    cy.toast("Published to 1 webhook");

    // Still in several-webhooks mode; A is marked published, B can be added.
    cy.get(".mode-multi").should("have.attr", "aria-selected", "true");
    cy.contains(".destination", "Hook A").find("input").should("be.disabled").and("be.checked");
    cy.contains(".destination", "Hook A").should("contain.text", "published");
    cy.contains(".destination", "Hook B").find("input").check();
    cy.contains("button", "Add to 1 more webhook").click();
    cy.toast("Published to 1 webhook");
    cy.get(".copy-item").should("have.length", 2).and("contain.text", "Hook A").and("contain.text", "Hook B");

    // The choice of mode survives a reload.
    cy.reload();
    cy.get(".mode-multi").should("have.attr", "aria-selected", "true");
  });
});
