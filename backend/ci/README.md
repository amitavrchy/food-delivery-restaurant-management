# CI and the two-folder layout

All CI resources live inside `backend/ci/`. GitHub Actions only discovers workflows in repository-root `.github/workflows/`, so automatic Actions runs are not enabled under the strict two-folder layout. The old successful runs remain in repository history.

Use `npm run verify` from `backend/` for type checks, builds and unit tests. With services and the application running, use `npm run test:integration` in backend and `npm run test:e2e` in frontend. The workflow in `github/workflows/` is a reference for a future external CI runner; it is not claimed to run automatically from this location.
