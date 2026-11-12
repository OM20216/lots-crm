# LOTS CRM – Daily work log

What was done on the CRM each day. The README's §19 has the work log by feature.

---

## 12 November 2026

### Remove the paste-to-auto-fill panel (user: "remove this section")
- The "Paste details to auto-fill" block (textarea, Parse & fill, Clear) is gone from the Creating / Editing Contact form, with its two state variables and `src/contactParse.js` (nothing else used it; it stays in git history). The seven Vtiger sections and every field are unchanged.

### Watchdog for both services (user: "do 2" - restart the service and tell someone when it is down)
- **Why:** the two runner loops (`run-crm.ps1`, `run-support.ps1`) only cover a crashed Node process. They do not cover a service that is still listening but not answering (MySQL unreachable, hung), a runner loop that has died, or nobody noticing either.
- `scripts/watchdog.ps1` (task "LOTS CRM Watchdog", starts at log-on and again every 5 minutes): every 60 s checks `:4000/api/health` and `:4100/api/health`; after 3 failed checks in a row it restarts that service through its own script (so a stop still waits for pending database writes). A slow start is retried once, because loading 3.2 lakh contacts can stall the event loop for seconds.
- Writes `~/.lots-crm/watchdog-status.json` and `logs/watchdog.log`, and raises a Windows notification when it restarts something. The event history survives a watchdog restart.
- **Status bar in the CRM** (`src/components/HealthBanner.jsx`, fed by the watchdog data added to `/api/health`): quiet when all is well; red while the support service or the database write is failing; amber after an automatic restart ("Everything is working now - no action needed"). Dismissable per event.
- **Tested live:** support service stopped at 12:50 -> bar red at 12:51 ("not answering since 12:51 PM") -> restarted automatically at 12:54 with 3 tokens intact -> bar amber ("restarted automatically at 12:55 PM") -> dismissed. Both services up; `watchdog.ps1 status` shows the history.

### Menu links: added, then removed again (user: "do 4", then "remove the sidebar options that you added now")
- Follow-ups, Missed calls, Leads and Knowledge base were added to the sidebar, then taken out again the same day at the user's request. The menu is back to its nine items; every one of those four pages still opens from its old place (a Dashboard tile, the top-bar missed-calls popup, or by typing the address) and none of them was changed.
- Automation, Case workflows, Picklists and Dependencies stay under Admin. The sidebar keeps the scroll it gained, so a short window never hides the last item.

### Watchdog: two guards after a restart of the CRM (same day)
- A manual `crm-service.ps1 restart` at 13:09 was still building when the watchdog saw the CRM down at 13:10 and started it too, so two restarts ran on top of each other and the service took five minutes to come back. Nothing was lost (0 pending writes), but the alert was noise.
- **Guard 1:** while `crm-service.ps1` / `support-service.ps1` is running, the watchdog leaves the restart to it.
- **Guard 2:** a process that started less than 8 minutes ago (CRM) or 2 minutes ago (support) is treated as "still loading", not as down - a cold start reads 3.2 lakh contacts from MySQL.
- MySQL itself timed out on this PC around 13:10 (`connect ETIMEDOUT`, `read ECONNRESET` in `crm-error.log`); it was reachable again a few minutes later and the full export/table check was not needed.

---

## 28 October 2026

### Process documentation (user: "process documentation of each process ... the whole documentation")
- **One complete document**, written from the CRM as it works today, with email left out (the mailbox is not connected). It replaces the agents' earlier PDF guide and two earlier drafts.
  - Shared doc: "LOTS CRM: complete process documentation" (claude.ai, private until shared from its Share menu).
  - In the project: `docs/process-documentation.md`, the flow charts in `docs/flows/` and the PDF `docs/LOTS CRM process documentation.pdf` (23 pages; also in the user's Downloads).
- **16 sections:** overview, sign-in, contacts and number rules, calls (incoming, missed-call callback, outgoing, Call logs), how cases are created (every route + the Log new case steps), case statuses, daily case work, escalation, finishing a case, outbound calling lists, imports, reports, support, what the CRM does automatically, admin set-up, daily rhythm.
- **17 horizontal process flows** (Start → steps → Stop, user's example): one per process, three for calls.
- **Section 16, every escalation route, generated from the CRM's matrices:**
  - 58 store routes, the same for all 6 stores: App 17, E-commerce 16, BDA 14, Store related 11;
  - 12 HO routes and 8 other paths (home store, care desk, re-escalation, blocked, wrong store, level corrected by an admin, crisis contacts, after Level 2);
  - TAT per level (FTR / L1 / L2): usually 1 / 2 / 3 days; Store Delivery related and Legal 4 h / 1 day / 2 days; all Product Quality routes 1 / 2 / 2 days;
  - named SPOCs and email addresses are left out of the document (they stay in the CRM).
- The doc's own PDF export draws only 8 charts, so the PDF is built from the same text and charts with headless Chrome.
- **Gaps found while writing it:** Outbound leads has no link anywhere since its Dashboard tile was removed (agents open /leads); the Knowledge base page has no menu link.

### Report / export check (user: "is the report system working and saving cases in Excel and CSV")
- **Correct:** CSV and Excel exports of 1–28 Oct held the same 1,597 cases in the same order, 32 columns, no broken rows; the date range and the status / channel filters work.
- **Crash:** an export of all cases (2018 to now, about 1.9 lakh) took the live CRM down. The CSV was written without waiting for the download, and the Excel file was built whole in memory, with about 2 GB free on the PC. The service did not restart by itself (task "Ready"). It was started again from the committed code; nothing was lost (pending 0).
- **Fix, tested, not live yet** (`server/index.js` /api/cases/export, `src/pages/Reports.jsx`):
  - CSV is written in parts, waiting for the download, so any range works: 2 lakh cases in 12 s with memory flat, and the CRM keeps answering;
  - Excel is streamed and capped at 50,000 cases (a full Excel export still added about 0.9 GB); above that the server answers 413 and the Report page greys out Download Excel, pointing to CSV, which opens in Excel too;
  - dates are India time: the From / To filter, and createdAt / updatedAt / dueAt / closedAt in the file ("2026-10-28 15:42"); a case at 01:30 on 2 Oct counts on 2 Oct;
  - a case without updatedAt no longer breaks the sort.
  - Tested on a test copy with 2 lakh cases: full CSV, full Excel refused, 1-year Excel (23,141 cases, 7 s), the Report page.
- **Until it is live:** do not export very long ranges (years) from Report or Cases.

### Built, not live (in git stash "wip: vtiger link + nightly sync + contact order")
- **Contact order:** contacts are loaded oldest first by created date, so the Contacts list's "newest" are right after a restart (they were sorted as text: M-99999 after M-300536).
- **Link imported cases to contacts:** a job for the 53,600 Vtiger cases with no contact. It looks their Vtiger contacts up (100 per request) and matches by the same Vtiger contact, a mobile only one contact has, the card no., then the email; it notes each link on the case. Tested with stand-in data (10 checks).
- **Nightly Vtiger sync** at 02:00 (on / off and time on both Vtiger panels): new contacts, then new cases, then links. The full test against Vtiger was stopped before it finished.


### Dashboard: five tiles removed (user: "i want to remove Missed calls to call back, Pending emails, Outbound leads due, Unassigned open cases, Automated actions today")
- **Removed** from *Needs attention now*: Missed calls to call back, Pending emails, Outbound leads due, Unassigned open cases, Automated actions today.
- **Kept:** Escalations overdue, Store follow-ups due today, Store replies to check, the open cases by status tiles, and the Today / Escalated by store / Top open categories lists.
- The counts are still made by the server and still used on their own pages (Missed calls, Email Inbox, Leads, All cases, Automation); only the dashboard tiles are gone. README §5 and §19 updated; built and deployed to the live CRM.

### Report page (the menu's Report item opened a blank page)
- **Why:** the left menu linked to `/reports`, but no page or route existed (only the Report tab inside Follow-ups). Clicking it showed a blank screen.
- **New page `/reports`:**
  - date range 7 days / 30 days / 90 days / 1 year;
  - cases created and closed per day (per month for the year view), as CSS bars — no chart library;
  - totals: created, closed (with resolved-on-call ROT), open now, escalated open, imported from Vtiger with linked / not linked, emails sent;
  - breakdowns by channel, status, case type and store; top open categories;
  - agents: open now, escalated, created and closed in the range;
  - escalations (open, overdue, follow-up due), calls (total, connected, missed still open), imported cases still open;
  - **Export CSV** of the same date range (the case export now takes `from` / `to`).
- **Server:** new `GET /api/reports?days=N`; one pass over all cases, so the browser gets numbers, not 1.9 lakh records. `filterCases` also takes `from` / `to` for the export.
- **Dashboard:** added a **Last 14 days** chart and **By channel** card, from the same endpoint.
- **Tested:** test copy (600 cases) — payload shape, empty ranges, dated export (379 bytes), Report page and dashboard in the browser; corrected a `req`/`query` bug the test caught before deploy.

### Deploy: surrogate-pair MySQL write bug, Vtiger case import resumed, Report page live
- **What broke the restart:** after the Vtiger case import reached about 158,000 cases, one Vtiger record carried a lone UTF-16 surrogate (half an emoji) in a text field. JSON.stringify writes that as \udXXX, and MySQL rejects the whole batch for the cases.doc JSON column. Because the store retries the same batch, every later save waited behind it and the CRM never answered /api/health (the restart looked dead).
- **Fix:** server/mysql-store.js now replaces any lone surrogate with U+FFFD **before** the value is encoded (a JSON.stringify replacer cleans every string in the record, and the column helpers clean the readable columns). One bad character can no longer block a write. scripts/crm-service.ps1 now waits up to 10 minutes for the health check, since loading ~1.9 lakh cases and ~3.2 lakh contacts takes several minutes.
- **Import resumed:** the job state (last Vtiger record read) survived, so the import continued from 158,000 instead of re-reading. It writes through cleanly now (no new errors in crm-error.log). Final count: 192,396 cases added (192,403 in the CRM with 7 logged here), 138,796 linked to contacts.
- **Report page removed at the user's request** ("the whole interface of report is wrong"). The page, its route and nav entry are gone; the dashboard 14-day trend and channel mix (and /api/reports) remain.
- **Removed:** the five dashboard tiles the user asked to drop earlier stay removed.
- **Notes:** server/index.js ilterCases now takes rom/	o; case export streams CSV with those dates.

## 26 October 2026

### CSV import: no duplicates, every field filled, earlier cases attached (user: "should not allow duplicacy … fill all the options and cases automatically of every contact")
- **No duplicates:** a contact already in the CRM is updated, never added again. It is recognised by the same Vtiger contact, the same membership card no., or, without a card no., the same mobile.
- **Repeats in one file:** the same contact twice in one file becomes one contact. The first row is kept, and later rows only fill in empty fields, so they never overwrite. (A test with two people under one membership ID showed the older version let the second overwrite the first person's mobile.)
- **Preview before saving:** the file is checked against the CRM without saving (`POST /api/members/import?dryRun=1`), in parts. It shows **N new · N already in the CRM (updated) · N skipped (number / card no. of another contact) · N without a number**, plus the rows that will be skipped. The import button says exactly that ("Import: 4 new, 1 updated").
- **Every field:** any CSV laid out like the contact form (Vtiger's field names: First / Last Name, or 5+ form columns) fills every field of the contact, not only Vtiger exports.
- **Earlier cases attached:** cases logged before the contact existed (no contact picked) are attached when the contact is imported, created or edited. A case is attached when its mobile (only if no other contact shares it), email or card no. matches, with a note on the case timeline. Count shown after the import.
- **Tested on a test copy** with a CSV covering: a repeat row, an existing contact, the same membership ID for two people, a shared mobile with its own card, a "?????" row and 3 earlier cases.
  - First import: 4 added, 1 updated, 3 repeats merged, 1 left out, 3 cases attached, 5 contacts in total.
  - The same file again: 0 added, 5 updated.
  - The preview equals the import (API). Index test 17/17.

### SOP flow chart: "Missed / Abandoned Call" → "Missed / Disconnected Call" (user's request)
- **Changed:** the flow chart step and its channel option, plus the Settings text on the call-event webhook, now say "disconnected", matching Type of call (renamed 24 Oct).
- **Kept:** the Support help article still answers to "abandoned", and now also to "disconnected".

### Shared mobiles allowed for contacts with their own membership ID (user: "the duplicate number is fine; if it has a unique register id add them also")
- **New rule:** a mobile can belong to several contacts when each has its **own membership card no.**
  - Card numbers stay unique.
  - A contact without a card no. still cannot take a number another contact has.
  - Until now one mobile belonged to one contact only.
- **Contact index:** keeps every holder of a mobile (`core.membersByPhone`). The save check (`phoneConflict`) lets a contact with a card no. share a mobile.
- **Caller lookup:**
  - a full mobile shared by several contacts gives no automatic match; all of them are listed;
  - Log new case says "N contacts share this mobile … click the caller to fill";
  - the SparkTG caller pop-up lists them, instead of "Not a registered member";
  - a card no. or membership ID still identifies exactly one contact.
- **Contact form:** a shared number is a note ("Also used by …; allowed: this contact has its own membership card no."), not an error, when the contact has a card no.
- **Import:**
  - a row with its own card no. is matched to an existing contact only by Vtiger id or card no., never by mobile, so it is added as its own contact;
  - two different Vtiger contacts are still never merged;
  - rows whose card no. belongs to another contact stay skipped.
- **Live:** the Vtiger duplicates that have a membership ID (13,371 of 19,382) plus the 3 unexplained ones are read by Contact Id (about 135 Vtiger requests) and imported. **Partly done:** about 6,000 were added (newest M-300536) before Vtiger refused requests ("TOO_MANY_REQUESTS", even the login), so the API allowance was used up for the day. Running it again finishes it: ones already added are updated by their Vtiger id, not doubled.
- **Tested:**
  - index: 17 checks (5 new);
  - test copy: 7 API checks (3 contacts on one mobile; no-card and repeated-card rows skipped; lookup lists all 3; card picks one; re-import updates; form rules);
  - browser: the pick list in Log new case.

## 24 October 2026

### Contacts: list of cards + contact details on the right (user's screenshot from another CRM)
- **Left:** contact cards with the initials, name, mobile, contact-type pill and business, plus round Call (SparkTG dialer), Email and WhatsApp buttons.
- **Right:** the tapped contact opens there; it is kept in the address (`?c=M-00123`).
  - Header with Edit (the contact form as before), and Call / Email / WhatsApp / Log case buttons.
  - The LOTS fields: mobiles, email, business, card no., contact ID and Vtiger id, contact type, status, Segment1 / 2, registered store, GSTIN, licence, source, joining date, assigned to, address, add-on members.
- **Communication history:** calls (incoming / outgoing, talk time, recording to play), missed calls, cases and emails the CRM sent about them, newest first.
  - Matched by the contact and every mobile / email on it, including add-on holders.
  - New endpoint: `GET /api/members/:id/history`.
- **My additions, not in the SOP:**
  - WhatsApp is a wa.me link (WhatsApp Web / app), not an integration;
  - Email is a mailto link until the mailbox is connected;
  - SMS is left out (not possible, decided 16 Oct).
- **Speed:** a contact by ID used to be found by reading all 2.95 lakh contacts (0.5–0.85 s); it now comes from the contact index (0.004 s). This applies to the contact page, edits, the history and automation.
- Tested: 10 browser checks on a test copy (cards, tap to open, history with recording, empty history, buttons, Edit, phone width); live lookups checked.

### Excel list of the Vtiger contacts not in the CRM
- `DownloadsVtiger contacts not imported - 24-10-2026.xlsx`, made by reading Vtiger again (52 min, read-only) and comparing it with the CRM.
- **Duplicates** (19,382): each with the CRM contact (and Vtiger contact) that already holds the number. 3 have no holder; most likely they were added in Vtiger after the import (Vtiger went from 3,35,064 to 3,35,067). Contacts → Import → "Get new contacts from Vtiger" (new button: after a finished import it reads only the contacts added in Vtiger since) brings them in.
- **No mobile or card** (21,136): as in Vtiger.

### "Abandoned Call" renamed "Disconnected Call" (user's request)
- Log new case → Type of call is now **Disconnected Call** / Inbound / Outbound (LOTS's Vtiger form says Abandoned Call). A missed-call callback is saved as Disconnected Call. No saved case had the old name. The SOP flow chart's "Missed / Abandoned Call" step is unchanged.

### Call logs (user: "rename it as call logs ... all the history of calls with recorded call")
- **Menu:** the Calls button is back in the left menu (it had dropped out when the menu was shortened), renamed **Call logs**; the page title is Call logs.
- **Whole history:** the page shows all calls by default (it showed one day). It has quick ranges (Today / Last 7 days / Last 30 days / All), From / To dates and a search by number, name, agent or case no.
- **Filters and list:** a "With recording" filter, 200 calls at a time with **Load more**, newest first, the date on every row, and the tiles / by-agent counts for the chosen range.
- **Recordings:** each one plays in the list and has **Download** ("call <number> <date>.mp3"), streamed through the server so the SparkTG login stays private.
- **What the history contains:** every call taken or made through the CRM dialer or reported by SparkTG's call event (8 so far; agents have not used the dialer yet).
- **SparkTG's API cannot list older calls:** `agent-recent-calls` needs a call id and returns only that call; without one it answers HTTP 400, also with date or page parameters. Calls from before the CRM need SparkTG's call report (export, or a report API from SparkTG).
- Tested with 260 made-up calls on a test copy (7 browser checks).

### Contacts imported straight from Vtiger (3,35,061 contacts)
- **Credentials:** the user put the Vtiger URL, username and access key in a Notepad file. I copied them into the private secrets file (`~/.lots-crm/secrets.env`) without showing them.
  - At first the access-key line held the login email; the user then put in the real 16-character key.
  - The Notepad copy in Documents should be deleted.
- **Vtiger's limits and speed:** login checked. Vtiger has 3,35,061 contacts and 110 fields, with the same labels as the CSV columns.
  - It returns at most 200 records per query.
  - Paging by position gets slow deep in the list (about 5 s per page); reading onward from the last record id stays at about 0.6 s.
- **Server job** (`server/vtiger.js`):
  - it logs in, reads 200 at a time onward from the last record, and converts each with the same code as the CSV import (now shared: `src/contactFields.js`, `src/vtigerContacts.js`);
  - it saves every 2,000 through the same import function, and only then moves its "continue from here" point;
  - Stop / Continue / Import again from the start; its state survives a restart; start / stop are admin-only.
- **Duplicates in Vtiger:** a test showed 57 of the first 4,200 Vtiger contacts share a mobile with an earlier one; they would have overwritten it. Now a second Vtiger contact with a taken mobile or card is skipped and listed, not merged.
- **Import function:** it now uses the contact index, including a Vtiger Contact Id lookup, instead of building its own index per batch.
- **Panel:** Contacts → Import CSV shows **Import from Vtiger**, with a progress bar, counts, the skipped contacts and Stop / Continue.
- **Tested on the test copy against the real Vtiger (read-only):**
  - 4,200 contacts read in 37 s, stopped, continued to 8,400;
  - every contact counted once, and nothing read was lost at a stop;
  - an imported contact is found by its mobile and keeps its Vtiger fields.
  - The test data was deleted afterwards.
- **Started on the live CRM** at the user's request ("now import the contact").
- **Result (14:21, about an hour):** 3,35,065 Vtiger contacts read.
  - **2,94,533 added**; 10 were already in the CRM and are now linked;
  - 19,382 skipped as duplicates in Vtiger (mobile or card already held by an earlier contact);
  - 21,140 left out (no mobile or card no.).
  - Searches stay instant: by mobile 0.004 s, by name 0.006 s.
- **Memory during the import:** at 60,000 contacts the CRM used 1.4 GB, against Node's 2.2 GB limit on this PC.
  - The cause: a 10-minute safety copy of every new record (for changes made outside the CRM's tracking).
  - Imported contacts no longer get it, so memory was 0.6–0.7 GB at 1 lakh contacts and 1.6 GB at the end.
  - The import was stopped, the CRM restarted and the import continued from the same contact, with nothing lost or doubled.
- **Memory limit raised to 4 GB** (`scripts/run-crm.ps1`); the PC has 12 GB. The CRM uses about 1.6 GB with 2.95 lakh contacts.
- **Start-up from 8 minutes to 60 seconds:** the MySQL database is on a remote server, and the 2.95 lakh contact records are 508 MB. With MySQL protocol compression on (`compress: true`) they load in about 80 s instead of about 6 minutes.
- **Excel list of the Vtiger contacts not in the CRM** (duplicates with who holds the number, and those without a number): `DownloadsVtiger contacts not imported - 24-10-2026.xlsx`.

### Vtiger contacts import, ready for 3 lakh contacts
The user exported Contacts from Vtiger (`Contacts_24-10-2026_1158.csv`). That file holds 100 contacts: Vtiger would not export all 3 lakh at once. The importer, the server and the caller search were changed so that lakhs of contacts work.
- **Vtiger CSV recognised:**
  - all its fields go into the contact form, which already has Vtiger's field names;
  - `+91` mobiles become 10 digits;
  - `?????` placeholders (24 "New Customer Lead" rows with no number) are left out and counted;
  - the add-on member becomes an add-on card holder;
  - an updated mobile / email becomes the main one, and the old one is kept;
  - the Vtiger Contact Id is kept, so a re-import updates instead of doubling;
  - only filled fields are stored (11 instead of 68 per contact).
- **Batches:** the browser sends 2,000 contacts at a time with a progress bar. If the import stops, running the same file again continues it.
- **Server import:** it no longer compares every row with every contact (that would have taken hours for 3 lakh). Numbers and cards are checked against an index; the rules are unchanged (one mobile / card, one person).
- **Contact index for the caller search** (mobile, card, ID, email, name):
  - it is built at start-up, and only changed contacts are re-indexed on MySQL;
  - tested with 3 lakh contacts: 0.03 s per search (was 0.4–0.8 s), 1,000 mobile look-ups in 2 ms, about 350 MB of memory;
  - the duplicate-number check on saving a contact takes 0.006 s.
- **Tested on test copies:**
  - the real file imports 76 contacts and leaves out 24, and importing it again updates the 76;
  - an imported contact opens in the form;
  - the index after edits, new contacts and add-ons passes 12 checks;
  - the search box (14) and call details (11) browser checks pass.
- **Not yet done:** the remaining 2,99,900 contacts. They can be exported from Vtiger in parts (filters on Created Time) and imported one after another, or read through the Vtiger API with an access key.

## 23 October 2026

### Log new case: call details and contact buttons (as on LOTS's Vtiger case form)
- **Channel cards and greeting line removed** (user's request). ① now has a **Channel** dropdown (Call / Email, as on the Vtiger form). For a call, **Type of call** says which: Inbound → Inbound call, Outbound → Outbound call, Abandoned Call → Missed call callback. Email shows the sender email and subject as before. The closing line ("Is there anything else…") stays.
- **Under ① How did they contact us?** (calls only), a **Call details** block:
  - **Type of call** (Abandoned Call / Inbound / Outbound), required. It goes with the channel cards both ways: Inbound call ↔ Inbound, Outbound call ↔ Outbound, Missed call callback ↔ Abandoned Call.
  - **Called number**, with **Same as contact's mobile**.
  - **Call transaction ID** (the SparkTG call ID, moved up from ② Who is it?).
  - "Call For" left out, as asked.
- **Member card:** **Edit**, **+ Add Another Contact** (both open the contact form in a new tab, so the case being written isn't lost) and **Change** (not this member).
- New case fields `callType` and `calledNumber`, shown and editable on the case page.
- **Also:** the Identify caller panel was moved between ① and ② and then **moved back to the top** (user's request), and Admin is pinned to the bottom of the left menu. Garbled characters from a wrong file encoding in `App.jsx` ("Â·", "â€“") were fixed.
- Tested in Chrome on a test copy: 11 checks (fields, both-way channel link, no Call For, same-as-mobile, contact buttons, saved case and case page).
- **One search box in Identify caller** (user: "search all the things like phone no, email, name, membership ID"). The mobile and card boxes became one box that searches mobiles (owner, alternate, add-on), card numbers (incl. add-on cards), membership ID (M-00123), name, business name and email:
  - an exact mobile, card no., membership ID or email fills the caller in (an add-on card or mobile fills in the add-on holder);
  - a name or business name lists *Matching members* to click;
  - an unknown 10-digit mobile or email is copied onto the case, and "Not a registered member … create the contact" shows as you type (before, only after pressing Search);
  - **Mobile** and **Card no.** are now fields in ② Who is it?;
  - a screen-pop / live call number still lands in the box and fills the caller in.
- Tested on a test copy: 8 server searches and 14 Chrome checks, and the call-details test (11) again.
- **① How did they contact us? uses the full width** (user: "justify this space"): Channel, Type of call, Called number and Call transaction ID on one row of four equal columns (two per row on narrow screens); for Email, Channel, Sender email and Email subject fill the row.
- **All cases:** the search box moved into the page header, beside **Export CSV** (user's request); the five filters (status, channel, type, store, agent) now share the full width of their row equally, wrapping on narrow screens.

### Open points settled by the documents (user: "keep these according to the docs")
- Checked against the SOP ("Lots Process Documents 2026") and the case master.
- **Customer survey:** the SOP only says "collecting feedback to improve our service". The 5 rating questions the CRM had added (overall, store, customer care, would-recommend) are removed: the survey call records the customer's feedback, shown in **Survey feedback** and on the case timeline. Old survey records keep their comments.
- **Kept, because the documents say so:**
  - the call outcome labels (the SOP's own words for follow-up and confirmation calls);
  - the 7 working days for refunds and new suppliers (the SOP's FAQ);
  - "Others" = Not Relevent or Spam only (the case master).
- **Not in the documents (stay with LOTS):** calling lists, current offers, extra email templates, the Vtiger lists (contact type, source, cities), and the SparkTG service for 1860-123-5687.
- Tested on a test copy: feedback saved and listed; rating fields sent anyway are dropped.

### Every escalation matrix checked end-to-end
- Checked the HO matrix (12 rows) and the store matrix (6 stores × 58 rows = 348) against the case master (228 paths), the routing code and each other.
- **Found and fixed:** the HO row “Marketing Related” was written with a capital R, while the case master (and every saved case, after the 17 Oct rename) says “Marketing related”. The row could never match a case, so marketing enquiries fell through to the Marketing team instead of the matrix SPOCs. `src/escalationMatrix.js` now uses the case-master spelling; all 12 HO rows are reachable.
- **Routing:** 93 routes over the 58 store rows; 22 marked `confirmed` (the six store-request kinds, app/website delivery → not dispatched, BDA cancelled / delayed → not dispatched, member NR / membership request → member complaint, and the “Others” fallbacks) — exactly the routes listed in the README. 0 routes are unreachable, 0 case paths are ambiguous (no two rows win at the same specificity), and every path of every store-matrix category (app, e-commerce, BDA, store, membership, NR, requests) reaches a row. Only the app “Product Damage” row has no case category, as documented.
- **Coverage:** the 26 paths without a store row are the ones that by design use the HO matrix (Inquiry) or the team escalation (General Query, Festive Gifting, New Member, New Supplier without a supplier type).
- **Data:** all 348 rows have the three stages with a non-empty To, a valid `@cpwi.in` address and a TAT; no duplicated addresses; every store mailbox is the row’s own store (no st101 left in 105/106); the 74 rows LOTS confirmed (DH 105 × 58, GNI Ecommerce × 16) carry the provenance note and are identical to NSP 101’s rows with only the store mailbox swapped (274 workbook rows + 58 + 16 = 348); delivery First Time Resolution is 4 hours and the quality Level 2 is 2 days, as in the sheet.
- **Data note:** the HO Marketing row repeats `navni.jain@cpwi.in` in Cc although it is already in To (as written in the sheet); the CRM already removes it when sending (`cleanList`).
- README: the “every category reaches a row” sentence now says which categories use the HO / team rows, and the two stale “to confirm” mentions for DH 105 / GNI Ecommerce are gone.

### LOTS confirmed the store matrix rows and routes
- LOTS confirmed, as they are: the DH 105 rows and GNI Ecommerce rows (made from NSP 101's rows with the store's own mailboxes) and every route the sheet doesn't state directly.
- The ⚠ “to confirm” flags are gone. Those 74 rows now carry a ⓘ note on where they came from (“confirmed by LOTS, 23 Oct 2026”), and the routes are marked `confirmed` in `src/storeMatrix.js`. `server/storeMatrix.json` was rebuilt from the same workbook; only those flags changed.
- LOTS also confirmed the HO Level 2 TAT (23 Oct 2026): **3 working days on every row except Legal (2, as its sheet says)** (Admin and Marketing were empty → 3). The three ⚠ flags on the HO matrix are gone, replaced by a ⓘ note.
- Still open with LOTS: “Others” = spam only.

### “Product Damage” as a category without sub-category (user's decision)
- The App tab's “Product Damage” row had no case-master category. Now **Issues or Complaint › Product Damage** is a category with **no sub-category** (the sub-category field is disabled for it, no sub-category 2). It goes to the store's App-tab Product Damage row (e.g. st103.delivery), needs the store and the order no. like app complaints, and is one of the AI reader's 229 paths.
- Store matrix back to 348 rows (6 stores × 58).
- Tested: store matrix 32 checks (incl. a Product Damage case at AKD → s103.app-damage → st103.delivery), AI reader 9 checks, and in Chrome: the category is in the list, the sub-category is disabled (“None for this category”), no sub-category 2.

### Live link to the matrix Excel: Refresh now instead of automatic checks (user's request)
- The "check every N min" box and the automatic re-read are gone. The linked Excel is read once when it is linked, and then only when someone presses **↻ Refresh now** ("No changes" when nothing changed). The "last read" time is shown.

### Unique card numbers
- A membership card or add-on card number now belongs to one person only, like mobile numbers.
- Refused when the same card is on another contact (main or add-on card) or entered twice on one contact.
- The contact form shows the error at the card field; the import skips the clashing row and says why.
- The live data has no duplicate cards (checked, read-only).

### AI email reader
- `server/aiReader.js` with the official `@anthropic-ai/sdk`: Claude (`claude-opus-5-5`, low effort, server-side fallback on a refusal) reads each new email.
- It returns JSON limited to the 228 case-master paths (it can't invent a category), the store, and the order / card / phone numbers written in the mail. A one-line summary goes on the timeline.
- The email is treated as data; instructions inside it are ignored.
- On only when `ANTHROPIC_API_KEY` is in the private secrets file and "AI email reader" is on (Automation). With an API error, no key or an unusable answer, the keyword rules are used as before.
- Tested against a fake Anthropic API: 9 checks (request shape, categorised case, numbers, timeline, API error → rules, invalid answer → rules, switched off → no call).

### The CRM in the background
- This Windows account has no administrator rights, so instead of a classic Windows service, the CRM runs as a **scheduled task "LOTS CRM"** under the user: it starts at log-on, runs hidden in production mode, and `scripts/run-crm.ps1` restarts it within 10 seconds if it stops.
- `scripts/crm-service.ps1 install | status | restart | stop | start | uninstall`. Stop and restart wait until there are no pending database writes (new open `/api/health`); restart rebuilds the screens first.

### Escalation flow for the store matrix
- Admin → Escalation flow: a switch between the HO matrix and the **store matrix** (store, tab and row pickers). The boxes show that row's people and TATs, and the live counts. The start box lists the case categories that go to the row.

### Sign-in with passwords and roles
- `server/auth.js`, **Admin → Users and sign-in**, **My password** in the top bar.
- **Off until an admin switches it on**, so the live CRM keeps working as before.
- Roles: **agent** (daily work) and **admin** (setup pages, matrices, automation, users, backup, answering support tokens, level corrections).
- **Safety:**
  - scrypt password hashes;
  - a signed HttpOnly session cookie (12 h), with the key in the private folder;
  - 5 wrong passwords → 10 minutes' wait;
  - a new password ends the other sessions;
  - the last admin can't be switched off;
  - the timeline uses the signed-in name;
  - `CRM_AUTH_OFF=1` in the secrets file is the emergency switch.
- Health check and SparkTG webhook stay open.
- **Tested on a test copy:**
  - 26 API checks (roles, 401/403, wrong passwords, session ends, last-admin guard, on / off);
  - browser checks (sign-in page, wrong password, agent without Admin, sign out, admin, Users page, flow chart for a store row);
  - the earlier suites still pass: store matrix 31, email layout and support 18, support email 11, Teams card.

---

## 22 October 2026

### Teams card per escalation email (added by the user, checked)
- The user added a Teams card for every escalation email (First Time Resolution, Level 1 / 2, overdue reminder): case facts, To / Cc / subject and the full email, sent once emails really go out (with Teams preview on, the preview card already shows them).
- Found in testing: with no mailbox the email was "not sent", but the card still read as if it had gone out. Fixed: the card now says **✅ Escalation email sent** or **⚠ NOT sent — reason**.
- Tested on a test copy with a fake Teams channel: no mailbox → 2 cards "NOT sent — Mailbox not connected"; fake Microsoft 365 mailbox → 2 emails sent, 2 cards "sent".
- Note: Teams cards can't contain HTML or JavaScript. The card is an Adaptive Card (JSON) built in JavaScript, which is what Teams accepts.
- Committed and merged (feature/teams-escalation-card).

### Store escalation matrix finished
- The workbook was downloaded through the share link (17 Oct). Its store tabs were read into `server/storeMatrix.json` with `server/buildStoreMatrix.js`: 348 rows, 6 stores × 58 (Lots-App 17, Ecommerce 16, BDA 14, Store related 11).
- DH 105 (no tabs) and GNI 106 Ecommerce (no tab) were made from NSP 101 with the store's own st105 / st106 mailboxes, marked "to confirm with LOTS".
- Text cleaned when read:
  - links and rich text in cells (read as the text shown);
  - `St10x.pbm.in` → `st10x.pbm@cpwi.in`;
  - cut-off `p.khamank@c…` completed;
  - a bare "@cpwi.in" left out;
  - 38 stages carry a ✎ note.
- Server: a store, membership, app, e-commerce or BDA case escalates to its store row (by category › sub-category › sub-category 2 and the store; membership: the home store). Then Level 1 and Level 2 follow automatically with each stage's own To / Cc / TAT. Replies from the matrix addresses are recognised. Store-matrix rows use the sheet's TAT.
- Screens:
  - **Stores & settings → Escalation matrix – stores (per store and kind)**: pick store and tab; Edit, Back to the workbook, Sample to Teams; ⚠ banner on the made-up tabs.
  - The case page and the New case hint show the row.
- Excel upload / live link read the store tabs; changes are shown, applied and can be undone.
- Email reader fix: "duplicate copy of the invoice" is now recognised.
- Tested on a test copy:
  - 29 end-to-end checks, including uploading the whole workbook: 274 store rows read with no changes, and the HO tab equals the CRM's 12 rows;
  - the browser check of the Settings card in Chrome;
  - 10 sample emails through the email reader;
  - the Teams card tests again.
- Not done: the live CRM is still running the version started on 17 Oct (before these changes); restart only with no pending database writes. The escalation flow chart still shows only the HO rows.

### Emails to stores and teams in the layout of LOTS's Vtiger mails (user's sample)
- Every email to a store / team now has the same layout: the first escalation, Level 1 / Level 2, overdue reminders, the samples, and the "Escalation to store" / "Store follow-up" templates on the case page.
- The layout:
  - "Hi Team, / Greeting for the day!", then what is asked;
  - from the second mail on a case: **Reminder#1, #2 …** "Need your kind intervention to close the below case as the TAT of this Case has already crossed";
  - **"The Details of the Query are:"** with every field of the sample (`src/queryDetails.js`). Contact fields (membership ID, business city, segments) come from the linked contact; "Email Content" is the customer's email on email cases.
- In the HTML email and the Teams cards the details are a table, without the short summary under them.
- New case fields: **Purchase amount** and **Amount to be refunded**. **Date of purchase** now shows for every case.
- Kept as before (to say if they should change too): customer emails; the daily store follow-up list.
- Tested on a test copy:
  - every field of the sample present on the first mail;
  - Reminder#1 / #2 on Level 1 / 2;
  - the Teams preview table (25 rows) and the HTML table;
  - the customer's email in "Email Content";
  - the store follow-up template.

### Support token email: to the support address, the client in Cc (user's request)
- A new token is emailed **To** the support email (Stores & settings → Support → Support email), **Cc** the agent who raised it (their email under Agents) and the new **Client copy (Cc)** addresses. The support address is never copied to itself; in test mode the email goes only to the test address.
- The Teams card and the outbox show To and Cc. An agent without a saved email gets “You were not copied on the email…”. Bad addresses are refused when saving.
- Also fixed: the token email had lost its blank lines (one block of text); it now has paragraphs.
- Tested with a fake Microsoft 365 mailbox: 11 checks (To, Cc, body, Teams, outbox, agent without email, no duplicate, test mode, bad address).

### Support button (added by the user, checked and finished)
- Reviewed the user's support button: help articles, support tokens for a help desk manager, the Support tokens page, the settings.
- **Help articles corrected:** 18 described things the CRM doesn't do, including:
  - a missed-call "nudge";
  - lead outcomes on the Automation page;
  - case counts on the Workflows page;
  - "contact details can't be edited";
  - a made-up Dependencies example;
  - an Excel import that "removes rows";
  - the old stores & teams matrix only.

  They now describe the CRM as it is, including the store matrix, Reminder#n and the chat.
- **Chat made two-way:**
  - the agent can write back on their token (status back to Open, the manager told in Teams);
  - the conversation shows again when the panel is reopened;
  - an answer shows as a badge on the button while the panel is closed;
  - a closed token takes no more messages;
  - "Ask the help articles instead" switches back.
- The Support tokens page refreshes every 20 seconds, shows the agent's messages marked, and the token badges have colours (the status classes were missing).
- Tested: 7 API checks (articles, unknown question, token, answer, write back, close, closed refuses), and 11 browser checks in Chrome (New case invoice fields, ask, token, the manager's answer arriving, the agent's reply, the manager page).

### "Lots-App" taken out of the app names (user's request)
- Category "LOTS-App Related" → **App Related**, "Lots-App Related Request" → **App Related Request**. Every app sub-category loses "Lots-App " (e.g. Lots-App Order Related → **Order Related**, Lots-App related- Others → **Others**), and so do its sub-categories 2 (Lots-App Delivery Related → Delivery Related).
- The store matrix tab is shown as **App**, and its rows are shown without "Lots-App". The workbook's own text still says "Lots-App", and the CRM still reads it from the Excel.
- Changed in the case master, picklists, workflows, requirements, email reader, store-matrix routing, flow chart and screens. Cases already saved with the old names are renamed once at start-up.
- Tested on a test copy: 31 end-to-end checks (including a saved "Lots-App" case renamed, and the store matrix showing "App"), the browser check, 5 app emails through the email reader, and every case-master category still reaching a store-matrix row.

---

## 17 October 2026

### HO escalation matrix applied (LOTS sheet "Escalation Matrix LOTS – April 2026 – V_6 (HO)")
- Read the sheet: 12 case types, each with three stages, **First Time Resolution → Level 1 → Level 2**. Each stage has a SPOC (To), an escalation list (Cc) and a TAT.
- Mapped each row to the case master: Real Estate, Legal, HR or Jobs, IT or Website, Admin Related, Marketing Related (Inquiry), and the supplier types under Requests › New Supplier.
- Decided with the user: working hours **9 AM – 9 PM**, **Monday–Saturday**; missing TATs filled from the row's pattern (Legal L2 = 2 days, Admin / Marketing L2 = 3 days, marked "to confirm"); **two supplier types added**: Suppliers - FMCG - Non Food, Suppliers - D&F.
- Corrected three faulty addresses in the sheet (HR: Isha.kohli@cpwi, Hemanshu.Yadav@cpwi.in@cpwi; IT: missing comma), marked on the Settings page.
- Built:
  - escalation emails to the stage's SPOCs with its list in copy;
  - automatic Level 1 / Level 2 when a TAT passes, then a daily reminder at Level 2;
  - "Escalate to Level 1 / 2 now";
  - a daily follow-up per sheet row;
  - replies from the sheet's addresses recognised;
  - Legal's 4 working hours counted inside working hours;
  - **Stores & settings → Escalation matrix (HO)**: view, edit, back to the sheet, **Sample to Teams**, working hours, crisis contacts;
  - the case page shows the three stages with the current one highlighted.
- Not in the sheet (unchanged, store / team escalation): store, e-commerce / app, BDA, membership, General Query, Festive Gifting, New Member.
- Tested on a test copy:
  - 24 unit checks (working hours, Sundays, holidays, row matching, all 212 addresses well-formed);
  - 34 end-to-end checks (emails To / Cc, automatic levels, reminders, digests, edits, samples);
  - older suites still pass;
  - Settings and case page checked in the browser.
- Restarted the live CRM (no pending database writes); 12 rows loaded.

### Two escalation levels everywhere
- As in the Excel, every case now has **First Time Resolution → Level 1 → Level 2**, both levels automatic when the TAT passes. Store / team cases: the store / team contact is the First Time Resolution; the store / team matrix has Level 1 and Level 2 only (Level 3 removed). Names updated in emails, timeline, Follow-ups and the case page. Tests re-run and passing; live CRM restarted.

### Live link to the matrix Excel
- **Live link:** paste the OneDrive / SharePoint share link of LOTS's matrix Excel. The CRM checks it every 10 minutes and applies it by itself whenever LOTS saves a change (history with Undo; a Teams card if it can't be read).
- **Needs Microsoft 365:** it uses the same sign-in as the mailbox, which now also asks to read files (Files.Read.All).
- Tested against a stand-in for OneDrive: 11 checks pass, and all earlier suites still pass.

### Escalation matrix updates from LOTS's Excel
- **Update from Excel** in Stores & settings: upload LOTS's new .xlsx / .csv. The CRM shows every change (old → new, yellow cells marked) and applies it on **Apply**. Rows can be HO rows, stores or teams; new rows can be added as new HO rows. Undo is available for the last 5 updates.
- **Automatic:** when the mailbox is connected, the same sheet emailed from a cpwi.in address is applied by itself. New rows wait for a decision; files from outside cpwi.in are ignored.
- Typos are fixed automatically; where the sheet is unclear, the CRM's value is kept and noted.
- Added the `exceljs` library to read .xlsx files.
- Tested:
  - the original April sheet gives no changes;
  - an updated .xlsx with changes is applied and undone;
  - an email with the matrix attached updates the matrix by itself.
- All earlier suites pass; checked in the browser.

### Editable escalation matrix for stores & teams
- New table in Stores & settings, the same as the HO matrix: one row per store and team plus a Default row.
- Each row has **First Time Resolution, Level 1 and Level 2**, with To, Cc and TAT, and buttons **Edit**, **Sample to Teams** and **Clear Cc and levels**.
- All levels are automatic. A store or team without its own levels uses the Default row. Store / team emails are now edited only here.
- Every case (HO, store, team) now runs through one escalation path.
- Tested: 20 new checks, all earlier suites, and a browser check. Live CRM restarted.
- **To do:** fill in the store / team emails and levels (all empty on the live CRM).

### Escalation flow chart
- New **Escalation flow** page (Admin, and "See as flow chart" on the matrix card), built with React Flow like the LOTS workflow chart.
- Pick a row of the sheet: the boxes show First Time Resolution → Level 1 → Level 2 → daily reminder with that row's SPOCs and TATs, the reply path (resolution / "we are checking"), the confirmation call and closing, plus live counts of the cases at each stage.
- Click a box for the full To / Cc list and what the CRM does; checked in the browser.

---

## 16 October 2026

### Health check
- Live CRM running on MySQL `lots`; one dropped MySQL connection overnight was retried automatically, nothing lost. Daily store follow-up emails went to Teams.
- Full re-test on fresh test copies: about 100 checks across 8 test sets (core SOP rules, picklists, follow-up / survey calls, escalation, contact types, Teams previews, templates, attachments), all passing.

### Decisions
- **SMS and "answer within 3 rings" measurement: not possible** — dropped from the open items.
- **Mailbox connection and member list: later.**
- Next: the **escalation** part.

---

## 15 October 2026

### Restart and browser check
- Restarted the CRM on the latest version (no pending database writes). It runs on MySQL `lots`, with SparkTG connected.
- Checked Picklists, Dependencies and the case form's **+ Add** in a real browser. All worked; fixed one layout issue (the add box now opens below the dropdown).
- Stopped the CRM on request.

### Checked the CRM against the SOP ("Lots Process Documents 2026")
- Covered: case types and statuses, inbound / outbound / email processes, missed calls in 30 min, store follow-ups with script and templates, stores and shifts, membership / add-on / supplier / HR rules, returns, delivery, MOV, privilege card, B2C, FAQ and scripts.
- Open, needs others: mailbox connection (cpwi.in account), SMS (provider), OMS access, escalation matrix beyond Level 1, ring-time (SparkTG), store / team contacts, current offers.
- SOP contradictions for LOTS to confirm: 5 vs 6 stores; "Microhub" MOV but no Microhub store; ₹500 per invoice vs store MOV.

### Built: the SOP outbound calls that were missing
- **Follow-up** call type ("giving updates or asking for missing info"):
  - queued automatically when a case goes to **Waiting** (Automation → "Queue the follow-up call", on)
  - **Info received** on the call moves the case back to Pending; **Update given** goes on the case timeline
  - closes itself if the case goes back to Pending another way
- **Customer survey** call type ("collecting feedback to improve our service"):
  - 5 questions: overall, store and customer-care ratings (1–5 stars), would recommend (Yes / No), what to improve
  - answers saved on the lead and the case timeline; **Survey results** panel on Outbound leads (averages, % recommend, latest comments)
  - optional automatic survey call after a case closes (Automation → "Queue a customer survey call", off by default), or import a survey calling list
- Tested on a copy of the data: 10 of 10 API checks and 5 of 5 browser checks passed.

### Built: everything missing in escalation
- **Escalation matrix** (Stores & settings): Level 2 and Level 3 contacts and TATs — a default for all, plus optional rows per store and team. Still to be filled in from LOTS's real matrix.
- **Holidays** (Stores & settings): skipped in all TATs, like Sundays.
- **Levels follow the matrix**: when a level's TAT passes the case moves up one level (next contact copied in, new due date); at the top it gets one reminder per working day instead of climbing for ever.
- **Store replies read properly**: only a real resolution moves the case to Resolved. "We are checking / will update / Noted" keep it Escalated and flag **Store replied — check**; dates in the reply ("by tomorrow", "within 2 days") become the promised date. Team and matrix contacts are recognised too.
- **Case page → Escalation panel**: who has it, level, due date, promised date, next level; **Re-assign** to another store / team; **Escalate to level N now** with a reason. When escalating, agents can pick **Send to** instead of the workflow's choice.
- **Follow-ups**: flags for level, promise missed, store reply to check and **Not followed up today**; the follow-up call records the store's promised date; **Report** tab (on time %, average days, overdue, above L1, promises missed per store / team).
- **Dashboard**: "Store follow-ups due today" and "Store replies to check" tiles.
- Tested on a copy of the data: 33 server checks (including overdue level-ups after a restart) and a browser run of the new screens. All behaved correctly.

### Fixed: sub-category dropdown empty
- Cause: the case master sheet (12 Oct) has sub-categories only for **Requests**, so every Inquiry and Complaint category had none and the dropdown stayed disabled.
- Fix: the categories the SOP describes now have its sub-categories: General Query, HR or Jobs, Store / App / ECommerce / BDA complaints (e.g. Store Related: rude staff behaviour, price mismatch, wrong product billed, late delivery, poor quality, freebie not given…). Categories the SOP gives no sub-list for (Admin, IT or Website, Marketing, Legal, Real Estate, Festive Gifting, Membership complaints) have none — nothing made up. LOTS can add more on the Picklists / Dependencies screens.
- The email reader now fills the sub-category too, and two SOP workflows are back: **Refund not received** (E-commerce, 7 working days) and **Product availability / price** enquiries (store).
- Checked in the browser on the case page and New case.

### Cases follow the case master ("lot cases excel") exactly
- Removed the sub-categories I had made up; kept only the SOP's lists (General Query, HR or Jobs, Store / App / ECommerce / BDA complaints).
- All 21 case-master categories, including Legal, Real Estate, Festive Gifting, Membership Related and Membership Related - NR (restored, with their workflows).
- The master's columns are now dependent fields under the category: **Request for**, **Sub-category** (requests: sub1), **Sub-category 2** (sub2 / supplier type), **Resolution type**; **invoice details required** for the 5 request categories (marked * and an SOP check). Single options fill in by themselves.
- Every type of contact (Not Registered / Registered / Others) gets the same options, as in the master; the old "not registered → only new member / supplier" limit is gone.
- The email reader puts "New Vendor - Supplier", "Add-On Cards" etc. into the right field.
- Note for LOTS: the master gives every request category the request for "Re-issuing of Lost Card" — probably a fill-down slip in the sheet; the CRM shows it but uses it for document requirements only on membership requests.
- Tested on a copy of the data: 13 of 13 checks (email reader + New case form in the browser).

### Checked the whole CRM against both documents and fixed the mismatches
- **Type of contact** now uses the case master's labels: Registered With Lots / Not Registered / Others (was Registered member / Not registered / B2C customer). Saved cases are converted once at start-up; old names from any screen are accepted. "Others" gets the SOP's B2C checks (AKD / NSP only, Indian-origin food, no e-commerce).
- **Store 105 is "DH" Duhai** (case master; the SOP FAQ calls it GZB).
- **"Not Specific" store** option (case master, phone complaints). A store complaint still needs the real store before it can be escalated.
- **Product type** under product category (case master column), using the SOP's examples: Fresh → Fruits, Vegetables, Meat, Fish, Dairy products; FMCG – Food → Beverages, Processed food…; etc.
- Status help: "With the store / team", "Store / team replied".
- Removed the "B2C: Walk-in customer" customer group (not in the SOP's customer types).
- Tested on a copy of the data, including converting old saved values: 10 of 10 checks.
- Still mine, waiting for LOTS: survey questions, 7-day TAT for refunds / suppliers, Level 2 / 3 escalation contacts, escalating to teams.

### Email previews in Microsoft Teams
- The team wanted to see what the CRM sends before any email goes out. Every email the CRM would send is now posted to the team's Teams channel (Power Automate workflow) instead: type, To, Cc, subject, case and full text. Nobody receives an email.
- The workflow link is in the private secrets file (`TEAMS_WEBHOOK_URL`), not in the code or GitHub.
- Automation page → **Email previews in Microsoft Teams**: on / off switch, **Send a test message**, **Post a sample of every email** (10 types). Outbox and case timelines say "Teams preview (not sent)".
- Tested against a fake Teams endpoint (9 of 9), then a test message and 10 sample emails were posted to the real channel.
- **Sample case sent to Teams** (test copy of the data): customer email → acknowledgement; escalation to AKD → escalation email; Level 2 → level-2 email (Store Manager cc); store "we are checking" → no email, flagged; store resolution → resolution email. 4 emails, all correct.
- **Bug found and fixed by that test**: the email reader filed "overcharged at Akshardham… please refund the difference" as E-commerce › Refund not received (it saw the word "refund"). The refund rule now needs an actual refund complaint ("refund not received / still pending", "amount debited") and is checked before "cancel order". 6 of 6 reader checks pass.
- Fixed: escalations didn't reach Teams — the running CRM was an old copy (restarted), and an escalation to a store with no email was skipped (now still shown in Teams with "not set" as the recipient). "Log as sent" on templates is "Send now (preview in Teams)" while previewing.
- Teams cards now mirror the real email exactly (same template text, header, case box, footer; checked for all 8 templates).

### Attachments
- **+ Add file** on the case page: photos / bills from WhatsApp or phone are saved on the case (noted on the timeline).
- **Escalation, level-up and overdue emails carry the case's files automatically**, so the store / team sees the bill or photos.
- **Template emails** from the case page: tick which case files to attach (escalation / store follow-up: all ticked by default).
- **Teams cards list the attachments.**
- Limits (Microsoft Graph's simple sending): up to 3 MB per file, 3.5 MB per email; bigger files are named in the email as "available on request".
- Tested with a stand-in for Microsoft Graph: files arrive byte-for-byte with the right type, the 4 MB file is named instead of attached, timeline records what was attached (9 of 9); browser: upload and picking work.

### Simpler screens (agents found it too complicated)
- **Case page**: one "What to do now" box with the next SOP step in a sentence and only the buttons that apply (escalation details and options inside it when escalated); everything else in tabs — Details (read-only, Edit button) · Timeline · Email · Files · Calls · Steps; the side shows only customer, store and documents needed.
- **Menu**: 16 → 11 items (Dashboard, Log new case, My cases, All cases, Follow-ups, Calls, Emails, Outbound calls, Contacts, Knowledge base, Admin). Setup pages (settings, automation, workflows, picklists, dependencies) are on one **Admin** page.
- **Dashboard**: simplified, then put back as it was on request (all tiles and the three tables).
- **New case**: 4 numbered steps (How did they contact us? → Who is it? → What is the concern? → What happens now?); Request for / Resolution type only when there's a real choice; product fields under "More details".
- Checked in the browser on a test copy (8 of 8 before the dashboard was put back).

### Decisions
- Survey questions, follow-up / survey outcome labels and the 7-day TAT for refunds / new suppliers: **kept until LOTS confirms** (listed in README §17).
- SOP sub-categories where the case master has none: **kept**.
- Duhai store code: **DH** (case master).
- **LWS-000003 reset from escalation level 6 to 1** (level 6 was left over from the old daily level-up), with the reason on its timeline. Added a way to correct a level by hand for team leaders (API).

---

## 10 November 2026

### Support tokens now live in MySQL (user's go-ahead)
- The standalone support service stores its tokens in the company's existing `lots` database in **two new tables of its own**, `support_tickets` (one row per token; the row number IS the token number, so a deleted token's number is never reused) and `support_messages` (every manager / agent message in order). The CRM's own tables are untouched.
- `support.env` gained the `MYSQL_*` settings (copied from `secrets.env`); when they are missing on another machine the service falls back to the old local JSON file store, so it still runs without the database.
- One-off `support-service/migrate-to-mysql.mjs` moved the 3 existing tokens out of `tickets.json` (kept as `tickets.json.pre-mysql` backup); numbering continued at SUP-000009.
- Tested live: create → manager reply → agent message → close → delete straight into MySQL, numbering continued (SUP-000010), 401/403 paths still refused, rows checked in the database, and everything re-read after a service restart. CRM-side list shows the same 3 tokens.

---

## 14 October 2026

### Picklists and dependencies, as in the PSRI CRM
- **Admin → Picklists:** the values of every dropdown (Case Type, Category, Sub Category, Caller Type, Channel, Product Category, Customer Group / Type, Request For, Supplier Type, Resolution Type).
  - **+ Add** a value to any list, or create a **new picklist**.
  - Values added are green and can be removed (×). Values from the case master stay fixed.
- **Admin → Dependencies:** **Add a dependency pair**: main field → main value → sub field → sub value, or type a new sub value.
  - Pairs are shown by relationship (Case Type → Category, Category → Sub Category, Customer Group → Customer Type).
- **Case form:** **+ Add** next to Category and Sub-category adds a value under the chosen type / category in one step.
- New case, case detail, case search filters and the contact form now read these lists, so additions show up straight away.
- Stored in the CRM database (`picklists`, `dependencies`); new files `src/picklists.js`, `src/pages/Picklists.jsx`, `src/pages/Dependencies.jsx`.
- Tested on a test copy of the data: 17 of 17 checks passed. README §6.7 added.

---

## 12 October 2026

### Aligned the case taxonomy to LOTS's case master
- Replaced the SOP case types / categories / sub-categories with LOTS's case master (**"lot cases excel.xlsx"**, every possible case) in `src/taxonomy.js`:
  - Case types: **Inquiry · Issues or Complaints - NR · Requests**.
  - The 21 categories and their sub-categories exactly as in the sheet, plus the other dimensions (`REQUEST_FOR`, `SUB1`, `SUB2`, `SUPPLIER_TYPES`, `RESOLUTION_TYPES`, `CALL_TYPES`).
- Updated everything that depends on the taxonomy:
  - `src/workflows.js` — owner team, TAT and steps per new case type / category / sub-category (Legal, Real Estate and Festive Gifting are new; they go to Administration / Marketing).
  - `src/requirements.js` — request requirements re-keyed to the new sub-categories (`New Member - Customer`, `Add-On Cards`, `Return Of Goods`, `Address updation`, …).
  - `server/automation.js` — email categoriser rules mapped to the new case types / categories / sub-categories.
  - `server/index.js` — dashboard case-type buckets.
  - Screens: New case, Case detail, Case workflows, Lots flow, and the classifier (case-type cards + colours).
- Built clean (`vite build`).

> Note: the sheet is a generated "all possible cases" matrix, so its `sub1` / `sub2` values repeat for every Requests category. If LOTS has per-category sub-lists, they should replace the generic ones in `src/taxonomy.js`.

---

## 9 October 2026

### 1. Saved the previous work to GitHub
- Committed, pushed and merged the calls, contacts and unique registered numbers work into `main` (`3538abf`).

### 2. Checked how to connect the email
- contactus@cpwi.in is in **CP Wholesale's own Microsoft 365**, separate from Openmind's.
- The VMM CRM's Microsoft app can't open that mailbox. Connecting needs a **cpwi.in account**.
- Decided to connect the email later.

### 3. Email works like the VMM CRM
- **Mailbox view** in Email inbox:
  - Inbox and Sent tabs, search, and the whole conversation for each email
  - attachments, **+ Log case** and **Mark unread**
- **"Being handled by …" lock:** an email an agent opens is locked for 15 minutes, so two agents don't answer the same one.
- **Replies** go inside the customer's own email thread, with templates and LOTS-branded emails.
- **New mail:**
  - only mail that arrives after the mailbox is connected is picked up; old inbox mail is ignored
  - each mail becomes a **Pending case**, and the mail is tagged **"LOTS CRM"** plus the case number
- **Customer replies** are matched to their case even if the case number is removed from the subject.
- **Test mode:** all outgoing emails go to one test address, with [TEST] in the subject.
- **On/off switch** for creating cases automatically from new emails.
- Tested against a stand-in for Microsoft's mail service (not the real mailbox). Everything passed.

### 4. Workflow per case type
Every SOP case type has its own owner team, deadline (TAT) and steps (`src/workflows.js`).

| Case type | Escalates to | TAT |
| --- | --- | --- |
| General enquiry, supplier-registration enquiry, new membership | Care desk (answered on the call) | — |
| Store complaint or request, return / exchange | The case's store (store must be set first) | 1 working day |
| App / e-commerce complaint, cancel order, app request | E-commerce / App team (order number must be set first) | 1 day |
| Refund not received, refund request | E-commerce / App team | 7 days |
| App access problem, IT enquiry | IT / Website team | 1 day |
| BDA complaint or request | BDA team | 1 day |
| Membership request | The member's home store | 1 day |
| HR / jobs, Admin, Marketing | HR (careers@cpwi.in), Administration, Marketing | 1 day |
| New supplier registration | Category / Supplier team | 7 days |

- **Workflow checklist** on the case page: steps tick themselves where the CRM can see them, and the next step is highlighted.
- **Escalation, overdue and daily follow-up emails** go to the right store or team.
- **Teams** section in Stores & settings, for each team's contact name, phone and email.
- **Store follow-ups** renamed **Follow-ups**, grouped by store and team.
- **Case workflows** reference screen, and a workflow preview on the New case form.
- Tested on a copy of the data: all 13 checks passed.

### 5. README updated
- The email section (§9.2) was rewritten, and a new section 6.6 covers the workflows.
- Work log entries 26 and 27 were added.

### 6. Cleanup and saving
- Deleted the stray file `108`.
- Committed, pushed and merged everything into `main` (`c999123`, branch `feature/mailbox-workflows`).

### Still to do
- [ ] Restart the CRM so it picks up today's changes.
- [ ] Add the team email addresses in **Stores & settings → Teams**.
- [ ] Connect the mailbox with a cpwi.in account.
