# RCM Dashboard Prototype

A clickable prototype of a revenue cycle dashboard. It shows what users can click, filter, drill, sort and export. The production build is a Qlik Cloud app. Every visual in this prototype has a note that names its native Qlik object type.

**All data is synthetic.** All client and facility names are placeholders.

## Run

Requires Node.js 20 or later.

```bash
npm install
npm run dev
```

Open http://localhost:5173 and sign in.

## GitHub Pages

The workflow `.github/workflows/pages.yml` runs the tests, builds the app and deploys `dist` to GitHub Pages on each push.
One-time setup: in the repository **Settings > Pages**, set **Source** to **GitHub Actions**.
The site is public, so anyone with the link can sign in with the demo account. Use synthetic data only.

## Demo sign-in

| User name | Password |
|---|---|
| `analyst` | `demo2026` |
| `reviewer` | `demo2026` |

> **This sign-in is not secure.** The credentials are in the page source (`src/config/users.ts`). Anyone who can view the source can read them. Use this prototype only with synthetic data. In the real build, the Qlik Cloud tenant handles authentication.

## Other commands

| Command | What it does |
|---|---|
| `npm run data` | Makes the synthetic data again (`public/data`). The seed and the end month are in `config/data.config.json`. |
| `npm test` | Runs the data tests: every metric is computable, reconciliation checks, planted patterns. |
| `npm run build` | Typecheck and production build. |

## Configuration

- `config/data.config.json`: seed, end month, number of months, volume.
- `config/client.config.json`: metric targets, the At Risk band, the operational task list (KPI, target, target type), and the categories of the period-over-period change view.
- `src/config/brand.ts`: placeholder brand name.

## Structure

- `scripts/generate-data.ts`: seeded generator. It writes fact and dimension files (star schema).
- `src/engine/`: run-time metric engine. Metrics are calculated from base fields only, for the current selections.
- `src/pages/`, `src/ui/`: the app.
- `tests/`: data and metric tests.
