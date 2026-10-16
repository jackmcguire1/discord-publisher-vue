describe("new message", () => {
  beforeEach(() => cy.visitClean());

  it("starts straight away when nothing is unsaved, keeping the webhook identity", () => {
    cy.contains("button", "New message").click();
    cy.get(".modal").should("not.exist");
    cy.toast("New message");
    cy.get(".discord-embed").should("not.exist");
    cy.get(".editing-name").should("have.text", "Not saved yet");
    // Username and avatar carry over.
    cy.contains(".field", "Username").find("input").should("have.value", "Stat-Milestones");
  });

  it("asks what to do with unsaved changes: cancel, discard, or save first", () => {
    cy.get("textarea").first().type("Work in progress", { delay: 0 });

    cy.contains("button", "New message").click();
    cy.get(".modal").should("contain.text", "hasn't been saved");
    cy.contains(".modal button", "Cancel").click();
    cy.get("textarea").first().should("have.value", "Work in progress");

    cy.contains("button", "New message").click();
    cy.get(".modal .new-discard").click();
    cy.get("textarea").first().should("have.value", "");
    cy.openModal("Messages");
    cy.get(".draft-item").should("not.exist");
    cy.get("body").type("{esc}");

    cy.get("textarea").first().type("Keep this", { delay: 0 });
    cy.window().then((w) => cy.stub(w, "prompt").returns("Kept"));
    cy.contains("button", "New message").click();
    cy.get(".modal .new-save").click();
    cy.toast("Draft saved");
    cy.get("textarea").first().should("have.value", "");
    cy.openModal("Messages");
    cy.get(".draft-name").should("have.text", "Kept");
  });

  it("marks a loaded draft with unsaved changes and offers to update it", () => {
    cy.window().then((w) => cy.stub(w, "prompt").returns("Mine"));
    cy.contains("button", "Save draft").click();
    cy.get(".editing-name").should("have.text", "Mine");
    cy.get("textarea").first().type("edit", { delay: 0 });
    cy.get(".editing-name").should("contain.text", "unsaved changes");
    cy.contains("button", "New message").click();
    cy.get(".modal").should("contain.text", "Mine");
    cy.contains(".modal button", "Update draft & start new").click();
    cy.toast("Draft updated");
    cy.get(".editing-name").should("have.text", "Not saved yet");
  });

  it("can be started from the Messages page", () => {
    cy.contains(".nav-link", "Messages").click();
    cy.get(".messages-panel .new-message").click();
    cy.location("hash").should("eq", "");
    cy.get(".editing-name").should("have.text", "Not saved yet");
  });
});
