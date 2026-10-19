describe("long message lists", () => {
  it("pages the Messages list and finds messages by search", () => {
    cy.visitClean();
    const drafts = Array.from({ length: 120 }, (_, i) => ({
      id: `d${i}`,
      name: `Draft ${String(i + 1).padStart(3, "0")}`,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      message: { content: i === 41 ? "The needle in the haystack" : `Body ${i + 1}`, tts: false, embeds: [] },
    }));
    cy.contains(".nav-link", "Messages").click();
    cy.get('.messages-panel input[type="file"]').selectFile(
      { contents: Cypress.Buffer.from(JSON.stringify({ format: "discord-publisher-drafts", version: 1, exportedAt: "x", drafts })), fileName: "many.json", mimeType: "application/json" },
      { force: true }
    );
    cy.toast("Imported 120 drafts");

    cy.get(".messages-panel .draft-item").should("have.length", 50);
    cy.get(".paging-status").should("have.text", "Showing 50 of 120");
    cy.get(".show-more").should("contain.text", "Show 50 more").click();
    cy.get(".messages-panel .draft-item").should("have.length", 100);
    cy.get(".show-more").should("contain.text", "Show 20 more").click();
    cy.get(".messages-panel .draft-item").should("have.length", 120);
    cy.get(".show-more").should("not.exist");

    // Search matches message text, not just names, and resets paging.
    cy.get(".message-search").type("needle", { delay: 0 });
    cy.get(".messages-panel .draft-item").should("have.length", 1).and("contain.text", "Draft 042");
    cy.get(".messages-paging").should("not.exist");
    cy.get(".message-search").clear().type("nothing like this", { delay: 0 });
    cy.contains(".messages-panel .empty", "Nothing matches").should("be.visible");
    cy.get(".message-search").clear();
    cy.get(".messages-panel .draft-item").should("have.length", 50);

    // Switching filters starts from the top again.
    cy.get(".show-more").click();
    cy.get('[data-filter="draft"]').click();
    cy.get(".messages-panel .draft-item").should("have.length", 50);
  });
});
