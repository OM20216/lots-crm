# LOTS Support — standalone support-token service

The support tokens (`SUP-000123`) raised by the support button are **not stored in the CRM database**.
They live in this small service, which runs as its own process, on its own port, with its own scheduled
task and its own JSON store. The CRM is only a client of it.

That means:

- If the CRM is stopped, crashed, being updated or its build fails, agents can still raise tokens and the
  help desk manager can still answer them from the standalone portals.
- If MySQL is unreachable, the support service is unaffected.
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
| `SUPPORT_DATA_DIR` | Where `tickets.json` and `settings.json` live, default `~/.lots-crm/support` |
| `SUPPORT_CRM_URL` | Link shown as "Open CRM", default `http://localhost:4000` |
| `SUPPORT_TEAMS_WEBHOOK` | Optional Teams incoming-webhook URL for new-token and agent-message alerts |

The CRM gets `SUPPORT_SERVICE_URL` and the same `SUPPORT_SERVICE_TOKEN` from its own private secrets file
(`~/.lots-crm/secrets.env`).

To rotate a code, change it in `support.env`, update `SUPPORT_SERVICE_TOKEN` in `secrets.env` if that one
changed, then restart the support service and the CRM.

## Data

- `tickets.json` — `{ counter, tickets: [...] }`; written atomically (temp file + rename).
- `settings.json` — manager email, CC, Teams-notify flag.
- Back these up like the CRM data. There is no customer data in them, only token conversations.

The two tokens that existed before the split (closed) were copied from the CRM on first install. The CRM's
old `supportTickets` records are left untouched in MySQL but are no longer read or written.

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
