<div align="center">

# FlowForm

Create, share, and analyze modern forms with branching logic, analytics, and Supabase-backed security.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20Postgres-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

---

## Features

### Form Builder
- Drag-and-drop editor (`@dnd-kit`)
- Question types: section, short answer, paragraph, multiple choice, checkbox, dropdown, date, time, email, number, image upload
- Undo/redo + auto-save + manual save
- Version snapshots and restore
- Conditional show/hide logic

### Branching & Flow
- Route from question to specific section
- Option-level branching (`optionBranchToSectionIds`)
- Direct route to submit via `__submit__`
- Mini flow map + safety warnings in editor
- Quick-fix tools for invalid/backward loop routes

### Theme & UX
- Accent/background color control
- Header image + logo
- Header image fit/position controls
- Multiple title/body font choices
- Progress bar preview and settings

### Responses & Analytics
- Summary charts + raw responses
- Route and section analytics
- Section funnel + branch option funnel
- Drop-off heatmap + completion trend
- Enhanced analytics CSV export

### Access & Security
- Supabase Auth sign-in
- Role-based collaboration:
  - `owner`
  - `editor`
  - `viewer`
- Audit timeline for form/collaborator changes
- RLS policies for forms/responses/collaborators/audit logs
- Optional strict server-side forward-route validation

### Optional Upload Backend
- Flask temp-storage server for images
- Per-form quota controls
- Closed-form delayed compression
- Works with fallback to base64 when server is unavailable

---

## Tech Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui + Base UI
- Zustand
- Supabase (Auth, Postgres, Storage, RLS)
- Recharts
- Motion
- Flask + Pillow (optional upload server)

---

## Project Structure

```text
src/
  app/
    (protected)/dashboard
    (protected)/form/[formId]
    f/[formId]
    view/[formId]
    api/validate-email
    api/temp-storage/*
  components/
    AuthWrapper.tsx
    Dashboard.tsx
    Editor.tsx
    ViewForm.tsx
    Responses.tsx
    ui/*
  lib/
    formsApi.ts
    formStatus.ts
    imageUpload.ts
    profilesApi.ts
    supabase.ts
  store/
    useAuthStore.ts
    useFormStore.ts
  types.ts

server/
  app.py
  requirements.txt

supabase/
  schema.sql
  migrations/
    202604260001_phase4_collaboration_audit_and_route_validation.sql
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.10+ (optional, for upload server)
- Supabase project

### 1) Install

```bash
npm install
```

### 2) Environment

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

NEXT_PUBLIC_ENABLE_TEMP_STORAGE_UPLOADS=true
TEMP_STORAGE_SERVER_URL=http://127.0.0.1:25534
TEMP_STORAGE_SERVER_TOKEN=your-secret-token
```

### 3) Database setup

Fresh environment:
- Run [`supabase/schema.sql`](supabase/schema.sql)

Existing environment:
- Apply migration files in order from [`supabase/migrations/`](supabase/migrations/)
- See [`supabase/migrations/README.md`](supabase/migrations/README.md)

### 4) Run dev

```bash
npm run dev
```

- Web: `http://localhost:3000`
- Upload server: `http://127.0.0.1:25534`

Use `npm run dev:web` for web only.

---

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Run Next.js + Flask together |
| `npm run dev:web` | Run Next.js only |
| `npm run dev:server` | Run Flask upload server only |
| `npm run build` | Build Next.js app |
| `npm run start` | Start production server |
| `npm run lint` | Type check (`tsc --noEmit`) |
| `npm run clean` | Remove `.next`, `out`, `dist` |

---

## Supabase Notes

Main tables:
- `forms`
- `responses`
- `profiles`
- `form_collaborators`
- `form_audit_logs`

Key DB functions/triggers:
- `increment_form_views`
- `enforce_response_email_rules` (trigger)
- `resolve_user_id_by_email_for_form_owner`
- `validate_form_routes` (trigger)
- `write_form_audit_log` (trigger)

---

## Upload Server Endpoints

See [`server/README.md`](server/README.md) for details.

Core endpoints:
- `GET /health`
- `POST /upload`
- `GET /files/<key>`
- `DELETE /files/<key>`
- `GET /forms/<form_id>/status`
- `POST /forms/<form_id>/close`
- `POST /forms/<form_id>/open`
- `POST /maintenance/compress-now`

---

## Current Upgrade Status

See [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md).

- Phase 1: done
- Phase 2: done
- Phase 3: done
- Phase 4: done

---

## License

Private project. Not licensed for redistribution.
