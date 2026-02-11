# cronlet-cli

CLI for [cronlet](https://www.npmjs.com/package/cronlet) - the simplest way to add scheduled tasks to a Node.js application.

## Installation

```bash
npm install cronlet cronlet-cli
```

## Commands

### `cronlet dev`

Start the dev server with hot reload and local dashboard.

```bash
cronlet dev                    # Auto-discovers jobs in ./jobs, ./src/jobs, ./app/jobs
cronlet dev --dir ./my-jobs    # Custom jobs directory
cronlet dev --port 4000        # Custom port (default: 3141)
```

```
  ⏱  cronlet dev server running

  Jobs discovered:
    ✓ weekly-digest      every friday at 9:00 AM
    ✓ cleanup-sessions   every 6 hours
    ✓ sync-stripe        daily at midnight

  Dashboard: http://localhost:3141
  Watching for changes...
```

### `cronlet list`

List all discovered jobs.

```bash
cronlet list
cronlet list --dir ./my-jobs
```

### `cronlet run <job-id>`

Manually trigger a job.

```bash
cronlet run cleanup-sessions
```

### `cronlet validate`

Validate all job configurations.

```bash
cronlet validate
```

## Dashboard

The dev server includes a local dashboard at `http://localhost:3141` with:

- Job list with schedules and status
- Manual "Run Now" buttons
- Execution history
- Real-time updates via SSE

## License

MIT
