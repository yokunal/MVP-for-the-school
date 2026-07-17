# School Library

A digital library web app for a school — students and teachers read PDFs and EPUBs in the browser; admins manage books and users. Built with Next.js 14 (App Router, TypeScript), Prisma + PostgreSQL, Cloudflare R2, NextAuth, react-pdf, epub.js, PapaParse, and the Anthropic Claude API.

## Status

**All 8 build steps done.** The app ships everything in the brief: auth, role-based access, admin user + book management, library views, in-browser PDF and EPUB readers with progress persistence, CSV bulk user import, per-book chatbot, and the polished dashboard with continue-reading / empty states.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui (New York, neutral)
- Prisma + PostgreSQL (Railway Postgres plugin in production)
- Cloudflare R2 (S3-compatible) — files accessed exclusively via short-lived signed URLs
- NextAuth.js (Credentials, JWT) — token carries id, role, classGrade
- react-pdf for paginated/zoomable PDF reading
- epub.js for reflowable EPUB reading
- PapaParse for CSV bulk user import
- Anthropic Claude for per-book chatbot

## Local development

Requires Node 20+ and npm (or pnpm).

```bash
npm install
cp .env.example .env
# fill in DATABASE_URL (local Postgres), R2_*, NEXTAUTH_SECRET
# optional: SEED_ADMIN_* — bootstraps the first ADMIN if all three are set
npx prisma migrate deploy      # apply migrations
npx prisma db seed             # creates the seed admin if SEED_ADMIN_* are set
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/login` — sign in with the seed admin and you'll land on `/admin`. After you upload a book or create a STUDENT/TEACHER, sign in as them to see `/dashboard`.

## Environment variables

See `.env.example`. All of these are required in production:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Railway Postgres plugin sets this automatically |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | e.g. `https://your-app.up.railway.app` |
| `R2_*` | Account ID, access key, secret, bucket, endpoint (S3-style), TTL |
| `ANTHROPIC_API_KEY` | For the per-book chatbot |
| `SEED_ADMIN_*` | First admin: email / password / name — all-or-nothing; idempotent |

## Project layout

```
prisma/
  schema.prisma          # User, Book, ReadingProgress, Role/Library enums
  seed.ts                # idempotent admin bootstrap from SEED_ADMIN_*
  migrations/0_init/     # the initial schema migration
src/
  middleware.ts              # role-based route protection
  app/
    layout.tsx               # providers wrapper
    page.tsx                 # → redirects to /login or /dashboard
    login/page.tsx           # credentials sign-in
    dashboard/page.tsx       # role-aware dashboard with continue reading
    libraries/[library]/     # library grid + search/filter
    books/[bookId]/          # book detail + chat panel
    books/[bookId]/read/     # PDF or EPUB reader
    admin/                   # admin layout, dashboard, books, users
    api/
      auth/[...nextauth]/         # NextAuth
      files/sign/                # ONLY place that issues R2 URLs
      reading-progress/[bookId]/ # GET/PUT last location
      chat/[bookId]/             # Anthropic proxy
      admin/
        books/upload-url/        # presigned PUT for direct browser → R2
        books/                   # POST create
        books/[bookId]/          # PATCH/DELETE
        users/                   # POST single user
        users/[id]/              # PATCH (toggle active)
        users/[id]/reset-password/  # POST → new temp password
        users/bulk-preview/      # CSV → preview
        users/bulk-commit/       # CSV → commit
  components/
    ui/                     # shadcn primitives
    nav-bar.tsx
    book-card.tsx, book-cover.tsx, book-grid.tsx, book-chat.tsx
    pdf-reader.tsx, epub-reader.tsx
    login-form.tsx
    admin/
      admin-header.tsx
      book-form.tsx
      users-table.tsx, add-user-form.tsx, csv-import.tsx
  lib/
    auth.ts                 # NextAuth options (Credentials + JWT)
    access.ts               # AccessPolicy: libraries, role checks
    session.ts              # requireUser / requireAdmin helpers
    env.ts                  # zod-validated env
    db.ts                   # HMR-safe PrismaClient
    r2.ts                   # S3 client + presign + health check
    uploads.ts              # UploadKeyBuilder — namespaced R2 keys
    csv.ts                  # CsvUserParser — bulk-import validation
    books.ts                # BookValidator
    utils.ts                # cn()
    epubjs.d.ts             # hand-rolled types for epubjs
  types/
    index.ts                # Library/Role re-exports + labels
    next-auth.d.ts          # session/JWT augmentation
```

## Build order

1. ✅ Project scaffold, Prisma schema, Postgres, Railway, R2
2. ✅ NextAuth credentials + role-based middleware
3. ✅ Admin single-user creation + book upload/edit (R2 presigned PUT)
4. ✅ Library views + book detail, filtered by role/class
5. ✅ PDF + EPUB reader with reading-progress persistence
6. ✅ CSV bulk import + manual password reset
7. ✅ Per-book chatbot (Anthropic)
8. ✅ Polish: continue reading, search/filter, empty states, responsive UI

## Notes

- The DB stores **R2 object keys** (e.g. `books/pdf/<hash>.pdf`), never URLs. The `/api/files/sign` route translates keys to short-lived URLs at request time. R2 credentials/bucket can rotate without rewriting data.
- Access control lives in `lib/access.ts`; the same rules gate the file-sign URL, the library page, the book detail page, and the reader.
- The chatbot is **strictly scoped** to one book's metadata. The system prompt says outright that the model has not read the book; questions the metadata can't answer are acknowledged as such.
- File uploads go straight from the browser to R2 via a presigned PUT — the Next.js server never sees the bytes.
- `prisma migrate deploy` runs on every deploy — idempotent; only unapplied migrations run.
