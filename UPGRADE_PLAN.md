# FlowForm Upgrade Plan

Status: accepted by owner on 2026-04-25

## Phase 1 (done in this batch)

- Section flow and branching base in editor/public form
- Question image support in editor/public form
- Branch target can route directly to submit (`__submit__`)
- Data-layer validation for routing targets before save (`formsApi`)
- Default first section added for newly created forms
- Navbar branding and action layout cleanup
- Auth initialization no longer treats missing session as hard error

## Phase 2 (done)

- Section flow visualization in editor (mini map / branch graph) ✅ done on 2026-04-25
- Branch safety warnings (empty section target, unreachable section) ✅ done on 2026-04-25
- "Submit form" route in UI labels and preview hints ✅ done on 2026-04-25
- Route-to-section analytics dimensions in response views ✅ done on 2026-04-25

## Phase 3 (done)

- Funnel analytics by section and by branch option ✅ done on 2026-04-25
- Drop-off heatmap and completion trend over time ✅ done on 2026-04-25
- Export enhanced analytics CSV ✅ done on 2026-04-25

## Phase 4 (done)

- Collaboration roles (owner/editor/viewer) ✅ done on 2026-04-25
- Edit history and audit timeline ✅ done on 2026-04-25
- Optional server-side validation for branch integrity and backward routes ✅ done on 2026-04-25

## Quality and Tooling

- Add ESLint flat config (`eslint.config.mjs`)
- Keep TypeScript strictness rollout gradual by module
- Add regression checklist for editor branching and submit routing
