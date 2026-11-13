// Help for the LOTS CRM itself: what every screen does, how the workflow and the escalation matrix work.
// The support button answers from these articles; if nothing matches, the agent gets a support token
// to chat with the help desk manager (see server/support.js).

export const SUGGESTED = [
  'How do I log a new case?',
  'What are the case statuses?',
  'How does escalation work?',
  'What is the TAT?',
  'How do I update the escalation matrix?',
  'Where is the dialer?',
  'How do I create a support token?',
];

export const SUPPORT_ARTICLES = [
  {
    id: 'new-case',
    title: 'Log a new case',
    keywords: ['log new case', 'create case', 'new case', 'log a case', 'register complaint', 'raise case', 'new complaint', 'add case', 'log case'],
    answer:
      'Open “Log new case” in the menu (the red button on the left). The steps follow the SOP:\n' +
      '• Identify the caller: type the mobile or card number — a registered member fills in their details.\n' +
      '• How they contacted us: inbound call, outbound call, missed call callback or email.\n' +
      '• Type of contact (Registered With Lots / Not Registered / Others), then case type → category → sub-category → sub-category 2. The case types offered depend on the type of contact (LOTS case master).\n' +
      '• Store, invoice / order no., date of purchase, purchase amount and amount to be refunded, if the customer has them.\n' +
      '• The details, then the outcome: resolved on the call, info missing (Waiting) or escalate.\n\n' +
      'The case number looks like LWS-000123. With automatic assignment on, the case goes to the agent on shift with the fewest open cases.',
  },
  {
    id: 'case-number',
    title: 'Case numbers and ID prefixes',
    keywords: ['case number', 'case id', 'reference number', 'id prefix', 'number format', 'lws', 'how are cases numbered'],
    answer:
      'Every record has its own prefix:\n' +
      '• LWS-000123 — a case (the customer’s complaint or request)\n' +
      '• MC-00123 — a missed call (30 minutes to call back)\n' +
      '• LD-00123 — an outbound lead (call-back to a prospect)\n' +
      '• M-00123 — a contact / member record\n' +
      '• OUT-000123 — one email in the outbox\n' +
      '• SUP-000123 — a support token (a question for the help desk manager)\n\n' +
      'The number is used everywhere: in emails to the customer, in the store / team escalation mails and in Teams.',
  },
  {
    id: 'statuses',
    title: 'What the case statuses mean',
    keywords: ['status', 'statuses', 'what does pending mean', 'waiting status', 'escalated status', 'resolved status', 'closed status', 'case status', 'meaning of status'],
    answer:
      'The five statuses of the LOTS flow:\n' +
      '• Pending — received, not yet addressed.\n' +
      '• Waiting — missing information was asked from the customer.\n' +
      '• Escalated — with the store / team, at First Time Resolution, Level 1 or Level 2, and a TAT is running.\n' +
      '• Resolved — the store / team replied; confirm with the customer (confirmation call).\n' +
      '• Closed — the customer confirmed, or it was resolved on the call (ROT).',
  },
  {
    id: 'transitions',
    title: 'Which status changes are allowed',
    keywords: ['status change', 'transition', 'move case', 'change status', 'not allowed', 'workflow chart', 'can i change status'],
    answer:
      'The CRM only allows the moves drawn on the LOTS workflow chart:\n' +
      '• Pending → Waiting / Escalated / Closed\n' +
      '• Waiting → Pending\n' +
      '• Escalated → Resolved\n' +
      '• Resolved → Closed / Escalated (not satisfied)\n' +
      '• Closed → Pending (reopen)\n\n' +
      'If a status change is not allowed the CRM explains which moves are possible from the current one. See “LOTS workflow chart” under Admin for the chart with live counts.',
  },
  {
    id: 'reopen',
    title: 'Reopen a closed case',
    keywords: ['reopen', 'closed case', 're open', 'customer not satisfied', 'complaint again', 'reopen case', 'not satisfied'],
    answer:
      'Open the case and set the status back to Pending (Closed → Pending is allowed).\n' +
      'The customer’s new complaint is added as a note in the timeline, so the history stays in one place instead of a new case.\n' +
      'From Resolved you can also go back to Escalated when the customer says they are not satisfied.',
  },
  {
    id: 'waiting',
    title: 'When a case goes to Waiting',
    keywords: ['waiting', 'waiting for customer', 'ask for information', 'info request', 'missing details', 'request information'],
    answer:
      'Waiting means the CRM is waiting for the customer — usually because something is missing (invoice number, date of purchase, image of the bill…).\n' +
      'The case leaves the agent’s to-do list and comes back to Pending as soon as the customer replies by email or the agent adds the information.\n' +
      'While a case waits, the store / team is not chased, and no escalation mail goes out.',
  },
  {
    id: 'escalate',
    title: 'Escalate a case',
    keywords: ['escalate', 'escalation', 'send to store', 'send to team', 'raise it', 'escalate the case', 'how do i escalate'],
    answer:
      'Use “Escalate” on the case page (the store must be recorded for store, app, e-commerce and BDA cases). The CRM then:\n' +
      '1. Finds where it goes: the HO escalation matrix row for its category, else the store escalation matrix row (category + store; membership cases: the member’s home store), else the store / team row.\n' +
      '2. Starts the First Time Resolution TAT of that row.\n' +
      '3. Sends the escalation mail to that row’s To with its Cc, with the details of the query.\n' +
      '4. Once emails really go out, posts an escalation card to Teams (while Teams preview is on, the preview card shows the email).\n\n' +
      'You can pick another store or team with “Send to” before escalating.',
  },
  {
    id: 'escalation-stages',
    title: 'First Time Resolution, Level 1 and Level 2',
    keywords: ['level 1', 'level 2', 'first time resolution', 'ftr', 'escalation levels', 'level up', 'shift level', 'escalated to level'],
    answer:
      'Every case has three stages, as in LOTS’s escalation matrix (Excel):\n' +
      '• First Time Resolution — the first contacts of the row.\n' +
      '• Level 1 — the next people of the same row.\n' +
      '• Level 2 — the highest level of the row.\n\n' +
      'Each stage has its own To, Cc and TAT. When the TAT of the current stage is crossed, the CRM moves the case to the next stage on its own: the new stage gets the mail (Reminder#…), the TAT starts again and the timeline records it. After Level 2 a reminder goes out every working day until the case is resolved. “Escalate to Level 1 / 2 now” on the case page does the same without waiting.',
  },
  {
    id: 'escalation-matrix',
    title: 'The escalation matrix (HO rows)',
    keywords: ['escalation matrix', 'matrix', 'ho matrix', 'escalation rows', 'who gets the mail', 'to and cc', 'level contact'],
    answer:
      'The HO escalation matrix (LOTS sheet V_6) says who gets the mail for the HO case types — Real Estate, the supplier types, Legal, HR, IT / Website, Admin, Marketing — at each stage: To, Cc and TAT.\n' +
      'It is under Escalation matrix (HO), where a row can be edited (and put back as in the sheet) or sent to Teams as a sample.\n' +
      'The CRM never invents an address: a corrected typo from the sheet is marked ✎, a TAT that was missing in the sheet is marked ⚠ to confirm.',
  },
  {
    id: 'store-matrix',
    title: 'Escalation matrix – stores',
    keywords: ['store matrix', 'stores matrix', 'store row', 'store escalation', 'app escalation', 'bda escalation', 'ecommerce escalation', 'per store', 'store tab', 'spoc email'],
    answer:
      'Store, membership, app, e-commerce and BDA cases follow LOTS’s store escalation matrix (the workbook with one tab per store: App, Ecommerce, BDA, Store related).\n' +
      'The case’s category → sub-category → sub-category 2 picks the row, and its store the people (membership: the member’s home store). Each row has its own To, Cc and TAT for First Time Resolution, Level 1 and Level 2.\n' +
      'Escalation matrix – stores: pick a store and a tab; Edit changes a row at once, Back to the workbook undoes it. DH 105 and GNI’s Ecommerce tab are not in the workbook: they were made from NSP’s rows, as LOTS confirmed (23 Oct 2026).\n' +
      'Cases no matrix covers (General Query, Festive Gifting …) use the store / team rows below it.',
  },
  {
    id: 'matrix-excel',
    title: 'Update the escalation matrix from Excel',
    keywords: ['excel', 'update matrix', 'matrix from excel', 'import matrix', 'one drive', 'sharepoint', 'live link', 'matrix workbook', 'upload matrix'],
    answer:
      'Escalation matrix (HO) → Update from Excel:\n' +
      '• Upload LOTS’s .xlsx / .csv, or paste the OneDrive / SharePoint share link (Live link: press Refresh now to read LOTS’s latest version).\n' +
      '• The CRM reads the HO sheet and the store tabs and shows every change (old → new, yellow cells marked) before anything is saved; Apply saves it.\n' +
      '• Typos are fixed and noted; where the sheet is unclear (empty SPOC, TAT without a unit) the CRM keeps its value. Rows or tabs missing from the file are left as they are.\n' +
      '• An email from a cpwi.in address with the matrix attached is applied by itself (once the mailbox is connected).',
  },
  {
    id: 'matrix-import',
    title: 'Preview and undo a matrix import',
    keywords: ['preview matrix', 'undo import', 'import history', 'apply import', 'matrix preview', 'roll back matrix'],
    answer:
      'Every update is shown first: each changed row with the old and new To / Cc / TAT. New rows of the HO sheet wait for a decision (an existing row, a new HO row, or skip). Nothing changes until you press Apply.\n' +
      'The history lists the updates with who did them and when; “Undo” puts the matrix back as it was (the last 5 updates, once).',
  },
  {
    id: 'tat',
    title: 'TAT (how long a case may stay with a store)',
    keywords: ['tat', 'turn around time', 'response time', 'how long', 'deadline', 'due date', 'due', 'sla'],
    answer:
      'The TAT is the time the store / team has to resolve an escalated case. It comes from the escalation matrix (for example 1 working day for Level 1, 4 working hours for some teams).\n' +
      'The TAT is counted in working days or working hours — see the next answer.\n' +
      'The deadline is shown on the case (Follow-ups and the case page) and the dashboard counts the overdue ones.',
  },
  {
    id: 'working-hours',
    title: 'Working days and working hours',
    keywords: ['working day', 'working hours', 'holiday', 'sunday', 'weekend', 'office hours', 'store hours', 'tat calculation'],
    answer:
      'Sundays never count as working days. The holidays set in Stores & settings → Holidays are not counted either.\n' +
      'A TAT in days adds working days; a TAT in hours adds working hours inside the working hours of Stores & settings (HO working hours, e.g. 09:00–21:00).\n' +
      'So a 4-working-hour TAT that starts at 18:00 finishes the next working morning, not the same evening.',
  },
  {
    id: 'overdue',
    title: 'What happens when the TAT is crossed',
    keywords: ['overdue', 'tat crossed', 'tat cross', 'when the tat is crossed', 'late', 'not answered in time', 'reminder', 'follow up mail', 'escalated late'],
    answer:
      'When an escalated case passes its TAT:\n' +
      '• The CRM moves it to the next level (First Time Resolution → Level 1 → Level 2) and resets the TAT for that level.\n' +
      '• The next level gets the escalation mail (Reminder#1, Reminder#2 … — every mail after the first one on a case), and Teams gets the escalation card once emails really go out.\n' +
      '• After Level 2 the CRM sends one reminder per working day to the same To / Cc until the case is resolved.\n\n' +
      'Overdue cases are listed under Follow-ups and on the dashboard.',
  },
  {
    id: 'workflows',
    title: 'Case workflows (owner, TAT and steps)',
    keywords: ['workflow', 'case workflow', 'owner team', 'who owns', 'steps', 'case type owner', 'workflows page'],
    answer:
      'Admin → Case workflows lists every case type’s workflow: the owner team, the TAT and the steps of the SOP.\n' +
      'The owner is where a case goes when no escalation matrix row covers it. For refunds and new suppliers going to a store / team row, the SOP’s 7 working days are used when longer than the row’s TAT; matrix rows use the sheet’s TAT.\n' +
      'On the case page the same steps show as a checklist; the ones the CRM can see tick themselves.',
  },
  {
    id: 'picklists',
    title: 'Picklists (the values in the dropdowns)',
    keywords: ['picklist', 'dropdown values', 'options', 'add option', 'list of values', 'case type list', 'category list', 'sub category'],
    answer:
      'Admin → Picklists shows every dropdown of the CRM: case type, category, sub-category, product type, request for, closure type, caller type, and so on.\n' +
      'The values from the case master are fixed; values added here can be removed again (only the ones added here — the case master stays).\n' +
      'Adding a value here is the usual way to add a new sub-category.',
  },
  {
    id: 'dependencies',
    title: 'Dependencies (which values go together)',
    keywords: ['dependency', 'dependencies', 'dependent values', 'category depends', 'filter dropdown', 'linked values'],
    answer:
      'Admin → Dependencies links the values of one dropdown to another — for example type of contact “Not Registered” → case type “Request”, case type “Request” → category “New Member”, sub-category “Behaviour of staff” → sub-category 2 “rude behaviour”.\n' +
      'The case form then only offers the linked values. Pairs from the case master stay; pairs added here can be removed again.',
  },
  {
    id: 'assign',
    title: 'Assign a case to an agent',
    keywords: ['assign', 'assigned to', 'owner agent', 'my cases', 'who handles', 'allocate case', 'unassigned'],
    answer:
      'On the case page, set “Assigned to” to the agent who handles it. The dashboard then counts it under “My cases”.\n' +
      'When the automatic assignment is on (Admin → Automation), new cases are assigned by the shift of the agent (Stores & settings → agent shifts) and otherwise stay unassigned.',
  },
  {
    id: 'edit-case',
    title: 'Edit the details of a case',
    keywords: ['edit case', 'change details', 'correct case', 'update case', 'edit fields', 'change store', 'fix case'],
    answer:
      'Open the case, go to the Details tab and press Edit. The caller’s details, the classification (case type … sub-category 2), store, invoice details, details and the assigned agent can be changed; saving writes the change to the timeline with your name.\n' +
      'The case number and the timeline cannot be changed. The status changes only along the workflow (see “Which status changes are allowed”).',
  },
  {
    id: 'search',
    title: 'Find a case (search and filters)',
    keywords: ['search', 'find case', 'filter', 'filter cases', 'search cases', 'lookup', 'all cases'],
    answer:
      'Use “All cases” in the menu. The search box looks in the case number, name, phone, email, business name, card number, subject and order reference.\n' +
      'The filters narrow the list by status, channel, store, case type and agent. “My cases” opens the list with your own open cases.\n' +
      'The “Contacts” page finds a member by phone, card number or name and shows their cases.',
  },
  {
    id: 'email-inbox',
    title: 'The email inbox and automatic import',
    keywords: ['email', 'emails', 'inbox', 'auto import', 'mailbox', 'read emails', 'email pending', 'pending emails', 'import mail'],
    answer:
      'With the mailbox connected (Automation → Sign in with Microsoft), every new mail to contactus@cpwi.in becomes a Pending case by itself (setting “Every mail becomes a case”), with its attachments, categorised and assigned, and the customer gets an acknowledgement in their own email thread.\n' +
      'As the SOP says, the agent then calls the customer before acting; automatic answers and information requests are off by default.\n' +
      'Every mail the CRM sends is in the outbox (Automation) with its status: sent, not sent, failed or Teams preview.',
  },
  {
    id: 'teams-preview',
    title: 'Teams email preview',
    keywords: ['teams', 'teams preview', 'email preview', 'preview mode', 'channel', 'webhook'],
    answer:
      'Admin → Automation → Teams email preview: while it is on, every email the CRM would send is posted to the Teams channel instead of being sent — nobody receives an email.\n' +
      'It is the safe way to check the wording of the automatic mails, the escalations and the follow-ups before switching the live mails on.\n' +
      'The channel link (a Power Automate “post to a channel” webhook) lives in the private secrets file.',
  },
  {
    id: 'automation',
    title: 'Automation (what the CRM does on its own)',
    keywords: ['automation', 'automatic', 'auto reply', 'auto assign', 'automatic email', 'rules', 'timers', 'activity log'],
    answer:
      'Admin → Automation has a switch for each automatic step, for example: every mail becomes a case, categorise, assign, acknowledge, escalation emails, store replies that resolve a case, resolution email, confirmation / follow-up / survey calls, overdue reminders, the store digest time and the daily report time — and Teams email preview and test mode.\n' +
      'Everything the engine does is written to the activity log and to the timeline of the case it touched.',
  },
  {
    id: 'missed-calls',
    title: 'Missed calls (30 minutes to call back)',
    keywords: ['missed call', 'callback', 'call back missed', 'abandoned', 'disconnected', '30 minutes', 'missed calls page'],
    answer:
      'Missed calls show in the top bar (Recent missed and 2nd round) and on the Missed calls page, with the caller if known.\n' +
      'The SOP TAT is 30 minutes: call back within half an hour. The dashboard and the daily report count the ones past 30 minutes.\n' +
      'Calling back from the list lets you log the case for that missed call, so the conversation is one case.',
  },
  {
    id: 'leads',
    title: 'Outbound calls (leads)',
    keywords: ['lead', 'outbound', 'outbound call', 'call back list', 'prospect', 'lead status', 'order placed'],
    answer:
      'Outbound calls holds the call lists of the SOP: new registration, inactive customer, order on call, LCC, confirmation, follow-up, customer survey and festival offers.\n' +
      'Call from the list and record the outcome. A confirmation call closes or re-escalates its case; a follow-up call with “Info received” moves a Waiting case back to Pending; a survey call records the customer’s feedback.\n' +
      'The CRM queues confirmation and follow-up calls by itself when those switches are on (Automation).',
  },
  {
    id: 'followups',
    title: 'Follow-ups (the escalated cases)',
    keywords: ['follow up', 'followups', 'follow-up', 'pending with store', 'chase store', 'chase', 'reminder list'],
    answer:
      'Follow-ups lists the escalated cases, as the SOP asks: call every store and team daily for their pending cases and record each call.\n' +
      'It shows each case’s level and due date, flags the ones not followed up today and the promises missed. Logging the call can record the date the store promised.\n' +
      'The Report tab shows, per store / team, escalated, resolved, on time %, overdue and promises missed.',
  },
  {
    id: 'calls',
    title: 'The calls page',
    keywords: ['calls', 'call history', 'call log', 'call recording', 'who called', 'inbound call log', 'link a call', 'link this call'],
    answer:
      'The Calls page lists every call the CRM knows about — inbound and outbound, with the agent, the number, the duration, the recording and the case it was linked to.\n' +
      'Calls that could not be linked to a case are the ones to link by hand (the button “Link this call to this case” is also on the caller panel).',
  },
  {
    id: 'contacts',
    title: 'Contacts and members',
    keywords: ['contact', 'member', 'member id', 'card number', 'membership', 'add contact', 'registered customer', 'customer group'],
    answer:
      'Contacts are the customers (members). Find them by phone, card number or name; the contact form holds the business details, segments, city and add-on cards.\n' +
      'When the caller is a known contact, the case is linked to them and the escalation mail shows their membership ID, business city and segments.',
  },
  {
    id: 'kb',
    title: 'The knowledge base (answers for customers)',
    keywords: ['knowledge base', 'kb', 'quick answers', 'reply templates', 'standard reply', 'faq', 'template'],
    answer:
      'The Knowledge base page holds the standard answers about LOTS’s products and processes (membership, invoices, refunds, delivery …) and the reply templates the CRM uses.\n' +
      'It is customer-facing: it is about LOTS Wholesale Solutions, not about the CRM.\n' +
      'Questions about the CRM itself are answered by the support button in the corner.',
  },
  {
    id: 'reports',
    title: 'The dashboard and reports',
    keywords: ['dashboard', 'report', 'numbers', 'statistics', 'count', 'performance', 'daily report', 'store digest'],
    answer:
      'The dashboard shows the open cases, the cases by status, the missed calls, the overdue escalations, the pending emails and the leads to call — all refreshed every 30 seconds.\n' +
      'Admin → Automation has the daily report (sent to the supervisor at a fixed time) and the store digest (what a store has to answer).',
  },
  {
    id: 'dialer',
    title: 'The dialer (SparkTG)',
    keywords: ['dialer', 'sparktg', 'telephony', 'soft phone', 'call from crm', 'phone widget', 'click to call'],
    answer:
      'The red round button at the bottom right is the SparkTG dialer. Click it to open the phone, then click “Call” on any number in the CRM to dial it.\n' +
      'Each agent signs in with their SparkTG login email (Stores & settings → Agents), and the CRM then opens the customer’s details automatically while the call is on.\n' +
      'If the dialer does not open, check that the SparkTG settings are in the private secrets file and that the agent’s login email is saved.',
  },
  {
    id: 'files',
    title: 'Attachments and files on a case',
    keywords: ['attachment', 'attach file', 'invoice upload', 'upload document', 'files on case', 'send file'],
    answer:
      'Files can be added to a case from the case page and come in automatically with the customer’s email.\n' +
      'The attachments go with the escalation mail to the store / team and are shown in the Teams card.\n' +
      'Very large files are not attached to the mail (Microsoft Graph limit) — the mail then lists them as available on request.',
  },
  {
    id: 'requirements',
    title: 'Information the customer has to give',
    keywords: ['requirement', 'required information', 'what to ask customer', 'documents needed', 'proof', 'invoice number needed', 'missing information'],
    answer:
      'Each case type has its own list of requirements (invoice number, purchase date, image of the bill, order reference …).\n' +
      'The CRM checks them when the case is saved and lists what is missing, so the agent asks for everything in one go instead of in several calls.\n' +
      'The request for the missing information can go out automatically (Admin → Automation → automatic info requests).',
  },
  {
    id: 'admin',
    title: 'The Admin pages',
    keywords: ['admin', 'admin page', 'setup page', 'settings page', 'team leader', 'configuration'],
    answer:
      'Admin collects the setup pages:\n' +
      '• Stores & settings — store SPOCs, team contacts, the escalation matrices, holidays, working hours, agents, SparkTG, backup\n' +
      '• Automation — mailbox, automatic emails, Teams preview, timers, shifts, activity log, outbox\n' +
      '• Case workflows — owner team, TAT and steps per case type\n' +
      '• LOTS workflow chart and Escalation flow — the SOP as a flow, with live counts\n' +
      '• Picklists and Dependencies — the values of the dropdowns\n' +
      '• Support tokens — the questions agents sent to the help desk manager\n\n' +
      'Agents do not need these pages day to day.',
  },
  {
    id: 'backup',
    title: 'Backup and export',
    keywords: ['backup', 'export', 'download data', 'copy of the data', 'json backup'],
    answer:
      'Stores & settings → Backup has “Download full backup (JSON)” — a complete copy of everything (cases, members, emails, settings) that works with either backend.\n' +
      'With MySQL, back up the database with the usual MySQL backups as well.',
  },
  {
    id: 'support-token',
    title: 'Support tokens (talking to the help desk manager)',
    keywords: ['support token', 'token', 'help desk', 'helpdesk', 'help desk manager', 'support', 'ask a human', 'chat with manager', 'raise a token'],
    answer:
      'The support button at the bottom right answers questions about the CRM. If the answer is not there, it offers to create a support token (SUP-000123) for the help desk manager.\n' +
      'The token holds your question, your name and the page you were on. It is emailed to the support address with you (your email under Stores & settings → Agents) and the client copy in Cc, and posted in Teams and replies in Admin → Support tokens — the answer comes straight back into the support panel (a red badge on the button if the panel is closed).\n' +
      'While the token is open, what you type goes to the manager, so you can write back; “Ask the help articles instead” switches to the articles. Close the token when it is solved.\n' +
      'You can also start a token without asking anything, with the “Talk to the help desk manager” button.',
  },
  {
    id: 'case-target',
    title: 'Where does my case go?',
    keywords: ['where does the case go', 'which team', 'which store', 'target', 'where will it be sent', 'escalation target', 'who receives'],
    answer:
      'The case page shows where the case escalates to (the workflow card):\n' +
      '• an HO escalation matrix row, for the HO case types (Legal, HR, IT, Admin, Marketing, Real Estate, suppliers);\n' +
      '• a store escalation matrix row, for store, membership, app, e-commerce and BDA cases (needs the store);\n' +
      '• otherwise the store / team of the case type’s workflow.\n\n' +
      'Before escalating you can choose another store or team with “Send to”.',
  },
];

// ---------- matching ----------

const norm = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STOP = new Set([
  'how', 'do', 'i', 'the', 'a', 'an', 'is', 'to', 'of', 'in', 'on', 'for', 'my', 'me', 'can', 'what', 'where', 'when', 'which', 'does', 'and', 'or', 'it', 'you', 'please', 'help', 'need', 'want', 'should', 'would', 'tell', 'about', 'there', 'that', 'this', 'with', 'from', 'was', 'are', 'be', 'have', 'has', 'not', 'get', 'know', 'any', 'some',
]);

const words = (t) => norm(t).split(' ').filter((w) => w && !STOP.has(w));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A keyword matches with or without a plural 's' ("missed call" finds "missed calls"). */
const keyRe = (kk) => new RegExp('\\b' + kk.split(' ').map(esc).join('\\s+') + '(?:s|es)?\\b');

/** Every phrase of an article that the question contains. */
function hits(question, article) {
  const text = ' ' + norm(question) + ' ';
  const found = [];
  for (const k of article.keywords) {
    const kk = norm(k);
    if (!kk) continue;
    if (keyRe(kk).test(text)) found.push(kk);
  }
  return found;
}

// How many articles use each keyword — a keyword only one or two articles use is a strong signal.
const KEY_OWNERS = (() => {
  const owners = new Map();
  for (const a of SUPPORT_ARTICLES) for (const k of a.keywords) {
    const kk = norm(k);
    owners.set(kk, (owners.get(kk) || 0) + 1);
  }
  return owners;
})();

/**
 * The best article for a question, or null when nothing matches.
 * One keyword that only this article uses ("tat", "escalation", "dialer"…) is enough;
 * otherwise the words of the question have to add up.
 */
export function matchArticle(question) {
  const q = norm(question);
  if (!q) return null;
  const qw = new Set(words(question));
  let best = null;
  for (const a of SUPPORT_ARTICLES) {
    const found = hits(question, a);
    if (!found.length) continue;
    let score = 0;
    let strong = false;
    for (const f of found) {
      const inTitle = norm(a.title).includes(f);
      const phrase = f.includes(' ');
      score += phrase ? 3 : inTitle ? 2 : 1;
      // a keyword only this article (or one other) uses, of at least 3 letters, is a clear sign
      if (!phrase && f.length >= 3 && (KEY_OWNERS.get(f) || 99) <= 2) strong = true;
      if (phrase) strong = true;
    }
    // a word of the article's title in the question is a strong hint
    for (const w of words(a.title)) if (qw.has(w)) score += 0.5;
    if (!best || score > best.score) best = { article: a, score, matched: found, strong };
  }
  if (!best) return null;
  return best.score >= 2 || best.strong ? best : null;
}

/** The articles whose title or keywords look closest to the question (for "did you mean"). */
export function relatedArticles(question, limit = 3) {
  const qw = new Set(words(question));
  const scored = SUPPORT_ARTICLES.map((a) => {
    let score = 0;
    for (const w of words(a.title)) if (qw.has(w)) score += 2;
    for (const k of a.keywords) for (const w of words(k)) if (qw.has(w)) score += 1;
    return { article: a, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => ({ id: x.article.id, title: x.article.title }));
}
