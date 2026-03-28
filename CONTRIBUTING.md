# Contributing to AfuChat

Thank you for your interest in contributing to AfuChat! This document provides guidelines and instructions for contributing to the project.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Project Structure](#project-structure)
- [Reporting Issues](#reporting-issues)
- [Feature Requests](#feature-requests)
- [Security Vulnerabilities](#security-vulnerabilities)

---

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. We expect all contributors to:

- Be respectful and considerate in all communications
- Welcome newcomers and help them get started
- Accept constructive criticism gracefully
- Focus on what is best for the community and the project
- Show empathy towards other contributors

Unacceptable behavior includes harassment, trolling, personal attacks, and publishing private information without consent. Violations may result in removal from the project.

---

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/afuchat.git
   cd afuchat
   ```
3. **Install dependencies**:
   ```bash
   pnpm install
   ```
4. **Create a branch** for your work:
   ```bash
   git checkout -b feat/your-feature-name
   ```

---

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Expo Go app (for testing on a mobile device) or a web browser

### Running the App

```bash
# Start both the API server and Expo app
# API Server runs on port 3000
cd artifacts/api-server && pnpm run dev

# Expo App runs on port 5000 (in a separate terminal)
cd artifacts/mobile && pnpm run dev
```

### Type Checking

```bash
# Run type checks across the entire monorepo
pnpm run typecheck
```

---

## Branch Naming

Use clear, descriptive branch names with a prefix:

| Prefix | Purpose | Example |
|---|---|---|
| `feat/` | New feature | `feat/voice-call-support` |
| `fix/` | Bug fix | `fix/message-delivery-delay` |
| `refactor/` | Code refactoring | `refactor/auth-context-cleanup` |
| `docs/` | Documentation only | `docs/api-endpoint-guide` |
| `chore/` | Tooling, CI, dependencies | `chore/upgrade-expo-sdk` |
| `test/` | Adding or updating tests | `test/wallet-transactions` |
| `hotfix/` | Urgent production fix | `hotfix/login-crash` |

---

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>
```

### Types

| Type | Description |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes |
| `style` | Formatting, whitespace (no logic change) |
| `refactor` | Code restructuring (no feature or fix) |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Build, CI, tooling, dependency updates |

### Scopes

Use the package or area being modified:

- `mobile` — Expo app (`artifacts/mobile`)
- `api` — API server (`artifacts/api-server`)
- `db` — Database schema (`lib/db`)
- `edge` — Supabase Edge Functions (`supabase/functions`)
- `ui` — Shared UI components
- `auth` — Authentication flow
- `chat` — Messaging features
- `wallet` — Currency and payments
- `ai` — AfuAi assistant

### Examples

```
feat(mobile): add video calling screen
fix(chat): resolve duplicate message on reconnect
refactor(api): extract rate limiter to middleware
docs(readme): update environment variable table
chore(mobile): upgrade expo-notifications to v0.32
```

---

## Pull Request Process

1. **Ensure your branch is up to date** with `main`:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Run type checks** before submitting:
   ```bash
   pnpm run typecheck
   ```

3. **Write a clear PR description** that includes:
   - What the change does
   - Why the change is needed
   - Screenshots or recordings for UI changes
   - Any breaking changes or migration steps

4. **Keep PRs focused** — one feature or fix per PR. Large changes should be split into smaller, reviewable pieces.

5. **Respond to review feedback** promptly and push updates to the same branch.

6. **Squash or rebase** commits before merging to keep the history clean.

### PR Checklist

- [ ] Code follows the project coding standards
- [ ] TypeScript type checks pass (`pnpm run typecheck`)
- [ ] No hardcoded secrets or credentials
- [ ] New screens include loading skeletons and error states
- [ ] Offline behavior considered (caching, queue, fallback)
- [ ] Dark mode and light mode both look correct
- [ ] Works on iOS, Android, and web where applicable

---

## Coding Standards

### General

- **Language**: TypeScript for all code (strict mode)
- **Formatting**: Prettier with project defaults
- **Imports**: Use workspace aliases (`@workspace/db`, `@workspace/api-zod`)
- **No `any`**: Avoid `any` types — use proper interfaces and generics
- **No commented-out code**: Remove dead code instead of commenting it out

### React Native / Expo

- Use functional components with hooks
- Use `expo-router` for navigation (file-based routing in `app/`)
- Use the project's `showAlert()` from `lib/alert.ts` instead of `Alert.alert` directly
- Use `useTheme()` hook for colors — never hardcode theme colors
- Add skeleton loaders from `components/ui/Skeleton.tsx` for loading states
- Use `OfflineBanner` component on screens that fetch data
- Persist user-facing state with AsyncStorage via `lib/offlineStore.ts`

### API Server

- Use Express Router for route grouping
- Validate request bodies before processing
- Return consistent JSON error responses: `{ error: "message" }`
- Use `pino` logger (never `console.log` in production code)
- Add rate limiting for public-facing endpoints

### Supabase

- All storage upload paths must start with `{userId}/` for RLS compliance
- Use the Supabase client from `lib/supabase.ts` — never create ad-hoc clients
- Edge functions must include CORS headers
- Use `SECURITY DEFINER` DB functions for sensitive operations (currency, XP)

### File Organization

- One component per file
- Co-locate styles with components
- Keep files under 400 lines — split large files into smaller modules
- Name files in kebab-case; name components in PascalCase

---

## Project Structure

Before contributing, familiarize yourself with the monorepo layout:

| Directory | Description |
|---|---|
| `artifacts/api-server/` | Express API server |
| `artifacts/mobile/app/` | Expo Router screens |
| `artifacts/mobile/components/` | Reusable React Native components |
| `artifacts/mobile/context/` | Context providers (Auth, Theme) |
| `artifacts/mobile/hooks/` | Custom hooks |
| `artifacts/mobile/lib/` | Utilities, Supabase client, helpers |
| `artifacts/mobile/constants/` | Colors, config constants |
| `lib/db/` | Drizzle ORM schema and database connection |
| `lib/api-spec/` | OpenAPI spec and Orval codegen config |
| `lib/api-zod/` | Generated Zod schemas |
| `lib/api-client-react/` | Generated TanStack Query hooks |
| `supabase/functions/` | Supabase Deno Edge Functions |

---

## Reporting Issues

When reporting a bug, please include:

1. **Description** — What happened vs. what you expected
2. **Steps to reproduce** — Numbered steps to trigger the issue
3. **Platform** — iOS, Android, or Web (include OS version and device)
4. **Screenshots or recordings** — Visual evidence if applicable
5. **Console logs** — Any relevant error messages

Use the **Bug Report** issue template if available.

---

## Feature Requests

We welcome feature ideas! When submitting a feature request:

1. **Check existing issues** to avoid duplicates
2. **Describe the problem** the feature would solve
3. **Propose a solution** with details on expected behavior
4. **Consider alternatives** you've thought about

Use the **Feature Request** issue template if available.

---

## Security Vulnerabilities

If you discover a security vulnerability, **do not** open a public issue. Instead, email **security@afuchat.com** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact

We will respond within 48 hours and work with you to resolve the issue before any public disclosure.

---

## Thank You

Every contribution, whether it's fixing a typo or building a new feature, helps make AfuChat better. We appreciate your time and effort!
