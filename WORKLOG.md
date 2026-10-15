# LOTS CRM – Daily work log

What was done on the CRM each day. The README's §19 has the work log by feature.

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
