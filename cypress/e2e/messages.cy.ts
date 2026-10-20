import { WEBHOOK, USER_EMAIL } from "../support/e2e";

const TEAMMATE = "teammate@example.com";

function addSavedWebhook(name = "Announcements") {
  cy.contains("button", "Manage").click();
  cy.get('.modal input[placeholder="e.g. Announcements"]').type(name, { delay: 0 });
  cy.get('.modal input[placeholder^="https://discord.com/api/webhooks"]').type(WEBHOOK, { delay: 0 });
  cy.contains(".modal button", "Add webhook").click();
  cy.get("body").type("{esc}");
}

describe("messages: published history", () => {
  beforeEach(() => {
    cy.visitClean();
    cy.stubDiscord();
    addSavedWebhook();
    cy.publish();
    cy.wait("@send");
  });

  it("lists published messages with who sent them, and loads one back from Discord", () => {
    cy.openModal("Messages");
    cy.get('[data-filter="published"]').click();
    cy.get(".draft-item").should("have.length", 1).and("contain.text", `by ${USER_EMAIL}`).and("contain.text", "via Announcements");
    cy.get("body").type("{esc}");

    // Start over, switch to a hand-typed URL, then load the message back.
    cy.contains("button", "New message").click();
    cy.get("select.webhook-select").select("Custom URL");
    cy.setWebhook("https://discord.com/api/webhooks/1/other");
    cy.openModal("Messages");
    cy.get('[data-filter="published"]').click();
    cy.contains(".draft-item", "published").contains("button", "Load").click();
    cy.wait("@fetch").its("request.method").should("eq", "GET");
    cy.toast("Loaded from Discord");
    cy.get("select.webhook-select").find("option:selected").should("have.text", "Announcements");
    cy.get("textarea").first().should("have.value", "Live from Discord");

    cy.contains("button", "Update published").should("not.be.disabled").click();
    cy.wait("@edit");
    cy.get(".banner-success").should("contain.text", "updated").and("contain.text", `by ${USER_EMAIL}`);
  });

  it("has its own page in the navbar, and loading from it opens the editor", () => {
    cy.contains(".nav-link", "Messages").click();
    cy.location("hash").should("eq", "#/messages");
    cy.get(".nav-messages").should("have.class", "active");
    cy.get(".messages-panel .draft-item").should("have.length", 1).and("contain.text", "published");
    cy.reload();
    cy.get(".messages-panel .draft-item").should("have.length", 1);
    cy.get(".messages-panel").contains("button", "Load").click();
    cy.toast("Loaded from Discord");
    cy.location("hash").should("eq", "");
    cy.get(".discord-messages").should("exist");
    cy.contains("button", "Update published").should("not.be.disabled");
  });

  it("duplicating from the Published filter switches to All and saves the copy to the org", () => {
    cy.contains(".nav-link", "Messages").click();
    cy.get('[data-filter="published"]').click();
    cy.window().then((w) => cy.stub(w, "prompt").callsFake((_m: string, suggested: string) => suggested));
    cy.get(".draft-item").should("have.length", 1);
    cy.rowAction("published", "Duplicate");
    cy.toast("Message duplicated");
    cy.get('[data-filter="all"]').should("have.attr", "aria-selected", "true");
    cy.get(".draft-item").should("have.length", 2);
    cy.get(".draft-item.just-added").should("exist").find(".tag-green").should("not.exist");

    // It's in Firestore, not just on screen.
    const FS = "http://127.0.0.1:8080/v1/projects/demo-discord-publisher/databases/(default)/documents";
    const get = (path: string) => cy.request({ url: `${FS}/${path}`, headers: { Authorization: "Bearer owner" } });
    get("orgs").then(({ body }) => {
      const org = body.documents[0].name.split("/documents/")[1];
      get(`${org}/drafts`).its("body.documents").should("have.length", 2);
    });
  });

  it("keeps a deleted message as history and publishes it again as a new one", () => {
    cy.contains("button", "Delete from Discord").click();
    cy.wait("@delete");
    cy.get(".deleted-banner").should("contain.text", "Deleted from Discord").and("contain.text", USER_EMAIL);
    cy.publish("Publish as new");
    cy.wait("@send");

    cy.openModal("Messages");
    cy.get('[data-filter="published"] .tag').should("have.text", "1");
    cy.get('[data-filter="deleted"] .tag').should("have.text", "1");
    cy.get('[data-filter="deleted"]').click();
    cy.get(".draft-item").should("have.length", 1).find(".tag-red").should("have.text", "deleted");
  });

  it("saving a published message from the toolbar starts a new draft", () => {
    cy.window().then((w) => cy.stub(w, "prompt").returns("Follow-up"));
    cy.contains("button", "Save as draft").click();
    cy.toast("Draft saved");
    cy.openModal("Messages");
    cy.get('[data-filter="draft"] .tag').should("have.text", "1");
    cy.get('[data-filter="published"] .tag').should("have.text", "1");
  });
});

describe("messages: member permissions", () => {
  it("a member without publish or delete rights can load messages but not change them on Discord", () => {
    cy.visitClean();
    cy.stubDiscord();
    addSavedWebhook();
    cy.publish();
    cy.wait("@send");

    cy.accountMenu("Members");
    cy.get(".invite-can-publish").uncheck();
    cy.get(".invite-email").type(TEAMMATE, { delay: 0 });
    cy.contains(".settings button", "Invite").click();
    cy.get(".pending-invite").should("contain.text", "drafts only");
    cy.accountMenu("Sign out");

    cy.signIn(TEAMMATE);
    cy.contains(".invite-item", "Test Org").contains("button", "Join").click();
    cy.get(".discord-messages").should("exist");
    cy.contains("button", /^\s*Publish\s*$/).should("be.disabled");

    cy.openModal("Messages");
    cy.contains(".draft-item", "published").find(".row-menu-toggle").click();
    cy.get(".row-menu .row-delete").should("be.disabled");
    cy.contains(".draft-item", "published").find(".row-menu-toggle").click();
    cy.contains(".draft-item", "published").contains("button", "Load").click();
    cy.toast("Loaded from Discord");
    cy.contains("button", "Update published").should("be.disabled");
    cy.contains("button", "Delete from Discord").should("be.disabled");
  });

  it("admins grant publish and delete per member", () => {
    cy.visitClean();
    cy.accountMenu("Members");
    cy.get(".invite-email").type(TEAMMATE, { delay: 0 });
    cy.get(".invite-can-delete").check();
    cy.contains(".settings button", "Invite").click();
    cy.get(".pending-invite").should("contain.text", "can publish and delete");
    cy.accountMenu("Sign out");
    cy.signIn(TEAMMATE);
    cy.contains(".invite-item", "Test Org").contains("button", "Join").click();
    cy.get(".discord-messages").should("exist");
    cy.accountMenu("Sign out");

    cy.signIn();
    cy.accountMenu("Members");
    cy.contains(".member-item", TEAMMATE).should("contain.text", "can publish and delete");
    cy.contains(".member-item", TEAMMATE).find(".perm-delete input").uncheck();
    cy.contains(".member-item", TEAMMATE).should("contain.text", "can publish").and("not.contain.text", "delete");
    cy.contains(".member-item", USER_EMAIL).should("contain.text", "all permissions");
  });
});
