import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5180",
    supportFile: "cypress/support/e2e.ts",
    specPattern: "cypress/e2e/**/*.cy.ts",
    viewportWidth: 1440,
    viewportHeight: 900,
    video: false,
    screenshotOnRunFailure: true,
    // Nothing in this app is slow locally; fail fast. CI runners are slower, and
    // after a reload the Firestore cache can wait out the previous page's tab
    // lease (~5s), so CI gets more room and one retry for a test that times out.
    defaultCommandTimeout: process.env.CI ? 15000 : 6000,
    retries: { runMode: process.env.CI ? 1 : 0, openMode: 0 },
  },
});
