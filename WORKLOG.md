# LOTS CRM – Daily work log

What was done on the CRM each day. The README's §19 has the work log by feature.

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
