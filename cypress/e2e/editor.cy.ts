describe("editor and preview", () => {
  beforeEach(() => cy.visitClean());

  it("loads the starter message and renders it in the preview", () => {
    cy.get(".discord-author-username").should("have.text", "Stat-Milestones");
    cy.get(".discord-embed-title").should("contain.text", "v1.8.2");
    cy.get(".discord-embed-author").should("contain.text", "Stat-Milestones");
    cy.get(".discord-embed-field").should("have.length", 2);
    cy.get(".discord-embed-inline-field").should("have.length", 2);
    cy.get(".discord-embed-footer").should("contain.text", "stat-milestones.dev");
  });

  it("renders Discord markdown in content", () => {
    cy.get('textarea[placeholder^="Supports Discord markdown"]')
      .type("Hello **bold** and ||secret|| <t:1700000000:d>", { parseSpecialCharSequences: false, delay: 0 });
    cy.get(".discord-message-markup strong").should("have.text", "bold");
    cy.get(".discord-message-markup .discord-spoiler").should("have.text", "secret");
    cy.get(".discord-message-markup .discord-timestamp").should("exist");
  });

  it("adds, edits and removes an embed", () => {
    cy.contains("button", "+ Add embed").click();
    cy.get(".card-title").should("have.length", 2).last().should("have.text", "Embed 2");
    // The new empty embed is invalid until it has content.
    cy.contains(".field-error", "at least one of").should("exist");

    cy.get(".embed-card").eq(1).find("input").first().type("Second embed", { delay: 0 });
    cy.get(".discord-embed-title").should("have.length", 2).last().should("have.text", "Second embed");

    cy.get(".embed-card").eq(1).find('button[title="Delete embed"]').click();
    cy.get(".discord-embed-title").should("have.length", 1);
  });

  it("adds a field and shows it inline in the preview", () => {
    cy.contains("button", "+ Add field").click();
    cy.get(".field-card").should("have.length", 3);
    cy.contains(".field-error", "Name is required").should("exist");
    cy.get(".field-card").last().within(() => {
      cy.get("input.input").type("Platform", { delay: 0 });
      cy.get("textarea").type("Twitch", { delay: 0 });
    });
    cy.get(".discord-embed-field").should("have.length", 3).last().should("contain.text", "Twitch");
    cy.contains(".field-error", "Name is required").should("not.exist");
  });

  it("enforces character limits with counters", () => {
    cy.get('textarea[placeholder^="Supports Discord markdown"]').invoke("val", "x".repeat(2001)).trigger("input");
    cy.contains(".count", "2001/2000").should("have.class", "over");
    cy.contains(".field-error", "2000").should("exist");
    cy.contains("button", "Publish").should("be.disabled");
  });

  it("supports undo and redo", () => {
    cy.get(".card-title").first().should("contain.text", "v1.8.2");
    cy.get(".embed-card").first().find("input").first().clear().type("Renamed", { delay: 0 });
    cy.get(".discord-embed-title").should("have.text", "Renamed");
    // History groups keystrokes; wait for the debounce then undo.
    cy.wait(500);
    cy.contains("button", "Undo").should("not.be.disabled").click();
    cy.get(".discord-embed-title").should("contain.text", "v1.8.2");
    cy.contains("button", "Redo").click();
    cy.get(".discord-embed-title").should("have.text", "Renamed");
  });

  it("clears the message and blocks publishing when empty", () => {
    cy.contains("button", "Clear message").click();
    cy.get(".discord-embed").should("not.exist");
    cy.contains(".banner-error", "validation issue").should("exist");
    cy.contains(".field-error", "Add some content or at least one embed").should("exist");
  });

  it("persists the message across reloads", () => {
    cy.get(".embed-card").first().find("input").first().clear().type("Persisted title", { delay: 0 });
    cy.reload();
    cy.get(".discord-embed-title").should("have.text", "Persisted title");
  });
});
