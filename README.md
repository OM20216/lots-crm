# LOTS Customer Care CRM

Case management and call-centre CRM for the LOTS Wholesale Solutions customer care desk (CP Wholesale India Pvt. Ltd.).
It is built from **"Lots Process Documents 2026"** (the SOP). The process flow is the live **LOTS Workflow** screen in the CRM; a static copy is in [`lots-workflow.svg`](lots-workflow.svg).

The CRM handles calls, missed calls, emails, outbound leads, contacts and store escalations in one place. It follows the SOP step by step and automates as much of it as possible, so agents mainly talk to customers.

For the end-to-end system map—including the app, server, database, integrations, automation and case lifecycle—see [PROJECT-WORKFLOW.md](PROJECT-WORKFLOW.md). The interactive LOTS Workflow screen remains the detailed SOP chart.

**Process documentation** for agents and team leaders (every process, with a horizontal flow chart each, and every escalation route): [docs/process-documentation.md](docs/process-documentation.md), the charts in [docs/flows/](docs/flows/) and a PDF copy, [docs/LOTS CRM process documentation.pdf](<docs/LOTS CRM process documentation.pdf>).

Code: [github.com/OM20216/lots-crm](https://github.com/OM20216/lots-crm), branch `main`.

---

## Contents

1. [Status at a glance](#1-status-at-a-glance)
2. [Install and run](#2-install-and-run)
3. [Configuration: `.env` and the private secrets file](#3-configuration-env-and-the-private-secrets-file)
4. [First-time setup checklist](#4-first-time-setup-checklist)
5. [Screens](#5-screens)
6. [Case workflow (from the SOP)](#6-case-workflow-from-the-sop)
7. [Calls: SparkTG dialer inside the CRM](#7-calls-sparktg-dialer-inside-the-crm)
8. [Caller identification](#8-caller-identification)
9. [Email](#9-email)
10. [Automation engine](#10-automation-engine)
11. [Contacts](#11-contacts)
12. [Knowledge base, scripts and templates](#12-knowledge-base-scripts-and-templates)
13. [Data, backup and security](#13-data-backup-and-security)
14. [Project structure](#14-project-structure)
15. [API reference](#15-api-reference)
16. [What has been tested](#16-what-has-been-tested)
17. [Known limitations and open items](#17-known-limitations-and-open-items)
18. [SOP questions (settled)](#18-sop-questions-settled)
19. [Work log](#19-work-log)

---

## 1. Status at a glance

| Area | Status |
| --- | --- |
| Case management (log, categorise, escalate, resolve, close), strictly following the SOP workflow | ✅ Ready |
| LOTS Workflow screen: the SOP flow chart (React Flow) with live numbers | ✅ Ready |
| New Case page in the SOP order (identify caller → source → case type → resolve within TAT) | ✅ Ready |
| Contacts: contact cards + contact panel with the communication history (calls, recordings, missed calls, cases, emails), Vtiger-style contact form, unique card numbers, CSV import with preview and no duplicates | ✅ Ready |
| Contacts imported straight from Vtiger (webservice): about 3 lakh contacts | ✅ Live. 2,94,533 imported 24 Oct; about 6,000 more of the Vtiger duplicates that have their own card no. on 26 Oct (stopped by Vtiger's daily limit, §11.3) |
| Cases imported straight from Vtiger: all 1.92 lakh, linked to their contacts where the contact is in the CRM | ✅ Live (§6.9). 1,38,796 linked; about 53,600 without a contact |
| Call logs: the whole call history with recordings (play and download) | ✅ Ready. SparkTG's API can't list calls from before the CRM (§7.5) |
| Report: cases of any date range with filters, CSV and Excel export | ✅ Ready. **The streamed export (28 Oct) is not live until the CRM is restarted** (§17) |
| Process documentation with 17 flow charts and every escalation route | ✅ Done (`docs/`) |
| Caller identification by any number, add-on member or card | ✅ Ready |
| SparkTG dialer in the CRM: caller panel on every call, click-to-call, call log | ✅ Built. API login works; **the live widget test with agents is still open** |
| Call details from SparkTG (direction, outcome, duration, recording) | ✅ Confirmed on real SparkTG records |
| Missed calls in the top bar (Recent missed / 2nd round), opening on a new missed call | ✅ Ready |
| Email: every mail to contactus@cpwi.in becomes a Pending case automatically | ✅ Built. **Connect with "Sign in with Microsoft" on the Automation page** (§9.3) |
| Automation engine (assign, acknowledge, escalation emails, chase stores, reports) | ✅ Ready. Email-based parts start once the mailbox is connected |
| Cases follow LOTS's case master: the **"Case catergory" sheet of the escalation workbook** (type of contact → case type → category → sub-category → sub-category 2) | ✅ Built and tested on a test copy (§6.1). **Live CRM not restarted yet** |
| Store escalation matrix: every store × App / Ecommerce / BDA / Store related, each row with its own To / Cc / TAT, automatic Level 1 → Level 2 | ✅ Built and tested on a test copy (§6.8). DH 105 / GNI Ecommerce rows and the routes the sheet doesn't state **confirmed by LOTS (23 Oct 2026)**. Live since 23 Oct 2026 |
| Workflow per case type and escalation: right store / team, TAT, escalation matrix (Level 2 / 3), holidays, re-assign, store-reply reading, promised dates, follow-up flags, report | ✅ Ready. **Store / team contacts and the matrix need filling in** |
| Email previews in Microsoft Teams (every email the CRM would send, nobody emailed) | ✅ Live — on until the mailbox is connected |
| Attachments: add files to a case; escalation emails carry them | ✅ Ready |
| Picklists and dependencies (add values and pairs, as in the PSRI CRM) | ✅ Ready |
| Simpler screens: case page "What to do now" + tabs, 11-item menu with an Admin page, 4-step New case | ✅ Ready |
| MySQL storage on the company server (database `lots`) | ✅ Live |
| Credentials kept outside the project | ✅ Done |
| Logins / passwords for agents | ✅ Built (§13.3). **Not switched on yet:** no admin has a password, so agents still pick their name (office network only) |
| SMS (SOP one-way channel), OMS link | ❌ Need an SMS provider / OMS access |

---

## 2. Install and run

Requires **Node.js 20.12 or newer** (tested on Node 24).

```bash
npm install
npm run dev          # http://localhost:4000, picks up code changes
```

For daily use on the office network:

```bash
npm run build        # build the front end (again after every code change)
npm start            # http://<this-pc-ip>:4000 — every agent opens this in Chrome / Edge
```

- At start the terminal shows `Data: MySQL database "lots"` and where the credentials were read from. If it doesn't say MySQL, the private secrets file wasn't found (§3).
- The server listens on all network interfaces. Agents on the same network use the CRM PC's IP address.
- If port 4000 is taken, set `PORT` in `.env`. The server says so clearly when the port is busy.
- **Restart the CRM after every change** to code, `.env` or the secrets file (Ctrl + C, then `npm run dev` / `npm start`).
- **In the background (recommended for the live CRM)**, without administrator rights, as a scheduled task "LOTS CRM" under the Windows user. It starts when that user logs on, runs hidden in production mode and is restarted within 10 seconds if it stops:
  ```
  powershell -ExecutionPolicy Bypass -File scripts\crm-service.ps1 install    # build the screens, create the task, start
  powershell -ExecutionPolicy Bypass -File scripts\crm-service.ps1 status     # running? since when, pending database writes
  powershell -ExecutionPolicy Bypass -File scripts\crm-service.ps1 restart    # after an update: build, stop safely, start
  powershell -ExecutionPolicy Bypass -File scripts\crm-service.ps1 stop | start | uninstall
  ```
  "stop" and "restart" wait until no database writes are pending (`/api/health`). The logs go to `crm.log` / `crm-error.log` in the project folder. It needs the user logged on; running before anyone logs on needs an administrator, who can install the same script with a real service tool such as NSSM.
- **Support tokens run separately** from the CRM, so agent questions still reach the help desk manager when the CRM is down. The service has its own task and port `4100`, and its own MySQL tables (`support_tickets` + `support_messages` in the same `lots` database); without MySQL settings it stores tokens in a local JSON file instead:
  ```
  powershell -ExecutionPolicy Bypass -File scripts\support-service.ps1 install | status | restart | stop
  ```
  Agents use `http://<this-pc-ip>:4100/`; the manager uses `http://<this-pc-ip>:4100/admin`. The CRM reads and writes tokens through this service, so both places show one shared list. See [support-service/README.md](support-service/README.md).
- **Watchdog**: checks both services every minute and restarts whichever stops answering (3 failed checks in a row), because the two runner loops above only cover a crashed Node process - not a hung one, a dead loop, or nobody noticing. It writes `~/.lots-crm/watchdog-status.json` (the CRM shows it as a bar above the page) and `logs/watchdog.log`, and raises a Windows notification when it restarts something:
  ```
  powershell -ExecutionPolicy Bypass -File scripts\watchdog.ps1 install    # create the task and start checking
  powershell -ExecutionPolicy Bypass -File scripts\watchdog.ps1 status     # last check, both services, recent events
  powershell -ExecutionPolicy Bypass -File scripts\watchdog.ps1 check      # one check now, then exit
  powershell -ExecutionPolicy Bypass -File scripts\watchdog.ps1 uninstall
  ```
  Skipped checks: the CRM needs up to 3 minutes to load before it is restarted, so an occasional slow start only delays the restart. The bar above the page turns amber after an automatic restart and red while a service is down.

### Run a copy on another PC (collaborator)

A clone contains **only the code**. Settings and data are deliberately outside git, so on a new PC the CRM starts on its own **empty data file** and without the **SparkTG dialer** — it looks as if all the data disappeared, but nothing was deleted: that copy simply has no MySQL settings and no access to the company database yet.

1. Install **Node.js 20.12 or newer** (LTS), clone the project, open a terminal in the project folder.
2. Run the setup script:
   ```
   powershell -ExecutionPolicy Bypass -File scripts\crm-setup.ps1
   ```
   It checks Node, runs `npm install`, creates `.env` from `.env.example` (port, SparkTG addresses, mailbox), creates `C:\Users\<him>\.lots-crm\secrets.env` from the template, builds the screens and lists exactly which values are still empty. It never prints or overwrites a password. Add `-InstallService` to also create the background task and start it.
3. Paste the **same** secrets values the live CRM PC uses into `C:\Users\<him>\.lots-crm\secrets.env` — `MYSQL_HOST`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, and the `SPARKTG_*` login. Copy them from the live PC by hand; they are never in git and must never be committed.
4. Restart (`scripts\crm-service.ps1 restart` or `npm start`) and open `http://localhost:4000`.

Then check the bar above the page: it must be quiet, and **Stores & settings › Database** must say `MySQL database lots`. If the bar says *"using its own local data file"*, the `MYSQL_*` values were not read — the copy is not on the company database.

- **Writing to the live database:** pointing a second copy at the same MySQL means its cases, calls and contact edits are live immediately. For a training/dev copy, set `CRM_DATA_DIR` in `.env` to a separate folder (or use a separate database) instead.
- **Never open `dist/index.html` directly** (double-click). Always start the server; the screens need `/api`, and without it every list is empty.
- **Do not commit** `.env`, `secrets.env` or `server/data/` (all git-ignored already).
- **Support tokens** are a separate service. Either paste the live PC's `SUPPORT_SERVICE_URL` + `SUPPORT_SERVICE_TOKEN`, or set up a copy with `scripts\support-service.ps1` and `C:\Users\<him>\.lots-crm\support.env` ([support-service/README.md](support-service/README.md)).

---

## 3. Configuration: `.env` and the private secrets file

Settings are kept in two files:

| File | Where | Contents |
| --- | --- | --- |
| **Private secrets file** | `C:\Users\<you>\.lots-crm\secrets.env`, **outside** the project folder, readable only by that Windows user | Every credential: MySQL server, user and password; SparkTG login and service ID; Microsoft 365 app details |
| **Microsoft sign-in** | `C:\Users\<you>\.lots-crm\ms-signin.json`, same private folder | Created by "Sign in with Microsoft" (§9.3). Never edit or share it |
| `.env` | Project folder | Only non-secret settings: port, SparkTG web addresses, mailbox name |

A **fresh clone has no `.env` and no private secrets file**, so it starts on its own empty data file. Run `scripts\crm-setup.ps1` (§2, "Run a copy on another PC") to create both and to see which values are still missing.

Zipping, copying or sharing the project folder never shares a password, and none of these files go into git. The browser never receives credentials. The CRM never shows the database server or user (terminal, Settings, error messages). Templates: `secrets.env.example` and `.env.example`. Another location can be set with the `LOTS_SECRETS_FILE` environment variable. The secrets file is read first, `.env` second.

**Private secrets file** (`secrets.env`):

| Setting | Needed for |
| --- | --- |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_SSL` | MySQL storage (§13.1). Without them the CRM won't start once the data has moved to MySQL (it refuses rather than starting empty) |
| `SPARKTG_USERNAME`, `SPARKTG_PASSWORD`, `SPARKTG_SVC_ID` | SparkTG API: direction, outcome, duration, recording, missed calls |
| `SPARKTG_WEBHOOK_TOKEN` | Optional secret for `/api/sparktg/event` |
| `MS_SIGNIN_CLIENT_ID` | Optional: own Microsoft app for "Sign in with Microsoft" (§9.3) |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | Alternative mailbox connection with an IT app secret (§9.4) |
| `VTIGER_URL`, `VTIGER_USERNAME`, `VTIGER_ACCESS_KEY` | Importing contacts and cases straight from Vtiger (§6.9, §11.3). The access key is under Vtiger → My Preferences |
| `ANTHROPIC_API_KEY` | Optional: the AI email reader (§9.2). Without it the keyword rules are used |
| `CRM_AUTH_OFF` | Emergency only: `1` turns sign-in off (§13.3) |
| `TEAMS_WEBHOOK_URL` | Microsoft Teams workflow link (Power Automate "post to a channel when a webhook request is received"): email previews are posted there (§9.2). The link carries a signature — treat it as a password |

Wrap values containing `#` or spaces in single quotes, for example `MYSQL_PASSWORD='abc#123'`.

**`.env`** (not secret):

| Setting | Notes |
| --- | --- |
| `PORT` | Default `4000` |
| `SPARKTG_BASE_URL` | Default `https://telephonycloud.co.in` |
| `SPARKTG_WIDGET_URL` | Dialer inside the CRM, the same as `VITE_SPARKTG_WIDGET_URL` in crm-vmm |
| `MAILBOX` | Default `contactus@cpwi.in` |
| `CRM_DATA_DIR` | Optional separate data folder for a test or training copy |

**Keeping credentials confidential:**
- Don't paste passwords into chats, email or tickets. If one was shared, have it changed and update `secrets.env`.
- Edit `.env` carefully: removing lines from it once hid all cases (the CRM now refuses to start in that situation instead).
- Back up `secrets.env` separately and securely, for example in a password manager. A new PC or user needs their own copy, from `secrets.env.example`.

---

## 4. First-time setup checklist

1. `npm install`, create `.env` and `C:\Users\<you>\.lots-crm\secrets.env` (§3), then `npm run build` and `npm start`.
2. **Sign in.** Each agent adds their **full name**, **SIP ID**, **email ID** and **phone no.** the first time (the full name is the name used everywhere in the CRM). An admin can change the details later in Admin → Users.
3. **Admin → Stores & settings:**
   - **store contacts** (name, phone, email) for all six stores, and **team contacts** (E-commerce, IT, BDA, HR, Admin, Marketing, Supplier) — escalation and follow-up emails go to them
   - the **escalation matrix** (Level 2 / 3 names, emails, TATs) and **holidays**, once LOTS shares them
   - each agent's **SIP ID**, email and phone, if not given at sign-in (email is the SparkTG dialer login)
   - **SparkTG → Test connection**, with a real call ID to see how the record is read
4. **Admin → Automation:**
   - **Email previews in Microsoft Teams**: *Send a test message* and *Post a sample of every email* to check the emails with the team
   - **Mailbox → Sign in with Microsoft** with an account that can open contactus@cpwi.in (§9.3); then switch the Teams previews **off** to go live
   - agent shifts (9–6, 10–7, 11–8, 12–9 or Off)
   - supervisor email (daily report)
5. **Contacts → Import CSV → Import all contacts from Vtiger** (or a CSV of the member master), so callers are recognised; then **Cases → Import from Vtiger** for the case history (§11.3, §6.9).
6. Make **one incoming and one outgoing test call** (§7.6).

---

## 5. Screens

**Left menu** — only what agents use every day (collapses to icons with ‹): Dashboard, Log new case, Inbox, Call logs, Contacts, Cases, Report, Support, and Admin at the bottom (admins only once sign-in is on).

| Screen | What it is for |
| --- | --- |
| **Dashboard** | What needs attention now: escalations overdue, store follow-ups due today, store replies to check (each opens Follow-ups). Open cases by status, last 14 days (created and closed), channel mix, today's totals, escalations by store, top open categories |
| **Log new case** | Four numbered steps in the SOP order, under the **Identify caller** panel: one search box for mobile, card no., membership ID, name, business name or email (owner, alternate and add-on card holders). An exact mobile, card no., membership ID or email fills the contact in; a name or business shows *Matching members* to click; an unknown mobile or email is copied onto the case: ① **How did they contact us?** (inbound call, missed-call callback, email, outbound call, with the SOP greeting) ② **Who is it?** (type of contact, name, business, mobile, card no.) ③ **What is the concern?** (case type cards → category → sub-category, store, invoice / order no.; the case master's other fields only when there's a real choice, product under *More details*; the workflow for the category) ④ **What happens now?** (resolved on call, info missing → Waiting, or escalate, with the EDC). SOP checks (§6.5), documents needed and SOP answers on the side |
| **Inbox** | Mailbox (once connected), email cases by status, logging an email by hand (§9) |
| **Call logs** | Every call through the CRM dialer or reported by SparkTG: Today / 7 days / 30 days / All or From–To dates, search by number, name, agent or case no., *With recording* filter, 200 at a time with **Load more**; recordings play in the list and **Download** as mp3. Tiles and figures per agent for the chosen range (§7.5) |
| **Contacts** | Contact **cards** (initials, name, mobile, contact type, business; Call / Email / WhatsApp) — the newest 500, search finds any of the 3 lakh. Tapping a card opens the **contact panel** on the right: Edit, Call / Email / WhatsApp / Log case, the LOTS fields, add-on members and the **communication history** (calls with recordings, missed calls, cases, emails), newest first. **+ Create Contact**, **Import CSV**, **Import from Vtiger** (§11) |
| **Cases** | All cases, 50 per page: search (case no., phone, name, email, card, order) beside **Export CSV**, filters (status, channel, type, store, agent), **Import from Vtiger** (admin, §6.9) |
| **Report** | Cases of a date range: From / To with **Today**, **7 Days**, **30 Days**, **This Month**; search and filters (status, store, channel, agent); the cases table, 50 per page; **Export CSV** (any range) and **Download Excel** (up to 50,000 cases; greyed out above that). Dates in India time (§15) |
| **Support** | The agent's help panel and support tokens (§12.1) |
| **Admin** | One page linking the setup pages below |

**Pages without a menu item** (opened from other pages or by address):

| Page | What it is for |
| --- | --- |
| **Follow-ups** (`/followups`, from the Dashboard tiles and the Escalation flow) | Escalated cases by **store or team** with deadlines, level, promised date and flags (*not followed up today*, *store replied — check*, *promise missed*); the daily call script, logging the call with the store's promised date, one follow-up email per store / team. **Report** tab: on time %, average days, overdue, levels, promises missed per store / team (§6.8) |
| **Outbound calls** (`/leads`, no link since its Dashboard tile was removed) | Calling lists for every SOP outbound purpose: new registration, inactive customer, order on call, LCC, confirmation, **follow-up**, **customer survey**, festival offers. Import, **Call**, log the outcome. Confirmation calls close or re-open their case; follow-up calls move a Waiting case back to Pending; survey calls record the customer's feedback (SOP: "collecting feedback to improve our service"), with a **Survey feedback** panel |
| **Knowledge base** (`/kb`, no menu link) | SOP / FAQ answers, call scripts and email templates, searchable. The matching answers also show beside Log new case |
| **Missed calls** (`/missed`, "All missed calls →" in the top-bar list) | Every missed call with its attempts (§7.3) |

**Admin page** (for team leaders):

| Page | What it is for |
| --- | --- |
| **Stores & settings** | Store contacts, team contacts (§6.6), **holidays** (§6.8), agent SparkTG emails, SparkTG connection test, database status, backup download |
| **Escalation matrix** | HO, store and team escalation matrices: who gets the email at each level, with TATs. Edit any row; it applies at once, also to cases already escalated. Sample to Teams. Also see **Escalation flow** for the same rules as a flow chart |
| **Automation** | Mailbox connection, **Email previews in Microsoft Teams**, rule switches, timers, agent shifts, activity log, outbox |
| **Case workflows** | The workflow of every case type: owner team, TAT, steps, and the teams' email addresses (§6.6) |
| **LOTS workflow chart** | The SOP flow as an interactive chart; every box shows its live count (red = needs attention) |
| **Escalation flow** | HO and store escalation matrices as a flow: First Time Resolution → Level 1 → Level 2 per row, with live counts |
| **Support tokens** | Questions the agents sent to the help desk manager (§12.1) |
| **Users and sign-in** | Passwords, roles (agent / admin) and the switch that makes sign-in required (§13.3) |
| **Picklists** | Values of every dropdown. **+ Add** a value, or create a new list (§6.7) |
| **Dependencies** | Which values go together (case type → category → sub-category / request for / sub-category 2 / resolution type, product category → product type, customer group → customer type). **Add a dependency pair** (§6.7) |

**On every page:**
- **Top bar:** dialer status (green = ready), the agent, **Switch agent**, and the **missed-call boxes** (§7.3).
- **Dialer** (📞, bottom right) and the **caller panel** that pops up on every call (§7.1).

**Case page** (kept simple):
- **Header:** case number, status, one line with the concern · customer · store, **Call customer**, and the status flow.
- **What to do now:** the next SOP step in one sentence and only the buttons that apply (resolve on call / waiting / escalate, store replied → resolution, confirm → close…). When escalated, the escalation sits inside it: who has it, level, due date, promised date, next level, **Re-assign**, **Escalate to the next level**, and the *store replied — check* banner.
- **Tabs:** **Details** (read-only, **Edit** to change) · **Timeline** · **Email** (templates, tick case files to attach, send / preview in Teams) · **Files** (+ Add file) · **Calls** (linked calls, recordings) · **Steps** (workflow checklist).
- **Side:** customer (with their other cases), store and its contact, documents needed.

---

## 6. Case workflow (from the SOP)

### 6.1 Case types (LOTS case master)

> Switched on 17 Oct 2026 and tested on 22 Oct 2026 (decided with the user). The live CRM picks it up at its next restart; saved cases are renamed then (below).

The case taxonomy now comes from the **"Case catergory" sheet of LOTS's escalation workbook** ("Escalation Matrix LOTS", the file with the store tabs; it replaces the older "lot cases excel"). It is defined in `src/taxonomy.js`, with the names written exactly as in the sheet (including its spellings, e.g. "Stock availablity", "Not Relevent or Spam"). The SOP still drives the workflows, answers and requirements.

Fields: **case type → category → sub-category (the sheet's Sub-1) → sub-category 2 (Sub-2)**. The case types depend on the **type of contact**:

| Type of contact | Case types (categories) |
| --- | --- |
| **Registered With Lots** | **Inquiry** (Legal · Real Estate · HR or Jobs · General Query · IT or Website · Admin Related · Marketing related · Festive Gifting) · **Issues or Complaint** (Store related · Membership Related · E-Comm Related · App Related · **Product Damage** · BDA related) · **Request** (Membership related Request · Store related Request · E Commerce Related Request · App Related Request · BDA Related REQUESTS) |
| **Not Registered** | **Inquiry** (same) · **Issues and Complaint (NR)** (Member related -NR) · **Request** (New Member · New Supplier) |
| **Others** | **Not Relevent or Spam** (no category) |

- **Sub-categories and sub-categories 2** are the sheet's: 88 sub-2 values. For example, Store related › Behaviour of staff › rude behaviour / no knowledge / No Support, and App Related › Order Related › order not complete / Wrong products received / ….
- **"Lots-App" taken out of the names (user, 22 Oct 2026):** the sheet's "LOTS-App Related" is **App Related**, "Lots-App Related Request" is **App Related Request**, and its app sub-categories lose the prefix ("Lots-App Order Related" → **Order Related**; "Lots-App related- Others" → **Others**). The website ones keep "Website …". The workbook's own tab and row text still says "Lots-App"; the CRM reads it as before but shows it without the prefix.
- **General Query** now uses the sheet's sub-categories: About Store, Member registration Inquiry, Store Branding, Pricing and product Inquiry, Mode of Payment, About Add on Cards, Delivery Inquiry, Offers & Schemes, Ecomm query, Supplier Registration Inquiry, Membership card Related.
- The SOP sub-categories the CRM had added are gone: General Query, HR or Jobs, and the store / app / e-commerce / BDA complaints.
- **New Supplier** keeps the six supplier types as sub-category 2, because the HO matrix rows use them.
- **Request for, Invoice detail required and Resolution type** are kept from the older case master, under the new category names.
- **New dependencies** (Admin → Dependencies): Caller Type → Case Type, and Sub Category → Sub Category 2.
- **Cases already saved:** at start-up, the CRM renames the 1-to-1 changes once:
  - Requests → Request;
  - Issues or Complaints - NR → Issues or Complaint;
  - Store Related → Store related;
  - ECommerce Related → E-Comm Related;
  - LOTS-App Related → App Related; Lots-App Related Request → App Related Request; app sub-categories lose "Lots-App " (e.g. Lots-App Order Related → Order Related);
  - Membership Related - NR → Member related -NR;
  - … (`CASE_ALIASES` in `src/taxonomy.js`).

  Their old sub-categories stay as they were.
- **To confirm with LOTS:**
  - In the sheet, "Others" only has *Not Relevent or Spam*, so B2C walk-in customers (AKD / NSP) can no longer log a complaint under "Others".
  - A registered member can't pick New Member / New Supplier.

Other fields on a case:
- Type of contact (the case master's `type_of_contact`): Registered With Lots, Not Registered, or Others. It decides the case types offered (above).
- Channel: Inbound call, Outbound call, Missed call callback, or Email.
- Product category: Fresh, FMCG – Food, Commodities, FMCG – Non food, or Non food.

### 6.2 Statuses

```
Pending ──► Closed (resolved on call, ROT)
   │
   ├──► Waiting (info missing) ──► customer replies ──► Pending
   │
   └──► Escalated to store (L1 TAT 1 working day, Sundays not counted)
             │
             ▼
         Resolved (store replied) ──► customer confirms ──► Closed
             │
             └── not satisfied ──► Escalated again
Closed ──► Reopen ──► Pending
```

**The CRM follows the LOTS Workflow chart strictly.** A status can only move along an arrow of the chart. Any other move is rejected without changing the case:

| From | Allowed next | Blocked |
| --- | --- | --- |
| Pending | Closed (ROT) · Waiting · Escalated | — |
| Waiting | Pending (customer provided details) | Closing or escalating straight from Waiting |
| Escalated | Resolved (store replied) | Closing, or sending it to Waiting, before the store resolves |
| Resolved | Closed (confirmation call: customer confirmed) · Escalated (not satisfied) | — |
| Closed | Pending (reopen) | — |

Two moves aren't drawn on the chart but are kept on purpose: **Reopen** and **Not satisfied → back to the store**. A confirmation call can close a case only once it's at Resolved. There are no auto-close rules, because the chart closes a case only on customer confirmation.

Also enforced:
- A case is escalated to the store or team of its **workflow** (§6.6). Store cases need a **store**; app / e-commerce cases need the **order / invoice number**.
- A case must have a **case type and category** before it can be closed.

Every change is written to the case **timeline** with the agent's name and the time.

### 6.3 Steps from the workflow chart that the CRM carries out

| Workflow box | How the CRM applies it |
| --- | --- |
| Registered member? | The caller's number is matched automatically (§8) |
| Select case type → Inquiry / Issues or Complaint / Request | Case-type cards on the New Case page (only the ones for the type of contact), with the case-master categories, sub-categories and sub-categories 2 |
| Answer from SOP / FAQ | Matching SOP answers appear beside the case form |
| **Request requirements** | For requests that need documents (new membership, add-on card, supplier, lost card, address change, return/exchange, bulk booking), the SOP checklist is shown in the case form and on the case page |
| Resolve within TAT? | Three outcomes, as in the SOP: ROT · Info missing → Waiting · Escalate to store team (EDC = 1 working day) |
| **Call closing: "anything else?"** | After a call case is saved: **Yes, next concern** opens a new case for the same caller and SparkTG call. **No** shows the closing line. One call can be linked to several cases |
| Email → case auto-created · Pending | Every mail becomes a Pending case automatically (§9.2) |
| "AI agent reads the mail" | **AI email reader** (Claude, once an Anthropic API key is in the secrets file) or the rule-based reader: case type, category, sub-category, store named in the mail, contact (by email, mobile or card number), invoice / order number |
| Information complete? → auto email / auto-escalate | Built, but **off by default**, because the SOP says an agent calls the customer first. Can be switched on (§10.1) |
| Escalate → Daily follow-up → Resolution → Confirmation call → Closed | Automation (§10) plus the Follow-ups and Outbound leads screens |

### 6.4 Case numbers

`LWS-000001`, `LWS-000002`, … Keeping `[LWS-000123]` in an email subject threads the reply onto that case.

### 6.5 SOP checks while logging a case

Shown as an orange **SOP check** box on the New Case page and the case page. They are warnings: the agent still decides.

| Situation | Check |
| --- | --- |
| Request → **Return / exchange** | A **Purchase date** field appears. Warns for non-returnable items (oil, ghee, fresh dairy, fruit, vegetables, meat, fish, chilled or frozen), for purchases more than **7 working days** ago, and reminds about the stamped bill and credit-note rules |
| Request categories of the case master (Membership / Store / E Commerce / BDA / App requests) | Invoice / order no. marked required; the SOP check reminds if it's empty |
| Type of contact **Others** (e.g. B2C walk-in customers) | Warns for stores other than **AKD / NSP**, **non-food** products, and **app / e-commerce** cases |

### 6.6 Workflow per case type

Every case type, category and sub-category has a **workflow**: who owns it, its TAT and its steps. They are defined in `src/workflows.js` and listed on the **Case workflows** screen. The most specific match wins (sub-category, then category, then case type).

| Workflow | Owner (escalates to) | TAT | Needs before escalating |
| --- | --- | --- | --- |
| General Query · New Member | Care desk (answered on the call, ROT) | — | — |
| Pricing and product Inquiry · Stock availablity / Pricing Related Request | Store team | 1 working day | Store (requests) |
| HR or Jobs | HR / Careers (careers@cpwi.in) | 1 | — |
| IT or Website · App Related | IT / Website team | 1 | Store (app) |
| Marketing related · Festive Gifting | Marketing team | 1 | — |
| Admin Related · Legal · Real Estate | Administration | 1 | — |
| Store related · Store related Request · Return of goods related Request | The case's **store** contact | 1 | Store |
| E-Comm Related · E Commerce Related Request · App Related Request | E-commerce / App team | 1 | **Store** and order / invoice no. |
| BDA related · BDA Related REQUESTS | BDA team | 1 | **Store** |
| Membership Related · Member related -NR · Membership related Request | The member's **home store** | 1 | — |
| New Supplier | Category / Supplier team | **7** (SOP: reply within 7 days) | — |

The owner above is the fallback. Store, membership, app, e-commerce and BDA cases go to their row of the **store escalation matrix** (§6.8), and the **store** is required on app, e-commerce and BDA cases for that reason.

**On the case page**, the **Workflow** card shows the owner, the TAT, where the case escalates to (with the contact's email, or a link to add it), and a **step checklist**:
- Steps the CRM can see tick **themselves** (details captured, customer called, escalated, follow-up done, resolution, confirmation, closed, store / order number recorded).
- The others (e.g. "Order status checked", "Return policy checked") the agent ticks; each tick goes on the timeline with the agent's name.
- The **next step** is highlighted, with a progress bar.

**When a case is escalated**, the CRM saves where it went (`escalatedTo`) and sets the EDC from the workflow's TAT. The **escalation email, overdue reminders and the daily follow-up email** go to that store or team (§10). The **Escalate** button names the team, and the **New case** form shows the workflow as soon as the category is chosen.

**Team contacts:** Stores & settings → **Teams**: contact name, phone and email for E-commerce, IT, BDA, HR, Administration, Marketing and Supplier teams. Until a team's email is set, its escalation emails are not sent and the activity log says so.

### 6.7 Picklists and dependencies (as in the PSRI CRM)

Every dropdown takes its values from a **picklist**, and dependent dropdowns (Category after Case Type, Sub-category after Category, Customer type after Customer group) follow the **dependency pairs**. The base values and pairs come from LOTS's case master (`src/taxonomy.js`); anything added is stored in the CRM's database and shows up in the forms straight away.

- **Admin → Picklists:** one card per list. Grey chips come from the case master and can't be removed; **green chips were added** (hover shows who added it and when) and have a × to remove them. **+ Add** puts a value in a list; **+ New picklist** creates a list. Duplicates are refused whatever the capitals.
- **Admin → Dependencies:** **Add a dependency pair**: main field → main value → sub field → sub value (or type a new sub value, which is added to its picklist too). The pairs are listed by relationship and main value.
- **On the case form:** **+ Add** next to *Category* and *Sub-category* adds a value under the chosen case type / category in one step, and selects it.
- Removing an added value also removes its pairs. Cases already saved keep their values.
- A category with no workflow of its own (§6.6) follows the standard workflow (store, 1 working day).

### 6.8 Escalation

#### HO escalation matrix (LOTS sheet "Escalation Matrix LOTS – April 2026 – V_6 (HO)")

For the case types in the sheet, escalation follows the sheet: **First Time Resolution → Level 1 → Level 2**. Each stage has a **SPOC** (To), an **escalation list** (Cc) and a **TAT**, counted from when the case reaches that stage. The data is in `src/escalationMatrix.js`; **Stores & settings → Escalation matrix (HO)** shows it, can edit a row (marked as changed, with "Back to the sheet"), and **Sample to Teams** posts a row's three emails for a sample case.

| Sheet row | CRM case (case master) | First Time Resolution | Level 1 | Level 2 |
| --- | --- | --- | --- | --- |
| Projects – Real Estate | Inquiry › Real Estate | Mandvi Tamrakar · 1 day | Mandvi Tamrakar · 2 days | Mandvi Tamrakar · 3 days |
| Suppliers – Fresh | Request › New Supplier › Suppliers - Fresh | Dushyant Gupta · 1 day | Dushyant Gupta, Satish Thaker · 2 days | same · 3 days |
| Suppliers – FMCG – Food | … › Suppliers - FMCG - Food | Akshit Sharma · 1 day | Satish Thaker · 2 days | Satish Thaker · 3 days |
| Suppliers – Commodities | … › Suppliers - FMCG - Commodities | Dushyant Gupta · 1 day | Dushyant Gupta · 2 days | Dushyant Gupta · 3 days |
| Suppliers – FMCG – Non Food | … › Suppliers - FMCG - Non Food (**new**) | Shalini Dani · 1 day | Satish Thaker · 2 days | Satish Thaker · 3 days |
| Suppliers – Non Food | … › Suppliers - Non Food | Anu Bakhshi · 1 day | Anu Bakhshi · 2 days | Anu Bakhshi · 3 days |
| Suppliers – D&F | … › Suppliers - D&F (**new**) | Anu Bakhshi · 1 day | Anu Bakhshi · 2 days | Anu Bakhshi · 3 days |
| Legal | Inquiry › Legal | Hemanshu Yadav · **4 working hours** | Hemanshu Yadav · 1 day | Hemanshu Yadav · 2 days |
| HR (only if required) | Inquiry › HR or Jobs | Yuktanshi Srivastava, Apoorv Tyagi · 1 day | Isha Kohli · 2 days | Isha Kohli · 3 days |
| IT / Website (only if required) | Inquiry › IT or Website | Tarang Shah · 1 day | Tarang Shah · 2 days | Tarang Shah · 3 days |
| Admin Related | Inquiry › Admin Related | Varun Tomar · 1 day | Varun Tomar · 2 days | Varun Tomar · 3 days |
| Marketing Related | Inquiry › Marketing related | consultant80, Navni Jain, Rigzin Yangdol · 1 day | same · 2 days | Amritraj Kaur + same · 3 days |

The copy lists are in the sheet / on the Settings page. Days are working days.

- **Escalate:** the email goes to the First Time Resolution SPOC with its list in copy, and the due date is that TAT. A TAT in hours counts only **working hours, 09:00–21:00** (editable on the Settings page), Monday–Saturday without holidays: Legal escalated at 8 PM is due at 12 noon the next working day.
- **TAT passes:** the case moves to Level 1, then Level 2, by itself. Each time the email goes to that stage's SPOCs with that stage's list in copy and says which TAT was missed. After Level 2's TAT, a reminder goes to Level 2 every working day. **Escalate to Level 1 / Level 2 now** on the case page does the same without waiting.
- **Daily follow-up email:** one per sheet row, to the SPOCs of each case's current stage, listing the stage and due date.
- **Replies** from any address in the sheet are recognised as the team's replies (same rules as store replies below).
- **Corrected from the sheet (✎ on the Settings page):** HR Level 1 "Isha.kohli@cpwi" → Isha.kohli@cpwi.in; HR "Hemanshu.Yadav@cpwi.in@cpwi" → Hemanshu.Yadav@cpwi.in; IT Level 1, missing comma between two addresses. Stray commas and spaces cleaned; nobody is copied who is already in To.
- **Level 2 TAT confirmed by LOTS (23 Oct 2026):** **3 working days on every row except Legal**, whose sheet's "Within 2 working" is read as 2 working days; Admin and Marketing were empty → 3.
- **Two new supplier types** from the sheet were added to New Supplier: Suppliers - FMCG - Non Food, Suppliers - D&F.
- **Crisis / miscellaneous** contacts below the table (Sumil Mudgal, Richa Singh; rigzin.yangdol, ajay.sharma, navni.jain) are shown on the Settings page; the CRM does not email them.
- **Not in the HO sheet:** store cases, e-commerce / app, BDA and membership go to the **store escalation matrix** below. General Query, Festive Gifting and New Member keep the store / team escalation.
- Cases already escalated before 17 Oct 2026 keep their team; only new escalations use the sheet.

**Escalation flow** (Admin → Escalation flow, `/escalation-flow`, also "See as flow chart" on the Settings card): the same rules as a React Flow chart, for the **HO matrix** or the **store matrix** (pick a store, a tab and a row; the start box lists the case categories that go to that row). Pick a row; the boxes show its SPOCs, copy lists and TATs and how many cases are at each stage now; click a box for the full To / Cc list and what the CRM does there.

#### Store escalation matrix (workbook store tabs)

LOTS's workbook **"Escalation Matrix LOTS"** (SharePoint, shared by the user on 17 Oct 2026) has 21 tabs: *Case catergory* (the new case master, §6.1), one tab per **store × kind**, and *HO*. Each store tab has the same CRM TABLE as the HO sheet, with SUB1 + SUB 2, and First Time Resolution / Level 1 / Level 2 with To, Cc and TAT. The people differ per store: the store's own mailboxes (`st101.reception`, `.delivery`, `.quality`, `.admin`, `.checkout`, `.cdm`, `.sgm`, `.asgm`) plus HO people.

| Tab | Stores in the workbook | Rows per store | CRM cases that go there |
| --- | --- | --- | --- |
| App (workbook tab "Lots-App") | 101 NSP · 102 Ithum · 103 AKD · 104 SV · 106 GNI | 17 | App Related · App Related Request · **Product Damage** |
| Ecommerce (website) | 101 · 102 · 103 · 104 (**no GNI**) | 16 | E-Comm Related · E Commerce Related Request |
| BDA | 101 · 102 · 103 · 104 · 106 | 14 | BDA related · BDA Related REQUESTS |
| Store related | 101 · 102 · 103 · 104 · 106 | 11 | Store related · Membership Related (row "Member complaint") |
| HO | — | 12 | The HO matrix above (to be compared with V_6) |

**DH 105 has no tabs**, and GNI 106 has no Ecommerce tab. User decision (17 Oct 2026): build them from the same rows with the store's own mailboxes (e.g. `st105.reception`), copied from NSP 101's pattern. **Confirmed by LOTS on 23 Oct 2026**; each of these rows carries a note saying where it came from.

**How a case finds its row** (`src/storeMatrix.js`): case category › sub-category › sub-category 2 → the tab row, for the case's **store** (membership: the member's home store). The most specific match wins. Every category that goes to a store tab reaches a row (checked by a script: 0 left without a row); the Inquiry categories stay on the HO matrix, and General Query, Festive Gifting and New Member on the team escalation. The routes the sheet doesn't state directly are marked `confirmed` (**confirmed by LOTS, 23 Oct 2026**):
- a store request → the store-related row of the same kind (the tab has complaints only);
- "Delivery Related" / "Website Delivery Related" (app / website order) → the *not dispatched* row;
- BDA "Order Cancelled" → *Order Cancelled without communication*;
- BDA "delayed delivery" → the *not dispatched* row;
- Member related -NR and Membership related Request → *Member complaint*;
- a category with no sub-category → the tab's "Others" row.

The app tab's **"Product Damage"** row has no category in the Case catergory sheet, so the CRM has a complaint category **Product Damage** with **no sub-category** (the sub-category field is disabled for it; user's decision, 23 Oct 2026). It goes to the store's App-tab Product Damage row and needs the store. Every row of the store matrix is reached by at least one case category.

**Read from the workbook** (checked 17 Oct 2026):
- every tab uses only its own store's mailboxes;
- faulty addresses: `Isha.kohli@cpwi` (HO tab), `p.khamank@c…` cut off in 12 cells, `St101.pbm.in` (each store tab, written without "@cpwi") and a bare "@cpwi.in"; all corrected or left out and noted (below);
- two tabs have a different SUB 2 text for "Lots-App Pricing Related - REQUESTS" (SV, GNI), so rows are matched by SUB1;
- Delivery related (store tabs) has a First Time Resolution TAT of **4 hours**, and the quality rows have Level 2 at 2 days.

**How it works (built 22 Oct 2026):**
- **The people per store** are in `server/storeMatrix.json`: 348 rows (6 stores × 58). `node server/buildStoreMatrix.js "<workbook.xlsx>"` reads them from the workbook, and the store tabs the workbook lacks (DH 105, GNI 106 Ecommerce) are made from NSP 101 with the store's own mailboxes (confirmed by LOTS, 23 Oct 2026; shown as a ⓘ note on the card).
- **Escalate:** a store, membership, app, e-commerce or BDA case goes to its store-matrix row, for its store (membership: the member's home store). The HO matrix still comes first for its own categories. The email goes to the row's First Time Resolution To with its Cc and says "as per the escalation matrix (store)"; the due time is the row's TAT (4 working hours for store delivery).
- **TAT passes → Level 1 → Level 2**, then a daily reminder: the same engine as the HO matrix (§6.8 above), with each stage's own To, Cc and TAT. Store-matrix rows use the sheet's TAT (the SOP's 7-day refund TAT is not added on top).
- **No store on the case** (or "Not Specific"): app, e-commerce and BDA cases can't be escalated until the store is recorded.
- **Stores & settings → Escalation matrix – stores (per store and kind):** pick a store and a tab (App, Ecommerce, BDA, Store related). Each row shows its three stages with To, Cc and TAT; **Edit** (applies at once, also to cases already escalated), **Back to the workbook**, **Sample to Teams**. A ⚠ banner shows on the made-up tabs.
- **Case page and New case form** show the row a case goes to as soon as the category and store are chosen.
- **Updates from LOTS:** uploading the workbook (or the live link, or an email from cpwi.in) reads the store tabs too. Each changed cell is shown (yellow marked), applied, and can be undone. Rows the CRM doesn't know are listed as "skipped"; tabs missing from the file are left as they are.
- **Replies** from any address in the store matrix are recognised as the store's replies.
- **Sheet text cleaned when read:** links and rich text in a cell are read as the text shown; `St101.pbm.in` → `st101.pbm@cpwi.in`; cut-off `p.khamank@c…` completed; a bare "@cpwi.in" left out. Corrections show as ✎ on the row (38 stages).

**Tested (22 Oct 2026, test copy, fake Teams):** 29 end-to-end checks: rows per store and tab; DH 105 and GNI Ecommerce rows (confirmed by LOTS, 23 Oct 2026); an AKD app complaint going First Time Resolution → Level 1 → Level 2 with the sheet's To / Cc, and nothing above Level 2; store delivery at 4 working hours; BDA, website, DH and not-registered membership routes; "Pricing mismatched" on the app vs website tab; Legal still on the HO matrix; a BDA case without a store refused; edit / bad email refused / back to the workbook; the whole workbook uploaded (274 store rows, 0 changes; the HO tab matches the CRM's 12 rows); one changed yellow cell found, applied and undone; an old case renamed at start-up; Sample to Teams. Settings card checked in Chrome (NSP Lots-App 17 rows, DH Store related 11 rows with the ⚠ banner, Edit form). Email reader: 10 sample emails, all land on case-master categories.

#### Updated matrix from LOTS (Excel / CSV)

LOTS updates the sheet: changed emails and new rows are highlighted in yellow, and SUB1 names stay the same. The CRM reads the new version itself (`server/matrixImport.js`).
- **Update from Excel** (Stores & settings, HO matrix card): upload the .xlsx or .csv. The CRM finds the "CRM TABLE" and matches each SUB1 to an HO row, a store ("Store AKD") or a team. It then shows every change (old → new, yellow cells marked) before anything is saved, and **Apply** saves it.
- **Typos are fixed and noted:** "a@cpwi" becomes a@cpwi.in, and "a@cpwi.in@cpwi" becomes a@cpwi.in. Anything that isn't an email is left out.
- **Where the sheet is unclear,** for an empty or unit-less TAT or an empty SPOC, the CRM keeps its current value and says so.
- **New rows** (a SUB1 the CRM doesn't know) wait for a decision: it is an existing row, a **new HO row** for a case-master category, or don't apply. Rows missing from the file are left as they are.
- **Automatic by email:** when the mailbox is connected, an email from a **cpwi.in** address with the matrix attached (.xlsx / .csv) is applied by itself. Its new rows wait on the Settings page, a note goes on the email's case and a card is posted to Teams. Files from outside cpwi.in are never applied.
- **History with Undo** (the last 5 updates, also after a restart).
- **Live link to the Excel** (`server/matrixLink.js`): LOTS keeps the matrix on OneDrive / SharePoint. Paste its share link (Share → Copy link) in **Update from Excel → Live link**.
  - **Refresh now** (since 23 Oct 2026, no automatic checking) downloads the file and applies it as above; when nothing changed it says “No changes”. Linking a file reads it once straight away.
  - It needs the Microsoft 365 sign-in (the same as the mailbox) with **Files.Read.All**, which was added to the sign-in. The signed-in account must be able to open the file. In app mode, IT grants Files.Read.All.
  - If the file can't be read (access removed, link deleted), the matrix stays as it is and the error shows on the page and in Teams.
  - Hand edits in the CRM stay until the Excel is refreshed with a change there; the Excel is the master.

#### Store / team escalation (case types not in the HO matrix)

**Escalation matrix – stores & teams** (Stores & settings): one row per store and team, plus a **Default** row, in the same shape as the HO matrix. Each row has **First Time Resolution** (the store's / team's own email), **Level 1** and **Level 2**, each with To, Cc and TAT, an **Edit** button, **Sample to Teams** and **Clear Cc and levels**.
- **Automatic:** the case goes to First Time Resolution, then to Level 1 and Level 2 automatically when each TAT passes. After Level 2, a reminder goes out every working day.
- **Default row:** a store or team without its own Level 1 / Level 2 uses it.
- **Edits apply at once**, also to cases already escalated.
- **Refunds and new suppliers** keep the SOP's 7 working days at First Time Resolution when that is longer than the row's TAT.
- **Contact tables:** the store SPOC and team tables keep names and phones only. Emails are edited in this matrix, and the First Time Resolution To is saved as the store's / team's email.

| Step | What happens |
| --- | --- |
| **Escalate** | The agent can keep the workflow's choice or pick **Send to** another store / team. The escalation email goes to that contact |
| **Store / team escalation matrix** (Stores & settings) | Level 2 and Level 3 contacts with their own TATs: a **default** for all, and optional rows per store and team. Empty = the Level 2 email on the Automation page |
| **TAT passes** | The case moves up one level by itself: the Level 1 contact keeps it, the next level is copied on the email, and the new due date is that level's TAT. At the highest level it gets one reminder per working day instead (no endless levels) |
| **Escalate to level N now** | From the case page, with a reason: an agent doesn't have to wait for the TAT |
| **Re-assign** | From the case page: move an escalated case to another store / team (wrong team, or passed on). It starts again at Level 1 with a fresh TAT and a new escalation email |
| **Daily follow-up call** (SOP) | Follow-ups shows **Not followed up today** for every case without an agent call today (the automatic daily email doesn't count). Logging the call can record the date the **store promised** |
| **Store replies by email** | Only a reply that reads like a resolution ("refund processed", "replacement delivered", "issue resolved") moves the case to Resolved. "We are checking", "will update by tomorrow", "Noted" keep it Escalated and flag **Store replied — check** for an agent, who marks it as the resolution or keeps following up. A date in the reply ("by tomorrow", "within 2 days", "by 18/10") becomes the promised date |
| **Promise missed** | When the promised date passes, the case is flagged (Follow-ups, Dashboard, daily email) and noted on the timeline |
| **Report** (Follow-ups → Report) | Per store / team for 7, 30, 90 or 365 days: escalated, resolved, **on time %** (within the first TAT), average working days to resolve, open, overdue, above Level 1, promises missed |

#### Emails to stores and teams (layout of LOTS's Vtiger mails)

Every email to a store or team uses the layout of LOTS's Vtiger mail (sample from the user, 22 Oct 2026). That covers the first escalation, Level 1 / Level 2, overdue reminders, the samples, and the "Escalation to store" and "Store follow-up" templates on the case page.
- The email opens with "Hi Team, / Greeting for the day!" and says what is asked.
- Every mail after the first one on a case is a reminder: **Reminder#1, #2 …** with "Need your kind intervention to close the below case as the TAT of this Case has already crossed".
- Then comes **"The Details of the Query are:"** (`src/queryDetails.js`), in the sample's order:
  - Escalation Level;
  - Case Number, Contact Name, Contact Type;
  - Membership ID, Business Name, Business City (from the contact);
  - Mobile, Primary Email;
  - Type of Customer (Segment1) and Type of Business (Segment2) (the contact's customer group and type);
  - Category (case type), Case Category, Request For, Issues (Sub 1), Sub Issue (Sub 2), Store Name;
  - Invoice Details: Date of Purchase, Invoice Number or Order ID, Membership ID (as provided by the customer), Purchase Amount, Amount To be Refunded;
  - Complaint Details;
  - Email Content (the customer's email, for email cases);
  - a note on the attachments.

  Empty values show as "—".
- **Format:** in the HTML email and in the Teams card the details are a table.
- **New on the case form** (under the invoice / order no.): **Date of purchase / order** (for every case, not only returns), **Purchase amount (₹)** and **Amount to be refunded (₹)**.
- **Not changed:**
  - emails to the customer (acknowledgement, information request, resolution) keep their own wording;
  - the daily store follow-up email stays a short list, one line per case.

Replies are recognised from the store contacts, the team emails, both escalation matrices and any @cpwi.in address. Re-assign also offers the HO matrix rows; the report has one row per store, team and HO matrix row.

### 6.9 Cases imported from Vtiger (all 1.92 lakh)

**Cases → Import from Vtiger** (admin only) brings LOTS's whole case history into the CRM. Like the contacts import it is a job on the server, with the `VTIGER_URL`, `VTIGER_USERNAME` and `VTIGER_ACCESS_KEY` settings in the private secrets file.

- **How it runs:** 200 cases per Vtiger request (its limit), onward from the last record id, saved every 2,000. The page can be closed. **Stop / Continue** go on from the last saved case, and a restart of the CRM shows the job as stopped. Cases already imported (same Vtiger record id) are skipped, so running it again never doubles a case and never overwrites changes made in the CRM.
- **Speed:** about an hour for 1.92 lakh; Vtiger accepts roughly one request a second.
- **What comes in:** case type, category and sub-category, store, channel, call type, product category and product type, subject, description, resolution, the Vtiger case no. and the owner. Vtiger's timestamps are kept, so "cases today" and the reports stay correct. Imported cases are not assigned to a CRM agent; the Vtiger owner is kept as information.
- **Contact:** a Vtiger case holds the Vtiger contact's record id (`4x762`), while the CRM stores the Vtiger **Contact Id** (`CON141`). The importer looks a page's ids up in one query and copies the phone, business, card no. and registered store when that contact is in the CRM. Cases whose contact was not imported stay without a contact.
- **Store:** Vtiger's case store; `Not Specific` becomes **NS**; when the case has none, the linked contact's home store is used.
- **Statuses (decision, 26 Oct 2026):** only Vtiger cases whose case status is **Open** are live work. Among those the raw **Resolved** stays **Resolved**, and every other Open case becomes **Pending**. Everything else (Vtiger `Closed` or blank, including old `Case On Hold`, `New`, `Assigned`) comes in as **Closed** history. This keeps the Email Inbox, dashboard, TAT clocks and automation to the work that is really open: about 548 open cases — 242 Pending and 306 Resolved — of which only 27 are email cases. Imported cases are never **Waiting** or **Escalated**, so the automation cannot chase customers or stores about old cases. The raw Vtiger status, the Vtiger case no. and the owner are on the case page, and the import is on the timeline.
- **Text:** the description is capped at 4,000 characters and the resolution at 6,000, HTML is stripped and empty fields are left out.
- **Result (live):** 1,92,396 cases imported; 1,38,796 linked to a CRM contact. One Vtiger record had half an emoji that MySQL refused; such characters are now replaced before saving, so one bad character can't block the writes.
- **Cases page:** 50 rows per page (Previous / Next, total and page), and **Export CSV** streams every case that matches the current filters from the server.
- **In main since 29 Oct 2026 (pull request #1), not live until the CRM is restarted:** a job that links the about 53,600 cases without a contact (by the Vtiger contact, a mobile only one contact has, the card no., then the email), and a **nightly Vtiger sync** at 02:00 (new contacts, new cases, links). Cases → Import from Vtiger → **Link cases to contacts** and the sync switch / time are on the Vtiger panels (admin only). Its full test against Vtiger is still to be finished. The nightly sync is **off by default** (29 Oct 2026): it runs only after an admin ticks *Sync with Vtiger every night* on a Vtiger panel.

---

## 7. Calls: SparkTG dialer inside the CRM

SparkTG's embeddable dialer (the same widget as in PSRI and crm-vmm) runs inside the CRM and talks to it through browser messages:

| From widget | Meaning | CRM does |
| --- | --- | --- |
| `ready_for_events` | Widget loaded | Logs the agent in with their SparkTG email (`login_sso_email`) |
| `login_sso_complete` | Login result | Dialer dot: green = logged in, yellow = loaded but not logged in, grey = loading |
| `show_dialer` | A call is ringing or starting (`callId`, `caller.phone`) | Logs the call and opens the **caller panel** |
| `hide_dialer` | Call ended | Marks the call ended and fetches the final record. SparkTG doesn't always send it, see §7.4 |

The CRM sends `login_sso_email` (automatic login) and `click_to_call` (every **Call** button) to the widget, and only accepts messages from the widget's own origin.

> **SparkTG service in use: 1672.** That is the service crm-vmm (VMM) uses; PSRI uses 1287. If LOTS has its own SparkTG service for 1860-123-5687, put its service ID and login in the secrets file (§17).

### 7.1 Caller panel (every call, incoming and outgoing)

Pops up next to the dialer, like in PSRI:
- **↙ Incoming** / **↗ Outgoing**, the number, then *Call ended* when it's over. Also why the call is happening: missed-call call-back, outbound lead or case.
- **Contact card** for a known number: initials, business, owner (or add-on member), card, customer type, home store, open cases, and **Card blocked** in red. Unknown numbers: *Not a registered member*.
- **+ New Case**, pre-filled with the number and call ID, and **All cases** for the contact.
- **Recent cases** (up to 5) with status and category: open one, or **Link this call to this case** to put the call (with outcome and recording) on an existing case.

The CRM no longer jumps to the New Case form by itself: the agent chooses a new case or an existing one.

### 7.2 Outgoing calls

**Call** buttons are on contacts, cases, missed calls, leads and the call log. The dialer dials, and the call is tied to the item it was dialled from. Contacts marked *Do not call* get no Call button.

### 7.3 Missed calls (top bar)

Two boxes in the top bar of every page (like PSRI):
- **Recent missed:** open missed calls nobody has tried yet. **Pulses red** past the SOP's 30 minutes.
- **2nd round:** tried once, not reached, needs another attempt.

Click a box for the list: number, contact, time, time left, agent, attempts, with **Call back**, **Log case**, **Not reachable** (moves it to 2nd round) and **No query**. **A new missed call opens the list by itself**, plays a short alert, and shows the call on top marked **NEW** with a red **Call now** button. The full list is at `/missed` ("All missed calls →").

### 7.4 After every call (automatic)

- The CRM fetches the final call record from SparkTG (retrying for about 20 seconds while SparkTG finalises it).
- **SparkTG doesn't always send "call ended".** Every minute the server checks calls still marked live; once SparkTG has the finished record, the call is processed like any other. This means a missed call reaches the CRM about **a minute after** the caller hangs up.
- **Direction comes from SparkTG's record** (INBOUND / OUTBOUND). The widget can't tell a keypad-dialled call from an incoming one.
- Outcome, duration and recording are saved on the call and on every case linked to it.
- **Incoming call not answered:** added to missed calls with the 30-minute timer, and assigned.
- **Calling a number that has an open missed call**, from any screen, counts as the call-back. When it connects, the missed call is marked *Called back*. A customer who rings again and is answered: *Customer called back*.
- **Outbound lead call not connected:** the lead becomes *Not reachable*.
- **Confirmation call:** *Confirmed resolved* closes the case, *Not satisfied* sends it back to the store.

### 7.5 Call logs page

**Call logs** in the menu: the whole history by default, with quick ranges (Today / Last 7 days / Last 30 days / All), From / To dates, a search by number, name, agent or case no., a **With recording** filter and 200 calls at a time (**Load more**). Every recording plays in the list and has **Download** ("call <number> <date>.mp3"), streamed through the server so the SparkTG login stays private.

**Calls from before the CRM:** SparkTG's API returns one call per call ID only and can't list older calls; they need SparkTG's call report (an export, or a report API from SparkTG).

Totals and figures per agent (in / out, connected, not connected, linked to a case, average talk time of answered calls), outbound calls against the **80–100 a day** target, a filter for **"Connected, no case logged"**, recordings played through the server, and **Raw** to see SparkTG's own record.

### 7.6 Checking the SparkTG connection

Confirmed on real records: `customerNumber`, `callType` (INBOUND / OUTBOUND), `disposition` (`ANSWER` / `NOANSWER`), `duration` (includes ringing time), `time`, `receivedBy` (agent), `recording` (.wav URL). To check the widget side:
1. **⚙ button** next to the dialer: the raw widget events (`show_dialer` should carry `callId` and `caller.phone`).
2. **Call logs → Raw** on a finished call: SparkTG's record and how the CRM read it.
3. **Stores & settings → SparkTG → Test connection:** login, agents, and how any call ID is read.

### 7.7 Other SparkTG options (if the account has them)

- **Call-event webhook:** `http://<crm>:4000/api/sparktg/event?token=…` catches calls that never reach any agent's dialer (everyone logged out, after hours). SparkTG must be able to reach the CRM PC.
- **Screen-pop URL:** `http://<crm>:4000/new?phone={caller}&txn={call id}`. Not needed with the dialer inside the CRM.
- A call ID can still be linked by hand on a case (Calls panel → Link).

---

## 8. Caller identification

When a number arrives (dialer, typed, or from a SparkTG call ID), the CRM looks it up automatically in **Contacts**:

- Numbers are compared on the **last 10 digits**, so `+91 98765 43210`, `919876543210` and `09876543210` all match.
- **Every number on a contact counts:** registered mobile, alternate, extra phones and **add-on members'** mobiles. An exact **card number** (member or add-on) also matches. For email, every address on a contact counts, plus a mobile or card number written in the mail.
- **A mobile shared by several contacts** (allowed when each has its own card no., §11.2) gives no automatic match: all of them are listed (Log new case and the caller panel) and the agent clicks the caller. A card no. or membership ID always identifies exactly one contact.
- **Match found:** name, business, card, email, caller type and home store fill in on their own. The contact card shows owner, mobiles, card, customer group and type, home store, GSTIN / licence, add-on cards, open cases, the registered delivery address and notes. **Blocked** cards are red. An add-on member calling is shown as such, with their own name and card.
- The caller's previous cases and recent calls are listed. **Not this member** unlinks a match for that number.
- Only a SparkTG call ID given: the CRM gets the caller's number from SparkTG first.

---

## 9. Email

**Status: ready to connect.** A supervisor connects contactus@cpwi.in once with **Sign in with Microsoft** on the Automation page. Until then, emails are logged by hand, and every email the CRM would send is **posted to the Microsoft Teams channel as a preview** (below), so the team can check it. Nobody receives an email.

### 9.1 Without a mailbox connection (manual)

**Log new case → Source: Email**, or **Email inbox → Log an incoming email**: a *Pending* case is created. A reply with `[LWS-…]` in the subject is added to that case instead. On the case page, templates can be copied or opened in the mail app, then logged as sent.

### 9.2 With the mailbox connected (works like the VMM CRM)

The mail domain cpwi.in is on **Microsoft 365**, so the CRM uses the **Microsoft Graph API**, with the same calls as the VMM CRM's mail code: delta inbox, conversation threads, reply in thread, categories, read / unread.

**Email inbox → Mailbox** (live view of contactus@cpwi.in):
- **Inbox / Sent** tabs, search (sender, subject, text), unread in bold, refresh every minute.
- Each email shows its **case number** (coloured by status), **Not logged**, or **Being handled by …** (an email opened by an agent is locked for 15 minutes, so two agents don't answer it).
- **Open an email:** the whole **conversation** (latest first, *Sent by us* marked, To / CC), attachments to download, **+ Log case** or **Open case**, **Mark unread**. Opening marks it read. Email bodies are shown in a sandbox, so nothing in an email can run in the CRM.
- **Reply in this thread:** write or pick a template; the reply goes **inside the customer's own email thread** as a LOTS-branded email, with the case number in the subject, and lands on the case timeline.

**Automatic (the SOP: "a case is automatically created" for every mail):**
1. The CRM checks the inbox **every 5 minutes** (SOP), with Graph's **delta** query: only mail that arrived **after the mailbox was connected** is picked up, so an existing inbox is never imported.
2. Every new mail becomes a **Pending case**: attachments saved, contact recognised (§8), category, store and invoice / order number suggested, assigned, and an **acknowledgement** sent **in the customer's thread**.
3. The mail **stays in the inbox**, tagged **LOTS CRM** and its **case number** (visible in Outlook too). It is never moved.
4. **Replies are matched to their case by conversation**, even if the customer removes the case number from the subject. Nothing is imported twice.
5. **The agent calls the customer** (SOP) and decides: ROT, Waiting or Escalate.

Switch **Create cases from new emails** off (Automation → Rules) to have agents log each case themselves from the Mailbox, as in VMM.

**All outgoing emails** (acknowledgements, templates, escalations, follow-ups, resolutions, agent replies) are **branded HTML**: LOTS header, the message, a case details box, and the care number in the footer. Emails to the customer of an email case go **in their thread**; others are new emails. A copy of everything is in Sent Items.

**Attachments:**
- Files customers send are saved on the case.
- Agents can add files too (**Files → + Add file**), for photos or bills from WhatsApp or phone.
- **Escalation, level-up and overdue emails carry the case's files automatically.**
- Template emails from the case page can attach chosen files.
- Limits (Microsoft Graph's simple sending): up to **3 MB per file, 3.5 MB per email**. Bigger files are named in the email as *available on request* instead of being dropped.

**Email previews in Microsoft Teams** (Automation → *Email previews in Microsoft Teams*): while `TEAMS_WEBHOOK_URL` (a Power Automate "post to a channel when a webhook request is received" workflow link) is in the **private secrets file** and the switch is on, **every email the CRM would send is posted to the Teams channel instead**. Nobody receives an email.
- Each card shows **who it would go to** (To / Cc), the subject and the type, then the email **exactly as the recipient would see it**: the same LOTS header, template text, case details box and footer. Attachments are listed.
- An email with no address yet (e.g. a store contact not filled in) still appears, with the recipient shown as *not set*.
- On the case page, template emails become **Send now (preview in Teams)**. *Send a test message* and *Post a sample of every email* (acknowledgement, information request, membership, supplier, job, escalation, store follow-up, resolution, escalation level 2, daily store follow-up) show the team everything before going live. The Outbox and case timelines mark these as *Teams preview (not sent)*. The workflow link carries a signature: keep it only in the secrets file.

**Test mode** (like VMM's `TEST_MODE`): **Automation → Timers & recipients → "Test mode: send all emails to"**. While an address is filled in, **every** outgoing email goes only to that address, with **[TEST]** in the subject and a note saying who it would have gone to. The Email inbox shows a banner. Empty = live.

#### AI email reader (optional)

With `ANTHROPIC_API_KEY` in the private secrets file and **Automation → AI email reader** on (the default), Claude (`claude-opus-5-5`, low effort) reads each new email instead of the keyword rules (`server/aiReader.js`).
- **Category:** it picks the case-master path down to sub-category 2. The answer is limited to the 228 paths of the case master, so it can't invent a category.
- **Details:** it also picks the store, and copies the order / invoice no., card no. and mobile written in the mail; a one-line summary goes on the timeline.
- **Safety:** the email is treated as data to classify; instructions written inside it are ignored. A rare refusal is answered by another model (server-side fallback).
- **Fallback:** an API error, a missing key or an unusable answer means the keyword rules are used, as before.
- **Privacy:** each new email is sent to the Anthropic API.
- **Cost:** roughly 1,000–4,000 tokens per email.

### 9.3 Connecting: Sign in with Microsoft (recommended)

1. **Automation → Mailbox → Sign in with Microsoft.**
2. The page shows a short code. Open the link shown (microsoft.com/devicelogin), enter the code, and sign in with a **Microsoft account that can open contactus@cpwi.in**. Accept the permissions (read / write and send mail you can access).
3. The page shows *Connected … as <account>*. Click **Test mailbox connection**.

The sign-in is kept only on this PC, in the private folder (`ms-signin.json`), and renews itself, so nobody needs to stay signed in. If it expires or the password changes, the Automation page says so: sign in again, or **Disconnect** to stop.

**Which account:** contactus@cpwi.in is in **CP Wholesale's own Microsoft 365**, not Openmind's. The VMM CRM's Azure app only accepts Openmind accounts, and an Openmind account can't open a cpwi.in mailbox. So sign in with a **cpwi.in account** that can open contactus@cpwi.in, or with contactus@cpwi.in itself.

**What the Microsoft 365 admin of cpwi.in may need to do, once:**
- Give the signing-in account **Full Access** and **Send As** on contactus@cpwi.in (not needed if the account *is* contactus@cpwi.in).
- If sign-in says *"Need admin approval"*: approve the app for the organisation. By default it is Microsoft's own *Microsoft Graph Command Line Tools* app (the one behind `Connect-MgGraph`). The admin may register a dedicated app instead (public client flows **on**; delegated `Mail.ReadWrite.Shared`, `Mail.Send.Shared`, `User.Read`, `offline_access`) and put its ID in `MS_SIGNIN_CLIENT_ID` in the secrets file.

### 9.4 Alternative: IT app secret

A connection that doesn't depend on a person's account; it takes precedence when set.
1. Microsoft Entra admin centre → App registrations → **New registration** ("LOTS CRM").
2. API permissions → Microsoft Graph → **Application** permissions **Mail.ReadWrite** and **Mail.Send** → **Grant admin consent**.
3. Certificates & secrets → **New client secret**.
4. Limit the app to this one mailbox:
   ```powershell
   New-DistributionGroup -Name "LOTS CRM Mailboxes" -Type Security -Members contactus@cpwi.in
   New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId "LOTS CRM Mailboxes" -AccessRight RestrictAccess -Description "LOTS CRM"
   ```
5. Put `MS_TENANT_ID`, `MS_CLIENT_ID` and `MS_CLIENT_SECRET` in the **private secrets file** and restart.

---

## 10. Automation engine

The **Automation** page switches each rule on or off. Everything the automation does is in the **activity log**, and every email it sends is in the **outbox**. Defaults follow the SOP; settings saved before the SOP review were moved to these defaults once, and can be changed again.

### 10.1 Rules

| Rule | What it does | Default | Needs mailbox |
| --- | --- | --- | --- |
| Categorise new emails | Suggests case type, category, sub-category, store, invoice / order and card numbers (SOP keywords, English and some Hinglish) | On | No |
| Assign cases & missed calls | To the agent on shift with the fewest open items | On | No |
| Acknowledge every new email | Customer gets the case number | On | Yes |
| Email the store / team on escalation | Escalation template to the store or team the case is escalated to, with the case's files attached | On | Yes |
| Store reply → Resolved | A reply from the store / team contact (or any @cpwi.in address) on an escalated case moves it to Resolved **only if it reads like a resolution**; otherwise the case stays Escalated and is flagged "Store replied — check" (§6.8) | On | Yes |
| Email the resolution to the customer | Quotes the store's reply | On | Yes |
| Queue the confirmation call | Resolved case → Outbound leads "Confirmation / resolution" | On | No |
| Queue the follow-up call | Waiting case → Outbound leads "Follow-up" to ask for the missing details. **Info received** on the call moves the case back to Pending; **Update given** goes on the timeline. If the case goes back to Pending another way, the call closes itself | On | No |
| Queue a customer survey call | Closed case → Outbound leads "Customer survey" (once per case). The customer's feedback (as the SOP says; no rating questions), saved on the case timeline and in **Survey feedback** | **Off** | No |
| Chase overdue escalations | A level's deadline passed: the case moves up one level of the **escalation matrix** (next contact copied in, that level's TAT). At the highest level (or with no matrix): one reminder per working day, the level stays. A **promised date** that passes is flagged | On | Yes (levels still change without it) |
| Answer standard enquiries | Job, supplier and new-membership emails answered with the SOP template. **Not in the SOP** (call first) | **Off** | Yes |
| Information complete? | Complaints / requests checked against the SOP requirements; missing → "information required" email, Waiting. **Not in the SOP** | **Off** | Yes |
| Complete → escalate to store | A complete complaint / request with a known store is escalated automatically. **Not in the SOP** | **Off** | No |

### 10.2 Scheduled jobs (the engine wakes every minute; the mailbox is checked every 5, per the SOP)

| Job | Default |
| --- | --- |
| Mailbox checked for new mail (every 5 minutes, SOP) | every 5 min |
| Daily follow-up email (one list per store / team; Level 2 copied when something is overdue or a promise was missed) | 10:00 |
| Reminder to a customer in *Waiting* | after 48 hours |
| Daily report to the supervisor (cases by channel and type, closed, ROT, open by status, overdue, missed calls and callback TAT, per agent, per store) | 21:00, once a supervisor email is set |

### 10.3 Agent shifts

From the SOP: 9–6, 10–7, 11–8, 12–9, or *Off*. An agent with no shift set counts as available 9 AM – 9 PM. If nobody is on shift, the item stays unassigned and shows on the dashboard.

---

## 11. Contacts

Contacts are the member master (one record per customer), used for caller and email identification.

**Contacts page:** contact cards on the left (the newest 500; the search finds any contact), the tapped contact on the right (kept in the address, `?c=M-00123`):
- header with **Edit** (the form below) and **Call** (SparkTG dialer) / **Email** / **WhatsApp** / **Log case**;
- the LOTS fields: mobiles, email, business, card no., contact ID and Vtiger id, contact type, status, segments, registered store, GSTIN, licence, source, joining date, assigned to, address, add-on members;
- **communication history**, newest first: calls (incoming / outgoing, talk time, recording to play), missed calls, cases and the emails the CRM sent, matched by the contact and every mobile and email on it, add-on holders included (`GET /api/members/:id/history`).
- My additions, not in the SOP: WhatsApp is a wa.me link (not an integration); Email is a mailto link until the mailbox is connected.

### 11.1 Contact form (like the Vtiger contact form)

**+ Create Contact** or **Edit** opens a panel that **slides in from the right** over the list: Sections menu on the left (highlights the section on screen, jumps on click, collapses with «), **Type to search** to find a field, **✕ / Cancel / Esc** to close (asks first if anything is unsaved), **Save** always visible.

| Section | Fields |
| --- | --- |
| Validation | Salutation, **First Name ✱**, **Last Name ✱**, Email (several, Primary / Secondary / Office), Business Name, Business Address, Address 2, City, City Picklist, Landmark, Pincode, Licence Type, Licence Number, Licence Expiry Date, GSTIN, Landline, Segment3 (customer group), Segment4 (customer type), **Source of Information ✱** |
| Updated Contact Details Block | Mobile Number Updation, Email ID Updation |
| Contact Information | **Phone ✱** (several: Mobile / WhatsApp / Landline / Office, +91), **Contact Type ✱**, Do Not Call, Customer Status (Active / Inactive / Blocked), Date of Joining, Registered store code + name, Birthday, Gender, Email Opt-in, SMS opt-in, Language, Timezone |
| Membership Details | Membership Card No. (used to recognise callers), Tax Exemption, Drug License, Licence Issuing Date, Language Preference, PAN, Turnover, No. of Employees, Consent Id |
| Custom Information | **Assigned To ✱**, Upload File Name, Date of Data Upload |
| Address Details | Shipping address, city, PIN, state, city picklist, country, name, landline, state code; Business state, state code, country |
| Details of Addon Member | **Up to 4** add-on members (SOP decision): first / last name, relationship, mobile, landline, card no., DOB |
| Description Details | Description, Need Validation |
| Socials | LinkedIn URL / followers, Facebook URL / followers |

Missing ✱ fields show *"The First Name field is required."* and the form jumps to the first problem. Formats are checked: 10-digit mobiles, email, PAN (ABCDE1234F), GSTIN (15 characters), 6-digit pincodes. Contact types, sources and cities are the CRM's own lists until LOTS's Vtiger lists are provided.

### 11.2 Registered numbers and card numbers

- **Card numbers are unique:** a membership or add-on card no. belongs to one person only.
- **Mobiles (rule of 26 Oct 2026):** a mobile (registered, alternate, extra, or an add-on member's) may belong to several contacts **only when each has its own card no.** A contact without a card no. can't take a number another contact has. A number can't appear twice on the same contact. Numbers are compared on the last 10 digits.
- **Contact form:** as soon as a number has 10 digits, a clash shows under it: *"Already registered to Kumar Kirana (M-00001)"*, with a link, and Save is blocked. For a contact with its own card no. a shared number is only a note (*"Also used by …"*).
- **Server:** enforced for every save (form, import, any route); a clash returns HTTP 409 with the number and the contact it belongs to.
- **Import:** rows whose number or card no. belongs to another contact are skipped and listed with the reason.

### 11.3 Import CSV

**Contacts → Import CSV** reads the member master and recognises common headers (Mobile, Card No, Business Name, Owner, Email, GSTIN, Store, Address, Status…). Store names become store codes. Existing contacts are matched by card number or mobile and **updated**, not duplicated.

- **No duplicates:** a contact already in the CRM is updated, never added again: the same Vtiger contact, the same card no., or (without a card no.) the same mobile. The same contact twice in one file becomes one contact; later rows only fill empty fields.
- **Preview before saving:** the file is checked first without saving (`POST /api/members/import?dryRun=1`): *N new · N already in the CRM (updated) · N skipped · N without a number*, with the rows that will be skipped. The button then says exactly that ("Import: 4 new, 1 updated").
- **Every field:** any CSV laid out like the contact form (Vtiger's field names) fills every field of the contact.
- **Earlier cases attached:** cases logged before the contact existed are attached when the contact is imported, created or edited, by its mobile (only if no other contact shares it), email or card no., with a note on the case timeline.

**Vtiger Contacts export** (recognised by its Contact Id / First Name / Last Name columns): every Vtiger field comes in, because the CRM's contact form has the same fields under the same names.

- Mobiles such as `+919876543210` become 10 digits. Rows with no real mobile or card no. (Vtiger's `?????`) are left out and counted.
- An updated mobile / email ("Mobile Number Updation") becomes the main one; the old one is kept as the next number.
- The add-on member columns become an add-on card holder. Segment1 / Segment2 fill the customer group / type when Segment3 / Segment4 are empty.
- Contacts are matched by **Vtiger Contact Id**, card no. or mobile, so importing the same file again updates them.
- Only filled-in fields are stored; the form shows the blanks again when a contact is opened.

**Lakhs of contacts** (LOTS has about 3 lakh in Vtiger): the file is sent in parts of 2,000 with a progress bar, and the server checks numbers and cards against an index, not contact by contact. If an import stops, run the same file again; saved contacts are updated, not doubled.

**Import from Vtiger (directly):** Contacts → Import CSV → **Import all contacts from Vtiger**.
- **Setup:** the CRM reads Vtiger's contacts through its webservice, with three settings in the private secrets file: `VTIGER_URL`, `VTIGER_USERNAME` and `VTIGER_ACCESS_KEY` (Vtiger → My Preferences → Access Key). They are never shown, logged or sent to the browser. Starting / stopping the import is admin-only.
- **How it runs:** it is a job on the CRM server, so the page can be closed. It reads 200 contacts per request, in Vtiger record order, onward from the last one read (fast even deep in the list). Contacts are saved every 2,000, with the same checks as the CSV import.
- **Speed:** about 6,000–7,000 contacts a minute, so about an hour for 3.35 lakh.
- **Result (24 Oct 2026):** 3,35,065 Vtiger contacts read: 2,94,533 added, 10 linked to contacts already in the CRM, 19,382 skipped as duplicates, 21,140 without a mobile or card no. Excel list of the ones not imported: `Downloads\Vtiger contacts not imported - 24-10-2026.xlsx`.
- **Get new contacts from Vtiger:** after a finished import, reads only the contacts added in Vtiger since.
- **Vtiger's limits:** 200 records per request, a per-minute burst limit and about 50,000 requests a day (it answers TOO_MANY_REQUESTS, even to the login, until the next day; resets around 5:30 AM IST). The CRM spaces its requests; a stopped import continues where it stopped.
- **Stop / Continue:** Continue goes on from the last saved contact; a restart of the CRM shows the job as stopped. **Import again from the start** re-reads everything; contacts already imported (same Vtiger Contact Id) are updated.
- **Server set-up for lakhs of contacts:**
  - the service starts Node with a 4 GB memory limit (`scripts/run-crm.ps1`); about 1.6 GB is used with 2.95 lakh contacts;
  - the MySQL connection is compressed, so start-up (loading every contact and case) takes a few minutes on the full data (1.9 lakh cases and 3.2 lakh contacts); `scripts/crm-service.ps1` waits up to 10 minutes for the health check before it reports a failed start.
- **Shared mobiles (26 Oct 2026):** a mobile may belong to several contacts when each has its own membership card no. (card numbers stay unique). A call or search by such a mobile lists all of them for the agent to pick. The Vtiger duplicates with their own card no. (13,371) are being added: about 6,000 so far; running it again finishes it without doubling.
- **Duplicates in Vtiger:** a second Vtiger contact with the same mobile or card as one already imported is **skipped and listed**, not merged. Contacts without a mobile or card no. are counted and left out. Vtiger's internal user ids (Assigned To, Created By, Modified By) are not taken.

**Contact index:** caller search (Identify caller, Contacts search, email and call matching) uses an in-memory index of mobiles, card nos., membership IDs, emails and one text line per contact.
- It is built when the CRM starts (3–5 s for 3 lakh contacts).
- On MySQL, only the contacts that changed are re-indexed.
- Tested with 3 lakh contacts: a search takes about 0.03 s (was 0.4–0.8 s), and the server uses about 350 MB of memory.
- A contact by ID also comes from the index (0.004 s instead of reading every contact): contact panel, edits, history and automation.

---

## 12. Knowledge base, scripts and templates

All taken from the SOP. The file is `src/knowledge.js`. The page is at `/kb` (no menu link); the matching answers also show beside Log new case.

- **Answers:**
  - membership documents, add-on cards, privilege card
  - stores and timings, B2C outlets (AKD and NSP)
  - return and exchange, delivery, minimum order value
  - payments and online orders (incl. cash on delivery), supplier registration
  - carrying goods to your vehicle, non-member shopping
  - lost card, offer SMS opt-in, BDA, jobs, LCC
- **SOP checks** (return policy, B2C): `src/requirements.js`.
- **Call scripts:** inbound greeting, hold procedure, inbound closing, outbound opening and closing, store follow-up call.
- **Email templates:**
  - acknowledgement, request missing information
  - membership documents, supplier registration, job enquiry
  - escalation to store, store follow-up, resolution to customer
- **CRM note templates:** store follow-up, called customer, confirmed resolution, not reachable.

**Stores:**

| Code | Store | Hours |
| --- | --- | --- |
| 101 | NSP (B2C) | 9 AM–8 PM |
| 102 | Ithum, Noida | 7 AM–9 PM |
| 103 | Akshardham (B2C) | 9 AM–9 PM |
| 104 | Sarita Vihar | 9 AM–8 PM |
| 105 | Duhai, Ghaziabad | online |
| 106 | Greater Noida | 9 AM–8 PM |

---

### 12.1 Support button (help for the agents)

The round **?** button at the bottom right (next to the dialer) answers questions about the CRM itself (`src/supportKb.js`: 38 help articles, checked against the CRM on 22 Oct 2026), with suggested questions and a list of all topics.
- **Not in the articles?** "Talk to the help desk manager" raises a **support token** (SUP-000123) with the question, the agent and the page. It is **emailed to the support address** (Stores & settings → Support → Support email) **with the client in Cc**: the agent who raised it (their email under Agents) and the fixed **Client copy (Cc)** addresses. It is also posted in Teams. In test mode the email goes only to the test address. An agent without a saved email is told they weren't copied.
- **The chat:**
  - The manager answers on **Admin → Support tokens**. The page refreshes every 20 seconds and shows the conversation, with the agent's messages marked.
  - The answer comes back into the agent's support panel. If the panel is closed, a red badge appears on the button.
  - While the token is open, what the agent types goes to the manager, so they can write back (Teams is told). "Ask the help articles instead" switches back to the articles.
  - Either side can close the token; a closed token takes no more messages.
- **Storage:** tokens are kept in the CRM's data (MySQL key `supportTickets`).

## 13. Data, backup and security

### 13.1 MySQL

**Live database:** `lots` on the company MySQL 8.0 server (the name is lowercase; the server is case-sensitive). The server address and login are only in the private secrets file (§3). Without MySQL settings the CRM would use `server/data/db.json`, but once the data has moved to MySQL it **refuses to start** rather than open an empty file.

**Setting it up on another server (DBA):**
```sql
CREATE DATABASE lots CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'lots_crm'@'<CRM PC IP>' IDENTIFIED BY '<strong password>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER ON lots.* TO 'lots_crm'@'<CRM PC IP>';
```
- Put the details in the **private secrets file** and restart. On first start the CRM creates its tables (`server/schema.sql`) and **copies an existing `db.json` into MySQL once** (the file is kept as `db.json.imported`).
- If the CRM user may not create tables, the DBA runs `server/schema.sql` once.
- The CRM PC must reach the MySQL server on port 3306. Supported: MySQL 5.7+ / 8.x, MariaDB 10.5+.

**Main tables:** `cases`, `members` (contacts), `missed_calls`, `leads`, `calls`, `outbox`, `stores`, and `kv` (counters, agents, shifts, automation settings, activity log). Each has real columns for searching and reports (status, phone, store, dates, agent…) plus a `doc` JSON column with the full record.

**Readable detail tables** (kept in step on every change; for viewing and reports only):

| Table | One row per |
| --- | --- |
| `case_timeline` | Timeline entry of a case (created, status change from → to, note, call, email, store follow-up) |
| `case_calls` | SparkTG call linked to a case (outcome, duration, agent, recording URL) |
| `case_attachments` | File received with a case |
| `member_addon_cards` | Add-on member of a contact |
| `lead_log` | Call outcome logged on an outbound lead |
| `missed_call_attempts` | Call-back attempt on a missed call |
| `agents` | Agent (the full name), with SparkTG login email and shift. SIP ID and phone are the `agentProfiles` value in `kv` |
| `automation_log` | Action taken by the automation engine |

**Reference tables from the SOP** (rewritten from the CRM's code at every start): `ref_case_categories` (66 rows: case type → category → sub-category, with `needs_documents` and the SOP `requirements`), `ref_customer_types` (41 rows), `ref_values` (status, channel, caller type, product category, lead type and outcome, missed-call reason).

Times are UTC (add 5:30 for IST). Examples:
```sql
SELECT store, status, COUNT(*) FROM cases GROUP BY store, status;
SELECT agent, direction, COUNT(*), SUM(connected) FROM calls WHERE started_at >= CURDATE() GROUP BY agent, direction;
SELECT * FROM case_timeline WHERE case_id = 'LWS-000003' ORDER BY seq;
```
To browse the tables: VS Code extension **"MySQL" by Database Client**, MySQL Workbench, or phpMyAdmin.

**How it works:** the CRM loads the data at start and writes every change within about 150 ms, in batches, inside a transaction. If MySQL is unreachable, changes are kept and retried every few seconds; **Stores & settings → Database** shows the last write and any error. Pending changes are written on Ctrl + C.

**Rules:**
- **Run only one CRM server against the database.** It keeps the working copy in memory, so two servers would overwrite each other.
- Treat the tables as **read-only**: edits made directly in MySQL are overwritten by the CRM.
- Back up the database with your normal MySQL backups. *Download full backup (JSON)* in Settings also works.

### 13.2 Files, git and security

- Attachments (from emails and added by agents) are stored in `server/data/attachments/<case>/`.
- **Credentials** are outside the project (§3), including the Microsoft Teams workflow link and the Vtiger access key. **Sign-in is built but not switched on** (§13.3): agents choose their name, so use the CRM only on the office network until it is on.
- **Not built yet:** an automatic database backup and an alert when the CRM is down. MySQL backups are LOTS's own; the service restarts the CRM if it stops.
- **Git:** `.gitignore` keeps out `server/data/` (all data and backups), `.env`, secrets files, the Microsoft sign-in file and logs. Save changes with `git add -A`, `git commit`, `git push`.
- **GitHub repo `OM20216/lots-crm` is private.** An early upload contained `.env` with the SparkTG login. It was removed from `main`, and the repo is now private.

---

### 13.3 Sign-in with passwords and roles

**Off until an admin switches it on** (Admin → **Users and sign-in**). Until then the CRM works as before: the agent picks their name.
- **Users:** every agent gets a password (8+ characters) and a role, plus a contact card — the **Full Name** (the agent's name, used everywhere), **SIP ID**, **email ID** and **phone no.** The email is also the SparkTG dialer login (SSO). An **Agent** does the daily work. An **Admin** can also:
  - use the Admin pages, the escalation matrices (edit, Excel upload, live link), automation and the Teams samples;
  - change stores, teams, holidays, working hours, users and agents;
  - answer support tokens, correct an escalation level and download the full backup.
- **Switching on** needs the name and password of an admin, who is then signed in. After that:
  - everyone signs in with name and password; sessions last 12 hours;
  - every change is recorded under the signed-in name (the name sent by the browser is ignored);
  - agents don't see Admin in the menu.
- **Safety:**
  - passwords are stored only as scrypt hashes;
  - the session is an HttpOnly cookie signed with a key in the private folder (`session.key` next to the secrets file);
  - 5 wrong passwords lock that name for 10 minutes;
  - a new password ends the other sessions of that user;
  - the last active admin can't be switched off or lose the role.
- **Always open:** `/api/health` and SparkTG's call-event webhook.
- **My password** (top bar) changes your own password. A forgotten password: an admin sets a new one.
- **Locked out** (every admin password forgotten): put `CRM_AUTH_OFF=1` in the private secrets file and restart.

## 14. Project structure

```
server/
  index.js         HTTP API, serves the front end, starts automation and the live-call check
  db.js            Data store: MySQL or JSON file, IDs, crash-safe save, refuses to start empty after a move to MySQL
  mysql-store.js   MySQL: load, change tracking, batched writes, detail and reference tables
  schema.sql       MySQL tables
  core.js          SOP rules: statuses, TAT, case creation, email intake, contact lookup, unique numbers, events
  calls.js         Call log from the dialer, SparkTG record after each call, direction, missed calls, live-call check
  sparktg.js       SparkTG API client (call record, agents, recordings, field mapping)
  automation.js    Rules, assignment, categorisation, scheduled jobs, outbox, mailbox polling
  mail.js          Microsoft 365: Sign in with Microsoft (device code) or app secret; read, send, reply in thread, attachments
  auth.js          Sign-in: users, passwords (scrypt), roles, session cookie, who may do what
  support.js       Support button: help answers, support tokens, emails to the support address
  teams.js         Microsoft Teams: email previews and escalation cards posted to a channel (Power Automate workflow link)
  matrixImport.js  Escalation matrix from LOTS's Excel / CSV: HO sheet and store tabs, preview, apply, undo
  matrixLink.js    Live link to the matrix Excel on OneDrive / SharePoint
  aiReader.js      Optional AI email reader (Claude) for new emails
  vtigerApi.js     Vtiger webservice client: challenge / login with the access key, query, request spacing
  vtiger.js        Vtiger contacts import job (200 per request, saved every 2,000, Stop / Continue)
  vtigerCases.js   Vtiger cases import job and the link to CRM contacts
  storeMatrix.json Store escalation matrix as read from the workbook (348 rows); built by buildStoreMatrix.js
  data/            JSON data / backups / attachments (not in git)
src/
  App.jsx          Layout: sidebar, top bar, routes, sign-in, dialer, caller panel
  sparktg.jsx      SparkTG widget connection (adapted from PSRI SparkTGContext)
  taxonomy.js      Case types, categories, sub-categories 1 / 2, case master columns, statuses, customer groups, product types (workbook "Case catergory" sheet + SOP)
  escalationMatrix.js  HO escalation matrix (sheet V_6), working hours, stage names
  storeMatrix.js   Store escalation matrix: the tab rows and which case goes to which row
  workflows.js     Workflow per case type: owner team, TAT, steps, escalation target (also used by the server)
  picklists.js     Picklists and dependencies: base values from taxonomy.js + the ones added on the screens
  knowledge.js     SOP / FAQ answers, scripts, email templates (also used by the server)
  contactFields.js, vtigerContacts.js, vtigerCases.js   Vtiger field mapping for contacts and cases (shared by the CSV import and the Vtiger jobs)
  supportKb.js     The support button's help articles
  requirements.js  Request requirements, SOP checks (return / B2C), reference-number reading (also used by the server)
  api.js, ui.jsx   Fetch helper, shared UI helpers
  components/      Dialer (widget, caller panel, Call button), MissedBar, Mailbox, MailboxCard, Classifier, CallsCard, WorkflowCard, EscalationPanel, MemberImport, CaseImport, TrendChart, MatrixImport, Icon
  pages/           One file per screen. Contacts.jsx = cards + contact panel; ContactForm.jsx = contact form; Calls.jsx = Call logs; Reports.jsx = Report; LotsFlow.jsx/.css = workflow chart; Admin.jsx = setup pages
scripts/           crm-service.ps1 (background service: install / status / restart / stop), run-crm.ps1 (keeps it running)
docs/              Process documentation (process-documentation.md), its 17 flow charts (flows/*.svg) and the PDF
lots-workflow.svg  Static process chart of the SOP
PROJECT-WORKFLOW.md  System map: app, server, database, integrations, case lifecycle
WORKLOG.md         Day-by-day log of what was built, tested and decided
.env.example, secrets.env.example   Setting templates
```

---

## 15. API reference

Every request sends the agent's name in the `x-agent` header; it goes on the timelines.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/meta` | Stores, teams, agents, agent emails, widget URL, integrations, database status |
| POST / PUT | `/api/agents`, `/api/agents/:name` | Add an agent / set their SparkTG email |
| PUT | `/api/stores/:code` | Store contact and hours |
| PUT | `/api/teams/:key` | Team contact (contact, phone, email) for workflow escalations |
| PUT | `/api/escalation-matrix/:key` | Levels above Level 1 for `*` (default), `store:<code>` or `team:<key>`: `{ levels: [{ name, email, phone, tatDays }] }` |
| GET | `/api/store-matrix?store=<code>` | Store escalation matrix of one store: its rows per tab with the three stages, ⚠ to confirm, edits |
| PUT / DELETE | `/api/store-matrix/:key` | Change a store row (`s101.app-tech`) `{ stages: [{ to, cc, tat: { value, unit } } ×3] }` / back to the workbook |
| POST | `/api/store-matrix/:key/sample` | Post the row's three emails for a sample case to Teams |
| PUT | `/api/holidays` | `{ dates: ["YYYY-MM-DD", …] }` — not counted as working days |
| POST | `/api/cases/:id/reroute` | Move an escalated case to `{ kind: store \| team, code, note }` |
| POST | `/api/cases/:id/raise-level` | Next escalation level now, `{ reason }` (400 if the matrix has no next level) |
| GET | `/api/escalation-report?days=30` | Escalations per store / team: on time, average days, open, overdue, levels, promises missed |
| POST / DELETE | `/api/picklists` | Add `{ field, value }` (409 if it exists) / remove an added value and its pairs |
| POST / DELETE | `/api/dependencies` | Add `{ mainField, mainValue, subField, subValue }` (both values must be in their picklists; 409 if the pair exists) / remove an added pair |
| GET / POST | `/api/cases` | List (filters: status, channel, store, caseType, assignedTo, q, overdue, `from` / `to` dates in India time; `limit` up to 5,000, `offset`; the total is in the **X-Total-Count** header) / create |
| GET | `/api/cases/export` | All cases that match the same filters (dates in India time), as CSV (streamed, any range) or Excel (`format=xlsx`, streamed, up to 50,000 cases; more → 413, use CSV) |
| GET | `/api/reports?days=30` | Counted figures for the dashboard's 14-day trend and channel mix (7–366 days) |
| GET / POST | `/api/vtiger-cases`, `/api/vtiger-cases/import`, `/api/vtiger-cases/import/stop` | Vtiger cases import: progress / start (admin; `{ fresh, max }`) / stop |
| GET / PATCH | `/api/cases/:id` | Case with history and escalation `target` / edit, change status (only along the workflow), add a note, tick a workflow step (`checkStep`, `done`) |
| POST | `/api/cases/:id/email` | Send an email from the case `{ to, subject, body, kind, attachments: [file] }` (mailbox, or Teams preview) |
| POST | `/api/cases/:id/attachments?name=` | Add a file to a case (raw bytes, up to 15 MB) |
| POST | `/api/cases/:id/set-level` | Correct an escalation level by hand `{ level, reason }` (kept on the timeline) |
| POST | `/api/cases/:id/calls` | Link a SparkTG call to a case |
| GET | `/api/cases/:id/attachments/:file` | Download an attachment |
| POST | `/api/calls/event` | Dialer event `{ callId, status: started \| ended, direction, phone, context, widget }` |
| GET | `/api/calls`, `/api/calls/stats`, `/api/calls/:id` | Call logs (dates, search, with recording, paging) / stats for the range / one call with SparkTG's raw record |
| GET | `/api/calls/:id/recording`, `/api/sparktg/recording/:case/:txn` | Recording, played through the server |
| GET | `/api/sparktg/call/:txnId`, `/api/sparktg/test`, `/api/sparktg/status` | Caller for a call ID / connection test / webhook events |
| ALL | `/api/sparktg/event` | SparkTG call-event webhook (missed calls) |
| GET | `/api/lookup?q=` | Caller lookup by phone, card, email or name; a shared mobile returns all its `holders` |
| GET / POST | `/api/members`, `/api/members/import` | Contacts (search `q`) / create / bulk import (`?dryRun=1`: the preview, nothing saved). A clashing number returns **409** with `phone` and `memberId` |
| GET / PATCH | `/api/members/:id` | One contact / edit (same 409 rule) |
| GET | `/api/members/:id/history` | Communication history of a contact: calls, missed calls, cases, emails |
| GET / POST | `/api/vtiger`, `/api/vtiger/import`, `/api/vtiger/import/stop` | Vtiger contacts import: progress / start (admin) / stop |
| GET / POST / PATCH | `/api/missed-calls` (`?open=1`) | Missed calls (with the contact) / add / attempt or status |
| GET / POST / PATCH | `/api/leads` | Outbound leads / call outcomes |
| POST | `/api/email-intake` | New email → case (manual form and mailbox) |
| GET / PUT / POST | `/api/automation`, `/api/automation/run` | Settings, log, outbox / run the checks now |
| GET / POST / DELETE | `/api/mail/signin` | Microsoft sign-in status / start (returns the code) / disconnect |
| GET | `/api/mail/test` | Mailbox connection test |
| GET / POST | `/api/teams-preview`, `/api/teams-preview/test`, `/api/teams-preview/samples` | Teams preview status / test message / one sample of every email |
| GET / POST | `/api/support`, `/api/support/ask`, `/api/support/articles/:id` | Support button: topics / answer a question from the help articles `{ question }` / one article |
| GET / POST / PATCH / DELETE | `/api/support/tickets`, `/api/support/tickets/:id` | Support tokens: list / create `{ question, context }` / `{ action: reply | message | close, reply }` (reply = the manager, message = the agent) / remove |
| GET / PUT | `/api/support/settings` | Help desk manager email, post tokens in Teams |
| GET | `/api/health` | Open: the CRM is up, the database backend and its pending writes (for the background service) |
| GET / POST | `/api/auth/me`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/password` | Sign-in: who is signed in, sign in `{ name, password }`, sign out, change your password `{ current, password }` |
| PUT | `/api/auth/settings` | Switch sign-in on `{ required: true, name, password }` (an admin) or off |
| GET / PUT | `/api/users`, `/api/users/:name` | Users with role, password state and their contact card / set `{ role, password, active, sipId, email, phone }` |
| GET | `/api/flow`, `/api/stats`, `/api/export` | Workflow live counts / dashboard / full backup |

---

## 16. What has been tested

Tests ran on separate test copies (`CRM_DATA_DIR`), never on live data. Microsoft 365 was tested against a mock server, plus one real request to Microsoft.

| Tested | Result |
| --- | --- |
| **Real SparkTG account:** login, agent list, real call records (number, direction, ANSWER / NOANSWER, time, agent, recording), recording playback | ✅ |
| **Real test calls:** keypad-dialled calls corrected to outgoing from SparkTG's record; calls without "call ended" completed by the live-call check | ✅ |
| **Real MySQL (`lots`):** import of the JSON data, all record types, detail and reference tables, reload after restart. Load test: 300 simultaneous cases | ✅ |
| Strict workflow: every move outside the chart refused; confirmation call closes only resolved cases | ✅ |
| Caller lookup: `+91` / `91` / `0` formats, alternate and extra phones, add-on member, card number, second email address | ✅ |
| Unique numbers: same number in another format, add-on number reused, number twice on one contact, edit clash, import clash all refused; editing a contact's own numbers allowed | ✅ |
| Email in SOP mode: mail → Pending case, categorised, store and bill number read, assigned, acknowledgement queued, waits for the agent | ✅ |
| Agent-logged email case keeps the agent's outcome; only the acknowledgement is automatic | ✅ |
| Escalation → store reply → Resolved → resolution email → confirmation call → closed | ✅ |
| Scheduled jobs: overdue reminder, waiting reminder, daily report, each sent once | ✅ |
| Microsoft sign-in (mock): code, sign-in, mail import and reply sent from contactus@cpwi.in, renewal after restart and expiry, revoked sign-in message, disconnect. Real Microsoft accepted the sign-in request | ✅ |
| SOP checks: return policy (non-returnable item, 7 working days), B2C, settings moved to SOP defaults | ✅ |
| Missed-call boxes: Recent missed vs 2nd round, contact name shown | ✅ |
| Workflow per case type and escalation: routing to stores / teams, matrix levels after a restart with past due dates, top-of-matrix reminder, re-assign, raise level, store replies (interim vs resolution, promised dates), follow-up flags, report | ✅ |
| Case master: all categories and dependent fields, contact types, old names converted on start-up, DH store, Not Specific store, product type | ✅ |
| Teams previews: fake Teams endpoint, then the real channel (test, samples, a full sample case); cards match all 8 email templates | ✅ |
| Attachments: upload, download, escalation email carries files byte-for-byte (Graph stand-in), too-big file named, Teams lists them | ✅ |
| **Screens in a browser** (headless Edge): picklists, dependencies, + Add, escalation panel, follow-ups report, settings, survey form, attachments, simplified case page, menu, Admin page, New case steps | ✅ |
| **Vtiger, real account (read-only tests, then live):** contacts read 200 at a time, Stop / Continue without losing or doubling; 3,35,065 contacts and 1,92,396 cases imported live | ✅ |
| Contact index with 3 lakh contacts: 0.03 s per search, 17 index checks (incl. shared mobiles) | ✅ |
| CSV import: repeats in one file, existing contact, same card for two people, shared mobile with own card, "?????" row, earlier cases attached; preview equals the import; the same file again updates only | ✅ |
| Contacts page: cards, contact panel, history with recording, buttons, phone width (10 browser checks) | ✅ |
| Call logs with 260 test calls: ranges, search, recording filter, Load more, download (7 browser checks) | ✅ |
| Case export: CSV and Excel of 1–28 Oct hold the same 1,597 cases; 2 lakh test cases: full CSV in 12 s with flat memory, Excel above 50,000 refused, 1-year Excel (23,141 cases) in 7 s | ✅ |
| **Dialer widget with agents logged in** (SSO, show_dialer, click-to-call from the CRM, incoming call) | ⏳ Needs agents' SparkTG emails and a live test |
| **Real mailbox** contactus@cpwi.in | ⏳ Needs "Sign in with Microsoft" |

---

## 17. Known limitations and open items

**To go live**
- [x] Restart the CRM after updates: `scriptscrm-service.ps1 restart` (§2); `status` shows MySQL and the pending writes. Live on the latest version since 23 Oct 2026.
- [x] **GitHub repo `OM20216/lots-crm` made private.** ✅ Done
- [ ] **Connect the mailbox:** Automation → Sign in with Microsoft (§9.3).
- [ ] Enter every agent's **SparkTG login email** and **shift**; then one live incoming and outgoing test call.
- [x] **Import the member master:** imported straight from Vtiger, 24 Oct 2026 (§11.3). The Vtiger duplicates with their own card no. are partly done (about 6,000 of 13,371): run the import again on a day Vtiger's limit allows.
- [ ] **Restart the live CRM** to load the export fix of 28 Oct (`scripts\crm-service.ps1 restart`, only with no pending writes). Until then don't export very long ranges (years) from Report or Cases: the old export took the CRM down.
- [ ] **Switch sign-in on:** give every agent a password, make the team leader Admin, then Admin → Users and sign-in (§13.3).
- [ ] **Store contacts** for all six stores, **team contacts**, the **escalation matrix** and **holidays**; **supervisor email**.
- [ ] When the mailbox is connected: switch **Email previews in Microsoft Teams** off so emails really go out.
- [ ] Confirm the **SparkTG service**: the CRM uses 1672 (VMM's). If LOTS has its own service for 1860-123-5687, add its ID and login to the secrets file.
- [x] **MySQL password changed** (it had been shared in a chat; the same login opened other databases on that server). ✅ Done. The SparkTG password was left unchanged by choice.

**From LOTS**
- [x] **Settled by the documents (23 Oct 2026, user's decision "keep these according to the docs"):**
  - **Customer survey:** the SOP says only "collecting feedback to improve our service", so the 5 rating questions the CRM had added were removed; the survey call records the customer's feedback.
  - **Call outcome labels:** kept. They are the SOP's own words: follow-up "giving updates or asking for missing info" (Update given / Info received), confirmation "is he satisfied … resolved or not" (Confirmed resolved / Not satisfied); "Survey completed" / "Refused survey" only record whether the feedback was collected.
  - **7 working days for refunds and new suppliers:** kept. The SOP's FAQ says so ("automatically refunded within 7 working days"; suppliers: "our representatives will get in touch with you within 7 days").
  - **"Others" = Not Relevent or Spam only:** kept, as the case master (Case catergory sheet) says.
- [x] ~~Confirm the SOP sub-categories~~: replaced by the workbook's Case catergory sheet (17 Oct 2026, §6.1).
- Settled 15 Oct 2026: Duhai store code is **DH** (case master).
- [x] **HO escalation matrix** (April 2026 V_6) applied, 17 Oct 2026 (§6.8).
- [x] **Level 2 TAT confirmed by LOTS (23 Oct 2026):** 3 working days on every HO row except Legal (2, as in the sheet).
- [ ] **Confirm with LOTS:** the 3 corrected addresses, and that each stage's TAT counts from when the case reaches it.
- [x] The **store escalation matrix**: received 17 Oct 2026 (workbook with store tabs). Built 22 Oct 2026 (§6.8).
- [x] **Confirmed by LOTS (23 Oct 2026):** the DH 105 rows and GNI Ecommerce rows (made from NSP's pattern), and the routes the sheet doesn't state directly (§6.8).
- [ ] **Data the documents don't contain** (the SOP has the call types, the customer groups and the reply templates, already in the CRM). LOTS to send when they have it:
  - **calling lists** for outbound leads, and current **offers / schemes** for festival calls;
  - official **email templates**, beyond the SOP's;
  - Vtiger lists for **Contact Type, Source of Information and cities** (or the Vtiger contacts export).

**Not built yet**
- [x] **Escalation flow** chart for the store matrix (23 Oct 2026).
- [x] **Run the CRM in the background** (23 Oct 2026, §2): a scheduled task starts it at log-on and restarts it if it stops; administrator rights are needed only to run it before anyone logs on.
- [x] **Logins** with passwords and roles (23 Oct 2026, §13.3). To do on site: give every agent a password, make the team leader Admin, then switch sign-in on.
- [ ] **OMS link** for orders on call: needs OMS access.
- [ ] Calls that reach no agent's dialer need SparkTG's call-event webhook.
- [ ] **Calls from before the CRM:** SparkTG's call report (export or report API) is needed; the API can't list them.
- [ ] **Vtiger:** link the about 53,600 cases without a contact and the nightly sync are in main (pull request #1, 29 Oct) but not tested in full; the nightly sync is off until an admin switches it on; finish the test first. Case comments, emails and other modules (add-ons, feedback, templates) are not imported.
- [ ] **Menu links** for Outbound calls (`/leads`) and the Knowledge base (`/kb`): both pages work but no menu item or tile opens them.
- [ ] **Contacts list:** shows the newest 500 (search finds any); no filters or Load more yet.
- [ ] **Backup and downtime alert:** no automatic database backup or alert when the CRM is down.
- [x] Unique **card numbers** (23 Oct 2026): a membership or add-on card number belongs to one person only — refused on the contact form, the API and the import (the clashing row is skipped), like mobile numbers.
- [x] **AI email reader** (23 Oct 2026, §9.2): built; to use it, put `ANTHROPIC_API_KEY` in the private secrets file and restart. Without a key the keyword rules are used.

**Not possible (decided 16 Oct 2026):**
- **SMS** (the SOP's one-way channel): no SMS provider. Customers get emails (and calls) instead.
- **"Answer within 3 rings"** can't be measured: SparkTG doesn't report ring time. It stays an SOP rule for agents.

**Later (decided 16 Oct 2026):** connecting the mailbox. (The member list was imported on 24 Oct 2026.)

**Note for PSRI:** its `SparkTGContext` listener doesn't list `agentEmail` in its `useEffect` dependencies, so it keeps the first email it saw. Fixed in this CRM.

---

## 18. SOP questions (settled)

- **Add-on cards: up to 4 per member** (decided 30 Sep 2026). Enforced in Contacts and by the server.
- **Delivery charges: the SOP Delivery section** (decided 30 Sep 2026). No delivery charge on ₹9,000+; handling fee ₹69 GNI / ₹99 other stores, waived for the month after more than 8 orders; shipping by article; business licence address only, within 25 km; TAT 2–3 working days. The FAQ's "no delivery charges" line is not used.

---

## 19. Work log

| Step | What was built |
| --- | --- |
| 1 | Workflow chart of the SOP (`lots-workflow.svg`) |
| 2 | The CRM: React + Node, case taxonomy from the LOTS case master, New case, Email inbox (manual), Missed calls, All cases, Case page, Store follow-ups, Outbound leads, Members, Knowledge base, Settings |
| 3 | Email design: cpwi.in confirmed on Microsoft 365 → Graph API approach |
| 4 | SparkTG API: link call to case, outcome / talk time / recording, recording streamed through the server, connection test, missed-call webhook |
| 5 | Automatic caller identification: exact number match (all formats, add-on holders, card number), member card, caller from a SparkTG call ID |
| 6 | Automation engine: email import (Graph), categorisation, assignment, acknowledgement / standard answers, store escalation and reply handling, resolution email, confirmation calls, overdue chasing, daily store email, waiting reminders, daily report, activity log and outbox, member CSV import, My queue |
| 7 | Email put on hold; focus moved to calls |
| 8 | SparkTG dialer in the CRM (from PSRI `SparkTGContext` / `SparkTGWidget`): SSO login, incoming-call pop-up with member details, call bar, click-to-call everywhere, call log with SparkTG lookup after each call, automatic missed calls, call-back and lead linking, Calls page with stats per agent, crash-safe saving on Windows |
| 9 | Workflow screen: React Flow chart from crm-vmm `LotsFlow` with live counts, SOP options, "In this CRM" notes and links. Applied the flow's missing steps: *Information complete?* (information-required email → Waiting → reply re-checked → auto-escalate), *Request requirements* checklist, *anything else?* after call cases (one call → several cases), invoice/order/card numbers read from emails, store taken from the mail (home store only a hint), `CRM_DATA_DIR` for test copies |
| 10 | Strict workflow: statuses can only move along the chart's arrows (Waiting → Pending only; Escalated → Resolved only; Resolved → Closed via confirmation or back to the store; Reopen kept). Auto-close rules removed. Confirmation call closes only resolved cases. Chart files renamed to `LotsFlow.jsx` / `LotsFlow.css` |
| 11 | MySQL storage: company MySQL server via `.env`, tables with report columns + full JSON record, automatic table creation, one-time import of `db.json`, change tracking with batched transactional writes and retry, Database card in Settings. Tested on MySQL 8.4: import, all record types, reload after restart, 300 simultaneous cases |
| 12 | Connected to the company MySQL (database `lots`) and imported the existing data. Added readable detail tables (case timeline, case calls, attachments, add-on cards, lead log, missed-call attempts, agents, automation log) and SOP reference tables (case categories with requirements, customer types, value lists), kept in step automatically |
| 13 | Add-on cards: up to 4 per member (process owner decision). SOP conflict removed from knowledge base and workflow; limit enforced in Members and on the server |
| 14 | Delivery charges: follow the SOP Delivery section (₹9,000+ free, handling fee ₹69 GNI / ₹99 others, waived after 8+ orders a month); FAQ line dropped. No SOP conflicts left |
| 15 | Credentials made confidential: moved out of the project into a private per-user secrets file (locked to the Windows user). The database address and user are no longer shown in the terminal, Settings or errors. `secrets.env.example` template added |
| 16 | Email option "Sign in with Microsoft" for contactus@cpwi.in: device-code sign-in on the Automation page, no IT app secret needed. Sign-in kept privately and renewed automatically; clear message if revoked; Disconnect. Tested against real Microsoft (code issued) and a mock (sign-in, import, auto-answer sent from the mailbox, renewal after restart and expiry, revocation, disconnect) |
| 17 | New look (layout ideas from the VMM CRM, LOTS colours): grouped sidebar with icons (Case handling, Channels, Store escalation, Reference, Admin) that can be collapsed, top bar with dialer status, agent and role. New Case page rebuilt in the SOP order with the Identify caller panel, source cards, case-type cards, "Resolve within TAT?" with EDC, and the SOP non-member request rule. Agent-logged email cases keep the agent's outcome and only get the acknowledgement automatically |
| 18 | SOP review fixes: return-policy checks (non-returnable items, 7 working days, stamped bill) with a purchase date on return requests; B2C checks (AKD / NSP only, food only, no e-commerce); EDC shown on the case page; automatic email answers off by default (SOP: call first); only the SOP's three outcomes on New Case (ROT / Waiting / Escalate); outbound calls per agent against the 80–100 daily target on the Calls page. Still not covered: system SMS (needs a provider), OMS link, 3-ring answer time |
| 19 | Email handling as in the SOP: every mail automatically becomes a Pending case (case number, categorised, assigned, acknowledged). The agent calls the customer and decides. Automatic information requests and escalation switched off by default (can be switched on) |
| 20 | Missed calls moved into the top bar (like PSRI): **Recent missed** (not tried yet, pulses red past the 30-minute TAT) and **2nd round** (tried, not reached), with a drop-down to call back, log a case, mark not reachable or no query. Removed from the sidebar; the full list stays at /missed |
| 21 | A new missed call opens the top-bar list by itself, plays a short alert, and puts the call on top marked NEW with a red **Call now** button (dials through SparkTG). The list checks every 10 seconds |
| 22 | Caller panel like PSRI: pops up beside the dialer on every incoming and outgoing call with the contact (business, owner or add-on holder, card, type, home store, blocked, open cases), + New Case pre-filled with the number and call ID, and recent cases with a link to the case and **Link this call to this case**. It replaces the top call strip and the automatic jump to New Case |
| 23 | **Contacts** tab (replaces Members, same records): list with search, Call, Edit and Cases; the full **Creating / Editing Contact** form with the Vtiger sections and fields (Validation, Updated Contact Details, Contact Information, Membership Details, Custom Information, Address Details, up to 4 Add-on Members, Description, Socials), section menu, field search, required-field and format checks (mobile, email, PAN, GSTIN, pincode). Every phone and email on a contact, and its add-on members, are recognised on calls and emails |
| 24 | **Registered numbers are unique.** A mobile (registered, alternate, extra or add-on member's) can belong to one contact only, and can't appear twice on the same contact. Enforced on the server for the form, import and any other route. The contact form warns as you type, names the contact the number belongs to (with a link), and blocks Save. Import skips and lists rows whose number belongs to another contact |
| 25 | README rewritten to match the current CRM: Contacts, caller panel, top-bar missed calls, SOP email handling, credentials file, MySQL `lots`, tests and open items |
| 26 | Email like the VMM CRM: **Mailbox** view in Email inbox (Inbox / Sent, search, conversation view, attachments, Log case, Mark unread, "Being handled by" lock, reply in thread with templates). Delta inbox (only mail after connecting), mail stays in the inbox tagged "LOTS CRM" + case number, replies matched by conversation, branded HTML emails sent in the customer's thread, **test mode**, switch for automatic case creation. Tested against a fake Microsoft Graph |
| 27 | **Workflow per case type**: each SOP case type / category has an owner team, TAT and steps (`src/workflows.js`). Escalations go to the right store or team (E-commerce, IT, BDA, HR, home store, …) with that TAT; escalation, overdue and daily follow-up emails follow. Workflow checklist on the case page (auto-ticking steps, next step highlighted), workflow preview on New case, **Teams** in Stores & settings, **Follow-ups** grouped by store and team, **Case workflows** reference screen. Tested on a test copy of the data |
| 28 | **Picklists and dependencies, as in the PSRI CRM**: Picklists screen (values per dropdown, + Add, new lists, remove added values) and Dependencies screen (add a dependency pair, pairs grouped by relationship). Case form, case filters, caller type and contact segments read the merged lists; **+ Add** beside Category and Sub-category on the case form. Base values from the case master stay fixed. Tested on a test copy of the data |
| 29 | **SOP outbound calls completed**: new call types **Follow-up** (queued automatically when a case goes to Waiting; "Info received" moves the case back to Pending) and **Customer survey** (5 questions: three star ratings, would-recommend, comments; Survey results panel; optional automatic survey call after a case closes). Tested on a test copy of the data, API and browser |
| 30 | **Escalation completed**: escalation matrix (Level 2 / 3 contacts and TATs, default + per store / team), holidays in TATs, automatic level-up when a level's TAT passes (daily reminder at the top level), **Escalate to next level** and **Re-assign** on the case page, **Send to** choice when escalating, store replies read for a real resolution ("we are checking" no longer resolves the case) with promised dates picked up, promised date on follow-up calls and missed-promise flags, **Not followed up today** flag, dashboard tiles, **Report** tab on Follow-ups. Team and matrix contacts recognised as store replies. Tested on a test copy of the data (API, overdue run and browser) |
| 31 | **Sub-categories for every category**: the case master has them only for Requests, so the categories the SOP describes got its sub-categories (the dropdown was empty); categories without an SOP sub-list have none. Email reader fills them; Refund not received (7 days) and product availability / price workflows restored |
| 32 | **Cases follow the case master exactly** ("lot cases excel"): all 21 categories; Request for, Sub-category 2 and Resolution type as dependent fields; invoice details required for the 5 request categories; same options for every type of contact (the old "not registered → only new member / supplier" limit removed). Made-up sub-categories removed. Email reader fills Request for / Sub-category 2 |
| 33 | **Matched to the documents**: type of contact uses the case master's labels (Registered With Lots / Not Registered / Others — saved cases converted once at start-up; Others get the B2C checks); store 105 is **DH** Duhai; **Not Specific** store option (a store complaint still needs a real store to escalate); **Product type** under product category (the SOP's examples, e.g. Fresh → Fruits); status help says store / team; the made-up B2C customer group removed |
| 34 | **Email previews in Microsoft Teams**: every email the CRM would send is posted to a Teams channel (Power Automate workflow link in the secrets file) instead of being sent; test message and "sample of every email" buttons; switch on the Automation page. Tested against a fake Teams endpoint (9 of 9), then posted to the real channel |
| 35 | **Attachments**: files can be added to a case (+ Add file — photos / bills from WhatsApp or phone); escalation, level-up and overdue emails carry the case's files automatically; template emails from the case page can attach chosen files; Teams cards list them. Up to 3 MB per file, 3.5 MB per email (Microsoft Graph's simple limit) — bigger files are named in the email as "available on request". Teams cards now mirror the branded email (header, template text, case box, footer). Tested with a stand-in for Microsoft Graph (9 of 9) and in the browser |
| 36 | **Simpler screens**: case page = "What to do now" (next SOP step + only the buttons that apply, escalation inside it) + tabs (Details read-only with Edit · Timeline · Email · Files · Calls · Steps) + customer / store / documents on the side; menu 16 → 11 items with setup pages on one **Admin** page; New case in 4 numbered steps with rarely used fields under "More details" |
| 37 | Decisions: CRM additions and SOP sub-categories kept until LOTS confirms; Duhai = DH; LWS-000003 reset from level 6 (old version's daily level-up) to level 1. New `POST /api/cases/:id/set-level` to correct a level by hand, with a reason on the timeline |
| 38 | README brought up to date with everything since 9 Oct: status, secrets (Teams link), setup checklist, screens (11-item menu, Admin page, simpler case page, 4-step New case), email previews in Teams, attachments, escalation rules, project files, API, tests, open items |
| 39 | **HO escalation matrix** (LOTS sheet April 2026 V_6): 12 rows, each First Time Resolution → Level 1 → Level 2 with SPOC (To), escalation list (Cc) and TAT; TATs in working hours (Legal 4 h, 09:00–21:00 Mon–Sat); automatic stage-ups and Level 2 reminders; daily follow-up per row; editable on Settings with Sample to Teams; 2 new supplier types; sheet typos corrected and missing TATs flagged. Tested: 24 unit checks + 34 end-to-end checks on a test copy, older suites still passing, screens checked in the browser |
| 40 | **Escalation flow** chart (React Flow, like the LOTS workflow chart): First Time Resolution → Level 1 → Level 2 → daily reminder, replies, resolution, confirmation call, closed; per sheet row with live counts and a details panel |
| 41 | **Two escalation levels everywhere, as in the Excel**: First Time Resolution → Level 1 → Level 2 (automatic) for store / team cases too; the store / team matrix now has Level 1 and Level 2 columns (no Level 3); emails, timeline, follow-ups and the case page use these names |
| 42 | **Editable escalation matrix for stores & teams**: same table as the HO matrix (First Time Resolution / Level 1 / Level 2 with To, Cc, TAT; Edit, Sample to Teams, Clear); default row; every case (HO, store, team) now runs on one automatic path; case page shows the three stages for store cases too. Tested: 20 new checks + all earlier suites, browser checked |
| 43 | **Escalation matrix updates from LOTS's Excel**: upload .xlsx / .csv → changes shown (yellow cells marked) → Apply; typos fixed; unclear cells keep the CRM value; new rows mapped or added as new HO rows; automatic when the sheet arrives by email from cpwi.in; history with Undo. New dependency `exceljs`. Tested: 19 + 6 checks, earlier suites passing, browser checked |
| 44 | **Live link to the matrix Excel** on OneDrive / SharePoint: checked every 10 min, applied when LOTS saves a change, errors shown and posted to Teams; Microsoft sign-in now also asks Files.Read.All. Tested against a stand-in for OneDrive (11 checks) |
| 45 | **Store escalation matrix and the new case master** from LOTS's workbook (21 tabs). Case types / categories / sub-categories / sub-categories 2 follow the "Case catergory" sheet (taxonomy, picklists, Caller Type → Case Type and Sub Category → Sub Category 2 dependencies, case form, workflows, requirements, email reader, dashboard, flow chart; saved cases renamed once at start-up). Store tabs: 348 rows (6 stores × 58) in `server/storeMatrix.json` (`server/buildStoreMatrix.js`), DH 105 and GNI Ecommerce made from NSP (confirmed by LOTS, 23 Oct 2026); case → row routing; First Time Resolution → Level 1 → Level 2 automatic; Stores & settings card per store and tab (Edit, Back to the workbook, Sample to Teams); case page / New case hint; Excel upload / live link read the store tabs. 29 end-to-end checks + browser check |
| 46 | **Teams card per escalation email** (built by the user, checked and fixed): one card for every escalation email (First Time Resolution, Level 1 / 2, overdue) once emails really go out, with the case, To / Cc / subject and the full email; it now says **sent** or **NOT sent — reason** (before, an unsent email showed as sent). Tested with no mailbox and a fake mailbox |
| 47 | **Emails to stores and teams in the layout of LOTS's Vtiger mails**: Hi Team / Greeting for the day, Reminder#n, and "The Details of the Query" with every field of the sample (contact, segments, case master fields, store, invoice details, complaint, the customer's email, attachments) as a table in the HTML email and the Teams card; new case fields purchase amount and amount to be refunded; date of purchase for every case. 18 checks |
| 48 | **Support button** (built by the user, checked and finished): 38 help articles (18 rewritten to match the CRM), support tokens for the help desk manager, two-way chat (the agent can write back, answers show as a badge when the panel is closed), Support tokens page with the conversation and auto-refresh, token status badges. 11 browser checks |
| 49 | **Background service** (scripts/crm-service.ps1, run-crm.ps1): scheduled task at log-on, hidden, production mode, restarted if it stops; install / status / restart / stop / start / uninstall; stops only with no pending database writes (`/api/health`) |
| 50 | **Escalation flow for the store matrix**: HO / store switch, store, tab and row pickers, the case categories of the row, live counts |
| 51 | **Sign-in with passwords and roles** (server/auth.js, Admin → Users and sign-in, My password): off until an admin switches it on; agent / admin; scrypt hashes, signed HttpOnly session cookie, 12 h; 5 wrong tries → 10 min; new password ends other sessions; last admin protected; CRM_AUTH_OFF emergency switch. 26 API checks + 9 browser checks |
| 52 | **Unique card numbers**: a membership or add-on card number belongs to one person only (contact form, API, import), like mobile numbers |
| 53 | **AI email reader** (server/aiReader.js, @anthropic-ai/sdk): Claude picks the case-master path, store and numbers from each new email; answer limited to the case master; keyword rules as fallback; on when ANTHROPIC_API_KEY is in the secrets file. 9 checks against a fake API |
| 54 | LOTS confirmed the DH 105 / GNI Ecommerce store-matrix rows and the routes the sheet doesn't state; ⚠ flags replaced by a provenance note |
| 55 | **Log new case, as on LOTS's Vtiger form:** call details under ① (Type of call Disconnected / Inbound / Outbound linked to the channel, Called number with "Same as contact's mobile", Call transaction ID); member card Edit / + Add Another Contact / Change; Channel dropdown (Call / Email) instead of the channel cards; Admin at the bottom of the menu |
| 56 | **One search box** in Identify caller (user's request): mobile, card no., membership ID, name, business name or email, of the contact or its add-on card holders; Mobile and Card no. moved to ② Who is it? |
| 57 | **Vtiger contacts import for lakhs of contacts:** Vtiger Contacts CSV recognised (all fields, +91 mobiles, add-on member, updated mobile), sent in parts of 2,000 with progress, server checks against an index; contact index for caller search (0.03 s with 3 lakh contacts) |
| 58 | **Import all contacts straight from Vtiger** (webservice + access key in the private secrets file): server job, 200 per request, saved every 2,000, Stop / Continue, duplicates in Vtiger skipped and listed; about an hour for 3.35 lakh |
| 59 | **Import all cases straight from Vtiger** (1.92 lakh): server job, 200 per request, saved every 2,000, Stop / Continue, re-runs skip cases already imported; Vtiger fields, owner, timestamps and the linked CRM contact (phone, business, card, store); only Vtiger's open cases stay open (Pending / Resolved), the rest is Closed history so the automation does not email about old cases. All cases pages 50 at a time and exports CSV from the server |
| 60 | **Dashboard trimmed** (user's request): removed Missed calls to call back, Pending emails, Outbound leads due, Unassigned open cases and Automated actions today; kept the three follow-up tiles, open cases by status and the three lists |
| 61 | **Report page** (the menu's Report item opened a blank page): cases created and closed per day, open / escalated / imported / linked now, emails sent, by channel, status, type and store, top open categories, agent workload, escalations, calls and imported cases still open; 7 days to 1 year with CSV export of the dates. Counted on the server in one pass over 1.9 lakh cases; the dashboard gets a 14-day trend and channel mix from the same `/api/reports` |
| 62 | **Process documentation + export fix (28 Oct):** complete process document with 17 horizontal flows and every escalation route (`docs/process-documentation.md`, `docs/flows/`, PDF); case export streamed (CSV any range, Excel up to 50,000 cases), India-time dates; the full export had crashed the live CRM |
| 63 | **Call logs** (24 Oct): Calls back in the menu as Call logs; the whole history with ranges, search, recording filter, Load more, recordings to play and download. "Abandoned Call" renamed **Disconnected Call** |
| 64 | **Contacts page** (24 Oct): contact cards + contact panel with Call / Email / WhatsApp / Log case and the communication history (calls with recordings, missed calls, cases, emails); contact by ID from the index (0.004 s) |
| 65 | **3,35,065 Vtiger contacts read** (24 Oct): 2,94,533 added; memory limit 4 GB; MySQL compression (start-up 8 min → about 1 min); Excel list of the contacts not imported |
| 66 | **Shared mobiles and CSV import without duplicates** (26 Oct): a mobile may be shared by contacts that each have their own card no.; import preview, repeats merged, every field filled, earlier cases attached |
| 67 | **Vtiger case import finished** (27 Oct): 1,92,396 cases, 1,38,796 linked; MySQL write fix for half-emoji characters. Report page removed at the user's request, then rebuilt (by the user) as a date range + cases table with quick presets, filters and CSV / Excel export |
| 68 | **README brought up to date** (29 Oct): menu and pages, Contacts, Call logs, Report, Vtiger imports, shared-mobile rule, secrets, API, tests, open items |
