## Tokyo Tester UI

This `ui-v2` app now includes Auth.js credentials authentication with a one-time `/setup` flow for the first admin account.

## Getting Started

1. Install dependencies:

```bash
bun dev
```

2. Configure environment variables. The auth layer uses the same database mode as the runner:

```bash
DB_TYPE=sqlite
DB_PATH=./data/tokyo-tester-auth.db
# DATABASE_URL=postgres://...

AUTH_SECRET=replace-with-a-long-random-secret
AUTH_TRUST_HOST=true
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_INNGEST_URL=http://localhost:8288
```

3. Run the auth/database migration:

```bash
bun run db:migrate
```

4. Start the development server:

```bash
bun dev
```

5. Open [http://localhost:3000/setup](http://localhost:3000/setup) on the first boot to create the initial admin user. After setup is complete, the app redirects unauthenticated users to `/login`.

## Useful Scripts

- `bun dev`: start the Next.js dev server
- `bun run db:migrate`: apply the checked-in auth schema for the selected database mode using Node runtime compatibility for SQLite
- `bun run db:generate`: generate Drizzle migrations from the current schema
- `bun test`: run tests discovered by Bun
- `node --import tsx --test src/modules/auth/server/service.test.ts`: run the auth service tests with Node

## Notes

- Credentials login currently supports email and password only.
- Roles currently include `admin` and `normal`, with the role column stored as text so additional roles can be added later.
- The Auth.js session uses JWT strategy because the Credentials provider requires JWT-backed sessions.
