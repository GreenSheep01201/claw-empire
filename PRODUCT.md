# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Desktop-first, mobile-capable. Managing the organisation and the pixel-art office happen on a computer; on a phone, users must at least be able to talk to the CEO agent and approve 🔴 actions.

## Users

- **Organisation admin**: business owner or manager, mostly **non-technical**, running one or several products or companies. They set up the organisation, give orders to the CEO agent, approve sensitive actions and watch costs.
- **Pole manager**: a human responsible for one pole (e.g. marketing lead). They only see and act on the poles they have been given access to, validate that pole's 🔴 actions and edit its agents.
- **Integrator (us)**: installs and configures one instance per client; technical, but the product must not depend on them for daily use.

The job: run a company (or several) with a team of AI agents that produce deliverables **and** act in real business tools, without needing to understand code, git or infrastructure.

## Product Purpose

QG turns a company into an AI-agent organisation. The user describes their structure; a **CEO agent** they can talk to delegates work to **pole directors** (AI), who split it between their agents and report back. Work runs either from direct requests to the CEO or from automatic workflows (schedule, connector events, webhooks).

Success: a non-technical owner gets real, validated work done across their poles (e.g. a week of LinkedIn posts written, illustrated, stored in Airtable, approved and published) while staying in control of risk and spend.

## Positioning

Not a dev tool and not an automation builder: a **living office** where the user is the boss of an AI company. Poles are whatever the user imagines (a product, a company, a function). Every external or irreversible action passes through a human approval threshold, and every pole has its own budget. The pixel-art office is the main interface, so the user sees who works on what.

## Operating Context

- Poles are flat, each with a free type (product, company, function, transverse) and one AI director. Examples: poles Reequal / Atomic Battle / UBTP for one company with three products; poles Company A / B / C plus a transverse "Group Finance" for a holding.
- Chain of command: CEO agent → pole director → agents → back to director → back to CEO. Cross-pole requests go through the CEO, except transverse poles, which directors can call directly.
- **Experts**: shared agents outside any pole (SEO, copywriter, translator, lawyer, data, designer), called per mission by directors only, with business memory shared and per-pole memory sealed. Their cost and approval rules follow the calling pole. Each expert has a max number of simultaneous missions (1 = queue).
- Approval tiers: 🟢 auto, 🟡 auto + notify, 🔴 human approval required (default for anything external, financial, destructive or production). Approvals live in an "À valider" inbox with Approve / Refuse / Edit, plus email / Telegram / Slack notifications.
- Pole workspaces: GitHub/GitLab for technical poles; Google Drive, Airtable or Notion for non-technical poles; internal storage by default. Non-technical users never see git.
- Connectors are added in one click (OAuth) from a catalogue, backed by MCP servers; priority connectors: Drive, Airtable, Notion, GitHub, Postiz (social publishing), Cloudinary (media), an image generator. Browser automation is a fallback only.
- Workflows are created by talking to the CEO and shown as a simple editable card (trigger, pole, instruction, approval tier, destination). No node-graph editor.
- Monthly budget per pole: alert at 80 %, pause at 100 %, cost dashboard per pole / agent / workflow.

## Capabilities and Constraints

- Fork of Claw-Empire (Apache 2.0: licence and attribution must be kept). Stack is the existing one: React 19 + Vite + Tailwind v4 + Pixi.js front end, Express + SQLite back end.
- The **pixel-art office stays the primary interface**: one room per pole, the CEO's office (click to chat), the "À valider" pile on the desk, an experts' coworking space, floors when there are many poles; detailed management opens in panels over the office.
- Agents: editable system prompt with version history, their own memory (written by the agent and by humans, always visible and editable), knowledge base per pole and per organisation, model selectable per pole or agent. Directors can create their own agents within limits.
- Multi-user with roles and per-pole access. Self-hosted first (one instance per client, plus one-click deploy); SaaS later. The app becomes a web app with login.
- Onboarding step 0 is entering an AI provider API key (OpenRouter highlighted), then a conversational setup with the CEO, ready-made templates and manual editing.
- Languages: French and English (per organisation, per pole if needed). Today the code is Korean-first (`UiLanguage = "ko" | "en" | "ja" | "zh"`, hard-coded Korean strings in ~82 components); French must become first-class.
- Roadmap and full decision log: `tasks/todo.md`.

## Brand Commitments

- Product name: **QG** (replaces "Claw-Empire" everywhere user-facing; keep Apache 2.0 attribution to the original project).
- The pixel-art office is a binding identity choice; it must not be demoted to a secondary view.

## Evidence on Hand

- The user already has real clients; none are named here and none may be quoted, logo'd or used as testimonials without explicit permission.
- First real user: the owner themselves, with poles Reequal (SaaS, web + mobile), Atomic Battle (mobile mini-game) and UBTP (web + mobile app for a client).
- Existing pixel-art assets and office scene: `public/`, `src/components/office-view/`. Existing screenshots: `Sample_Img/`.
- No testimonials, metrics, pricing or benchmarks exist yet; do not invent any.

## Product Principles

1. **The boss stays in control.** Anything external, costly or irreversible waits for a human; everything else flows on its own.
2. **No tech required.** A non-technical owner must be able to set up, operate and understand QG without seeing code, git, MCP or config files.
3. **The office is the truth.** What agents are doing, for whom, and what is waiting for approval must be visible in the office at a glance.
4. **Shaped by the user's imagination.** Structure, poles, agents and workflows are defined by the user, never imposed by a fixed template.
5. **Every cost has an owner.** Spend is always traceable to a pole, an agent or a workflow, and capped.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Audience is non-technical and includes people reading French daily, so readable text sizes (no 8–11 px body text), labelled forms, keyboard-reachable and properly announced dialogs (the approval inbox above all), and a reduced-motion mode that keeps meaningful status feedback.
