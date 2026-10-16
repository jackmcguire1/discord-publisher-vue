# AGENTS.md

Guidance for Codex when working in this repository.

## What this is

A minimal Vue 3 + Vite + TypeScript app for composing and publishing Discord webhook messages (content + embeds). It replaces a forked React "Embed Generator" with a stripped-down rewrite. Guests (signed out) use the full editor with webhooks, servers, authors and drafts in localStorage, like the original app. Signing in (Firebase Auth, email link only) moves the user into organizations, where those collections live in Firestore under the active org; guest data can then be imported. There is no server code (no Cloud Functions): the browser still calls Discord directly, so any org member can read webhook tokens, and Firestore rules are the only access control. Firebase Storage is deliberately not used (it needs the Blaze plan). No router library (`src/router.ts` is a tiny hash router), no UI framework and no state library.

## Commands

```bash
yarn emulators   # Firebase auth/firestore emulators (needs Java; `mise install` provides it); UI on :4000
yarn dev         # dev server, talks to the emulators (.env.development)
yarn typecheck   # vue-tsc -b
yarn build       # typecheck + vite build -> dist/, uses the production config in .env
yarn test        # starts the emulators, then Cypress e2e headless against vite on port 5180
yarn test:open   # Cypress interactive runner (start `yarn emulators` first)
yarn test:rules  # Firestore security rules tests (node --test, tests/rules/)
yarn deploy:rules # deploy rules + indexes to the production project
```

`yarn emulators` saves its data to `.emulator-data/` (gitignored) on exit and reloads it on start; delete the folder to start fresh. The test scripts never use it. In development, sign-in links are not emailed: the auth emulator prints them in the `yarn emulators` output. The emulators use the `demo-discord-publisher` project id, so nothing can reach production.

CI (`.github/workflows/ci.yml`) runs typecheck, build, the rules tests and the Cypress suite (against the emulators) on every PR. Dependabot PRs for minor/patch bumps auto-merge when CI is green. Keep the suite passing and add a spec when adding user-visible behaviour.

## Layout

- `src/discord/schema.ts` – Zod schema for the editable message, limits, `validateMessage`, `parseIncomingMessage` (normalises any raw payload into editor state).
- `src/discord/webhook.ts` – webhook URL parsing, `buildPayload` (strips editor-only `id`s and empty values), send/edit/delete/fetch calls, cURL generation.
- `src/discord/markdown.js` – Discord markdown → HTML for the preview (ported; keep it plain JS).
- `src/firebase.ts` – Firebase app/auth/firestore init; connects to the emulators when `VITE_FIREBASE_EMULATORS=true`.
- `firebase/firestore.rules` – the security model (data model documented at the top of the Firestore rules). Change them together with `tests/rules/`.
- `src/stores/session.ts` – auth (email link), the user's memberships and invites, `activeOrgId`, `canManage`, `createOrg`/`acceptInvite`. `src/stores/org.ts` – members/invites of the active org and admin actions.
- `src/stores/orgCollection.ts` – mirrors `orgs/{activeOrgId}/{name}` into a reactive array and writes through optimistically, so `webhooks`, `servers`, `authors` and `drafts` keep a synchronous API. For guests the same API reads and writes localStorage under `name` instead; guests never touch Firestore, so the rules don't cover them.
- `src/stores/*` (others) – `message` (undo/redo + validation), `settings` and `toasts` stay per-device in `localStorage` via `persist.ts` (prefix `discord-publisher:`). `legacy.ts` offers to import guest (and pre-Firebase) localStorage data into the active org after sign-in. `settings.webhookId` points at a saved webhook; a hand-typed URL sets it to null.
- `src/router.ts` – hash routes: `#/` (editor) and `#/settings/{general|members|webhooks|authors|account}`. Hash routing keeps GitHub Pages happy and leaves the query string to Firebase sign-in links.
- `src/components/*` – `NavBar` (brand, Editor/Settings links, org switcher, avatar menu or Sign in), `SettingsPage` (sidebar tabs), editor, preview, publish panel, and the JSON / cURL / drafts modals. Webhooks and authors are `*Panel` components shared by their quick-access modals and the settings page; the org/members/account panels only live in settings.
- `cypress/e2e/*.cy.ts` – e2e specs; `cypress/support/e2e.ts` holds the custom commands. `cy.visitClean()` wipes the emulators, signs in through the real email-link flow (reading the auth emulator's outbox) and creates an org; `cy.visitGuest()` opens the editor signed out. Discord is stubbed with `cy.intercept`, never called for real.
- `src/styles/app.css` – app styling via CSS variables. `src/styles/preview.css` is a pruned port of the discord-components stylesheet; only touch it for preview fidelity.

## Conventions

- Roles: `owner` | `admin` | `member`. Admins manage webhooks, servers, invites and roles; every member reads everything and writes authors and drafts. Hide admin-only UI behind `canManage` (true for guests, who own their local data), but the rules are the real enforcement.
- Membership listeners ignore docs with pending writes: attaching org listeners before the membership commits gets them permanently denied.
- The Firebase web config in `.env` is public by design; never commit service-account keys.
- Keep dependencies minimal. Prefer a few lines of code over a new package.
- Embed/field objects carry a numeric `id` used only for Vue keys; it must never reach the webhook payload.
- Optional nested embed objects (`author`, `footer`, `image`, `thumbnail`) are set to `undefined` when empty rather than left as `{}`.
- Drafts store the webhook **id** only, never the token. Saved webhooks (which do hold the token) are never included in draft exports. Draft exports do carry the referenced servers (name + guild id) so imports can regroup by name.
- The authors dialog is opened through `openAuthors(prefill)` in `authors.ts` rather than props, because it is triggered from the toolbar, the webhook identity section and every embed. `App.vue` renders it while `authorsDialog` is set.
- `servers.ts` imports from `webhooks.ts` and `drafts.ts` (to ungroup on delete); those two must not import `servers.ts` back, or the module graph cycles. `session.ts` must not import any data store; they import it.
- Embed cards carry the `embed-card` class and field cards `field-card`; tests select on those. The publish panel also uses `.card`, so never select embeds with a bare `.card`.
