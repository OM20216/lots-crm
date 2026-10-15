# LOTS Customer Care CRM

Case management and call-centre CRM for the LOTS Wholesale Solutions customer care desk (CP Wholesale India Pvt. Ltd.).
It is built from **"Lots Process Documents 2026"** (the SOP). The process flow is the live **LOTS Workflow** screen in the CRM; a static copy is in [`lots-workflow.svg`](lots-workflow.svg).

The CRM handles calls, missed calls, emails, outbound leads, contacts and store escalations in one place. It follows the SOP step by step and automates as much of it as possible, so agents mainly talk to customers.

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
| Contacts: Vtiger-style contact form, unique registered numbers, CSV import | ✅ Ready |
| Caller identification by any number, add-on member or card | ✅ Ready |
| SparkTG dialer in the CRM: caller panel on every call, click-to-call, call log | ✅ Built. API login works; **the live widget test with agents is still open** |
| Call details from SparkTG (direction, outcome, duration, recording) | ✅ Confirmed on real SparkTG records |
| Missed calls in the top bar (Recent missed / 2nd round), opening on a new missed call | ✅ Ready |
| Email: every mail to contactus@cpwi.in becomes a Pending case automatically | ✅ Built. **Connect with "Sign in with Microsoft" on the Automation page** (§9.3) |
| Automation engine (assign, acknowledge, escalation emails, chase stores, reports) | ✅ Ready. Email-based parts start once the mailbox is connected |
| Cases follow LOTS's case master (21 categories, Request for, Sub-category 2, Resolution type, product type) with SOP sub-categories | ✅ Ready |
| Workflow per case type and escalation: right store / team, TAT, escalation matrix (Level 2 / 3), holidays, re-assign, store-reply reading, promised dates, follow-up flags, report | ✅ Ready. **Store / team contacts and the matrix need filling in** |
| Email previews in Microsoft Teams (every email the CRM would send, nobody emailed) | ✅ Live — on until the mailbox is connected |
| Attachments: add files to a case; escalation emails carry them | ✅ Ready |
| Picklists and dependencies (add values and pairs, as in the PSRI CRM) | ✅ Ready |
| Simpler screens: case page "What to do now" + tabs, 11-item menu with an Admin page, 4-step New case | ✅ Ready |
| MySQL storage on the company server (database `lots`) | ✅ Live |
| Credentials kept outside the project | ✅ Done |
| Logins / passwords for agents | ❌ Not yet. Agents pick their name (office network only) |
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
- The CRM stops when its terminal closes. Running it as a Windows service is an open item (§17).

---

## 3. Configuration: `.env` and the private secrets file

Settings are kept in two files:

| File | Where | Contents |
| --- | --- | --- |
| **Private secrets file** | `C:\Users\<you>\.lots-crm\secrets.env`, **outside** the project folder, readable only by that Windows user | Every credential: MySQL server, user and password; SparkTG login and service ID; Microsoft 365 app details |
| **Microsoft sign-in** | `C:\Users\<you>\.lots-crm\ms-signin.json`, same private folder | Created by "Sign in with Microsoft" (§9.3). Never edit or share it |
| `.env` | Project folder | Only non-secret settings: port, SparkTG web addresses, mailbox name |

Zipping, copying or sharing the project folder never shares a password, and none of these files go into git. The browser never receives credentials. The CRM never shows the database server or user (terminal, Settings, error messages). Templates: `secrets.env.example` and `.env.example`. Another location can be set with the `LOTS_SECRETS_FILE` environment variable. The secrets file is read first, `.env` second.

**Private secrets file** (`secrets.env`):

| Setting | Needed for |
| --- | --- |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_SSL` | MySQL storage (§13.1). Without them the CRM won't start once the data has moved to MySQL (it refuses rather than starting empty) |
| `SPARKTG_USERNAME`, `SPARKTG_PASSWORD`, `SPARKTG_SVC_ID` | SparkTG API: direction, outcome, duration, recording, missed calls |
| `SPARKTG_WEBHOOK_TOKEN` | Optional secret for `/api/sparktg/event` |
| `MS_SIGNIN_CLIENT_ID` | Optional: own Microsoft app for "Sign in with Microsoft" (§9.3) |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | Alternative mailbox connection with an IT app secret (§9.4) |
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
2. **Sign in.** Each agent adds their name and **SparkTG login email** the first time.
3. **Admin → Stores & settings:**
   - **store contacts** (name, phone, email) for all six stores, and **team contacts** (E-commerce, IT, BDA, HR, Admin, Marketing, Supplier) — escalation and follow-up emails go to them
   - the **escalation matrix** (Level 2 / 3 names, emails, TATs) and **holidays**, once LOTS shares them
   - each agent's SparkTG login email, if not given at sign-in
   - **SparkTG → Test connection**, with a real call ID to see how the record is read
4. **Admin → Automation:**
   - **Email previews in Microsoft Teams**: *Send a test message* and *Post a sample of every email* to check the emails with the team
   - **Mailbox → Sign in with Microsoft** with an account that can open contactus@cpwi.in (§9.3); then switch the Teams previews **off** to go live
   - agent shifts (9–6, 10–7, 11–8, 12–9 or Off)
   - supervisor email (daily report)
5. **Contacts → Import CSV** with the member master, so callers are recognised.
6. Make **one incoming and one outgoing test call** (§7.6).

---

## 5. Screens

**Left menu** — only what agents use every day (collapses to icons with ‹):

| Screen | What it is for |
| --- | --- |
| **Dashboard** | What needs attention now: missed calls past 30 minutes, pending emails, overdue escalations, follow-ups due today, store replies to check, leads due, unassigned cases, automated actions today. Open cases by status, today's totals, escalations by store, top categories |
| **Log new case** | Four numbered steps in the SOP order, under the **Identify caller** panel (mobile or card number → contact details fill in): ① **How did they contact us?** (inbound call, missed-call callback, email, outbound call, with the SOP greeting) ② **Who is it?** (type of contact, name, business) ③ **What is the concern?** (case type cards → category → sub-category, store, invoice / order no.; the case master's other fields only when there's a real choice, product under *More details*; the workflow for the category) ④ **What happens now?** (resolved on call, info missing → Waiting, or escalate, with the EDC). SOP checks (§6.5), documents needed and SOP answers on the side |
| **My cases** | Open cases assigned to the signed-in agent |
| **All cases** | Search and filter all cases (status, channel, type, store, agent), CSV export |
| **Follow-ups** | Escalated cases by **store or team** with deadlines, level, promised date and flags (*not followed up today*, *store replied — check*, *promise missed*); the daily call script, logging the call with the store's promised date, one follow-up email per store / team. **Report** tab: on time %, average days, overdue, levels, promises missed per store / team (§6.8) |
| **Calls** | Every SparkTG call: direction, number, contact, agent, outcome, talk time, recording, linked cases. Stats per agent, including outbound calls against the SOP target of 80–100 a day |
| **Emails** | Mailbox (once connected), email cases by status, logging an email by hand |
| **Outbound calls** | Calling lists for every SOP outbound purpose: new registration, inactive customer, order on call, LCC, confirmation, **follow-up**, **customer survey**, festival offers. Import, **Call**, log the outcome. Confirmation calls close or re-open their case; follow-up calls move a Waiting case back to Pending; survey calls record ratings and comments, with a **Survey results** panel |
| **Contacts** | The member master: list, **+ Create Contact** / **Edit** (Vtiger-style form, §11), **Call**, **Cases**, CSV import |
| **Knowledge base** | SOP / FAQ answers, call scripts and email templates, searchable |
| **Admin** | One page linking the setup pages below |

**Admin page** (for team leaders):

| Page | What it is for |
| --- | --- |
| **Stores & settings** | Store contacts, team contacts (§6.6), **escalation matrix** and **holidays** (§6.8), agent SparkTG emails, SparkTG connection test, database status, backup download |
| **Automation** | Mailbox connection, **Email previews in Microsoft Teams**, rule switches, timers, agent shifts, activity log, outbox |
| **Case workflows** | The workflow of every case type: owner team, TAT, steps, and the teams' email addresses (§6.6) |
| **LOTS workflow chart** | The SOP flow as an interactive chart; every box shows its live count (red = needs attention) |
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

The case taxonomy is taken from LOTS's case master (**"lot cases excel.xlsx"** — every possible case), and is defined in `src/taxonomy.js`. The SOP still drives the workflows, answers and requirements.

| Case type | Categories |
| --- | --- |
| **Inquiry** | Legal · Real Estate · HR or Jobs · General Query · IT or Website · Festive Gifting · Admin Related · Marketing Related |
| **Issues or Complaints - NR** | Store Related · Membership Related · ECommerce Related · BDA Related · App Related · Membership Related - NR |

**Case master columns** ("lot cases excel"), as dependent fields under the category: **Request for** (New Member → New Member - Customer · New Supplier → New Vendor - Supplier · other requests → Re-issuing of Lost Card), **Sub-category** (requests: Behavior of staff … Others (st)), **Sub-category 2** (requests: Add-On Cards / Address updation · New Supplier: the 4 supplier types), **Invoice detail required** (the 5 request categories), **Resolution type** (Inquiry: Answer Received / Clarity required from LOTS / Escalated and Auto Closed · New Member / Supplier: Information Provided · requests: Answer Received / Clarity required from LOTS · complaints: Escalated to LOTS). Every type of contact gets the same options. The SOP's sub-categories are kept for General Query, HR or Jobs and the Store / App / ECommerce / BDA complaints (the master has none there).
| **Requests** | App Related Requests · BDA Related REQUESTS · E Commerce Related Request · Membership Related Request · New Member · New Supplier · Store Related Request |

Sub-categories (Requests): *Behavior of staff · Delivery Related · Offer related · Operational issues · Others (st) · Payment or invoice · Pricing issue · Quality issue · Return Of Goods · Stock availability · Add-On Cards · Address updation* (New Member → *New Member - Customer*; New Supplier → *New Vendor - Supplier* and the four supplier types). Inquiry and complaint categories have no sub-category. The other case-master dimensions are also in `src/taxonomy.js`: `REQUEST_FOR`, `SUB1`, `SUB2`, `SUPPLIER_TYPES`, `RESOLUTION_TYPES`, `CALL_TYPES`.

Other fields on a case:
- Type of contact (the case master's `type_of_contact`): Registered With Lots, Not Registered, or Others. Every type gets the same case types and categories.
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
| Select case type → Inquiry / Issues or Complaints - NR / Requests | Case-type cards on the New Case page, with the case-master categories and sub-categories |
| Answer from SOP / FAQ | Matching SOP answers appear beside the case form |
| **Request requirements** | For requests that need documents (new membership, add-on card, supplier, lost card, address change, return/exchange, bulk booking), the SOP checklist is shown in the case form and on the case page |
| Resolve within TAT? | Three outcomes, as in the SOP: ROT · Info missing → Waiting · Escalate to store team (EDC = 1 working day) |
| **Call closing: "anything else?"** | After a call case is saved: **Yes, next concern** opens a new case for the same caller and SparkTG call. **No** shows the closing line. One call can be linked to several cases |
| Email → case auto-created · Pending | Every mail becomes a Pending case automatically (§9.2) |
| "AI agent reads the mail" | Rule-based reader: case type, category, sub-category, store named in the mail, contact (by email, mobile or card number), invoice / order number |
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
| Stock availability · Pricing issue | Store team | 1 working day | — |
| HR or Jobs | HR / Careers (careers@cpwi.in) | 1 | — |
| IT or Website · App Related | IT / Website team | 1 | — |
| Marketing Related · Festive Gifting | Marketing team | 1 | — |
| Admin Related · Legal · Real Estate | Administration | 1 | — |
| Store Related · Store Related Request · Return Of Goods | The case's **store** contact | 1 | Store |
| ECommerce Related · E Commerce Related Request · App Related Requests | E-commerce / App team | 1 | Order / invoice no. |
| BDA Related · BDA Related REQUESTS | BDA team | 1 | — |
| Membership Related · Membership Related - NR · Membership Related Request | The member's **home store** | 1 | — |
| New Supplier | Category / Supplier team | **7** (SOP: reply within 7 days) | — |

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

**Level 1** is the store or team the case-type workflow picks (§6.6), with that workflow's TAT (1 working day; 7 for refunds and new suppliers). Working days skip **Sundays and the holidays** in Stores & settings.

| Step | What happens |
| --- | --- |
| **Escalate** | The agent can keep the workflow's choice or pick **Send to** another store / team. The escalation email goes to that contact |
| **Escalation matrix** (Stores & settings) | Level 2 and Level 3 contacts with their own TATs: a **default** for all, and optional rows per store and team. Empty = the Level 2 email on the Automation page |
| **TAT passes** | The case moves up one level by itself: the Level 1 contact keeps it, the next level is copied on the email, and the new due date is that level's TAT. At the highest level it gets one reminder per working day instead (no endless levels) |
| **Escalate to level N now** | From the case page, with a reason: an agent doesn't have to wait for the TAT |
| **Re-assign** | From the case page: move an escalated case to another store / team (wrong team, or passed on). It starts again at Level 1 with a fresh TAT and a new escalation email |
| **Daily follow-up call** (SOP) | Follow-ups shows **Not followed up today** for every case without an agent call today (the automatic daily email doesn't count). Logging the call can record the date the **store promised** |
| **Store replies by email** | Only a reply that reads like a resolution ("refund processed", "replacement delivered", "issue resolved") moves the case to Resolved. "We are checking", "will update by tomorrow", "Noted" keep it Escalated and flag **Store replied — check** for an agent, who marks it as the resolution or keeps following up. A date in the reply ("by tomorrow", "within 2 days", "by 18/10") becomes the promised date |
| **Promise missed** | When the promised date passes, the case is flagged (Follow-ups, Dashboard, daily email) and noted on the timeline |
| **Report** (Follow-ups → Report) | Per store / team for 7, 30, 90 or 365 days: escalated, resolved, **on time %** (within the first TAT), average working days to resolve, open, overdue, above Level 1, promises missed |

Replies are recognised from the store contacts, the team emails, the escalation-matrix contacts and any @cpwi.in address.

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

### 7.5 Calls page

Totals and figures per agent (in / out, connected, not connected, linked to a case, average talk time of answered calls), outbound calls against the **80–100 a day** target, a filter for **"Connected, no case logged"**, recordings played through the server, and **Raw** to see SparkTG's own record.

### 7.6 Checking the SparkTG connection

Confirmed on real records: `customerNumber`, `callType` (INBOUND / OUTBOUND), `disposition` (`ANSWER` / `NOANSWER`), `duration` (includes ringing time), `time`, `receivedBy` (agent), `recording` (.wav URL). To check the widget side:
1. **⚙ button** next to the dialer: the raw widget events (`show_dialer` should carry `callId` and `caller.phone`).
2. **Calls → Raw** on a finished call: SparkTG's record and how the CRM read it.
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
- **Each number belongs to one contact only** (§11.2), so a match is always unambiguous.
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
| Queue a customer survey call | Closed case → Outbound leads "Customer survey" (once per case). Ratings for overall, store and customer care, would-recommend, and comments; saved on the case timeline and in **Survey results** | **Off** | No |
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

### 11.2 Registered numbers are unique

A mobile (registered, alternate, extra, or an add-on member's) can belong to **one contact only**, and can't appear twice on the same contact. Numbers are compared on the last 10 digits.
- **Contact form:** as soon as a number has 10 digits, a message appears under it: *"Already registered to Kumar Kirana (M-00001)"*, with a link to that contact, and Save is blocked.
- **Server:** enforced for every save (form, import, any route); a clash returns HTTP 409 with the number and the contact it belongs to.
- **Import:** rows whose number belongs to another contact are skipped and listed with the reason.

### 11.3 Import CSV

**Contacts → Import CSV** reads the member master and recognises common headers (Mobile, Card No, Business Name, Owner, Email, GSTIN, Store, Address, Status…). Store names become store codes. Existing contacts are matched by card number or mobile and **updated**, not duplicated.

---

## 12. Knowledge base, scripts and templates

All taken from the SOP. The file is `src/knowledge.js`.

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
| `agents` | Agent, with SparkTG login email and shift |
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
- **Credentials** are outside the project (§3), including the Microsoft Teams workflow link. **No logins yet**: agents choose their name, so use the CRM only on the office network until logins are added.
- **Git:** `.gitignore` keeps out `server/data/` (all data and backups), `.env`, secrets files, the Microsoft sign-in file and logs. Save changes with `git add -A`, `git commit`, `git push`.
- **GitHub repo `OM20216/lots-crm` is private.** An early upload contained `.env` with the SparkTG login. It was removed from `main`, and the repo is now private.

---

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
  teams.js         Microsoft Teams: email previews posted to a channel (Power Automate workflow link)
  data/            JSON data / backups / attachments (not in git)
src/
  App.jsx          Layout: sidebar, top bar, routes, sign-in, dialer, caller panel
  sparktg.jsx      SparkTG widget connection (adapted from PSRI SparkTGContext)
  taxonomy.js      Case types, categories, case master columns, statuses, customer groups, product types (LOTS case master + SOP)
  workflows.js     Workflow per case type: owner team, TAT, steps, escalation target (also used by the server)
  picklists.js     Picklists and dependencies: base values from taxonomy.js + the ones added on the screens
  knowledge.js     SOP / FAQ answers, scripts, email templates (also used by the server)
  requirements.js  Request requirements, SOP checks (return / B2C), reference-number reading (also used by the server)
  api.js, ui.jsx   Fetch helper, shared UI helpers
  components/      Dialer (widget, caller panel, Call button), MissedBar, Mailbox, MailboxCard, Classifier, CallsCard, WorkflowCard, EscalationPanel, MemberImport, Icon
  pages/           One file per screen. ContactForm.jsx = contact form; LotsFlow.jsx/.css = workflow chart; Admin.jsx = setup pages
lots-workflow.svg  Static process chart of the SOP
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
| PUT | `/api/holidays` | `{ dates: ["YYYY-MM-DD", …] }` — not counted as working days |
| POST | `/api/cases/:id/reroute` | Move an escalated case to `{ kind: store \| team, code, note }` |
| POST | `/api/cases/:id/raise-level` | Next escalation level now, `{ reason }` (400 if the matrix has no next level) |
| GET | `/api/escalation-report?days=30` | Escalations per store / team: on time, average days, open, overdue, levels, promises missed |
| POST / DELETE | `/api/picklists` | Add `{ field, value }` (409 if it exists) / remove an added value and its pairs |
| POST / DELETE | `/api/dependencies` | Add `{ mainField, mainValue, subField, subValue }` (both values must be in their picklists; 409 if the pair exists) / remove an added pair |
| GET / POST | `/api/cases` | List (filters: status, channel, store, caseType, assignedTo, q, overdue) / create |
| GET / PATCH | `/api/cases/:id` | Case with history and escalation `target` / edit, change status (only along the workflow), add a note, tick a workflow step (`checkStep`, `done`) |
| POST | `/api/cases/:id/email` | Send an email from the case `{ to, subject, body, kind, attachments: [file] }` (mailbox, or Teams preview) |
| POST | `/api/cases/:id/attachments?name=` | Add a file to a case (raw bytes, up to 15 MB) |
| POST | `/api/cases/:id/set-level` | Correct an escalation level by hand `{ level, reason }` (kept on the timeline) |
| POST | `/api/cases/:id/calls` | Link a SparkTG call to a case |
| GET | `/api/cases/:id/attachments/:file` | Download an attachment |
| POST | `/api/calls/event` | Dialer event `{ callId, status: started \| ended, direction, phone, context, widget }` |
| GET | `/api/calls`, `/api/calls/stats`, `/api/calls/:id` | Call log / stats / one call with SparkTG's raw record |
| GET | `/api/calls/:id/recording`, `/api/sparktg/recording/:case/:txn` | Recording, played through the server |
| GET | `/api/sparktg/call/:txnId`, `/api/sparktg/test`, `/api/sparktg/status` | Caller for a call ID / connection test / webhook events |
| ALL | `/api/sparktg/event` | SparkTG call-event webhook (missed calls) |
| GET | `/api/lookup?q=` | Caller lookup by phone, card, email or name |
| GET / POST | `/api/members`, `/api/members/import` | Contacts (search `q`) / create / bulk import. A clashing number returns **409** with `phone` and `memberId` |
| GET / PATCH | `/api/members/:id` | One contact / edit (same 409 rule) |
| GET / POST / PATCH | `/api/missed-calls` (`?open=1`) | Missed calls (with the contact) / add / attempt or status |
| GET / POST / PATCH | `/api/leads` | Outbound leads / call outcomes |
| POST | `/api/email-intake` | New email → case (manual form and mailbox) |
| GET / PUT / POST | `/api/automation`, `/api/automation/run` | Settings, log, outbox / run the checks now |
| GET / POST / DELETE | `/api/mail/signin` | Microsoft sign-in status / start (returns the code) / disconnect |
| GET | `/api/mail/test` | Mailbox connection test |
| GET / POST | `/api/teams-preview`, `/api/teams-preview/test`, `/api/teams-preview/samples` | Teams preview status / test message / one sample of every email |
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
| **Dialer widget with agents logged in** (SSO, show_dialer, click-to-call from the CRM, incoming call) | ⏳ Needs agents' SparkTG emails and a live test |
| **Real mailbox** contactus@cpwi.in | ⏳ Needs "Sign in with Microsoft" |

---

## 17. Known limitations and open items

**To go live**
- [ ] Restart the CRM after updates; check the terminal says `Data: MySQL database "lots"`.
- [x] **GitHub repo `OM20216/lots-crm` made private.** ✅ Done
- [ ] **Connect the mailbox:** Automation → Sign in with Microsoft (§9.3).
- [ ] Enter every agent's **SparkTG login email** and **shift**; then one live incoming and outgoing test call.
- [ ] **Import the member master** (Contacts → Import CSV).
- [ ] **Store contacts** for all six stores, **team contacts**, the **escalation matrix** and **holidays**; **supervisor email**.
- [ ] When the mailbox is connected: switch **Email previews in Microsoft Teams** off so emails really go out.
- [ ] Confirm the **SparkTG service**: the CRM uses 1672 (VMM's). If LOTS has its own service for 1860-123-5687, add its ID and login to the secrets file.
- [x] **MySQL password changed** (it had been shared in a chat; the same login opened other databases on that server). ✅ Done. The SparkTG password was left unchanged by choice.

**From LOTS**
- [ ] **Confirm the CRM's own additions** (kept until LOTS decides): the 5 customer-survey questions; the follow-up / survey call outcome labels (Info received, Update given, Survey completed, Refused survey); the 7-day TAT for refund and new-supplier escalations (taken from the FAQ promises; the SOP's escalation TAT is 1 working day).
- [ ] **Confirm the SOP sub-categories** used where the case master has none (General Query, HR or Jobs, Store / App / ECommerce / BDA complaints). Editable on the Picklists page.
- Settled 15 Oct 2026: Duhai store code is **DH** (case master).
- [ ] The full **escalation matrix** (the SOP defines only Level 1, 1 working day).
- [ ] **Calling lists** for outbound leads, and current **offers / schemes** for festival calls.
- [ ] Official **email templates**, if LOTS has them.
- [ ] LOTS's Vtiger lists for **Contact Type, Source of Information and cities**.

**Not built yet**
- [ ] **Run the CRM as a Windows service** (starts with the PC, runs with VS Code closed).
- [ ] **Logins** with passwords and roles, before the CRM is reachable outside the office network.
- [ ] **SMS** (SOP one-way channel): needs an SMS provider; ask SparkTG.
- [ ] **OMS link** for orders on call: needs OMS access.
- [ ] Answer within 3 rings isn't measured (SparkTG doesn't report ring time).
- [ ] Calls that reach no agent's dialer need SparkTG's call-event webhook.
- [ ] Unique **card numbers** (numbers are unique; cards not yet).
- [ ] AI email reader instead of keyword rules (needs an Anthropic API key).

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
