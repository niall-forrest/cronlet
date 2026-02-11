# cronlet

The simplest way to add scheduled tasks to a Node.js application. A typed, fluent API with file-based job discovery, built-in retries, and a local dev dashboard. Just write functions and say when they should run.

```ts
// jobs/weekly-digest.ts
import { schedule, weekly } from "cronlet"

export default schedule(weekly("fri", "09:00"), async (ctx) => {
  await sendWeeklyDigest()
})
```

## Quick Start

```bash
# Install
npm install cronlet cronlet-cli

# Create a job
mkdir jobs && cat > jobs/hello.ts << 'EOF'
import { schedule, every } from "cronlet"

export default schedule(every("1m"), async (ctx) => {
  console.log(`Hello from ${ctx.jobName}!`)
})
EOF

# Run the dev server
npx cronlet dev
```

```
  ⏱  cronlet dev server running

  Jobs discovered:
    ✓ hello    every 1 minute

  Dashboard: http://localhost:3141
  Watching for changes...
```

## Schedule API

### Intervals

```ts
import { schedule, every } from "cronlet"

schedule(every("30s"), handler)   // every 30 seconds
schedule(every("15m"), handler)   // every 15 minutes
schedule(every("2h"), handler)    // every 2 hours
schedule(every("1d"), handler)    // every day
schedule(every("1w"), handler)    // every week
```

### Daily

```ts
import { schedule, daily } from "cronlet"

schedule(daily("09:00"), handler)              // daily at 9:00 AM
schedule(daily("09:00", "17:00"), handler)     // daily at 9 AM and 5 PM
schedule(daily("00:00"), handler)              // daily at midnight
```

### Weekly

```ts
import { schedule, weekly } from "cronlet"

schedule(weekly("fri", "09:00"), handler)                    // every Friday at 9 AM
schedule(weekly(["mon", "wed", "fri"], "09:00"), handler)    // MWF at 9 AM
```

### Monthly

```ts
import { schedule, monthly } from "cronlet"

schedule(monthly(1, "09:00"), handler)              // 1st of month at 9 AM
schedule(monthly(15, "12:00"), handler)             // 15th of month at noon
schedule(monthly("last-fri", "17:00"), handler)     // last Friday of month
```

### Raw Cron

```ts
import { schedule, cron } from "cronlet"

schedule(cron("0 9 * * 1-5"), handler)    // 9 AM on weekdays
```

### Timezones

```ts
schedule(
  daily("09:00").withTimezone("America/New_York"),
  handler
)
```

## Configuration

```ts
schedule(
  daily("09:00"),
  {
    name: "daily-report",
    retry: {
      attempts: 3,
      backoff: "exponential",
      initialDelay: "30s"
    },
    timeout: "5m",
    onSuccess: async (ctx) => {
      console.log("Report sent!")
    },
    onFailure: async (error, ctx) => {
      await alertOps(error)
    }
  },
  async (ctx) => {
    await generateAndSendReport()
  }
)
```

## Job Context

Every handler receives a context object:

```ts
interface JobContext {
  jobId: string        // unique job identifier
  jobName: string      // human-readable name
  runId: string        // unique run identifier
  scheduledAt: Date    // when this run was scheduled
  startedAt: Date      // when the handler started
  attempt: number      // current attempt (1-based)
  signal: AbortSignal  // for cancellation
}
```

## CLI Commands

```bash
cronlet dev              # Start dev server with hot reload
cronlet list             # List all discovered jobs
cronlet run <job-id>     # Manually trigger a job
cronlet validate         # Validate all job configurations
```

## Comparison

| Feature | Cronlet | Vercel Cron | Trigger.dev | Inngest |
|---------|---------|-------------|-------------|---------|
| Setup complexity | Zero config | vercel.json | Dashboard + SDK | Dashboard + SDK |
| Type safety | Full TypeScript | None | Partial | Partial |
| Local development | Built-in | None | Requires tunnel | Requires tunnel |
| Pricing | Free | Hobby limits | Per-execution | Per-execution |
| Schedule syntax | Typed builders | Cron strings | Cron strings | Cron strings |
| Retries | Built-in | Manual | Built-in | Built-in |
| Dashboard | Local dev UI | Vercel dashboard | Cloud dashboard | Cloud dashboard |

## Why Cronlet?

Sits between basic cron and full orchestration platforms:

- More than Vercel Cron — retries, timeouts, typed schedules, local dev
- Less than Trigger.dev/Inngest — no cloud dashboard, no webhooks, no separate infrastructure

## Project Structure

```
your-app/
├── jobs/
│   ├── daily-report.ts
│   ├── cleanup-sessions.ts
│   └── billing/
│       └── sync-stripe.ts
├── package.json
└── ...
```

Jobs are discovered automatically from `./jobs`, `./src/jobs`, or `./app/jobs`.

## Development

This is a monorepo using pnpm workspaces and Turborepo.

### Structure

```
cronlet/
├── packages/
│   ├── cronlet/          # Core library (zero dependencies)
│   └── cronlet-cli/      # CLI tool
├── apps/
│   ├── dashboard/        # Local dev dashboard (Vite + React)
│   └── docs/             # Documentation site
└── examples/             # Example job files
```

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Link CLI globally for local development
cd packages/cronlet-cli && pnpm link --global

# Run with examples
cronlet dev --dir ./examples
```

### Key Packages

- **cronlet** - Core library with schedule builders and job types. Zero runtime dependencies.
- **cronlet-cli** - CLI with dev server, job discovery, and local scheduler.

## Status

Early development. API may change.

## License

MIT
