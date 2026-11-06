# Tablelane customer and operations interface

Independent Next.js application. Requires Node.js 24.

```sh
npm ci
npm run dev
```

Configure `.env.local` from `.env.example`. The backend must be available at `API_URL` (default http://localhost:4000). All browser/API integration tests and their artifacts live in this directory.

To configure and launch the whole system, see [backend setup](../backend/README.md). Run `npm run setup` then `npm run dev:all` from `backend/` after installing its dependencies. No root workspace package is required.
