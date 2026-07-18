# PKH Document Generator

A production-ready document generator for **PKH (Program Keluarga Harapan)** — the Indonesian Ministry of Social Affairs' conditional cash transfer program. Upload source documents (PDF / Office / CSV / JSON), auto-extract data, and generate official-looking HTML forms with handwritten-style checkmarks, digital signatures, and BSrE certification stamps.

Built with **Next.js 16 (App Router)**, **TypeScript**, **Tailwind CSS 4**, and **shadcn/ui**.

---

## Features

- **Drag & drop upload** for PDF, DOCX, XLSX, CSV, JSON, and image files
- **Auto text extraction** from PDF (via Python `pdfplumber`) and Office files
- **Auto form-type detection** — Pendidikan / Kesehatan / Kesejahteraan Sosial
- **Live HTML preview** rendered in an iframe (looks like the final PDF)
- **Handwritten-style checkmarks** — 7 SVG variants with Bezier curves, pen-pressure variation, ink-bleed, and rotation for a natural look
- **Digital signatures** using the Dancing Script cursive font with rotation
- **BSrE stamp** — one per document, 70% transparent, dark blue
- **Attendance rate** randomized between 90–100% per record
- **Replaceable logo** — upload a custom logo or use the default
- **Dark-blue color scheme** (official look, not red)
- **PDF export** of the generated form

---

## Tech Stack

| Layer        | Technology                                  |
|--------------|---------------------------------------------|
| Framework    | Next.js 16 (App Router, Turbopack)          |
| Language     | TypeScript 5                                |
| Styling      | Tailwind CSS 4 + shadcn/ui (New York)       |
| Database     | Prisma ORM (SQLite)                         |
| State        | Zustand (client) + TanStack Query (server)  |
| PDF extract  | Python `pdfplumber` / `pikepdf`             |
| PDF export   | Headless render pipeline                    |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20 (or **Bun** ≥ 1.1 — recommended)
- **Python 3** with `pdfplumber` and `pikepdf`:
  ```bash
  pip install pdfplumber pikepdf
  ```

### Install & Run

```bash
# install dependencies
bun install

# push the database schema
bun run db:push

# start the dev server (http://localhost:3000)
bun run dev
```

### Production Build

```bash
bun run build
bun run start
```

The build uses Next.js `output: "standalone"`, producing a self-contained server in `.next/standalone/`.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                 # 4-step wizard: Upload → Review → Generate → Export
│   └── api/pkh/
│       ├── parse/route.ts       # upload + extract text
│       ├── generate/route.ts    # build the HTML form
│       ├── export-pdf/route.ts  # HTML → PDF
│       └── sample-data/route.ts # demo data per form type
├── lib/pkh/
│   ├── types.ts                 # PKHRecord, PKHFormData, FormType
│   ├── document-extractor.ts    # PDF/Office text extraction
│   ├── parser.ts                # form-type detection + JSON/CSV parsing
│   └── form-generator.ts        # HTML form builder (checkmarks, signatures, stamps)
└── components/ui/               # shadcn/ui component set
```

---

## Deployment

### Option A — Docker

```bash
docker build -t pkh-doc-generator .
docker run -p 3000:3000 -v $(pwd)/prisma:/app/prisma pkh-doc-generator
```

See [`Dockerfile`](./Dockerfile).

### Option B — Vercel

1. Push this repo to GitHub.
2. Import it on [vercel.com](https://vercel.com/new).
3. Framework preset: **Next.js**.
4. Add environment variable `DATABASE_URL` (use a persistent Postgres/MySQL URL — SQLite is local-only).

> **Note:** This app uses SQLite by default, which does **not** work on serverless platforms (Vercel). For serverless deployment, switch the Prisma datasource to Postgres and update `DATABASE_URL`.

### Option C — Self-hosted (standalone)

```bash
bun run build
cd .next/standalone
NODE_ENV=production node server.js
```

---

## Environment Variables

| Variable        | Description                          | Default                          |
|-----------------|--------------------------------------|----------------------------------|
| `DATABASE_URL`  | Prisma database connection string    | `file:./prisma/dev.db` (SQLite)  |

Copy `.env.example` → `.env` and adjust as needed.

---

## License

Internal tool for the Indonesian Ministry of Social Affairs. All rights reserved.
