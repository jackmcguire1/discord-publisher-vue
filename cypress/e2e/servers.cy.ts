import { WEBHOOK } from "../support/e2e";

const SECOND = "https://discord.com/api/webhooks/222222222222222222/second-token_ABC";
const GUILD = "987654321098765432";

function addServer(name: string, guildId = "") {
  cy.get(".modal").within(() => {
    cy.contains("button", "+ Add server").click();
    cy.get('input[placeholder="Server name"]').type(name, { delay: 0 });
    if (guildId) cy.get('input[placeholder^="Discord server ID"]').type(guildId, { delay: 0 });
    cy.get(".server-form").contains("button", "Add").click();
  });
}

function addWebhook(name: string, url: string, server?: string) {
  cy.get(".modal").within(() => {
    cy.get('input[placeholder="e.g. Announcements"]').clear().type(name, { delay: 0 });
    cy.get('input[placeholder^="https://discord.com/api/webhooks"]').clear().type(url, { delay: 0 });
    if (server) cy.get(".webhook-server-select").select(server);
    cy.contains("button", "Add webhook").click();
  });
}

describe("servers", () => {
  beforeEach(() => {
    cy.visitClean();
    cy.stubDiscord();
    cy.contains("button", "Manage").click();
  });

  it("adds a server and groups webhooks under it in the dialog and the dropdown", () => {
    addServer("Stat-Milestones", GUILD);
    cy.toast("Server added");
    cy.get(".modal .server-item").should("have.length", 1).and("contain.text", "Stat-Milestones").and("contain.text", GUILD);

    // New server is preselected for the webhook being added.
    cy.get(".modal .webhook-server-select option:selected").should("have.text", "Stat-Milestones");
    addWebhook("Announcements", WEBHOOK);
    addWebhook("Loose hook", SECOND, "No server");

    cy.get(".modal .webhook-group").should("have.length", 2);
    cy.get(".modal .webhook-group").first().find(".group-label").should("have.text", "Stat-Milestones");
    cy.get(".modal .webhook-group").first().find(".webhook-item").should("have.length", 1).and("contain.text", "Announcements");
    cy.get(".modal .webhook-group").last().find(".group-label").should("have.text", "No server");
    cy.get("body").type("{esc}");

    cy.get("select.input optgroup").should("have.length", 2);
    cy.get('select.input optgroup[label="Stat-Milestones"] option').should("have.length", 1).and("have.text", "Announcements");
    cy.get('select.input optgroup[label="No server"] option').should("have.text", "Loose hook");
    cy.contains(".field-label", "Webhook").should("contain.text", "Stat-Milestones");
  });

  it("files published drafts under the webhook's server and builds proper Discord links", () => {
    addServer("Stat-Milestones", GUILD);
    addWebhook("Announcements", WEBHOOK);
    cy.get("body").type("{esc}");

    cy.contains("button", "Publish").click();
    cy.wait("@send");
    cy.contains("a", "open in Discord")
      .should("have.attr", "href")
      .and("eq", `https://discord.com/channels/${GUILD}/555666777888999000/999000111222333444`);

    cy.contains("button", "Drafts").click();
    cy.get(".modal .draft-group").should("have.length", 1).find(".group-label").should("have.text", "Stat-Milestones");
    cy.get(".modal .draft-item .draft-server-select option:selected").should("have.text", "Stat-Milestones");
    cy.get(".modal .draft-item a").should("have.attr", "href").and("include", GUILD);
  });

  it("lets a draft be moved between servers and shows unassigned ones separately", () => {
    addServer("Alpha");
    addServer("Beta");
    cy.get("body").type("{esc}");

    cy.window().then((w) => cy.stub(w, "prompt").returns("Loose draft"));
    cy.contains("button", "Save draft").click();
    cy.contains("button", "Drafts").click();

    cy.get(".modal .draft-group .group-label").should("have.text", "Unassigned");
    cy.get(".modal .draft-server-select").select("Beta");
    cy.get(".modal .draft-group .group-label").should("have.text", "Beta");
    cy.get(".modal .draft-server-select").select("Alpha");
    cy.get(".modal .draft-group .group-label").should("have.text", "Alpha");
  });

  it("deleting a server keeps its webhooks and drafts but ungroups them", () => {
    addServer("Temporary");
    addWebhook("Announcements", WEBHOOK);
    cy.get(".modal .webhook-group .group-label").should("have.text", "Temporary");
    cy.get(".modal .server-item .btn-danger").click();
    cy.get(".modal .server-item").should("not.exist");
    cy.get(".modal .webhook-item").should("have.length", 1);
    cy.get(".modal .webhook-group .group-label").should("have.text", "No server");
    cy.get("body").type("{esc}");
    cy.get("select.input optgroup").should("not.exist");
    cy.get("select.input option").should("have.length", 2);
  });

  it("edits a server name and keeps it on the webhook", () => {
    addServer("Old name");
    addWebhook("Announcements", WEBHOOK);
    cy.get(".modal .server-item").contains("button", "Edit").click();
    cy.get('.modal input[placeholder="Server name"]').clear().type("New name", { delay: 0 });
    cy.get(".modal .server-form").contains("button", "Save").click();
    cy.toast("Server updated");
    cy.get(".modal .webhook-group .group-label").should("have.text", "New name");
    cy.get("body").type("{esc}");
    cy.get('select.input optgroup[label="New name"]').should("exist");
  });

  it("round-trips server names through draft export and import", () => {
    addServer("Exported server", GUILD);
    addWebhook("Announcements", WEBHOOK);
    cy.get("body").type("{esc}");
    cy.contains("button", "Publish").click();
    cy.wait("@send");

    // Simulate an import on a browser that has no servers: a drafts file carrying a server entry.
    const file = {
      format: "discord-publisher-drafts",
      version: 1,
      exportedAt: new Date().toISOString(),
      servers: [{ id: "remote-1", name: "Imported server", guildId: "111" }],
      drafts: [
        { id: "x", name: "From elsewhere", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", serverId: "remote-1", message: { content: "hi", tts: false, embeds: [] } },
      ],
    };
    cy.contains("button", "Drafts").click();
    cy.get('.modal input[type="file"]').selectFile(
      { contents: Cypress.Buffer.from(JSON.stringify(file)), fileName: "drafts.json", mimeType: "application/json" },
      { force: true }
    );
    cy.toast("Imported 1 draft");
    cy.get(".modal .draft-group .group-label").should("contain.text", "Exported server").and("contain.text", "Imported server");
    cy.contains(".modal .draft-item", "From elsewhere").find(".draft-server-select option:selected").should("have.text", "Imported server");
  });
});
