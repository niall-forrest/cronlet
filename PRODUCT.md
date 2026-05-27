# Product

## Register

product

One cohesive brand carries both surfaces — the cronlet.dev landing and the cloud-web dashboard share one design language. PRODUCT.md defaults to **product** because that is where most design work happens and where the burden of clarity is highest. The marketing site earns trust by previewing the actual product aesthetic, not by adopting a separate "marketing" voice.

## Users

Developers building AI agents who want their agents to schedule tasks independently — without standing up their own cron infrastructure. The audience spans solo founders shipping agent-shaped products and platform/infrastructure engineers at established companies adding scheduling to an existing product.

Primary context: an operator opening the dashboard to answer one of three questions — *is my org healthy, what is failing or pending, what should I do next.* They may be on a second monitor, in a dim room, late at night, after an alert.

## Product Purpose

Cronlet is an operator-grade scheduling control plane for AI agents and the systems around them. Tasks, runs, and destinations are the core model; the product's job is to make the state of those entities legible and the next action obvious.

Success on first login: in the first 30 seconds, the user understands the core model, sees urgent issues if any exist, and has one obvious next action (create a task, inspect failures, configure callback security). They leave feeling oriented, calm, and confident in the auditability of the system.

## Brand Personality

**Precise. Calm. Operator-grade.**

Voice: exact and unhurried. We do not hype, we do not soften with corporate warmth, we do not pad. We name things accurately (task, run, destination, callback) and let the precision of the language do the work.

Tone: like a senior infra engineer writing a runbook — confident, direct, terse where terseness reads as competence. Errors and warnings are specific and actionable, never apologetic.

## Anti-references

Explicit rejections, because these are the reflexes that drag the design toward generic output:

- **The Tailwind/shadcn purple-gradient SaaS template.** Default indigo-to-fuchsia gradients on every CTA. No.
- **"AI startup" neon-on-black with animated gradients and glow effects.** The cliché lane for anything that mentions agents. Absolutely not.
- **Gradient-hero-with-giant-number landing format.** Every Y Combinator company has this page. Cronlet is not that page.
- **Datadog/Grafana sprawl.** Dense for density's sake, panels everywhere, no priority, no editorial hand. We are dense, but we are *edited.*
- **Wizard-heavy onboarding** that hides state behind multi-step modals. Operators want to see the system, not click through it.
- **Gradients in general.** If any appear, they are subtle and structural (a single soft surface gradient at most). Never decorative, never colorful, never animated.

**Yes-references** (calibration, not imitation): Linear and Vercel for dense-but-calm restraint. BetterStack as the closest neighbor for dev-tool dark aesthetics — that is the lane to live in, with room for a more distinct typographic and structural identity than the typical dev-tool dashboard.

## Design Principles

1. **State first, decoration never.** Every screen leads with the answer to "what is happening and what should I do." Visual interest comes from typography and structure, not ornament.
2. **One design language across product and marketing.** The landing previews the product. Brand and product share type, color, and motion vocabulary; the marketing register adds scale and editorial breathing room, not a different aesthetic.
3. **Calm density.** Show enough information to make the decision; never more. Linear and BetterStack are the calibration — operators want compact tables, scannable lists, and consistent rhythm, not whitespace for whitespace's sake.
4. **Keyboard-first respect.** Power operators do not want to click. Every primary flow has a keyboard path; a command palette and shortcut surface are first-class, not afterthoughts.
5. **Earn trust by being exact.** Alignment, type hierarchy, status semantics, and copy are precise because the product handles real schedules for real systems. Sloppy UI implies sloppy infrastructure.

## Accessibility & Inclusion

- **WCAG 2.2 AA** target across product and marketing.
- **Keyboard navigation** across every primary flow; visible focus rings on dark surfaces; shortcuts documented and discoverable.
- **Status never communicated by color alone** — icons, glyphs, or labels accompany green/red/amber states so color-blind operators read the same signal.
- **Respect `prefers-reduced-motion`** — transitions and incidental motion collapse to instant state changes.
- **Dark-mode readable in a dim room on a second monitor at 2am** is the canonical scene. Contrast ratios are tuned to that environment, not to a bright office.
