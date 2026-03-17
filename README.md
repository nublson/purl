# Purl

**Save links. Ask questions. Get answers.**

Purl is an AI-powered read-it-later app. Save any link from the web, and Purl extracts, understands, and remembers the content for you. Weeks later, just ask — Purl searches your saved knowledge and gives you answers with sources.

- **Product context**: see `ABOUT.md`

## Tech stack

- **Web**: Next.js (App Router), React, TypeScript
- **UI**: Tailwind + shadcn/ui
- **Auth**: Better Auth
- **Database**: Postgres + Prisma
- **Email** (optional for local dev): Resend (verification emails)

## Setup (local development)

### Prerequisites

- **Node.js**: install a recent LTS
- **Package manager**: `pnpm` (this repo includes `pnpm-lock.yaml`)
- **Postgres**: local or hosted

### 1) Install dependencies

```bash
pnpm install
```

### 2) Configure environment variables

Create a `.env` file in the repo root.

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"

# Optional (used for email verification on signup)
RESEND_API_KEY="re_..."
RESEND_FROM="Purl <onboarding@resend.dev>"
```

Notes:

- **`DATABASE_URL` is required** (Prisma + Better Auth)
- **Resend is optional** for local dev: if `RESEND_API_KEY` is not set, signup still works but verification emails won’t send

### 3) Run database migrations

```bash
pnpm prisma migrate dev
```

### 4) Start the dev server

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Useful commands

```bash
pnpm lint
pnpm build
pnpm start
```
