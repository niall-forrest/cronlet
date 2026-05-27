---
name: Cronlet
description: Operator-grade scheduling control plane for AI agents.
colors:
  bg-deep: "#050810"
  bg-primary: "#0a0f1a"
  bg-elevated: "#111827"
  bg-card: "#151c2c"
  bg-hover: "#1a2235"
  primary-teal: "#06d6a0"
  primary-teal-glow: "#00f5d4"
  primary-teal-muted: "#0891b2"
  accent-violet: "#8b5cf6"
  accent-violet-muted: "#6366f1"
  accent-amber: "#f59e0b"
  text-primary: "#f8fafc"
  text-secondary: "#94a3b8"
  text-muted: "#64748b"
  status-success: "#22c55e"
  status-warning: "#f59e0b"
  status-error: "#ef4444"
  border-subtle: "#1f2937"
typography:
  display:
    fontFamily: "Syne, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 3.25rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Syne, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Syne, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "IBM Plex Mono, JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0"
  label:
    fontFamily: "IBM Plex Mono, JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  none: "0"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  "2xl": "20px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  "2xl": "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary-teal}"
    textColor: "{colors.bg-deep}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    backgroundColor: "{colors.bg-deep}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "32px"
  button-destructive:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.status-error}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "32px"
  card-default:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.2xl}"
    padding: "20px"
  card-interactive:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.2xl}"
    padding: "20px"
  input-default:
    backgroundColor: "{colors.bg-deep}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "32px"
  badge-default:
    backgroundColor: "{colors.primary-teal}"
    textColor: "{colors.bg-deep}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
    height: "20px"
  badge-success:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.status-success}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
    height: "20px"
  badge-mcp:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.accent-violet}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "22px"
---

# Design System: Cronlet

## 1. Overview

**Creative North Star: "The Quiet Control Room"**

Cronlet looks like the second monitor of a senior operator at 2am — dim, dense, deliberate. The screen is dark not for fashion but because it is read in a dim room, after an alert, by someone who needs to know within ten seconds whether their organization is healthy. Information has weight: tables are compact, labels are monospace, status is unambiguous. There is no decoration competing with state, and there is no marketing tone competing with the truth on screen.

The visual language sits in the lineage of BetterStack, Linear, and Vercel — dev-tool dark, dense but calm, structured by typography and alignment rather than ornament. Sharp 90° corners on every interactive control (buttons, inputs, table cells) give the system its operator-grade edge; softer 20px corners on cards and surfaces provide the necessary breathing rhythm so the density does not feel hostile. Mono is the system's resting voice; the geometric Syne display face appears only at section breaks and titles, where its angularity earns its place.

This system explicitly rejects: the Tailwind/shadcn purple-gradient SaaS template, the "AI startup" neon-on-black trope, animated decorative gradients, glassmorphism, and the gradient-hero-with-giant-number landing format. Color saturation is rationed; the teal accent appears only on truth-bearing surfaces (state, primary action, the brand mark), and even then it stays under 10% of any given screen.

**Key Characteristics:**
- Dark, tinted-neutral palette anchored on near-black `#050810`
- Mono-as-body (IBM Plex Mono) with geometric sans (Syne) for display only
- Sharp 0px corners for interactive controls, soft 20px for surfaces
- One accent (teal `#06d6a0`) carrying state and primary action; violet reserved for AI/MCP affordances
- Compact density: 32px button height, 8px gutters inside dense regions, no decorative whitespace
- Motion as feedback only: state changes, no choreography

## 2. Colors

A tinted-neutral dark palette with two saturated accents. Every neutral is biased toward the surface family (`oklch ~250° hue`) — the system never uses pure `#000` or pure `#fff`. The teal accent is the brand voice; violet is reserved for AI / MCP-adjacent affordances; amber for warnings; emerald and red carry status only.

### Primary
- **Primary Teal** (`#06d6a0`, `oklch(75.6% 0.157 168)`): The single brand voice. Used on the primary CTA, the brand mark, "running" status dots, the inline cyan in code samples, and section-label rules. Saturation is high but appearances are rationed.
- **Teal Glow** (`#00f5d4`, `oklch(89.4% 0.176 175)`): A lighter teal used exclusively for the logo dot center and for hover states on primary actions. Never used as a fill outside those two cases.

### Secondary (AI / MCP)
- **Accent Violet** (`#8b5cf6`, `oklch(62% 0.222 296)`): Reserved for AI / MCP / agent affordances — MCP badges, AI handler cards, code keyword highlighting. Its job is semantic: when you see violet, the system is talking about agent integration.

### Tertiary (status / signal only)
- **Status Success** (`#22c55e`): Emerald for successful runs and "ok" dots.
- **Status Warning** (`#f59e0b`): Amber for pending and at-risk states.
- **Status Error** (`#ef4444`): Red for failed runs and destructive confirms.

### Neutral
- **Background Deep** (`#050810`, `oklch(11% 0.018 260)`): The canvas — full-page background, page shell.
- **Background Primary** (`#0a0f1a`): Section backgrounds (social proof, use cases, sdk, handlers).
- **Background Elevated** (`#111827`): Cards, badges, nav bar, popovers — the resting surface for content.
- **Background Card** (`#151c2c`): Inner card regions, dashboard tasks, code blocks.
- **Background Hover** (`#1a2235`): Hover and pressed states on interactive surfaces.
- **Text Primary** (`#f8fafc`): Headings, body emphasis, primary copy.
- **Text Secondary** (`#94a3b8`): Description text, secondary labels, table values.
- **Text Muted** (`#64748b`): Timestamps, meta labels, pre-action affordances.
- **Border Subtle** (`rgba(148,163,184,0.1)`): The default divider — barely there.
- **Border Accent** (`rgba(6,214,160,0.3)`): Used on hover for interactive cards.

### Named Rules

**The One Voice Rule.** The primary teal (`#06d6a0`) appears on no more than 10% of any given screen. Its rarity is what makes it read as signal rather than decoration.

**The Status-Color Lockdown.** Emerald, amber, and red are reserved for run state. They never appear as decorative accents, never carry brand voice, never appear in copy or links. If a color is doing semantic work for state, do not use it for anything else on the same view.

**The Violet-Means-Agent Rule.** Violet `#8b5cf6` only appears when the surface is talking about AI, MCP, or agent affordances. Used decoratively, it becomes the "AI startup neon" anti-reference. Used semantically, it teaches the user a real signal.

## 3. Typography

**Display Font:** Syne (with `ui-sans-serif, system-ui, sans-serif` fallback)
**Body / UI Font:** IBM Plex Mono (with `JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace` fallback)
**Label / Meta Font:** IBM Plex Mono (same family, smaller scale + wider tracking)

**Character:** Syne is angular, geometric, and quietly confident — it carries the system's "operator" voice at display sizes without slipping into trendiness. IBM Plex Mono is the system's resting voice; using a monospace as body text is a deliberate signal that this is dev-tool territory, not consumer SaaS. The pairing is intentional: sans for *what this is*, mono for *what is happening right now*.

### Hierarchy

- **Display** (Syne, 700, `clamp(1.75rem, 4vw, 3.25rem)`, line-height 1.1, letter-spacing -0.03em): Hero h1, section h2. The only place Syne appears at scale.
- **Headline** (Syne, 700, 1.5rem, line-height 1.2, letter-spacing -0.02em): Card section headers, modal titles.
- **Title** (Syne, 600, 1.125rem, line-height 1.3): Card titles, handler card names.
- **Body** (IBM Plex Mono, 400, 0.8125rem, line-height 1.6): Default UI text — table cells, descriptions, button labels, navigation. Cap body line length at 70ch for long-form passages (docs, callouts).
- **Label** (IBM Plex Mono, 500, 0.6875rem, line-height 1.2, letter-spacing 0.08em, uppercase): Meta labels (`LAST RUN`, `DURATION`, `SCHEDULE`), section eyebrows, status text.

### Named Rules

**The Mono-First Rule.** Body text is monospace. This is the system's resting voice. Resist the urge to set descriptions, table values, or navigation in a proportional sans "to make it feel more like a normal product." The monospace body is what makes Cronlet read as operator-grade rather than consumer-SaaS.

**The Syne-Earns-Its-Place Rule.** Syne is reserved for display and titles only. Never use Syne for body copy, table headers, button labels, or labels. If you find yourself reaching for Syne at small sizes, you have introduced visual noise.

**The All-Caps Meta Rule.** All-caps + wider tracking (0.08em) + mono is the signal for *meta* — timestamps, run states, section eyebrows, schedule strings. Used anywhere else, it reads as shouty.

## 4. Elevation

The system is **flat by default**, layered through tinted-neutral surfaces rather than shadows. Each background step (`bg-deep` → `bg-primary` → `bg-elevated` → `bg-card` → `bg-hover`) adds roughly one OKLCH-lightness step (~4-5%), so depth reads as a stack of paper rather than as floating UI.

Shadows appear in three places only: (1) a subtle outer stack on the dashboard preview window, (2) a soft inner glow under primary buttons and active status dots (to suggest *liveness*, not depth), (3) a deep diffuse shadow on page-card surfaces in subpages. There are no decorative shadows.

### Shadow Vocabulary

- **Surface ambient** (`box-shadow: 0 16px 44px -24px rgba(0,0,0,0.85)`): Default `panel` surface shadow. Establishes the card sitting on the page.
- **Window depth** (`box-shadow: 0 0 0 1px rgba(255,255,255,0.05), 0 20px 50px -20px rgba(0,0,0,0.5)`): For the dashboard preview window and large content shells. Includes a hairline highlight at the top edge.
- **Accent glow — primary action** (`box-shadow: 0 0 80px -40px hsl(var(--primary) / 0.2)`): Used as `card-glow` and on the primary button hover. Soft, low-saturation, present only on the element that is currently the user's focus.
- **Status pulse** (`box-shadow: 0 0 8px hsl(var(--primary) / 0.5)`): The 8px halo under active status dots (`running`, `success`, `error`, `warning`). Tiny, semantic, always paired with a corresponding dot fill.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. The depth in Cronlet comes from tinted-neutral layering, not from drop shadows. Shadows are *responses* — to focus, to state, to "this is a window, not a card."

**The No-Decorative-Glow Rule.** Glows that do not encode state are decoration. A glow on a button is allowed because it tells the user *this is the primary action*. A glow under a section heading is decoration. Strip it.

## 5. Components

### Buttons

- **Shape:** Sharp 0px corners (`rounded-none`). The angular silhouette is the operator-grade signature. Cards are soft; buttons are not.
- **Height:** 32px default (`h-8`), with `xs (24px)`, `sm (28px)`, `lg (36px)` variants. Compact density is deliberate.
- **Typography:** IBM Plex Mono, 500 weight, 0.75rem (`text-xs`).
- **Primary:** Background `bg-primary` (HSL `160 84% 43%`), text `bg-deep`. Hover transitions to teal-glow background plus the accent-glow shadow. Used at most once per primary region.
- **Outline:** Transparent on `bg-deep`, border `border` token, text `text-primary`. The default for "this is an action, not the primary action."
- **Ghost:** No background or border at rest, hover surfaces `bg-muted`. Used in toolbars and dropdown triggers.
- **Destructive:** `bg-destructive/10`, text `destructive` (red `#ef4444`), border transparent. The 10% alpha background is the signal: red text on dark surface is destructive; full red fill is reserved for irreversible confirms.
- **Focus:** `ring-1 ring-ring/50` plus border-color shift. Always visible on dark surfaces — never `outline: none` without replacement.

### Cards

- **Shape:** 20px corners (`rounded-2xl`). The soft surface is the counterweight to the sharp controls.
- **Background:** `bg-card` (`#151c2c`); the interactive variant adds a 1px subtle border at rest and shifts to a 30%-opacity teal border + 2px upward translate on hover.
- **Padding:** 20px default (`p-5`), 12px (`p-3`) for the `sm` variant.
- **Border:** `border-border/50` (50% alpha of the subtle border token).
- **Footer:** When present, a 30%-alpha top border separates the footer from the body. Reduced padding to 16px/20px.
- **Glow variant:** Used sparingly — only when a card is the focal point of a page (e.g. the hero dashboard, a primary CTA card).

### Inputs

- **Shape:** Sharp 0px corners (`rounded-none`). Matches buttons; aligns inputs and buttons on the same baseline.
- **Background:** Transparent on the parent surface (or `bg-input/30` in dark mode for legibility).
- **Border:** 1px `input` token at rest. On focus: border shifts to `ring`, plus a 1px ring at `ring/50`.
- **Height:** 32px (`h-8`) standard.
- **Typography:** IBM Plex Mono, 0.75rem.
- **Error:** `border-destructive` + `ring-destructive/20`. Helper text in `text-destructive` mono below.

### Badges

- **Default:** 20px height, 6px corners (`rounded-md`), text-xs, padding `2px 8px`. Solid teal background, dark text.
- **Status variants** (`success`, `warning`, `error`): Use the corresponding status color at 10% alpha background + 90%-saturated text. No fill, just colored type on a tinted chip.
- **Type variants** (`webhook`, `tools`, `code`, `mcp`): All-caps, mono, wider tracking (uppercase + `tracking-wide`). Teal-tinted background for general task types; violet-tinted for `code` and `mcp` to signal AI/agent territory. `mcp` uses a fully rounded pill (`rounded-full`) to differentiate it visually.

### Tables

- **Type:** Body 0.75rem mono, headers in `text-foreground` with regular weight (not all-caps in the cloud-web table primitive — the all-caps treatment is in `.table-shell` for landing-page-style tables).
- **Rows:** Bottom-border between rows; hover applies `bg-muted/50` (extremely subtle); selected applies `bg-muted`.
- **Cells:** `p-2` (8px) — compact density.
- **Truncation:** `whitespace-nowrap` on cells by default. Tables are for scanning, not for wrapped prose.

### Navigation (dashboard)

- **Style:** Single-row tab strip with mono labels, 8px/16px padding per tab, 6px rounded chip background on the active tab, divider line below.
- **Default:** `text-muted` muted color.
- **Active:** `bg-hover` chip with `text-primary` (teal) text. The active tab is the only place teal touches the nav.

### Status Dots

Tiny but load-bearing. 8-10px circles, paired with a matching label.

- **Success:** Emerald with 8px halo at 50% alpha.
- **Running:** Teal with 8px halo, pulsing 2s ease-in-out infinite.
- **Pending / paused:** Muted-foreground at 40% alpha, no halo.
- **Failed:** Red with 8px halo at 50% alpha.

The halo is the signal of *liveness*. A status dot without a halo is *historical state*; with a halo, it is *current state*.

### Section Label (signature component)

A small ornament that appears across product and marketing surfaces and ties them visually. A 24px-wide 1px teal rule, followed by 8px gutter, followed by an uppercase mono label in teal at 0.6875rem with 0.1em tracking. Used as section eyebrows. It is the single most identifiable Cronlet element after the brand mark.

## 6. Do's and Don'ts

### Do:
- **Do** keep the primary teal `#06d6a0` to ≤10% of any given screen. Its rarity is the brand voice.
- **Do** use IBM Plex Mono for all body, table, navigation, and label copy. Mono-as-body is the signature.
- **Do** keep interactive controls (buttons, inputs, tabs) on sharp 0px corners, and surfaces (cards, panels) on 20px corners. The contrast is intentional.
- **Do** convey state with both color *and* a glyph or text label — status badges have a colored dot or icon next to the word, never color alone.
- **Do** stack tinted neutrals to convey depth: `bg-deep` → `bg-elevated` → `bg-card` → `bg-hover`. Reach for shadows last, not first.
- **Do** reserve violet `#8b5cf6` for AI / MCP / agent affordances. When violet appears, the user should learn it means *agent territory*.
- **Do** make every primary flow keyboard-reachable. Visible focus rings on dark surfaces, always.
- **Do** respect `prefers-reduced-motion` — the orbit-pulse, the running-dot pulse, the fade-up entrances all collapse to instant state changes.

### Don't:
- **Don't** use the Tailwind/shadcn purple-gradient SaaS template. Default indigo-to-fuchsia CTA gradients are explicitly out of bounds.
- **Don't** apply "AI startup" neon-on-black aesthetics — no glow text, no animated gradients, no decorative neon. The current landing hero gradient text (`linear-gradient(135deg, var(--cyan-glow) 0%, var(--cyan-primary) 50%, var(--violet-accent) 100%)` on h1 spans) is a candidate for removal; if it must stay, it is the *only* place gradient text appears, ever.
- **Don't** use glassmorphism (`backdrop-filter: blur` + translucent fill) as a decorative pattern. The nav-bar blur is the one exception — it is functional (legibility against scrolling content), not decorative.
- **Don't** build a gradient-hero-with-giant-number landing template. Cronlet is not that page.
- **Don't** drown the dashboard in unprioritized panels. Datadog/Grafana sprawl is the anti-reference; the dashboard's job is to lead with the one thing the operator should look at.
- **Don't** hide state behind multi-step wizards. Operators want to see the system, not click through it.
- **Don't** mix proportional sans into body copy "to make it feel more like a normal product." That breaks the operator-grade voice.
- **Don't** use Syne below 1.125rem. Below that, it loses character and starts to look like noise.
- **Don't** use `border-left` greater than 1px as a colored stripe accent on cards, list items, or callouts. Banned across the system.
- **Don't** use gradient text outside the one allowed exception (see above). Background-clip:text gradients are decorative, never meaningful.
- **Don't** introduce a green-button-for-success or red-button-for-destructive design. Status colors are for state, action colors are for action. Mixing them collapses the semantic.
- **Don't** add em dashes to UI copy. Use commas, colons, semicolons, periods, or parentheses.
