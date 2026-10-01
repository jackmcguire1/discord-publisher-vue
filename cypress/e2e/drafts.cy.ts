describe("drafts", () => {
  beforeEach(() => cy.visitClean());

  it("saves a draft, lists it and shows it as the one being edited", () => {
    cy.window().then((w) => cy.stub(w, "prompt").returns("Skyrim promo"));
    cy.contains("button", "Save draft").click();
    cy.toast("Draft saved");
    cy.contains("Draft:").should("contain.text", "Skyrim promo");

    cy.openModal("Drafts");
    cy.get(".draft").should("have.length", 1).and("have.class", "active");
    cy.get(".draft-name").should("have.text", "Skyrim promo");
    cy.get(".draft .tag").should("contain.text", "editing");
  });

  it("updates an existing draft and saves as new", () => {
    cy.window().then((w) => {
      const stub = cy.stub(w, "prompt");
      stub.onFirstCall().returns("First");
      stub.onSecondCall().returns("Second");
    });
    cy.contains("button", "Save draft").click();
    cy.contains("button", "Update draft").click();
    cy.toast("Draft updated");
    cy.contains("button", "Save as new").click();
    cy.contains("Draft:").should("contain.text", "Second");
    cy.openModal("Drafts");
    cy.get(".draft").should("have.length", 2);
  });

  it("loads a draft back into the editor", () => {
    cy.window().then((w) => cy.stub(w, "prompt").returns("Original"));
    cy.contains("button", "Save draft").click();

    cy.contains("button", "Clear message").click();
    cy.get(".discord-embed").should("not.exist");

    cy.openModal("Drafts");
    cy.contains(".draft", "Original").contains("button", "Load").click();
    cy.toast("Draft loaded");
    cy.get(".discord-embed-title").should("contain.text", "Skyrim");
  });

  it("renames, duplicates and deletes drafts", () => {
    cy.window().then((w) => {
      const stub = cy.stub(w, "prompt");
      stub.onFirstCall().returns("Draft A");
      stub.onSecondCall().returns("Draft Renamed");
    });
    cy.contains("button", "Save draft").click();
    cy.openModal("Drafts");

    cy.contains(".draft", "Draft A").contains("button", "Rename").click();
    cy.get(".draft-name").should("have.text", "Draft Renamed");

    cy.contains(".draft", "Draft Renamed").contains("button", "Duplicate").click();
    cy.get(".draft").should("have.length", 2);
    cy.contains(".draft-name", "Draft Renamed (copy)").should("exist");

    cy.contains(".draft", "(copy)").find(".btn-danger").click();
    cy.get(".draft").should("have.length", 1);
  });

  it("marks drafts as published and links to the message", () => {
    cy.stubDiscord();
    cy.setWebhook();
    cy.contains("button", "Publish").click();
    cy.wait("@send");
    cy.openModal("Drafts");
    cy.get(".draft .tag-green").should("have.text", "published");
    cy.contains(".draft a", "open").should("have.attr", "href").and("include", "999000111222333444");
  });

  it("imports a drafts export file", () => {
    const file = {
      format: "discord-publisher-drafts",
      version: 1,
      exportedAt: new Date().toISOString(),
      drafts: [
        {
          id: "x",
          name: "Imported one",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          message: { content: "hi", tts: false, embeds: [] },
        },
        { id: "y", name: "Imported two", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", message: { content: "", tts: false, embeds: [{ title: "E" }] } },
      ],
    };
    cy.openModal("Drafts");
    cy.get('.modal input[type="file"]').selectFile(
      { contents: Cypress.Buffer.from(JSON.stringify(file)), fileName: "drafts.json", mimeType: "application/json" },
      { force: true }
    );
    cy.toast("Imported 2 drafts");
    cy.get(".draft").should("have.length", 2);
    cy.contains(".draft", "Imported two").contains("button", "Load").click();
    cy.get(".discord-embed-title").should("have.text", "E");
  });

  it("imports a bare webhook payload as a draft", () => {
    cy.openModal("Drafts");
    cy.get('.modal input[type="file"]').selectFile(
      { contents: Cypress.Buffer.from(JSON.stringify({ content: "bare payload" })), fileName: "payload.json", mimeType: "application/json" },
      { force: true }
    );
    cy.toast("Imported 1 draft");
    cy.contains(".draft-name", "payload").should("exist");
  });
});
