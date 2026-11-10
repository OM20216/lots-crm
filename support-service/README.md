# LOTS Support — standalone support-token service

The support tokens (`SUP-000123`) are **not stored in the CRM's tables**. They live in this small
service, which runs as its own process, on its own port, with its own scheduled task and its own
MySQL tables (`support_tickets` + `support_messages` in the company's existing `lots` database.
Two tables of their own — the CRM tables are never touched by this service). The CRM is only a
client of it.

That means:

- If the CRM is stopped, crashed, being updated or its build fails, agents can still raise tokens and the
  help desk manager can still answer them from the standalone portals.
- On a machine without `MYSQL_*` settings in `support.env`, the service falls back to a local JSON
  file store instead (`store.js`), so it can run without the database too.
- Tokens raised in the CRM and tokens raised in the portal are the **same list** (one shared store).

The service also answers the CRM help questions from [`../src/supportKb.js`](../src/supportKb.js)
read-only, so the help articles work even when the service is down (the CRM keeps a local copy too).

## Portals

| Who | Address |
| --- | --- |
| Agent | <http://localhost:4100/> (or `http://<crm-pc-ip>:4100/` on the office network) |
| Help desk manager | <http://localhost:4100/admin> |

Each portal asks for its access code once and remembers it in that browser.

## Run it

```powershell
powershell -ExecutionPolicy Bypass -File scripts\support-service.ps1 install    # create the "LOTS Support" task and start
powershell -ExecutionPolicy Bypass -File scripts\support-service.ps1 status
powershell -ExecutionPolicy Bypass -File scripts\support-service.ps1 restart    # after an update
powershell -ExecutionPolicy Bypass -File scripts\support-service.ps1 stop | start | uninstall
```

The task starts at log-on and runs `scripts/run-support.ps1`, which restarts the service if it stops.
Logs: `support.log` and `support-error.log` in the project folder.

For development only, run it in the foreground:

```powershell
node support-service\server.js
```

## Configuration

The service reads `C:\Users\<you>\.lots-crm\support.env` (outside the project, never committed):

| Setting | Meaning |
| --- | --- |
| `SUPPORT_PORT` | Port, default `4100` |
| `SUPPORT_HOST` | Bind address, default `0.0.0.0` (office network) |
| `SUPPORT_AGENT_CODE` | Access code for the agent portal; gives read/write on that agent's own tokens |
| `SUPPORT_ADMIN_CODE` | Access code for the manager desk; full access, settings and delete |
| `SUPPORT_SERVICE_TOKEN` | Token the CRM uses (`x-support-token`); full access |
| `SUPPORT_DATA_DIR` | Where `settings.json` (and, without MySQL, `tickets.json`) live, default `~/.lots-crm/support` |
| `SUPPORT_CRM_URL` | Link shown as "Open CRM", default `http://localhost:4000` |
| `SUPPORT_TEAMS_WEBHOOK` | Optional Teams incoming-webhook URL for new-token and agent-message alerts |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_SSL` | The company MySQL — the same values as in `secrets.env`. When set (the default here), tokens are stored in `support_tickets` + `support_messages`; when absent, the JSON file store is used |

The CRM gets `SUPPORT_SERVICE_URL` and the same `SUPPORT_SERVICE_TOKEN` from its own private secrets file
(`~/.lots-crm/secrets.env`).

To rotate a code, change it in `support.env`, update `SUPPORT_SERVICE_TOKEN` in `secrets.env` if that one
changed, then restart the support service and the CRM.

## Data

- **MySQL (the default):** `support_tickets` (one row per token, `num AUTO_INCREMENT` is the token
  number, so a deleted token's number is never reused) and `support_messages` (every manager/agent
  message, in order). The tables are created automatically on first use and are safe to re-run.
- **JSON fallback (no `MYSQL_*` in support.env):** `tickets.json` — `{ counter, tickets: [...] }`,
  written atomically (temp file + rename).
- `settings.json` — manager email, CC, Teams-notify flag (always a local file for both stores).
- Back these up like the CRM data. There is no customer data in them, only token conversations.

### Moving an existing JSON store into MySQL

```powershell
powershell -ExecutionPolicy Bypass -File scripts\support-service.ps1 stop
node support-service\migrate-to-mysql.mjs      # safe to run again; keeps tickets.json as *.pre-mysql backup
powershell -ExecutionPolicy Bypass -File scripts\support-service.ps1 start
```

The tokens that existed before the split (closed) were copied from the CRM on first install, then from
the JSON store into MySQL on 10 Nov 2026. The CRM's old `supportTickets` records are left untouched in
MySQL but are no longer read or written.

## API

All JSON. Authentication by header:

| Header | Role |
| --- | --- |
| `x-support-token: <SUPPORT_SERVICE_TOKEN>` | CRM, full access |
| `x-support-admin: <SUPPORT_ADMIN_CODE>` | Manager desk |
| `x-support-code: <SUPPORT_AGENT_CODE>` | Agent portal; pass `?agent=<name>` and only that agent's tokens are visible |

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Public liveness, ticket count and data folder |
| `GET /api/overview` | Public; suggested questions, article list, manager-known/Teams flags |
| `POST /api/ask` | `{ question }` → article answer or related topics |
| `GET /api/articles/:id` | One article |
| `GET /api/settings`, `PUT /api/settings` | Manager/CRM only |
| `GET /api/tickets` | List (agent: only own, `?agent=`) |
| `POST /api/tickets` | `{ question, agent, context }` → new token |
| `GET /api/tickets/:id` | One token |
| `PATCH /api/tickets/:id` | `{ action: "reply" \| "message" \| "close", reply?, by? }` |
| `DELETE /api/tickets/:id` | Manager/CRM only |

Ticket states: `Open` (waiting for the manager), `Answered` (manager replied), `Closed`.

## Notifications

The service posts to the Teams webhook when one is configured, independently of the CRM mailbox.
There is intentionally **no SMTP dependency**: if the CRM mailbox is down or unconfigured, tokens still
work and Teams alerts still go out. Email notifications can be added later without touching the token store.

## Tests performed

- Service health, agent/manager/CRM authentication and 401/403 paths.
- Create → manager reply → agent message → close → delete through both the service API and the CRM.
- The same lifecycle with the CRM **stopped**: portal HTTP 200 and all token actions succeeded.
- Existing tokens migrated with the counter preserved.
- Portal scripts pass a syntax check; both pages load with the service.
- **MySQL store (10 Nov 2026):** JSON store migrated (3 tokens), create → reply → agent message →
  close → delete cycle verified against MySQL, numbering continued at the next token, rows checked in
  the database, and all data re-read after a service restart.
