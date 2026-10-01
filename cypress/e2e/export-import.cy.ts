describe("JSON and cURL", () => {
  beforeEach(() => cy.visitClean());

  it("shows the cleaned webhook payload as JSON", () => {
    cy.openModal("JSON");
    cy.get("textarea.code")
      .invoke("val")
      .then((val) => {
        const payload = JSON.parse(String(val));
        expect(payload.username).to.eq("Green Man Gaming");
        expect(payload.embeds[0]).to.not.have.property("id");
        expect(payload.embeds[0].fields).to.have.length(4);
        expect(payload).to.not.have.property("content");
      });
  });

  it("applies pasted JSON back into the editor", () => {
    cy.openModal("JSON");
    const incoming = {
      content: "From **JSON**",
      embeds: [{ title: "Imported", description: "desc", color: "#ff0000", fields: [{ name: "a", value: "b" }], footer: null }],
    };
    cy.get("textarea.code").clear().invoke("val", JSON.stringify(incoming)).trigger("input");
    cy.contains("button", "Apply to editor").should("not.be.disabled").click();
    cy.toast("Message replaced from JSON");

    cy.get(".discord-message-markup strong").should("have.text", "JSON");
    cy.get(".discord-embed-title").should("have.text", "Imported");
    cy.get(".discord-left-border").should("have.css", "background-color", "rgb(255, 0, 0)");
    cy.get('input[placeholder="#5865F2"]').should("have.value", "#ff0000");
  });

  it("rejects invalid JSON", () => {
    cy.openModal("JSON");
    cy.get("textarea.code").clear().invoke("val", "{ not json").trigger("input");
    cy.get(".modal .field-error").should("exist");
    cy.contains("button", "Apply to editor").should("be.disabled");
  });

  it("generates a cURL command for the configured webhook", () => {
    cy.setWebhook();
    cy.openModal("cURL");
    cy.get("textarea.code")
      .invoke("val")
      .should("include", "curl -X POST 'https://discord.com/api/webhooks/123456789012345678/abcDEF_test-token-xyz?wait=true'")
      .and("include", "-H 'Content-Type: application/json'")
      .and("include", '"username": "Green Man Gaming"');
    cy.contains("Edit published message").find("input").should("be.disabled");
  });

  it("offers an edit cURL once a message is published", () => {
    cy.stubDiscord();
    cy.setWebhook();
    cy.contains("button", "Publish").click();
    cy.wait("@send");
    cy.openModal("cURL");
    cy.contains("label", "Edit published message").click();
    cy.get("textarea.code").invoke("val").should("include", "curl -X PATCH").and("include", "/messages/999000111222333444");
  });

  it("closes modals with Escape", () => {
    cy.openModal("JSON");
    cy.get("body").type("{esc}");
    cy.get(".modal").should("not.exist");
  });
});
