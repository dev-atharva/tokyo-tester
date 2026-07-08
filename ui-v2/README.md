## Tokyo Tester UI

This `ui-v2` app now includes Auth.js credentials authentication with a one-time `/setup` flow for the first admin account.

## Getting Started

For the complete application, use `make dev` from the repository root. It starts the UI and runner and applies pending migrations automatically. `make dev` may run the runner on the host when the Docker socket is non-standard. Use `make dev-local` when you want both the UI and runner on the host. The steps below are only for running the UI process by itself.

1. Install dependencies:

```bash
bun install
```

2. Configure environment variables. The auth layer uses the same database mode as the runner:

```bash
DB_TYPE=sqlite
DB_PATH=./data/tokyo-tester-auth.db
# DATABASE_URL=postgres://...

AUTH_SECRET=replace-with-a-long-random-secret
AUTH_TRUST_HOST=true
```

3. Run the auth/database migration:

```bash
bun run db:migrate
```

`db:migrate` runs `node ./src/db/migrate.mjs` under the hood. The app runtime stays on Bun, but SQLite migration uses Node because the current setup depends on `better-sqlite3`.

4. Start the development server:

```bash
bun dev
```

5. Open [http://localhost:3000/setup](http://localhost:3000/setup) on the first boot to create the initial admin user. After setup is complete, the app redirects unauthenticated users to `/login`.

## Useful Scripts

- `bun dev`: start the Next.js dev server
- `bun run build`: create the production build
- `bun run start`: start the production server
- `bun run db:migrate`: apply the checked-in auth schema for the selected database mode
- `bun run db:generate`: generate Drizzle migrations from the current schema
- `bun test`: run tests discovered by Bun
- `node --import tsx --test src/modules/auth/server/service.test.ts`: run the auth service tests with Node

## Sync And Execution Notes

- workflow definitions are edited locally in Zustand-backed stores and synced to the backend in batches
- the sync queue is persisted in `localStorage`, restored on startup, and flushed on interval plus page hide/close events
- active workflow runs also reconcile from the backend, so logs and results can recover if realtime updates are missed
- execution-owned entities like workflow runs, scenario runs, and test results are treated as backend-owned during a run
- Personal and Team workspaces share the workflow builder but enforce owner, editor, and runner permissions
- workflow edits use optimistic concurrency; stale changes require loading the current version or preserving the local edit as a copy
- immutable workflow revisions are created manually, on execution, and when restoring history

## Notes

- Credentials login currently supports email and password only.
- Roles currently include `admin` and `normal`, with the role column stored as text so additional roles can be added later.
- The Auth.js session uses JWT strategy because the Credentials provider requires JWT-backed sessions.
