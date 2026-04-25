# Supabase Migrations

This folder stores incremental SQL migrations for existing environments.

## Current migration order

1. `202604260001_phase4_collaboration_audit_and_route_validation.sql`

## How to apply

### Option A: Supabase SQL Editor (quick/manual)

1. Open your project SQL Editor.
2. Run each migration file in filename order.
3. Verify there are no errors.

### Option B: Supabase CLI (recommended for teams)

```bash
supabase db push
```

If you keep a remote database only and apply manually, still commit migration files here so every environment stays in sync.
