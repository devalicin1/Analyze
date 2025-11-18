# Multi-Restaurant Sales Analytics

A minimalist, production-ready analytics workspace for restaurant groups. Managers can upload POS exports, manage dynamic menus, and monitor sales KPIs across products, categories, extras, and lifecycle stages.

## Tech stack

- **Frontend:** Vite, React 19, TypeScript, React Router, TailwindCSS, Recharts
- **State & data:** Firebase Web SDK (Firestore, Storage, Functions) with dev-friendly mock data + seed helpers
- **Backend:** Firebase Cloud Functions (TypeScript) for report processing, Storage ingestion, and metrics aggregation

## Getting started

```bash
npm install
npm run dev
```

Environment variables (set in `.env`):

```
VITE_FIREBASE_API_KEY=***
VITE_FIREBASE_AUTH_DOMAIN=***
VITE_FIREBASE_PROJECT_ID=***
VITE_FIREBASE_STORAGE_BUCKET=***
VITE_FIREBASE_MESSAGING_SENDER_ID=***
VITE_FIREBASE_APP_ID=***
VITE_USE_FIREBASE_EMULATORS=true|false
VITE_USE_MOCK_DATA=true|false  # keep true until real data is hooked up
```

## Project structure

```
src/
  components/      // layout, charts, forms, tables
  context/         // fake auth & workspace providers
  lib/
    api/           // Firestore helpers + analytics aggregations
    seed/          // workspace seeding utilities
    firebase.ts    // Firebase initialization
  pages/           // dashboard, products, reports, settings
  routes/          // app router
functions/         // Cloud Functions (processing pipeline)
```

## Fake auth + workspaces

The UI wraps the tree in `AppProviders`, exposing a hardcoded user plus tenant/workspace IDs. When Firebase Auth is ready, replace the providers without touching pages.

## Dev data seeding

1. Keep `VITE_USE_MOCK_DATA=true` for instant charts populated from `mockData`.
2. To write sample docs into Firestore, visit `/dev/seed` (dev mode only) and run the "Seed workspace data" action. It copies menu groups, products, and sample reports to the current workspace path.

## Sales report workflow

1. Upload CSV/XLSX via `Reports → Upload`.
2. Configure report date + column mapping.
3. Preview the first 20 rows.
4. Processing creates a `salesReports` doc and uploads the file. The Cloud Function parses rows, matches products, writes `salesLines`, and updates monthly metrics. If names cannot be matched, the report transitions to `needs_mapping` and surfaces a mapping UI in the report detail page.

## Cloud Functions

Located in `functions/`.

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

`processSalesReport` watches `salesReports` documents, downloads the uploaded file from Storage, parses the POS rows, validates product mappings, writes `salesLines`, and aggregates `monthlyProductSummary` and `monthlyCategorySummary` docs.

## Deployment

1. Configure Firebase project + Hosting site.
2. Ensure environment variables exist in Firebase (`firebase functions:config:set` or Hosting env vars).
3. Build web app: `npm run build`.
4. Deploy frontend: `firebase deploy --only hosting`.
5. Deploy functions: `cd functions && firebase deploy --only functions`.

## Testing & linting

```bash
npm run lint
npm run build   # requires Node ≥ 20.19 because of Vite 7
```

The repo uses Tailwind 4 with the new `@tailwindcss/postcss` bridge; ensure the plugin is installed (already configured).

## Future enhancements

- Replace fake auth context with Firebase Auth + multi-tenant rules.
- Persist column mapping per report + automate unmatched product creation.
- Expand analytics (extras attach rate, lifecycle burial alerts, cohort tables).
