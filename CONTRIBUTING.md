# Contributing to Huellas Vivas

Thank you for your interest in contributing to **Huellas Vivas** — an open-source Web3 donation platform built to help pets and animals receive the medical care they need. Every contribution, no matter how small, makes a real difference.

Please read this guide carefully before submitting any contribution.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Project Overview](#project-overview)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
- [Development Workflow](#development-workflow)
  - [Branch Naming](#branch-naming)
  - [Commit Messages](#commit-messages)
  - [Pull Requests](#pull-requests)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Security Vulnerabilities](#security-vulnerabilities)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you agree to uphold a respectful and inclusive environment for everyone. Any unacceptable behavior should be reported to the maintainers.

---

## Project Overview

Huellas Vivas is a monorepo containing:

| Package | Technology | Description |
|---|---|---|
| `/` (root) | Next.js 16 + Tailwind CSS | Frontend application |
| `/backend` | NestJS 11 + TypeScript | REST API |

**Core integrations:**
- **Supabase** — PostgreSQL database + file storage + auth helpers
- **Stellar blockchain** — wallet generation per user
- **Trustless Work** — on-chain escrow for donation security

---

## Repository Structure

```
huellas-vivas/
├── app/                    # Next.js App Router pages and components
├── public/                 # Static assets
├── backend/
│   └── src/
│       ├── config/         # Typed environment configuration
│       ├── common/         # Guards, interceptors, filters, enums, DTOs
│       ├── database/       # Supabase client + SQL migrations
│       ├── blockchain/     # Stellar SDK + Trustless Work integration
│       └── modules/        # Feature modules (auth, users, publications…)
├── CONTRIBUTING.md
└── README.md
```

---

## Getting Started

### Prerequisites

Make sure you have the following installed:

| Tool | Version | Notes |
|---|---|---|
| Node.js | `>= 20.x` | [nodejs.org](https://nodejs.org) |
| pnpm | `>= 9.x` | `npm install -g pnpm` |
| npm | `>= 10.x` | Bundled with Node.js |
| Git | `>= 2.40` | |

You will also need accounts / access to:
- [Supabase](https://supabase.com) — create a free project
- [Stellar Testnet](https://laboratory.stellar.org) — no account needed, uses Friendbot
- [Trustless Work](https://trustlesswork.com) — testnet API key

---

### Installation

1. **Fork** the repository and clone your fork:

```bash
git clone https://github.com/<your-username>/huellas-vivas.git
cd huellas-vivas
```

2. **Add the upstream remote:**

```bash
git remote add upstream https://github.com/<org>/huellas-vivas.git
```

3. **Install frontend dependencies** (root):

```bash
pnpm install
```

4. **Install backend dependencies:**

```bash
cd backend
npm install
```

---

### Environment Variables

The project requires environment files for both the frontend and the backend. Example files are provided — **never commit real credentials**.

**Frontend** (root):

```bash
cp .env.example .env.local
```

**Backend:**

```bash
cp backend/.env.example backend/.env
```

Open each `.env` file and fill in the required values. All variables are documented inside the example files with descriptions and accepted formats.

> **Important:** `.env` and `.env.local` are listed in `.gitignore` and must never be pushed to the repository.

---

## Development Workflow

### Branch Naming

Always branch off from `main`. Use the following naming convention:

```
<type>/<short-description>
```

| Type | When to use |
|---|---|
| `feat/` | New feature or functionality |
| `fix/` | Bug fix |
| `refactor/` | Code restructuring without behavior change |
| `docs/` | Documentation only |
| `test/` | Adding or improving tests |
| `chore/` | Tooling, CI, dependencies, config |
| `hotfix/` | Critical fix on production |

**Examples:**

```bash
git checkout -b feat/create-publication-endpoint
git checkout -b fix/escrow-release-nonce-validation
git checkout -b docs/update-contributing-guide
```

---

### Commit Messages

This project follows the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

**Format:**

```
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

**Scopes** (use the module or area affected):

`auth` | `users` | `wallets` | `publications` | `donations` | `escrow` | `comments` | `notifications` | `media` | `blockchain` | `stellar` | `db` | `config` | `frontend`

**Examples:**

```
feat(publications): add cursor-based pagination for infinite scroll

fix(escrow): prevent nonce reuse on fund release transaction

refactor(auth): extract refresh token rotation to dedicated method

docs(contributing): add environment setup instructions

chore(deps): upgrade stellar-sdk to v12
```

**Rules:**
- Use the **imperative mood** in the summary (`add`, not `added` or `adds`)
- Keep the summary under **72 characters**
- Reference issues when applicable: `Closes #42`, `Fixes #17`

---

### Pull Requests

1. **Keep PRs focused** — one feature or fix per PR. Avoid bundling unrelated changes.
2. **Sync with upstream** before opening a PR:

```bash
git fetch upstream
git rebase upstream/main
```

3. **Fill out the PR template** completely — title, description, screenshots (if UI), and testing steps.
4. **Link related issues** using GitHub keywords (`Closes #`, `Fixes #`, `Resolves #`).
5. PRs require **at least one approving review** before merging.
6. All **CI checks must pass** (lint, build, tests).
7. Squash commits if the PR history is noisy — the maintainer may request this before merging.

#### PR Title Format

Follow the same Conventional Commits format:

```
feat(donations): implement Trustless Work escrow creation flow
```

---

## Coding Standards

### General

- All **code must be written in English** (variables, functions, comments, files).
- All **user-facing content** (UI strings, messages, labels) must be in **Spanish**.
- No `console.log` in committed code — use NestJS `Logger` in the backend.
- Keep functions small and single-purpose.
- Avoid premature abstractions — don't create helpers for one-time use.

### Backend (NestJS)

- Follow the **repository pattern**: Controller → Service → Repository → Supabase.
- Use **DTOs with `class-validator`** for all incoming request data.
- **Never expose** sensitive fields (`password_hash`, `encrypted_secret_key`) in response DTOs.
- Use **enums** from `src/common/enums/` — don't hardcode strings for statuses or types.
- Emit **domain events** via `EventEmitter2` for side effects (e.g., notifications after a donation).
- Configuration must come from the **typed config module** — no raw `process.env` inside feature modules.

### Frontend (Next.js)

- Use the **App Router** (`app/` directory).
- Components must be in **PascalCase**, files in **kebab-case**.
- Use **Tailwind CSS** utility classes. Avoid custom CSS unless strictly necessary.
- Keep pages thin — move logic to hooks and service files.

---

## Testing

### Backend

Run the full test suite:

```bash
cd backend
npm run test
```

Run with coverage:

```bash
npm run test:cov
```

Run end-to-end tests:

```bash
npm run test:e2e
```

### Frontend

```bash
pnpm test
```

### Guidelines

- Every new feature **must include tests**.
- Bug fixes **should include a regression test**.
- Unit tests live alongside the file they test (`*.spec.ts`).
- E2E tests live in the `test/` directory.
- Aim for meaningful coverage — don't write tests just to hit a percentage.

---

## Reporting Bugs

Before opening an issue, please:

1. Search [existing issues](../../issues) to avoid duplicates.
2. Reproduce the bug on the latest `main` branch.

When opening a bug report, include:

- A clear and descriptive title
- Steps to reproduce the behavior
- Expected vs actual behavior
- Environment details (OS, Node version, browser if applicable)
- Relevant logs, screenshots, or error messages

Use the **Bug Report** issue template.

---

## Suggesting Features

Feature suggestions are welcome. Before submitting:

1. Check if the feature has already been requested or is on the roadmap.
2. Consider whether it aligns with the project's scope and goals.

When opening a feature request, include:

- The problem it solves
- A description of the proposed solution
- Any alternatives you've considered

Use the **Feature Request** issue template.

---

## Security Vulnerabilities

**Do not open a public issue for security vulnerabilities.**

Please report security concerns privately by emailing the maintainers directly or using GitHub's [private vulnerability reporting](../../security/advisories/new) feature.

We will acknowledge your report within 48 hours and work with you to resolve the issue responsibly.

---

## Thank You

Huellas Vivas exists because people care — about animals, about technology, and about building things that matter. We're grateful for every contribution that helps this platform grow.

If you have any questions, feel free to open a [Discussion](../../discussions) or reach out to the maintainers.
