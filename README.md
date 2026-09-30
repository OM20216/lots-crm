# LOTS Customer Care CRM

Case management and call-centre CRM for the LOTS Wholesale Solutions customer care desk (CP Wholesale India Pvt. Ltd.).
It is built from **"Lots Process Documents 2026"** (the SOP). The process flow is the live **Workflow** screen in the CRM, and there is also a static copy in [`lots-workflow.svg`](lots-workflow.svg).

The CRM handles calls, missed calls, emails, outbound leads and store escalations in one place. It automates as much of the SOP as possible, so agents mainly talk to customers.

---

## Contents

1. [Status at a glance](#1-status-at-a-glance)
2. [Install and run](#2-install-and-run)
3. [Configuration (`.env`)](#3-configuration-env)
4. [First-time setup checklist](#4-first-time-setup-checklist)
5. [Screens](#5-screens)
6. [Case workflow (from the SOP)](#6-case-workflow-from-the-sop)
7. [Calls: SparkTG dialer inside the CRM](#7-calls-sparktg-dialer-inside-the-crm)
8. [Caller identification (registered members)](#8-caller-identification-registered-members)
9. [Email](#9-email)
10. [Automation engine](#10-automation-engine)
11. [Members](#11-members)
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
| Case management (log, categorise, escalate, resolve, close) | ✅ Ready |
| Workflow screen: the SOP flow chart (React Flow) with live numbers | ✅ Ready |
| Caller lookup: registered number fills in member details | ✅ Ready |
| SparkTG dialer in the CRM (incoming pop-up, click-to-call, call log, missed calls) | ✅ Built. **Needs a live test with the real SparkTG account** |
| Call details from SparkTG (outcome, duration, recording) | ✅ Confirmed on real SparkTG records (30 Sep 2026) |
| Missed calls, outbound leads, store follow-ups | ✅ Ready |
| Automation engine (assign, remind, chase stores, daily report) | ✅ Ready (email-based parts wait for the mailbox) |
| Email: automatic import and sending via contactus@cpwi.in (Microsoft 365) | ✅ Built. **Connect with "Sign in with Microsoft" on the Automation page** (§9.3) |
| Member master import (CSV) | ✅ Ready |
| MySQL storage (company server) | ✅ Built and tested on MySQL 8.4. **Needs your server's connection details in `.env`** |
| Logins / passwords | ❌ Not yet. Agents pick their name (fine on the office network only) |

---

## 2. Install and run

Requires **Node.js 20.12 or newer** (tested on Node 24).

```bash
npm install
npm run dev          # development: http://localhost:4000, reloads on code changes
```

For daily use on the office network:

```bash
npm run build        # build the front end once (again after every code change)
npm start            # http://<this-pc-ip>:4000 — every agent opens this in Chrome/Edge
```

- The server listens on all network interfaces. Agents on the same network use the CRM PC's IP address.
- If port 4000 is taken, set `PORT` in `.env`. The server prints a clear message when the port is busy.
- Keep the CRM PC switched on during working hours. The automation checks run every minute inside the server.

---

## 3. Configuration: `.env` and the private secrets file

Settings are kept in two files:

| File | Where | Contents |
| --- | --- | --- |
| **Private secrets file** | `C:\Users\<you>\.lots-crm\secrets.env`, **outside** the project folder, readable only by that Windows user | Every credential: MySQL server, user and password; SparkTG login; Microsoft 365 app secret |
| `.env` | Project folder | Only non-secret settings: port, SparkTG web addresses, mailbox name |

Zipping, copying or sharing the project folder therefore never shares a password. The browser never receives credentials. The CRM doesn't show the database server or user anywhere (terminal, Settings, error messages). Templates: `secrets.env.example` and `.env.example`. A different location can be set with the `LOTS_SECRETS_FILE` environment variable. The CRM reads the secrets file first and `.env` second.

**Private secrets file** (`secrets.env`):

| Setting | Needed for |
| --- | --- |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_SSL` | MySQL storage (§13.1). Without them the CRM uses the JSON file, and refuses to start if the data was already moved to MySQL |
| `SPARKTG_USERNAME`, `SPARKTG_PASSWORD`, `SPARKTG_SVC_ID` | SparkTG API: call outcome, duration and recording |
| `SPARKTG_WEBHOOK_TOKEN` | Optional secret for `/api/sparktg/event` |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | Email automation, when Microsoft 365 is connected (§9) |

**`.env`** (not secret):

| Setting | Notes |
| --- | --- |
| `PORT` | Default `4000` |
| `SPARKTG_BASE_URL` | Default `https://telephonycloud.co.in` |
| `SPARKTG_WIDGET_URL` | Dialer inside the CRM, the same as `VITE_SPARKTG_WIDGET_URL` in crm-vmm |
| `MAILBOX` | Default `contactus@cpwi.in` |
| `CRM_DATA_DIR` | Optional separate data folder for a test or training copy |

Restart the CRM after changing either file.

**Keeping credentials confidential:**
- Never paste passwords into chats, email or tickets. If one was shared, have it changed and update `secrets.env`.
- Back up `secrets.env` separately and securely (for example in a password manager), not with the project.
- A new PC or user needs their own `secrets.env`, from `secrets.env.example`.

## 4. First-time setup checklist

1. `npm install`, then create `.env` (see §3), then `npm run build`, then `npm start`.
2. **Sign in.** Each agent adds their name and **SparkTG login email** the first time.
3. **Stores & settings:**
   - Store contacts (SPOC name, phone, email) for all six stores. Escalation and follow-up emails go to these contacts.
   - Each agent's SparkTG login email, if not given at sign-in.
   - **SparkTG → Test connection.** Enter a real call ID to see how the record is read.
4. **Automation:**
   - Agent shifts (9–6, 10–7, 11–8, 12–9 or Off).
   - Level 2 escalation email, supervisor email, and the times for the daily store email and daily report.
   - Switch off any rule you don't want.
5. **Members → Import CSV** with the member master, so calls from registered numbers are recognised.
6. Make **one inbound and one outbound test call** and check them (see [§7.5](#75-checking-the-sparktg-connection)).

---

## 5. Screens

| Screen | What it is for |
| --- | --- |
| **LOTS Workflow** | The SOP flow as an interactive chart (from the crm-vmm `LotsFlow`). Every box shows its live count (red = needs attention). Click a box to see the SOP options, what the CRM does at that step, and a link to the screen that handles it |
| **Dashboard** | What needs attention now: missed calls past 30 minutes, pending emails, overdue escalations, leads due, unassigned cases, automated actions today. Open cases by status. Today's totals. Escalations by store. Top categories |
| **Log new case** | Laid out in the SOP order: **Identify caller** panel (mobile or card number → registered member details fill in) → **Source of case** (inbound call, missed-call callback, email, outbound call) with the SOP greeting → caller details → **case type** cards (Enquiry / Issue & Complaint / Request) with category and sub-category → **Resolve within TAT?** (ROT, info missing → Waiting, escalate to store team with the **EDC**, keep pending). SOP rule enforced: a caller who is not registered can only request a new membership or supplier registration. SOP answers and request requirements are shown on the side. A status pill shows *Draft* or *On live call* |
| **My queue** | Open cases assigned to the signed-in agent |
| **Email inbox** | Email cases by status (Pending / Waiting / Escalated / Resolved) and a form to log an email by hand |
| **Calls** | Every SparkTG call: direction, number, member, agent, outcome, talk time, recording, linked case / missed call / lead. Stats per agent. **Log case** and **Call back** on each call |
| **Missed calls** | Open missed calls with the 30-minute countdown, assigned agent and attempts. **Call back** (SparkTG) or **Log case** |
| **All cases** | Search and filter (status, channel, type, store, agent), CSV export |
| **Case page** | Status flow, next-step buttons, editable details, timeline, reply templates (copy / open in mail / send), linked calls with recordings, attachments, customer history, **Call customer** |
| **Store follow-ups** | Escalated cases grouped by store, with deadline countdown, the daily call script, the CRM note template, and one follow-up email per store |
| **Outbound leads** | Calling lists (new registration, inactive, order on call, LCC, confirmation, festival offers). Import from Excel, **Call**, log the outcome. Confirmation calls close or re-open their case |
| **Members** | Member master: add, edit, block, add-on cards, CSV import, **Call** |
| **Knowledge base** | SOP/FAQ answers, call scripts and email templates, searchable. SOP conflicts are flagged |
| **Automation** | Rule switches, timers, agent shifts, mailbox status, activity log, outbox |
| **Stores & settings** | Store contacts, agent SparkTG emails, SparkTG connection test, screen-pop / webhook URLs, backup download |

---

## 6. Case workflow (from the SOP)

### 6.1 Case types (from the SOP)

| Case type | Categories |
| --- | --- |
| **Enquiry** | General query · HR & jobs · Admin, IT & marketing |
| **Issue & Complaint** | Store related · App / E-comm related · BDA related |
| **Request** | Membership related · Store related · App / E-comm related · BDA related · Not registered member |

Every category has the sub-categories listed in the SOP, for example *Store related → Price mismatch, Wrong product billed, GST issue, Late delivery…*. The full list is in `src/taxonomy.js`.

Other fields on a case:
- Caller type: Registered member, Not registered, or B2C customer.
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
- A case must have a **store** before it can be escalated.
- A case must have a **case type and category** before it can be closed.

Every change is written to the case **timeline** with the agent's name and the time.

### 6.3 Steps from the workflow chart that the CRM carries out

| Workflow box | How the CRM applies it |
| --- | --- |
| Registered member? | Caller's number is matched automatically (§8) |
| Select case type → Enquiry / Complaint / Request | Case form, with the SOP categories and sub-categories |
| Answer from SOP / FAQ | Matching SOP answers appear beside the case form |
| **Request requirements** | For requests that need documents (new membership, add-on card, supplier, lost card, address change, return/exchange, bulk booking), the SOP checklist is shown in the case form and on the case page (`src/requirements.js`) |
| Resolve within TAT? | Outcome buttons: Resolved on call · Info missing · Escalate to store |
| **Call closing: "anything else?"** | After a call case is saved: **Yes, next concern** opens a new case for the same caller and the same SparkTG call. **No** shows the closing line. A call can be linked to several cases |
| Email → AI agent reads the mail | Rule-based reader: case type, category, sub-category, store named in the mail, member (by email, mobile or card no. in the mail), invoice/order no. |
| **Information complete?** | Complaints and requests only, see §10.1 |
| Auto email: information required → customer replied | Lists exactly what is missing; status Waiting. The reply is read (store, mobile, order no., attachments) and checked again. After 2 requests it is left for an agent |
| Complete → auto-escalate | Escalated to the store; the store gets the escalation email |
| Escalate → Daily follow-up → Resolution → Confirmation call → Closed | §10 automation plus the Store follow-ups and Outbound leads screens |

### 6.4 Case numbers

`LWS-000001`, `LWS-000002`, … Keeping `[LWS-000123]` in an email subject threads the reply onto that case.

---

## 7. Calls: SparkTG dialer inside the CRM

SparkTG's embeddable dialer (the same widget used in the PSRI project) is loaded in the CRM. It talks to the CRM through browser messages:

| From widget | Meaning | CRM does |
| --- | --- | --- |
| `ready_for_events` | Widget loaded | Logs the agent in automatically with their SparkTG email (`login_sso_email`) |
| `login_sso_complete` | Login result | Green dot = logged in, yellow = loaded but not logged in, grey = loading |
| `show_dialer` | A call is ringing / starting (`callId`, `caller.phone`, `calledTo`) | Logs the call, shows the call bar, opens the case form for inbound calls |
| `hide_dialer` | Call ended | Marks the call ended and fetches the final record from SparkTG |

| To widget | Used for |
| --- | --- |
| `login_sso_email` | Automatic agent login |
| `click_to_call` | Every **Call** button in the CRM |

SparkTG sends `reason: "incoming_call"` for both directions, so, as in PSRI, the CRM tracks outbound calls itself. The CRM also only accepts messages from the widget's own origin.

### 7.1 Incoming call

1. The phone rings in the dialer, and the **call bar** appears at the top of every page. It shows the number, the member's business name, owner and card number, a **Blocked** warning if the card is blocked, and how many open cases they have.
2. The **case form opens automatically** with the number and call ID filled in. If the number is registered, every member detail fills in (see §8). If the agent is already filling in a case form, it isn't replaced; the call bar shows a **Case form** button instead.
3. The agent picks the category and outcome and saves. The call is **linked to the case automatically**.

### 7.2 Outgoing call

**Call** buttons appear on missed calls, leads, cases, members and the call log. The dialer dials the number, and the call is attached to the item it was dialled from.

### 7.3 After every call (automatic)

- The CRM asks SparkTG for the final call record, retrying for up to about 20 seconds, because SparkTG takes a few seconds to finalise it.
- Outcome, talk time and recording are saved on the call and on the linked case.
- **Inbound call not answered:** added to **Missed calls** with the 30-minute timer and assigned to an agent on shift.
- **Agent dials a number that has an open missed call**, from any screen: counts as the call-back. If it connects, the missed call is marked *Called back*.
- **Customer rings again and is answered:** their open missed call is marked *Customer called back*.
- **Outbound lead call not connected:** the lead is marked *Not reachable*.
- **Confirmation call** on a resolved case: *Confirmed resolved* closes the case, *Not satisfied* sends it back to the store.

### 7.4 Calls page

It shows:
- totals (in/out, connected, not connected, linked to a case, average talk time) and the same figures per agent
- a filter for **"Connected, no case logged"**, to find calls nobody wrote up
- recordings, played through the server

### 7.5 Checking the SparkTG connection

The SparkTG API documentation hasn't been seen. Only the call ID field (`xnid`) is confirmed; the other field names are common guesses. Check them once:
1. **⚙ button** next to the dialer: the raw widget events. Check that `show_dialer` carries `callId` and `caller.phone`.
2. **Calls → Raw** on a finished call: the SparkTG record and how the CRM read it. Check outcome, talk time and recording.
3. **Stores & settings → SparkTG → Test connection:** checks the login, lists SparkTG agents, and shows how any call ID is read.

If a field shows blank, update the name lists in `normalizeCall()` in `server/sparktg.js`. Missed-call detection depends on the outcome field: a call counts as not connected when the outcome contains words like *no answer, missed, busy, failed*, or the talk time is 0. That pattern is `NOT_CONNECTED` in `server/calls.js`.

### 7.6 Other SparkTG options (if the account has them)

- **Screen-pop URL:** `http://<crm>:4000/new?phone={caller}&txn={call id}`. Not needed when agents use the dialer inside the CRM.
- **Call-event webhook:** `http://<crm>:4000/api/sparktg/event?token=…`. Catches missed calls that never reach any agent's dialer (everyone logged out, after hours). SparkTG must be able to reach the CRM PC.
- **Typing a call ID by hand** on a case (Calls panel → Link) still works as a fallback.

---

## 8. Caller identification (registered members)

When a phone number arrives, whether typed, from the dialer, or from a SparkTG call ID, the CRM looks it up automatically:

- Numbers are compared on the **last 10 digits**, so `+91 98765 43210`, `919876543210` and `09876543210` all match.
- The CRM checks the owner's mobile, the alternate mobile, and **add-on card holders' mobiles**. An exact card number also matches.
- **Match found:** name, business, card number, email, caller type (Registered member) and home store fill in on their own. A member card shows owner, mobiles, card, customer group and type, home store, GSTIN/licence, add-on cards, open cases, the registered delivery address and notes. **Blocked** cards are shown in red.
- If an add-on card holder is calling, their name and card are used and they are labelled as the add-on holder.
- The caller's previous cases and recent SparkTG calls are listed underneath.
- **Not this member** unlinks the match, and it isn't filled in again for that number.
- If only a SparkTG call ID is given, the CRM gets the caller's number from SparkTG first.

This depends on the **Members** list, so import the member master (§11).

---

## 9. Email

**Status: ready to connect.** A supervisor connects contactus@cpwi.in once with **Sign in with Microsoft** on the Automation page. Until then, emails are logged by hand and automatic emails wait in the outbox as *not sent*.

### 9.1 Without a mailbox connection (manual)

**Email inbox → Log an incoming email:** paste the sender, subject and message, and a *Pending* case is created. A reply with `[LWS-…]` in the subject is added to that case instead. On the case page, templates can be copied or opened in the mail app, then logged as sent.

### 9.2 With the mailbox connected

The mail domain cpwi.in is on **Microsoft 365**, so the CRM uses the **Microsoft Graph API** (no IMAP).

- The CRM checks contactus@cpwi.in **every minute**.
- Each new mail becomes a case: attachments are saved, and the member is matched by email or by a phone number written in the mail.
- The case is categorised, checked for missing information, assigned and acknowledged, and the mail is moved to a **CRM-Logged** folder so it is never imported twice.
- Replies from the case page (**Send now**) and all automatic emails are **sent from contactus@cpwi.in**, and a copy is saved in its Sent Items.

### 9.3 Connecting: Sign in with Microsoft (recommended)

1. **Automation → Mailbox → Sign in with Microsoft.**
2. The page shows a short code. Open the link shown (microsoft.com/devicelogin), enter the code, and sign in with a **Microsoft account that can open contactus@cpwi.in**. Accept the permissions: read/write and send mail you can access.
3. The page switches to *Connected … as <account>*. Click **Test mailbox connection**.

That's all. The sign-in is saved only on this PC, in the private credentials folder (`C:\Users\<you>\.lots-crm\ms-signin.json`, readable only by that Windows user). It renews itself, so nobody needs to stay signed in. If it expires or the password changes, the Automation page says so. Sign in again, or **Disconnect** to stop.

**What the Microsoft 365 admin of cpwi.in may need to do, once:**
- Give the signing-in account **Full Access** and **Send As** on contactus@cpwi.in. Not needed if the account *is* contactus@cpwi.in.
- If sign-in says *"Need admin approval"*: approve the app for the organisation. By default it is Microsoft's own *Microsoft Graph Command Line Tools* app (the one used by `Connect-MgGraph`). The admin may register a dedicated app instead (public client flows **on**, delegated permissions `Mail.ReadWrite.Shared`, `Mail.Send.Shared`, `User.Read`, `offline_access`) and put its ID in `MS_SIGNIN_CLIENT_ID` in the secrets file.

### 9.4 Alternative: IT app secret

Use this for a connection that doesn't depend on any person's account. It takes precedence over the sign-in when set.
1. Microsoft Entra admin centre → App registrations → **New registration** ("LOTS CRM").
2. API permissions → Microsoft Graph → **Application** permissions **Mail.ReadWrite** and **Mail.Send** → **Grant admin consent**.
3. Certificates & secrets → **New client secret**.
4. Limit the app to this one mailbox:
   ```powershell
   New-DistributionGroup -Name "LOTS CRM Mailboxes" -Type Security -Members contactus@cpwi.in
   New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId "LOTS CRM Mailboxes" -AccessRight RestrictAccess -Description "LOTS CRM"
   ```
5. Put `MS_TENANT_ID`, `MS_CLIENT_ID` and `MS_CLIENT_SECRET` into the **private secrets file** and restart.

Whichever way is used, nothing is lost while the mailbox isn't connected. Every automatic email is kept in the **outbox** as *not sent*.

---

## 10. Automation engine

The **Automation** page switches each rule on or off. Everything the automation does is recorded in the **activity log**, and every email it sends in the **outbox**.

### 10.1 Rules

| Rule | What it does | Default | Needs mailbox |
| --- | --- | --- | --- |
| Categorise new emails | Keyword rules from the SOP set case type, category, sub-category and store (English and some Hinglish). Also picks up invoice/order and card numbers | On | No |
| Information complete? (emails) | Complaints and requests are checked against the SOP requirements. **Documents:** at least one attachment for new membership, add-on card, supplier, lost card and address change. **Store complaints / BDA:** the store must be named in the mail. **App complaints:** the order number. **All:** registered mobile or card no. Missing → "information required" email, status Waiting (max 2 requests). **Not in the SOP** | **Off** | Yes |
| Complete → escalate to store | A complete complaint or request with a known store is escalated automatically. Membership requests use the member's home store. **Not in the SOP** | **Off** | No (the store email needs the mailbox) |
| Assign cases & missed calls | To the agent on shift with the fewest open items | On | No |
| Acknowledge every new email | Customer gets the case number | On | Yes |
| Answer standard enquiries | Job: careers reply, then closed. Supplier: documents reply, then Waiting. New membership: documents reply, then closed. **Not in the SOP** (the SOP says to call the customer before creating the case) | **Off** | Yes |
| Email the store on escalation | Escalation template to the store contact | On | Yes |
| Store reply → Resolved | A reply from the store contact or any @cpwi.in address on an escalated case moves it to Resolved | On | Yes |
| Email the resolution to the customer | Quotes the store's reply | On | Yes |
| Queue the confirmation call | Resolved case → Outbound leads "Confirmation / resolution" | On | No |
| Chase overdue escalations | Deadline passed: reminder to the store, cc Level 2, escalation level +1, repeated every working day | On | Yes (the level still goes up without it) |

### 10.2 Scheduled jobs (checked every minute)

| Job | Default |
| --- | --- |
| Daily store follow-up email (one list per store) | 10:00 |
| Reminder to a customer in *Waiting* | after 48 hours |
| Daily report to the supervisor (cases by channel and type, closed, ROT, open by status, overdue, missed calls and callback TAT, per agent, per store) | 21:00 |

### 10.3 Agent shifts

Shifts come from the SOP: 9–6, 10–7, 11–8, 12–9, or *Off*. An agent with no shift set counts as available 9 AM – 9 PM. If nobody is on shift, the item stays unassigned and is counted on the dashboard.

> **Note:** answering standard enquiries by email without a call departs from the SOP ("call before creating a case"). Switch it off if the process owner prefers calls.

---

## 11. Members

- Add, edit, block, and record add-on cards (name, mobile, card number). Delivery goes only to the registered address.
- Customer groups and types follow the SOP (Distributor, Food Retailer, HoReCa, Catering Business, Non-food Retailer, SEP, Service, plus B2C).
- **Import CSV** reads the member master and recognises common headers (Mobile, Card No, Business Name, Owner, Email, GSTIN, Store, Address, Status…). Store names are converted to store codes. Existing members are matched by card number or mobile and **updated**, not duplicated.

---

## 12. Knowledge base, scripts and templates

All taken from the SOP. The file is `src/knowledge.js`.

- **Answers:**
  - membership documents, add-on cards, privilege card
  - stores and timings, B2C outlets (AKD and NSP)
  - return and exchange, delivery, minimum order value
  - payments and online orders, supplier registration
  - lost card, offer SMS opt-in, BDA, jobs, LCC
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

The CRM stores its data in **MySQL** when `MYSQL_HOST` and `MYSQL_DATABASE` are set in `.env`; otherwise it uses `server/data/db.json`.

**Setup on the company server (your DBA):**
```sql
CREATE DATABASE lots_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'lots_crm'@'<CRM PC IP>' IDENTIFIED BY '<strong password>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER ON lots_crm.* TO 'lots_crm'@'<CRM PC IP>';
```
- Put the details in `.env` and restart. On first start the CRM creates its tables (`server/schema.sql`) and **copies the existing `db.json` into MySQL once**, then renames the file `db.json.imported` as a backup.
- If the CRM user may not create tables, the DBA runs `server/schema.sql` once and can drop `CREATE, ALTER, INDEX` from the grant.
- The CRM PC must reach the MySQL server on port 3306 (firewall).
- Supported: MySQL 5.7+ / 8.x, MariaDB 10.5+. Tested on MySQL 8.4.

**Live database:** `lots` on the company MySQL 8.0 server. The name is lowercase, because the server is case-sensitive. The server address and login are only in the private secrets file (§3).

**Tables:** `cases`, `members`, `missed_calls`, `leads`, `calls`, `outbox`, `stores`, plus `kv` for counters, agents, shifts, automation settings and the activity log.

**Readable detail tables.** The CRM keeps these in step on every change. They are for viewing and reports only:

| Table | One row per |
| --- | --- |
| `case_timeline` | Timeline entry of a case (created, status change from → to, note, call, email, store follow-up) |
| `case_calls` | SparkTG call linked to a case (outcome, duration, agent, recording URL) |
| `case_attachments` | File received with a case |
| `member_addon_cards` | Add-on card of a member |
| `lead_log` | Call outcome logged on an outbound lead |
| `missed_call_attempts` | Call-back attempt on a missed call |
| `agents` | Agent, with SparkTG login email and shift |
| `automation_log` | Action taken by the automation engine |

**Reference tables from the SOP.** Rewritten from the CRM's code at every start, so they always match the CRM:

| Table | Contents |
| --- | --- |
| `ref_case_categories` | 78 rows: case type → category → sub-category, with `needs_documents` and the SOP `requirements` |
| `ref_customer_types` | 41 rows: customer group → customer type |
| `ref_values` | Lists: `status` (with meaning), `channel`, `caller_type`, `product_category`, `lead_type`, `lead_outcome`, `missed_reason` |

Existing data was copied into the detail tables automatically when they were added (schema version 2, stored in `kv`). Each table has real columns for searching and reports (status, phone, store, dates, agent…) and a `doc` JSON column with the full record (timeline, add-on cards, call details). Times are UTC. Example report:
```sql
SELECT store, status, COUNT(*) FROM cases GROUP BY store, status;
SELECT agent, COUNT(*), SUM(connected) FROM calls WHERE started_at >= CURDATE() GROUP BY agent;
```

**How it works:** the CRM loads the data at start and writes every change to MySQL within about 150 ms, in batches, inside a transaction. If MySQL is unreachable, changes are kept and retried every few seconds. **Stores & settings → Database** shows the last write and any error. Pending changes are written on Ctrl + C.

**Rules:**
- **Run only one CRM server against the database.** The server keeps the working copy in memory, so two servers would overwrite each other.
- Treat the tables as **read-only for reports**. Edits made directly in MySQL are overwritten, and only seen after a CRM restart.
- Back up the database with your normal MySQL backups. *Download full backup (JSON)* also still works.

### 13.2 Files and security

- Without MySQL, all data is in **`server/data/db.json`**. Email attachments are in `server/data/attachments/<case>/`.
- Saving is crash-safe: the CRM writes a temporary file, then swaps it in. If antivirus or indexing briefly locks the file on Windows, it retries and then copies over. Tested with 60 cases created at the same moment.
- **Backup:** Stores & settings → *Download full backup (JSON)*. Take one daily, or copy `server/data/` with the PC's own backup.
- `.env`, `server/data/*.json` and attachments are excluded from git.
- **No login yet.** Agents choose their name. Use the CRM only on the office network until proper logins are added.
- For several CRM servers (for example two sites) writing at the same time, the storage layer would need to become fully database-driven. Today one server serves everyone.

---

## 14. Project structure

```
server/
  index.js        HTTP API + serves the front end (Vite in dev, dist/ in production)
  db.js           JSON data store (load, crash-safe save, ID counters)
  core.js         SOP rules: statuses, TAT, case creation, email intake, member lookup, events
  calls.js        Call log from the dialer, SparkTG lookup after each call, missed-call detection, linking
  sparktg.js      SparkTG API client (call record, agents, recordings, field mapping)
  automation.js   Rules, auto-assignment, keyword categorisation, scheduled jobs, outbox
  mail.js         Microsoft 365 Graph client (read inbox, attachments, move, send)
  data/           db.json + attachments (not in git)
src/
  App.jsx         Layout, navigation, sign-in, dialer + call bar
  sparktg.jsx     SparkTG widget connection (adapted from PSRI SparkTGContext)
  taxonomy.js     Case types / categories / statuses / customer groups (from the SOP)
  knowledge.js    FAQ answers, scripts, email templates (also used by the server)
  api.js, ui.jsx  Fetch helper, shared UI helpers
  components/     Classifier, Dialer (widget, call bar, Call button), CallsCard, MemberImport
  requirements.js Request requirements + "information complete?" check (also used by the server)
  pages/          One file per screen (§5). LotsFlow.jsx + LotsFlow.css = the React Flow chart
lots-workflow.svg Process chart of the SOP
```

---

## 15. API reference

Every request sends the agent's name in the `x-agent` header; it is written to the timelines.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/meta` | Stores, agents, agent emails, widget URL, integration status |
| POST / PUT | `/api/agents`, `/api/agents/:name` | Add an agent / set their SparkTG email |
| PUT | `/api/stores/:code` | Store contact and hours |
| GET / POST | `/api/cases` | List (filters: status, channel, store, caseType, assignedTo, q, overdue) / create |
| GET / PATCH | `/api/cases/:id` | Case with history / edit fields, change status, add a note |
| POST | `/api/cases/:id/email` | Send an email from the case (needs the mailbox) |
| POST | `/api/cases/:id/calls` | Link a SparkTG call to a case |
| GET | `/api/cases/:id/attachments/:file` | Download an attachment |
| POST | `/api/calls/event` | Dialer event `{ callId, status: started \| ended, direction, phone, context }` |
| GET | `/api/calls`, `/api/calls/stats`, `/api/calls/:id` | Call log (date, agent, direction, outcome) / stats / one call with its raw record |
| GET | `/api/calls/:id/recording`, `/api/sparktg/recording/:case/:txn` | Recording, played through the server |
| GET | `/api/sparktg/call/:txnId` | Caller details for a call ID |
| GET | `/api/sparktg/test`, `/api/sparktg/status` | Connection test / recent webhook events |
| ALL | `/api/sparktg/event` | SparkTG call-event webhook (missed calls) |
| GET | `/api/lookup?q=` | Caller lookup by phone, card, email or name |
| GET / POST / PATCH | `/api/members`, `/api/members/import`, `/api/members/:id` | Members / bulk import / edit |
| GET / POST / PATCH | `/api/missed-calls` | Missed calls |
| GET / POST / PATCH | `/api/leads` | Outbound leads / call outcomes |
| POST | `/api/email-intake` | New email → case (manual form and mailbox import) |
| GET / PUT / POST | `/api/automation`, `/api/automation/run` | Automation settings, log, outbox / run checks now |
| GET | `/api/mail/test` | Mailbox connection test |
| GET | `/api/flow` | Live count for every box on the Workflow screen |
| GET | `/api/stats`, `/api/export` | Dashboard figures / full backup |

---

## 16. What has been tested

All tests used local mock servers that behave like SparkTG and Microsoft 365. **Nothing has been tested against the real SparkTG account or the real mailbox yet.**

| Tested | Result |
| --- | --- |
| Case flow: Pending → Waiting → Pending, Escalated with deadline, a rejected move leaves the case unchanged | ✅ |
| Customer email reply with `[LWS-…]` threads onto the case, Waiting → Pending | ✅ |
| Missed call → call-back case → missed call marked called back; case closed on the call (ROT) | ✅ |
| SparkTG call linking with retry (record not ready on the first try), recording streamed through the server | ✅ |
| Member lookup from `+91…`, `91…`, `0…` numbers, add-on holder's number, card number | ✅ |
| Caller number fetched from a SparkTG call ID | ✅ |
| Dialer call log: inbound answered and linked to its case | ✅ |
| Inbound not answered → missed call created and assigned | ✅ |
| Calling back a missed number with no context → auto-linked, missed call marked *Called back* | ✅ |
| Unanswered lead call → lead *Not reachable*; stats per agent | ✅ |
| Email automation (mock mailbox): job enquiry auto-answered and closed; complaint categorised, store detected, member matched from phone in the body, assigned, acknowledged, attachment saved | ✅ |
| Escalation email → store replies → Resolved → resolution email → confirmation lead → *Confirmed resolved* closes the case | ✅ |
| Scheduled jobs: overdue reminder (cc Level 2, level +1), waiting reminder, daily report, each sent once only | ✅ |
| 60 cases created at the same moment, all saved | ✅ |
| Information complete?: complaint without store or mobile → info-required email, Waiting. Reply naming the store and mobile → checked again → escalated to that store | ✅ |
| Add-on card request without documents → documents requested. With attachments → escalated to the member's home store + acknowledgement | ✅ |
| Workflow screen live counts (`/api/flow`) and page load | ✅ |
| SparkTG API with the real account: login, agent list, 5 real call records read correctly (number, direction, ANSWER/NOANSWER, time, agent, recording) | ✅ |
| **SparkTG widget in a real browser** (SSO login, show_dialer / hide_dialer, click-to-call) | ⏳ Needs agents' SparkTG emails and a live test call |
| **Workflow screen visual check in a browser** | ⏳ Built and loads; not yet looked at on screen |

---

## 17. Known limitations and open items

**Calls (current focus)**
- [ ] Set `SPARKTG_WIDGET_URL` and the API credentials, then do a live test call in and out (§7.5).
- [x] SparkTG record fields confirmed on real calls: `customerNumber`, `callType` (INBOUND/OUTBOUND), `disposition` (`ANSWER` / `NOANSWER`), `duration` (includes ringing), `time`, `receivedBy` (agent), `recording` (.wav URL). Average talk time counts answered calls only.
- [ ] Calls that never reach any agent's dialer (all logged out, after hours) aren't captured without SparkTG's call-event webhook. Ask SparkTG whether the account has one, or a call-history (CDR) API.
- [ ] Enter every agent's SparkTG login email.
- Note for the PSRI project: its `SparkTGContext` message listener doesn't list `agentEmail` in its `useEffect` dependencies, so it keeps whichever email was set when it first ran. The CRM version fixes this; worth checking in PSRI.

**Email (on hold)**
- [ ] IT admin creates the Microsoft 365 app registration (§9.2) and provides the tenant ID, client ID and secret.

**General**
- [ ] Import the member master (§11).
- [ ] Fill in the store contacts, Level 2 email, supervisor email and agent shifts.
- [ ] Proper logins (passwords / Microsoft sign-in) before the CRM is reachable outside the office network.
- [ ] Email categorisation is keyword-based; agents correct it on the case. An AI-based categoriser could be added later.
- [ ] Move from the JSON file to a database when volume grows.

---

## 18. SOP questions (settled)

Both contradictions in the SOP have been settled. The knowledge base no longer shows any SOP conflict.

- ~~Add-on cards~~ **Decided 30 Sep 2026: up to 4 add-on cards per member.** Enforced in the Members screen and by the server; knowledge base, workflow chart and requirements updated.
- ~~Delivery charges~~ **Decided 30 Sep 2026: follow the SOP Delivery section.** No delivery charge on ₹9,000+. Handling fee ₹69 GNI / ₹99 other stores, waived for the month after more than 8 orders. Shipping charges by article. Business licence address only, within 25 km. TAT 2–3 working days. The FAQ's "no delivery charges" line is not used.

---

## 19. Work log

| Step | What was built |
| --- | --- |
| 1 | Workflow chart of the SOP (`lots-workflow.svg`) |
| 2 | The CRM: React + Node, case taxonomy from the SOP, New case, Email inbox (manual), Missed calls, All cases, Case page, Store follow-ups, Outbound leads, Members, Knowledge base, Settings |
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
