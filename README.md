<div align="center">

# 🌊 FlowForm

**Create, share, and analyze beautiful forms — effortlessly.**

A modern, full-stack form builder with drag-and-drop editing, real-time analytics, conditional logic, and a refined natural design system.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20Postgres-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Getting Started](#-getting-started) • [Features](#-features) • [Architecture](#-architecture) • [Commands](#-commands)

</div>

---

## ✨ Features

### 📝 Intuitive Form Editor
- **Drag-and-drop** question reordering with `@dnd-kit`
- **10 question types**: Short answer, Paragraph, Multiple choice, Checkboxes, Dropdown, Date, Time, Email, Number, Image upload
- **Undo/Redo** support with full history tracking (up to 50 steps)
- **Auto-save** with real-time status indicator and local draft recovery
- **Form versioning** — save and label snapshots of your form at any point

### 🎨 Customization & Theming
- Custom **accent colors**, **background colors**, **logo**, and **header images**
- Choose from multiple **font families** (Sans-serif, Serif, Monospace)
- Add **images to individual options** in choice-based questions
- Beautiful **natural design system** with light/dark mode support

### 🧠 Smart Logic & Validation
- **Conditional logic** — show or hide questions based on answers (all/any match)
- Field-level **validation rules**: min/max length, regex patterns, date constraints, selection limits
- **Server-side email validation** via dedicated API endpoint

### 📊 Response Analytics
- **Summary view** with Pie charts and Bar charts (powered by Recharts)
- **Raw data** tab for inspecting individual responses
- **Analytics** tab with word frequency analysis for open-ended questions
- **Export to CSV** with one click
- Track **completion time** and **respondent timezone**

### 🔐 Security & Access Control
- **Supabase Auth** with email/password sign-in (no public registration)
- **Row Level Security (RLS)** policies on all tables — users only access their own data
- Public forms are readable by anyone, but only authenticated creators can modify them
- Expiring forms with **expiration dates** — auto-reject submissions after deadline

### 📱 Responsive Preview
- Preview forms in **Desktop**, **Tablet**, and **Mobile** viewports
- Share forms via direct link or **QR code** (built into the editor)
- Custom **redirect URL** after submission

### 🖼️ Temporary Upload Server
- Lightweight **Flask-based** image upload backend (optional)
- Form-aware lifecycle: auto-compress images for closed forms after 7 days
- Per-form quotas for file count and total storage
- Deploys to **Pterodactyl** or any Python host

### 📋 Form Templates
Get started quickly with built-in templates:
| Template | Description |
|---|---|
| **Blank Form** | Start from scratch |
| **Party Invite** | RSVP with attendance tracking |
| **Customer Feedback** | Collect reviews and suggestions |
| **Contact Information** | Gather contact details |

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router) |
| **UI** | [React 19](https://react.dev/), [Tailwind CSS 4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/), [Base UI](https://base-ui.com/) |
| **State** | [Zustand](https://zustand-demo.pmnd.rs/) |
| **Backend** | [Supabase](https://supabase.com/) (Auth, Postgres, Storage, RLS) |
| **Charts** | [Recharts](https://recharts.org/) |
| **Animations** | [Motion](https://motion.dev/), [tw-animate-css](https://github.com/nicolo-ribaudo/tw-animate-css) |
| **Drag & Drop** | [@dnd-kit](https://dndkit.com/) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Upload Server** | [Flask](https://flask.palletsprojects.com/), [Pillow](https://python-pillow.org/) |
| **Language** | [TypeScript 5.8](https://www.typescriptlang.org/), Python 3 |

---

## 📁 Project Structure

```
FlowForm/
├── src/
│   ├── app/                        # Next.js App Router pages
│   │   ├── (protected)/            # Auth-gated routes
│   │   │   ├── dashboard/          # Form management dashboard
│   │   │   └── form/[formId]/      # Editor, Preview, Responses
│   │   ├── api/                    # API routes
│   │   │   ├── temp-storage/       # Upload proxy & form status sync
│   │   │   └── validate-email/     # Server-side email validation
│   │   ├── f/[formId]/             # Public form submission page
│   │   └── view/[formId]/          # Legacy redirect → /f/[formId]
│   ├── components/                 # React components
│   │   ├── ui/                     # shadcn/ui primitives
│   │   ├── AuthWrapper.tsx         # Sign-in/sign-out gate
│   │   ├── Dashboard.tsx           # Form list, search, templates
│   │   ├── Editor.tsx              # Full-featured form editor
│   │   ├── ViewForm.tsx            # Public form renderer
│   │   ├── Responses.tsx           # Analytics & response viewer
│   │   ├── NewsCard.tsx            # Content card component
│   │   └── DarkModeToggle.tsx      # Light/dark theme switch
│   ├── hooks/                      # Custom React hooks
│   ├── lib/                        # API clients, Supabase, utilities
│   ├── store/                      # Zustand stores (auth, form)
│   ├── types.ts                    # Shared TypeScript interfaces
│   └── index.css                   # Tailwind + natural design tokens
├── server/                         # Temporary upload backend (Flask)
│   ├── app.py                      # Flask API server
│   └── requirements.txt            # Python dependencies
├── supabase/
│   └── schema.sql                  # Database schema + RLS policies
└── scripts/
    └── dev.mjs                     # Dev orchestrator (Next.js + Flask)
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+ (optional, for the upload server)
- A [Supabase](https://supabase.com/) project

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create a `.env.local` file in the project root:

```env
# Required — Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional — Temporary upload server
NEXT_PUBLIC_ENABLE_TEMP_STORAGE_UPLOADS=true
TEMP_STORAGE_SERVER_URL=http://127.0.0.1:25534
TEMP_STORAGE_SERVER_TOKEN=your-secret-token
```

### 3. Initialize the database

Run the SQL in [`supabase/schema.sql`](supabase/schema.sql) in your **Supabase SQL Editor**. This creates:

- `forms` and `responses` tables with proper indexes
- Row Level Security policies for data isolation
- A `form-assets` Storage bucket for image uploads
- An `increment_form_views()` helper function

### 4. Create users

In **Supabase Auth**, create users manually with email/password. FlowForm does not expose a public registration page — only invited users can sign in.

### 5. Run the development server

```bash
npm run dev
```

This starts both:
- **Next.js** on `http://localhost:3000`
- **Upload server** on `http://127.0.0.1:25534`

> 💡 Use `npm run dev:web` to start only the Next.js app.

---

## 🏗 Architecture

### Data Flow

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Browser    │────▶│   Next.js API     │────▶│   Supabase   │
│  (React 19)  │     │   (App Router)    │     │   Postgres   │
│              │     │                  │     │   Auth       │
│  ─ Zustand   │     │  /api/           │     │   Storage    │
│  ─ dnd-kit   │     │   validate-email │     │   RLS        │
│  ─ Recharts  │     │   temp-storage/* │     └──────────────┘
└─────────────┘     └──────────────────┘            │
                            │                        │
                            ▼                        │
                    ┌──────────────┐                  │
                    │  Flask Server │◀── (optional) ──┘
                    │  (uploads)    │     Storage fallback
                    └──────────────┘
```

### Row Level Security

The Supabase schema enforces strict access control:

| Table | Select | Insert | Update | Delete |
|---|---|---|---|---|
| `forms` | Owners see own; Public sees live public forms | Authenticated users (own forms) | Owners only | Owners only |
| `responses` | Owners see responses to their forms | Anyone (for live public forms) | — | — |

### Upload Flow

1. **User adds an image** in the editor or form
2. If `NEXT_PUBLIC_ENABLE_TEMP_STORAGE_UPLOADS=true`, the file is proxied through `/api/temp-storage/upload` to the Flask server
3. Otherwise, the file is encoded as base64 and stored in the JSON form data
4. When a form is closed, the editor syncs its status to the upload server, which auto-compresses images after 7 days

---

## ⌨ Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js + Flask upload server concurrently |
| `npm run dev:web` | Start only the Next.js dev server |
| `npm run dev:server` | Start only the Flask upload server |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run TypeScript type checking |
| `npm run clean` | Remove `.next`, `out`, and `dist` folders |

---

## 🎨 Design System

FlowForm uses a custom **"Natural"** design token system built on CSS variables, providing a warm, earthy aesthetic:

| Token | Light | Dark |
|---|---|---|
| `natural-bg` | `#FAF9F6` | `#121212` |
| `natural-primary` | `#5C6351` | `#8C9975` |
| `natural-accent` | `#F1F0EA` | `#2e2e2e` |
| `natural-border` | `#E8E6E1` | `#333333` |
| `natural-card` | `#ffffff` | `#1e1e1e` |

Key UI components use generous `rounded-[32px]` cards, pill-shaped buttons, and the **Geist** font family.

---

## 🖥 Upload Server

The optional Flask server in [`server/`](server/) provides:

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/upload` | POST | Upload an image file |
| `/files/<key>` | GET | Retrieve an uploaded file |
| `/files/<key>` | DELETE | Delete an uploaded file |
| `/forms/<id>/status` | GET | Check if a form is closed |
| `/forms/<id>/close` | POST | Mark a form as closed |
| `/forms/<id>/open` | POST | Reopen a closed form |
| `/maintenance/compress-now` | POST | Trigger manual compression |

See [`server/README.md`](server/README.md) for full deployment instructions including **Pterodactyl** setup.

---

## 📄 License

This project is private and not licensed for redistribution.
