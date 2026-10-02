const AVATAR = "https://pbs.twimg.com/profile_images/1533157608537960449/h-KjDil9_400x400.jpg";

function addAuthor(name: string, url = "", avatar = "") {
  cy.get(".modal").within(() => {
    cy.get('input[placeholder="e.g. Stat-Milestones"]').clear().type(name, { delay: 0 });
    cy.get('input.input[placeholder="https://"]').eq(0).clear();
    if (url) cy.get('input.input[placeholder="https://"]').eq(0).type(url, { delay: 0 });
    cy.get('input.input[placeholder="https://"]').eq(1).clear();
    if (avatar) cy.get('input.input[placeholder="https://"]').eq(1).type(avatar, { delay: 0 });
    cy.contains("button", "Add author").click();
  });
}

describe("authors", () => {
  beforeEach(() => cy.visitClean());

  it("starts with no authors and disabled pickers", () => {
    cy.get(".author-select").should("have.length", 2).and("be.disabled");
    cy.contains("button", "Authors").find(".tag").should("have.text", "0");
  });

  it("adds an author from the toolbar and lists it", () => {
    cy.contains("button", "Authors").click();
    addAuthor("Release bot", "https://stat-milestones.dev", AVATAR);
    cy.toast("Author saved");
    cy.get(".modal .author-item").should("have.length", 1).and("contain.text", "Release bot").and("contain.text", "stat-milestones.dev");
    cy.get(".modal .author-avatar").should("have.attr", "src", AVATAR);
    cy.get("body").type("{esc}");
    cy.contains("button", "Authors").find(".tag").should("have.text", "1");
    cy.get(".author-select").should("not.be.disabled");
  });

  it("applies an author as the webhook identity", () => {
    cy.contains("button", "Authors").click();
    addAuthor("Release bot", "", AVATAR);
    cy.get("body").type("{esc}");

    cy.get(".author-select").first().select("Release bot");
    cy.get('input[placeholder^="Defaults to the webhook"]').should("have.value", "Release bot");
    cy.get(".discord-author-username").should("have.text", "Release bot");
    cy.get(".discord-author-avatar img").should("have.attr", "src", AVATAR);
    // The picker resets so the same author can be applied again later.
    cy.get(".author-select").first().find("option:selected").should("contain.text", "Apply saved author");
  });

  it("applies an author to an embed's author block", () => {
    cy.contains("button", "Authors").click();
    addAuthor("Release bot", "https://example.com/bot", AVATAR);
    cy.get("body").type("{esc}");

    cy.get(".embed-card .author-select").select("Release bot");
    cy.get(".discord-embed-author").should("contain.text", "Release bot");
    cy.get(".discord-embed-author a").should("have.attr", "href", "https://example.com/bot");
    cy.get(".discord-embed-author img").should("have.attr", "src", AVATAR);
  });

  it("saves the current embed author as a reusable author, prefilled", () => {
    // The starter message already has an embed author; offer to save it.
    cy.get(".embed-card").contains("button", "Save as author…").click();
    cy.get('.modal input[placeholder="e.g. Stat-Milestones"]').should("have.value", "Stat-Milestones");
    cy.get('.modal input.input[placeholder="https://"]').eq(0).should("have.value", "https://stat-milestones.dev");
    cy.get('.modal input.input[placeholder="https://"]').eq(1).invoke("val").should("include", "pbs.twimg.com");
    cy.contains(".modal button", "Add author").click();
    cy.toast("Author saved");
    cy.get(".modal .author-item").should("have.length", 1);
  });

  it("saves the webhook identity as an author, prefilled", () => {
    cy.get(".author-picker").first().contains("button", "Save as author…").click();
    cy.get('.modal input[placeholder="e.g. Stat-Milestones"]').should("have.value", "Stat-Milestones");
    cy.get('.modal input.input[placeholder="https://"]').eq(0).should("have.value", "");
    cy.get('.modal input.input[placeholder="https://"]').eq(1).invoke("val").should("include", "pbs.twimg.com");
  });

  it("validates URLs and requires a name", () => {
    cy.contains("button", "Authors").click();
    cy.get('.modal input.input[placeholder="https://"]').eq(0).type("not a url", { delay: 0 });
    cy.contains(".modal .field-error", "Invalid URL").should("exist");
    cy.contains(".modal button", "Add author").should("be.disabled");
    cy.get('.modal input.input[placeholder="https://"]').eq(0).clear();
    cy.contains(".modal button", "Add author").should("be.disabled"); // still no name
    cy.get('.modal input[placeholder="e.g. Stat-Milestones"]').type("X", { delay: 0 });
    cy.contains(".modal button", "Add author").should("not.be.disabled");
  });

  it("edits and deletes an author", () => {
    cy.contains("button", "Authors").click();
    addAuthor("Old", "", "");
    cy.get(".modal .author-item").contains("button", "Edit").click();
    cy.get('.modal input[placeholder="e.g. Stat-Milestones"]').clear().type("New", { delay: 0 });
    cy.contains(".modal button", "Save changes").click();
    cy.toast("Author updated");
    cy.get(".modal .author-item .draft-name").should("have.text", "New");
    cy.get(".modal .author-item .btn-danger").click();
    cy.get(".modal .author-item").should("not.exist");
    cy.get("body").type("{esc}");
    cy.get(".author-select").should("be.disabled");
  });

  it("persists authors across reloads", () => {
    cy.contains("button", "Authors").click();
    addAuthor("Persisted", "", "");
    cy.get("body").type("{esc}");
    cy.reload();
    cy.get(".author-select").first().find("option").should("contain.text", "Persisted");
  });
});
