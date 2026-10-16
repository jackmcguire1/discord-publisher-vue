import { WEBHOOK } from "../support/e2e";

const FS = "http://127.0.0.1:8080/v1/projects/demo-discord-publisher/databases/(default)/documents";
const fsGet = (path: string) => cy.request({ url: `${FS}/${path}`, headers: { Authorization: "Bearer owner" } });
/** Revision docs of the only message in the org. */
function revisionDocs() {
  return fsGet("orgs").then(({ body }) => {
    const org = body.documents[0].name.split("/documents/")[1];
    return fsGet(`${org}/drafts`).then(({ body: drafts }) => {
      const draft = drafts.documents[0].name.split("/documents/")[1];
      return fsGet(`${draft}/revisions`).then(({ body: revs }) => revs.documents ?? []);
    });
  });
}

function content() {
  return cy.get("textarea").first();
}

describe("message versions", () => {
  it("each save is a revision; old ones can be previewed and restored", () => {
    cy.visitClean();
    cy.window().then((w) => cy.stub(w, "prompt").returns("Notes"));
    // History lives in the Message panel; it waits for the first save.
    cy.get(".message-panel .editor-history").should("be.disabled");
    content().type("First version", { delay: 0 });
    cy.contains("button", "Save draft").click();
    cy.get(".message-panel .revision-tag").should("have.text", "v1");

    content().clear().type("Second version", { delay: 0 });
    cy.contains("button", "Update draft").click();
    cy.get(".message-panel .revision-tag").should("have.text", "v2");

    // Saving without changes doesn't add an empty revision.
    cy.contains("button", "Update draft").click();
    cy.toast("No changes to save");
    cy.get(".message-panel .revision-tag").should("have.text", "v2");

    cy.get(".editor-history").click();
    cy.get(".revision-item").should("have.length", 2);
    cy.get('.revision-item[data-revision="2"]').should("contain.text", "latest").and("contain.text", "Second version");
    cy.get('.revision-item[data-revision="1"]').find(".revision-preview-toggle").click();
    cy.get('.revision-item[data-revision="1"] .revision-preview').should("contain.text", "First version");
    cy.get('.revision-item[data-revision="1"]').find(".revision-restore").click();
    cy.toast("Restored v1");
    content().should("have.value", "First version");
    cy.get(".editing-name").should("contain.text", "unsaved changes");

    // Keep v2 as it is and save the restored content as the next version.
    cy.get(".new-version").click();
    cy.toast("Saved as v3");
    cy.get(".message-panel .revision-tag").should("have.text", "v3");
    cy.get(".editor-history").click();
    cy.get(".revision-item").should("have.length", 3);
    revisionDocs().should("have.length", 3);

    // Saved versions can be deleted (Cypress accepts the confirm), except v1, the starting point.
    cy.get('.revision-item[data-revision="1"] .revision-delete').should("not.exist");
    cy.get('.revision-item[data-revision="1"] .revision-locked').should("exist");
    cy.get('.revision-item[data-revision="2"] .revision-delete').click();
    cy.toast("Deleted v2");
    cy.get(".revision-item").should("have.length", 2);
    cy.get('.revision-item[data-revision="2"]').should("not.exist");
    revisionDocs().should("have.length", 2);
  });

  it("publishing and updating on Discord are revisions too", () => {
    cy.visitClean();
    cy.stubDiscord();
    cy.setWebhook();
    cy.contains("button", "Publish").click();
    cy.wait("@send");
    cy.get(".message-panel .revision-tag").should("have.text", "v1"); // one revision, not a save plus a publish
    content().type("Edited", { delay: 0 });
    cy.contains("button", "Update published").click();
    cy.wait("@edit");
    cy.get(".message-panel .revision-tag").should("have.text", "v2");
    cy.get(".editor-history").click();
    cy.get('.revision-item[data-revision="1"]').should("contain.text", "Published to Discord");
    cy.get('.revision-item[data-revision="2"]').should("contain.text", "Updated on Discord");
    // What went out to Discord can't be deleted.
    cy.get(".revision-delete").should("not.exist");
    cy.get(".revision-locked").should("have.length", 2);
    revisionDocs().should("have.length", 2);
  });

  it("opens from the Messages list, and a duplicate starts its own history", () => {
    cy.visitClean();
    cy.window().then((w) => cy.stub(w, "prompt").returns("Original"));
    cy.contains("button", "Save draft").click();
    cy.contains(".nav-link", "Messages").click();
    cy.get(".draft-item .revision-tag").should("have.text", "v1");
    cy.contains(".draft-item", "Original").contains("button", "Duplicate").click();
    cy.contains(".draft-item", "(copy)").contains("button", "History").click();
    cy.get(".revision-item").should("have.length", 1).and("contain.text", 'Duplicated from "Original"');
  });

  it("guests keep versions locally, and they come along on import", () => {
    cy.visitGuest();
    cy.window().then((w) => cy.stub(w, "prompt").returns("Guest notes"));
    content().type("one", { delay: 0 });
    cy.contains("button", "Save draft").click();
    content().type(" two", { delay: 0 });
    cy.contains("button", "Update draft").click();
    cy.get(".message-panel .revision-tag").should("have.text", "v2");
    cy.get(".editor-history").click();
    cy.get(".revision-item").should("have.length", 2);
    cy.get("body").type("{esc}");

    cy.signIn();
    cy.createOrg();
    cy.get(".legacy-banner").contains("Import…").click();
    cy.contains(".settings button", "Import into Test Org").click();
    cy.toast("Imported 1 item");
    revisionDocs().should("have.length", 2);
    cy.contains(".nav-link", "Messages").click();
    cy.contains(".draft-item", "Guest notes").contains("button", "History").click();
    cy.get(".revision-item").should("have.length", 2);
  });

  it("an imported message keeps its original content as v1 when first changed", () => {
    cy.visitClean();
    const file = {
      format: "discord-publisher-drafts",
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      drafts: [{ id: "x", name: "Old one", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", message: { content: "Original text", tts: false, embeds: [] } }],
    };
    cy.openModal("Messages");
    cy.get('.modal input[type="file"]').selectFile(
      { contents: Cypress.Buffer.from(JSON.stringify(file)), fileName: "drafts.json", mimeType: "application/json" },
      { force: true }
    );
    cy.contains(".draft-item", "Old one").contains("button", "Load").click();
    cy.get(".message-panel .editor-history").should("be.disabled");
    content().clear().type("New text", { delay: 0 });
    cy.contains("button", "Update draft").click();
    cy.get(".message-panel .revision-tag").should("have.text", "v2");
    cy.get(".editor-history").click();
    cy.get('.revision-item[data-revision="1"]').should("contain.text", "Original text").and("contain.text", "before history");
    cy.get('.revision-item[data-revision="2"]').should("contain.text", "New text");
    revisionDocs().should("have.length", 2);
  });

  it("applying JSON to an open draft counts as a change that can be saved", () => {
    cy.visitClean();
    cy.window().then((w) => cy.stub(w, "prompt").returns("From JSON"));
    cy.contains("button", "Save draft").click();
    cy.get(".message-panel .revision-tag").should("have.text", "v1");

    cy.openModal("JSON");
    cy.get(".modal textarea").clear().type('{"content":"Edited in JSON"}', { delay: 0, parseSpecialCharSequences: false });
    cy.contains(".modal button", "Apply to editor").click();
    content().should("have.value", "Edited in JSON");
    cy.get(".editing-name").should("contain.text", "unsaved changes");

    cy.contains("button", "Update draft").click();
    cy.toast("Draft updated");
    cy.get(".message-panel .revision-tag").should("have.text", "v2");
    cy.get(".editing-name").should("not.contain.text", "unsaved changes");
  });

  it("Update draft saves over the current version; New version starts the next one", () => {
    cy.visitClean();
    cy.window().then((w) => cy.stub(w, "prompt").returns("Iterating"));
    content().type("A", { delay: 0 });
    cy.contains("button", "Save draft").click();

    // v1 is the starting point, so the first update makes v2...
    content().type("B", { delay: 0 });
    cy.contains("button", "Update draft").click();
    cy.contains(".toast-message", "Saved as v2").should("be.visible");
    // ...and later updates save over v2 instead of piling up versions.
    content().type("C", { delay: 0 });
    cy.contains("button", "Update draft").should("have.attr", "title").and("contain", "Save over v2");
    cy.contains("button", "Update draft").click();
    cy.contains(".toast-message", "Saved over v2").should("be.visible");
    cy.get(".message-panel .revision-tag").should("have.text", "v2");
    revisionDocs().should("have.length", 2);

    content().type("D", { delay: 0 });
    cy.get(".new-version").click();
    cy.toast("Saved as v3");
    revisionDocs().should("have.length", 3);

    cy.get(".editor-history").click();
    cy.get('.revision-item[data-revision="2"]').should("contain.text", "ABC").and("contain.text", "last saved");
    cy.get('.revision-item[data-revision="3"]').should("contain.text", "ABCD");
  });

  it("applying JSON to an open draft counts as a change that can be saved", () => {
    cy.visitClean();
    cy.window().then((w) => cy.stub(w, "prompt").returns("From JSON"));
    cy.contains("button", "Save draft").click();

    cy.openModal("JSON");
    cy.get(".modal textarea").clear().type('{"content":"Edited in JSON"}', { delay: 0, parseSpecialCharSequences: false });
    cy.contains(".modal button", "Apply to editor").click();
    content().should("have.value", "Edited in JSON");
    cy.get(".editing-name").should("contain.text", "unsaved changes");

    cy.contains("button", "Update draft").click();
    cy.toast("Draft updated");
    cy.get(".message-panel .revision-tag").should("have.text", "v2");
    cy.get(".editing-name").should("not.contain.text", "unsaved changes");
  });
});
