import { WEBHOOK } from "../support/e2e";

const FS = "http://127.0.0.1:8080/v1/projects/demo-discord-publisher/databases/(default)/documents";
const orgDocs = () => cy.request({ url: `${FS}/orgs`, headers: { Authorization: "Bearer owner" } }).its("body.documents");

describe("organizations page", () => {
  beforeEach(() => {
    cy.visitClean();
    cy.accountMenu("Organizations");
  });

  it("creates a second organization alongside the first and switches between them", () => {
    cy.contains("button", "+ New organization").click();
    cy.get(".new-org-form input").type("Second Org", { delay: 0 });
    cy.contains(".new-org-form button", "Create").click();
    cy.toast("Created Second Org");

    cy.get(".org-item").should("have.length", 2);
    cy.contains(".org-item", "Second Org").should("contain.text", "current");
    cy.contains(".org-item", "Test Org").contains("button", "Switch").should("exist");
    cy.get(".org-name-input").should("have.value", "Second Org");
    orgDocs().should("have.length", 2);

    cy.contains(".org-item", "Test Org").contains("button", "Switch").click();
    cy.contains(".org-item", "Test Org").should("contain.text", "current");
    cy.get(".org-name-input").should("have.value", "Test Org");
    cy.get("select.org-select").find("option:selected").should("have.text", "Test Org");
  });

  it("deletes the current organization and everything in it, falling back to another", () => {
    // Give the org some content first.
    cy.contains(".settings-tab", "Webhooks").click();
    cy.get(".settings input[placeholder='e.g. Announcements']").type("Doomed hook", { delay: 0 });
    cy.get(".settings input[placeholder^='https://discord.com/api/webhooks']").type(WEBHOOK, { delay: 0 });
    cy.contains(".settings button", "Add webhook").click();
    cy.toast("Webhook saved");

    cy.contains(".settings-tab", "Organizations").click();
    cy.contains("button", "+ New organization").click();
    cy.get(".new-org-form input").type("Keeper", { delay: 0 });
    cy.contains(".new-org-form button", "Create").click();
    cy.contains(".org-item", "Test Org").contains("button", "Switch").click();
    cy.contains(".org-item", "Test Org").should("contain.text", "current");

    // A mistyped name deletes nothing.
    cy.window().then((w) => cy.stub(w, "prompt").as("prompt").onFirstCall().returns("wrong").onSecondCall().returns("Test Org"));
    cy.get(".delete-org").click();
    cy.toast("Name didn't match");
    orgDocs().should("have.length", 2);

    cy.get(".delete-org").click();
    cy.toast("Deleted Test Org");
    cy.get(".org-item").should("have.length", 1).and("contain.text", "Keeper").and("contain.text", "current");
    cy.get(".toast-error").should("not.exist");
    orgDocs().should("have.length", 1).its("0.fields.name.stringValue").should("eq", "Keeper");
  });

  it("deleting your only organization returns you to the welcome screen", () => {
    cy.window().then((w) => cy.stub(w, "prompt").returns("Test Org"));
    cy.get(".delete-org").click();
    cy.toast("Deleted Test Org");
    cy.contains("h2", "Create an organization").should("be.visible");
    cy.get(".toast-error").should("not.exist");
  });

  it("owners cannot leave, so they only see delete in the danger zone", () => {
    cy.get(".danger-zone").should("be.visible");
    cy.get(".leave-org").should("not.exist");
    cy.get(".delete-org").should("exist");
  });
});
