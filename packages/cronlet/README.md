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
npm install cronlet cronlet-cli
```

Create a job file:

```ts
// jobs/hello.ts
import { schedule, every } from "cronlet"

export default schedule(every("1m"), async (ctx) => {
  console.log(`Hello from ${ctx.jobName}!`)
})
```

Run the dev server:

```bash
npx cronlet dev
```

## Schedule API

### Intervals

```ts
schedule(every("30s"), handler)   // every 30 seconds
schedule(every("15m"), handler)   // every 15 minutes
schedule(every("2h"), handler)    // every 2 hours
schedule(every("1d"), handler)    // every day
schedule(every("1w"), handler)    // every week
```

### Daily

```ts
schedule(daily("09:00"), handler)              // daily at 9:00 AM
schedule(daily("09:00", "17:00"), handler)     // daily at 9 AM and 5 PM
```

### Weekly

```ts
schedule(weekly("fri", "09:00"), handler)                    // every Friday at 9 AM
schedule(weekly(["mon", "wed", "fri"], "09:00"), handler)    // MWF at 9 AM
```

### Monthly

```ts
schedule(monthly(1, "09:00"), handler)              // 1st of month at 9 AM
schedule(monthly(15, "12:00"), handler)             // 15th of month at noon
```

### Raw Cron

```ts
schedule(cron("0 9 * * 1-5"), handler)    // 9 AM on weekdays
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

## CLI

Install `cronlet-cli` for the dev server and tooling:

```bash
cronlet dev              # Start dev server with hot reload
cronlet list             # List all discovered jobs
cronlet run <job-id>     # Manually trigger a job
cronlet validate         # Validate job configurations
```

## License

MIT
