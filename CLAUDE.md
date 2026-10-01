# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A minimal, client-only Vue 3 + Vite + TypeScript app for composing and publishing Discord webhook messages (content + embeds). It replaces a forked React "Embed Generator" with a stripped-down rewrite. There is intentionally no backend, no router, no UI framework and no state library.

## Commands

```bash
yarn dev         # dev server
yarn typecheck   # vue-tsc -b
yarn build       # typecheck + vite build -> dist/
yarn test        # Cypress e2e, headless, against vite on port 5180
yarn test:open   # Cypress interactive runner
```

CI (`.github/workflows/ci.yml`) runs typecheck, build and the Cypress suite on every PR. Dependabot PRs for minor/patch bumps auto-merge when CI is green. Keep the suite passing and add a spec when adding user-visible behaviour.

## Layout

- `src/discord/schema.ts` – Zod schema for the editable message, limits, `validateMessage`, `parseIncomingMessage` (normalises any raw payload into editor state).
- `src/discord/webhook.ts` – webhook URL parsing, `buildPayload` (strips editor-only `id`s and empty values), send/edit/delete/fetch calls, cURL generation.
- `src/discord/markdown.js` – Discord markdown → HTML for the preview (ported; keep it plain JS).
- `src/stores/*` – module-level reactive stores (`message` with undo/redo + validation, `drafts`, `settings`, `toasts`) persisted via `persist.ts` to `localStorage` under the `discord-publisher:` prefix.
- `src/components/*` – editor, preview, publish panel, and the JSON / cURL / drafts modals.
- `cypress/e2e/*.cy.ts` – e2e specs; `cypress/support/e2e.ts` holds the custom commands. Discord is stubbed with `cy.intercept`, never called for real.
- `src/styles/app.css` – app styling via CSS variables. `src/styles/preview.css` is a pruned port of the discord-components stylesheet; only touch it for preview fidelity.

## Conventions

- Keep dependencies minimal. Prefer a few lines of code over a new package.
- Embed/field objects carry a numeric `id` used only for Vue keys; it must never reach the webhook payload.
- Optional nested embed objects (`author`, `footer`, `image`, `thumbnail`) are set to `undefined` when empty rather than left as `{}`.
- Drafts store the webhook **id** only, never the token.
- Embed cards carry the `embed-card` class and field cards `field-card`; tests select on those. The publish panel also uses `.card`, so never select embeds with a bare `.card`.
