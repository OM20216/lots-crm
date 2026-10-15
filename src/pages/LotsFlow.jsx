import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, { Background, Controls, Handle, MarkerType, MiniMap, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import './LotsFlow.css';
import { api } from '../api.js';
import { useMeta } from '../ui.jsx';

// LOTS customer-care workflow (from crm-vmm LotsFlow.jsx, per "Lots Process Documents 2026"),
// made live: every box shows today's numbers from this CRM and opens the screen that handles that step.

function LotsNode({ data, selected }) {
  const live = data.live;
  return (
    <div className={`lf-node tone-${data.tone} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} className="lf-handle" />
      <Handle type="source" position={Position.Bottom} className="lf-handle" />
      <div className="lf-node-icon">{data.icon}</div>
      <div className="lf-node-body">
        <div className="lf-node-title">
          {data.label}
          {data.start && <span className="lf-badge start">start</span>}
          {data.end && <span className="lf-badge end">end</span>}
          {data.tat && <span className="lf-badge tat">{data.tat}</span>}
          {data.auto && <span className="lf-badge auto">auto</span>}
        </div>
        {data.detail && <div className="lf-node-detail">{data.detail}</div>}
        <div className="lf-node-foot">
          {data.options?.length > 0 && <span className="lf-node-count">{data.options.length} options ›</span>}
          {live && live.n != null && (
            <span className={`lf-live ${live.alert ? 'alert' : ''}`}>
              {live.n} <span>{live.label}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { lots: LotsNode };
const n = (id, x, y, data) => ({ id, type: 'lots', position: { x, y }, data });

// `to` = CRM screen for this step · `how` = what the CRM does here · `auto` = handled without an agent
const NODES = [
  n('start', 700, -200, {
    icon: '▶️', label: 'START — Case comes in', tone: 'start', start: true,
    detail: 'Two-way channels: inbound call · outbound call · email',
    options: ['Inbound call', 'Missed / abandoned call', 'Email to contactus@cpwi.in', 'Outbound call'],
    to: '/', how: 'Dashboard shows everything that needs attention now across all channels.',
  }),
  n('ib', 0, 0, {
    icon: '📞', label: 'Inbound Call', tone: 'violet', tat: '3 rings',
    detail: 'Customer care 1860-123-5687 · everyday 9 AM–9 PM',
    options: [
      'Answer as quickly as possible — three rings is the optimal wait-time',
      'Greeting: "Good morning! [Name] this side from Lots Wholesale Solution. How may I assist you today?"',
      'Hold procedure: explain reason for hold · ask for phone number in case the call is cut · give best estimate of hold time',
      'If delay is more than a couple of minutes: ask for a number and a time to call back',
    ],
    to: '/calls', auto: true,
    how: 'SparkTG dialer inside the CRM: ringing call opens the case form with the caller identified; the call is logged with outcome, talk time and recording.',
  }),
  n('missed', 380, 0, {
    icon: '📵', label: 'Missed / Abandoned Call', tone: 'violet', tat: '30 min',
    detail: 'Agent busy · caller hung up · non-working hours',
    options: ['No missed call should be left unattended', 'Call back within 30 minutes', 'Ask about the query and give a satisfactory resolution'],
    to: '/missed', auto: true,
    how: 'Unanswered inbound calls are added automatically with a 30-min countdown and assigned to an agent on shift. Dialling the number back (from any screen) marks it called back.',
  }),
  n('email', 1000, 0, {
    icon: '📧', label: 'Email — contactus@cpwi.in', tone: 'violet', tat: 'every 5 min',
    detail: 'Every incoming mail automatically creates a case — status Pending',
    options: [
      'Case auto-created in CRM on mail receipt · complaint number generated · status Pending',
      'AI agent reads every new mail automatically',
      'Check email every 5 minutes',
      'Categorise the mail by contact and case type',
      'Reply as per the template provided',
      'Follow up with store SPOC and customer on enquiries / complaints',
    ],
    to: '/emails', auto: true,
    how: 'Mailbox checked every 5 minutes, as the SOP says, once Microsoft 365 is connected (on hold). Until then emails are logged on the Email inbox screen and follow the same steps.',
  }),
  n('ob', 1560, 0, {
    icon: '📤', label: 'Outbound Call', tone: 'violet', tat: '80–100 calls/day',
    detail: 'Call as per task requirement',
    options: [
      'New registration lead — customers who enquired about membership via app / website',
      'Inactive customer lead — members not purchasing for a few months',
      'Order on call lead',
      'LCC (Lots Club Card) lead',
      'Confirmation / resolution call',
      'Call on missed calls',
      'Festival & seasonal offer call',
    ],
    to: '/leads', how: 'Outbound leads: import calling lists, Call button dials through SparkTG, not-connected calls mark the lead Not reachable automatically.',
  }),
  n('airead', 1000, 170, {
    icon: '🤖', label: 'AI agent reads the mail', tone: 'blue', auto: true,
    detail: 'Reads mail + attachments and fills the auto-created case',
    options: [
      'Reads mail body and attachments',
      'Identifies case type: Inquiry · Issues or Complaints - NR · Requests, and category',
      'Extracts: customer name · membership no. / registered mobile · store · invoice / order no. · product · issue description · documents attached',
      'Updates the auto-created case with the extracted details',
    ],
    to: '/emails',
    how: 'Rule-based reader: sets case type / category / sub-category from SOP keywords, store from the text, member from email, mobile or card no., invoice / order no. from the text, and saves attachments.',
  }),
  n('aicheck', 1000, 340, {
    icon: '🔍', label: 'Information complete?', tone: 'amber', auto: true,
    detail: 'Checks the mail has everything needed for this case type',
    options: [
      'Complete → case escalated to store team automatically · Incomplete → automatic email asking for the missing items',
      'New membership: licence + PAN, Aadhaar, selfie, store preference (documents attached)',
      'Add-on card: authority letter · Aadhaar · photo · mobile of the person added',
      'Supplier registration: company profile · product catalogue',
      'Lost card: application on letterhead · govt ID',
      'Change of delivery address: new address proof · business licence · authority letter',
      'Store / BDA complaints: the store concerned · App complaints: the order number',
      'Every complaint / request: registered mobile or membership card number',
    ],
    to: '/automation',
    how: 'Done by the agent after calling the customer (SOP). An automatic check exists on the Automation page but is off by default.',
  }),
  n('aiwait', 1350, 510, {
    icon: '✉️', label: 'Auto email: information required', tone: 'amber', auto: true,
    detail: 'Sent on the same thread · status Waiting',
    options: ['Email lists exactly which SOP-required items are missing', 'Case status set to Waiting', 'Customer replies → reply is read and checked again (max 2 requests, then an agent calls)'],
    to: '/cases?status=Waiting', how: 'Sent automatically with the case number in the subject so the reply threads back.',
  }),
  n('obpitch', 1560, 170, {
    icon: '🗣️', label: 'Outbound call script', tone: 'blue',
    detail: '"Namaskar! Main [Name] bol raha hoon LOTS Wholesale Solutions se. Kya abhi aapse baat karne ka yeh sahi samay hai?"',
    options: [
      'New registration: explain membership process and documents',
      'Inactive: ask the issue they face in purchasing → resolve concerns → share current offers to visit store / website',
      'Order on call: inform current offers, schemes and prices → convince to place order on call',
      'LCC: pitch benefits — delivery within 24 hours, zero delivery charges, personal assistance in store',
      'Confirmation: check whether the customer is satisfied / concern resolved',
      'Festival / seasonal: inform offers, schemes, sales → invite to visit store or shop on app',
      'Offer example: ₹99 voucher on ₹999+ shopping at Akshardham (code via SMS & WhatsApp)',
      'B2C info: AKD & NSP — shop without documentation, food items only',
      'Closing: "Dhanyavaad Sir, LOTS Wholesale mein samay dene ke liye shukriya. Aapka din shubh ho!"',
    ],
    to: '/leads', how: 'Script and the pitch for each lead type are shown on the Outbound leads screen.',
  }),
  n('identify', 190, 340, {
    icon: '🪪', label: 'Registered member?', tone: 'amber', auto: true,
    detail: 'Request calls are classified as registered / not registered member',
    options: [
      'Registered With Lots',
      'Not Registered',
      'Others — e.g. B2C walk-in customers (AKD / NSP): no membership needed, food items of Indian origin only',
    ],
    to: '/members', how: 'Automatic: the caller’s number (any format, add-on holders, card no.) is matched to the member master and every detail fills in.',
  }),
  n('custtype', 560, 340, {
    icon: '🏢', label: 'Customer & store reference', tone: 'gray',
    detail: 'Customer categories and store master from the SOP',
    options: [
      'Distributor: Exporter · FMCG Wholesaler · Food W/S · Fresh Food Wholesaler · Grocery Retail Shop/Stall · Non Food Wholesaler · Up Country Distributor',
      'Food Retailer: Bakery/Sweet Shop · Fresh Food Retail Shop · Fruit & Vegetable Shop · Grocery Retail Shop/Stall · Kirana · Organised Retailer · Supermarket',
      'HoReCa: Bakery/Sweet Shop · Caterer',
      'Catering Business: Hotel · Hotel & Resort · Restaurant',
      'Non-food Retailer: Electronic appliance shop · Medicine Shop · Non Food Wholesaler · Stationery / Office supply shop',
      'Self Employed Professionals: Educational Service · Self Employed Professionals · Small and Medium Office',
      'Service: Educational Institute · Exporter · Hospital · Institution · Institutional Service · Other Service',
      '101 NSP — 9 AM–8 PM', '102 Ithum, Noida — 7 AM–9 PM', '103 Akshardham (AKD) — 9 AM–9 PM',
      '104 Sarita Vihar (SRV) — 9 AM–8 PM', '105 Duhai (DH) — online store', '106 Greater Noida (GNI) — 9 AM–8 PM',
    ],
    to: '/settings', how: 'Store master and store contacts: Stores & settings. Customer groups: Members.',
  }),
  n('oms', 1560, 340, {
    icon: '🛒', label: 'Place order on call', tone: 'green',
    detail: 'Order recorded in OMS (Order Management System)',
    to: '/leads', how: 'Lead outcome “Order placed” with the OMS order no.',
  }),
  n('casetype', 380, 510, {
    icon: '🧭', label: 'Select case type', tone: 'amber',
    detail: 'Inquiry · Issues or Complaints - NR · Requests',
    to: '/new', how: 'New case form: case type → category → sub-category from the LOTS case master. Emails are categorised automatically.',
  }),
  n('enq', 0, 680, {
    icon: '❓', label: 'Inquiry', tone: 'blue',
    detail: 'Request for information or clarification',
    options: [
      'General Query: store timings, address, membership process & documents, supplier registration, product availability / stock / price, payment modes, delivery enquiry',
      'HR or Jobs: vacancies, HR contact',
      'IT or Website · Marketing Related · Admin Related · Legal · Real Estate · Festive Gifting',
    ],
    to: '/cases?caseType=Inquiry', how: 'Answered by the agent from the SOP / FAQ (answers appear beside the case form). Automatic email answers exist but are off, because the SOP says to call the customer first.',
  }),
  n('comp', 380, 680, {
    icon: '⚠️', label: 'Issues or Complaints - NR', tone: 'red',
    detail: 'Store · App/E-comm · BDA · Membership',
    options: [
      'Store Related: staff behaviour, delivery, quality, pricing / billing, offers',
      'App Related · ECommerce Related: app / website / order issues',
      'BDA Related · Membership Related',
    ],
    to: '/cases?caseType=Issues%20or%20Complaints%20-%20NR', how: 'All complaint categories from the LOTS case master are in the case form.',
  }),
  n('req', 760, 680, {
    icon: '📝', label: 'Requests', tone: 'blue',
    detail: 'Formal request for a service, action or change',
    options: [
      'Membership Related Request: re-issuing of lost card, add-on cards, address updation',
      'Store Related Request: return of goods, payment or invoice, stock availability, pricing',
      'App Related Requests · E Commerce Related Request · BDA Related REQUESTS',
      'New Member · New Supplier',
    ],
    to: '/cases?caseType=Requests', how: 'Required documents for the chosen request are shown to the agent while logging it.',
  }),
  n('kb', 0, 850, {
    icon: '📚', label: 'Answer from SOP / FAQ', tone: 'gray',
    detail: 'Information the agent gives on the call',
    options: [
      'Stores: 7 days open · Delhi NCR only (not pan India)',
      'Membership is free · 1 valid business licence + govt ID',
      'Privilege card: ₹799 / ₹1450 / ₹1499 · valid 3–6 months · issued in-store only',
      'Returns: within 7 working days with original invoice · credit note valid 1 year, single purchase',
      'Not returnable: oil, ghee, fresh dairy, fruits, vegetables, meat, fish, temperature-controlled products',
      'No warranty from LOTS — manufacturer / brand warranty and service centres apply',
      'Delivery: free on ₹9,000+ · handling fee ₹69 GNI / ₹99 others · business licence address only · within 25 km · TAT 2–3 working days',
      'App / website MOV: HoReCa ₹3,000 · NSP 9000 · Ithum 6000 · AKD 3000 & 6000 · SRV 5000 · Microhub 3000 · GNI 6000',
      'In-store minimum: ₹500 per invoice',
      'Payment: cards (except AmEx), cash, Paytm · split payment allowed',
      'Order can be cancelled any time before status is Dispatched',
      'Amount debited but not received: auto-refund within 7 working days or contact bank',
      'Jobs: careers@cpwi.in',
      'B2C (AKD, NSP): no membership · food items of Indian origin only',
    ],
    to: '/kb', how: 'Knowledge base; the matching SOP answers also appear beside the case form when the agent picks a category.',
  }),
  n('reqdocs', 800, 850, {
    icon: '📂', label: 'Request requirements', tone: 'gray',
    detail: 'Documents / process the customer must follow',
    options: [
      'New membership — licence (or supporting document without GST) + PAN · mobile · Aadhaar · selfie · store preference · physically present at store',
      'Add-on card (up to 4 per member): authority letter · Aadhaar · photo · mobile of person added · linked to owner card (blocked if owner blocked)',
      'Supplier / vendor registration: company profile + product catalogue to contactus@cpwi.in · reply within 7 days',
      'Lost card: application on business letterhead + valid govt ID',
      'Change delivery address: new address proof + business licence + authority letter',
      'Return / exchange: original bill stamped by store guard · no bill → store verifies',
      'Offer SMS not received: missed call to 08061914105 from registered number',
      'Bulk product booking: product details and quantity',
    ],
    to: '/new', how: 'Checklist shown in the case form and on the case page for the selected request.',
  }),
  n('createcase', 380, 850, {
    icon: '🧾', label: 'Create / update case in CRM', tone: 'blue',
    detail: 'Calls: case created by agent · Emails: auto-created case is updated',
    options: [
      'Email: case already exists (Pending) — agent fills in the details, no new case',
      'Call: agent creates the case as per the query / concern',
      'Case type: Inquiry · Issues or Complaints - NR · Requests',
      'Category by contact and case type',
      'Product category: Fresh · FMCG Food · Commodities · FMCG Non-food · Non-food',
    ],
    to: '/new', how: 'The live SparkTG call is linked to the case automatically.',
  }),
  n('decide', 380, 1020, {
    icon: '⚡', label: 'Resolve within TAT?', tone: 'amber',
    detail: 'Resolve, request missing info, or escalate to store team',
    to: '/cases?status=Pending', how: 'Outcome buttons on the case form / case page: Resolved on call · Info missing · Escalate to store.',
  }),
  n('rot', 0, 1190, {
    icon: '✅', label: 'Resolved over telephone (ROT)', tone: 'green',
    to: '/cases?status=Closed', how: 'Case closes immediately with resolution type ROT.',
  }),
  n('esc1', 380, 1190, {
    icon: '🏪', label: 'Escalate to store team', tone: 'red', tat: 'L1: 1 working day', auto: true,
    detail: 'As per existing escalation matrix',
    to: '/followups', how: 'Deadline set (1 working day, Sundays excluded); escalation email goes to the store SPOC automatically; overdue → reminder cc Level 2, level +1 every working day.',
  }),
  n('waiting', 780, 1190, {
    icon: '⏳', label: 'Status: Waiting', tone: 'amber', auto: true,
    detail: 'Discrepancy / missing info → detailed email to customer requesting it · stays Waiting until customer provides details',
    to: '/cases?status=Waiting', how: 'Customer’s reply moves it back to Pending automatically; reminder email after 48 h.',
  }),
  n('callclose', 0, 1360, {
    icon: '🙏', label: 'Call closing', tone: 'blue',
    detail: '"Is there anything else I can assist you with?"',
    options: ['Yes → handle the next concern', 'No → "Thank you for your time and for contacting Lots Wholesale Solution. Have a great day ahead!"'],
    to: '/calls', how: 'After saving a call case the agent gets “Anything else?”: Yes opens a new case for the same caller and call.',
  }),
  n('followup', 380, 1360, {
    icon: '🔁', label: 'Daily store follow-up', tone: 'blue', auto: true,
    detail: 'Daily calls to stores for all pending cases · record every update in CRM after each call',
    options: [
      'Call script: "Good afternoon XYZ ji, Main [Your Name] bol rahi hoon, Lots Wholesale Solutions ke customer support se. Pending cases ke regarding follow-up karna tha."',
      'CRM note: "Had a discussion with the store contact person, [Name]. As per the update, the case is still pending due to [reason]. A follow-up email has been sent to the store."',
      'Follow-up email: "Dear Sir, As per our discussion over the call regarding the pending case, we kindly request you to share an update on the same at the earliest."',
    ],
    to: '/followups', how: 'Store follow-ups screen (script, CRM note, one email per store) + automatic daily email to each store at 10:00.',
  }),
  n('resolution', 380, 1530, {
    icon: '📨', label: 'Status: Resolution', tone: 'green', auto: true,
    detail: 'Store resolves the issue and responds to customer care by email',
    to: '/cases?status=Resolved', how: 'Store’s reply email moves the case to Resolved and the resolution is emailed to the customer.',
  }),
  n('confirm', 380, 1700, {
    icon: '🤝', label: 'Confirmation call to customer', tone: 'amber', auto: true,
    detail: 'Is the customer satisfied / concern resolved?',
    to: '/leads', how: 'Queued automatically in Outbound leads; the call outcome closes the case (confirmed) or sends it back to the store (not satisfied).',
  }),
  n('closed', 380, 1870, {
    icon: '🏁', label: 'Case Closed', tone: 'green', end: true,
    detail: 'Customer confirms → case closed from our end',
    to: '/cases?status=Closed', how: 'Closed cases can be reopened from the case page.',
  }),
];

const S = { strokeWidth: 2, strokeDasharray: '6 6' };
const M = { type: MarkerType.ArrowClosed };
const e = (source, target, label, color, animated) => ({ id: `e-${source}-${target}`, source, target, label, style: color ? { ...S, stroke: color } : S, markerEnd: M, animated });
const GREEN = '#22c55e', RED = '#ef4444', AMBER = '#f59e0b', GRAY = '#9ca3af';

const EDGES = [
  e('start', 'ib', 'call', GREEN, true),
  e('start', 'missed', 'missed', GREEN, true),
  e('start', 'email', 'email', GREEN, true),
  e('start', 'ob', 'outbound', GREEN, true),
  e('ib', 'identify'),
  e('missed', 'identify', 'call back'),
  e('email', 'airead', 'case auto-created · Pending', GREEN, true),
  e('airead', 'aicheck'),
  e('aicheck', 'esc1', 'complete → auto-escalate', RED, true),
  e('aicheck', 'aiwait', 'incomplete', AMBER),
  e('aiwait', 'airead', 'customer replied', AMBER),
  e('ob', 'obpitch'),
  e('obpitch', 'oms', 'order on call', GREEN),
  e('obpitch', 'casetype', 'concern raised', AMBER),
  e('identify', 'custtype', null, GRAY),
  e('identify', 'casetype'),
  e('casetype', 'enq', 'Inquiry'),
  e('casetype', 'comp', 'Complaint', RED),
  e('casetype', 'req', 'Requests'),
  e('enq', 'kb'),
  e('comp', 'createcase'),
  e('req', 'reqdocs'),
  e('reqdocs', 'createcase'),
  e('kb', 'rot', 'answered', GREEN),
  e('createcase', 'decide'),
  e('decide', 'rot', 'resolved', GREEN),
  e('decide', 'esc1', 'escalate', RED),
  e('decide', 'waiting', 'info missing', AMBER),
  e('waiting', 'createcase', 'customer provides details', AMBER),
  e('rot', 'callclose'),
  e('callclose', 'casetype', 'anything else? yes', AMBER),
  e('callclose', 'closed', 'no', GREEN, true),
  e('esc1', 'followup'),
  e('followup', 'resolution', 'store replies by email', GREEN),
  e('resolution', 'confirm'),
  e('confirm', 'closed', 'customer confirms', GREEN, true),
];

export default function LotsFlow() {
  const nav = useNavigate();
  const { stats } = useMeta();
  const [live, setLive] = useState({});
  const [active, setActive] = useState(null);

  useEffect(() => {
    const load = () => api.get('/flow').then(setLive).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [stats]);

  const nodes = useMemo(() => NODES.map((x) => ({ ...x, data: { ...x.data, live: live[x.id] } })), [live]);
  const current = active && nodes.find((x) => x.id === active)?.data;

  return (
    <div className="lf-page">
      <div className="page-head">
        <div>
          <h1>Workflow</h1>
          <div className="muted small">LOTS SOP flow with live numbers from the CRM. Click a box for its SOP options and to open the screen that handles it. <span className="lf-badge auto">auto</span> = done by the CRM without an agent.</div>
        </div>
      </div>
      <div className="lf-wrap">
        <div className="lf-container">
          <ReactFlow
            nodes={nodes}
            edges={EDGES}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setActive(node.id)}
            onPaneClick={() => setActive(null)}
            nodesDraggable={false}
            fitView
            minZoom={0.2}
            attributionPosition="bottom-left"
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(x) => (x.data.live?.alert ? '#ef4444' : '#3b82f6')} maskColor="rgba(0,0,0,0.06)" />
          </ReactFlow>
        </div>
        {current && (
          <aside className="lf-panel">
            <button className="lf-panel-close" onClick={() => setActive(null)} aria-label="Close">
              ×
            </button>
            <div className="lf-panel-title">
              {current.icon} {current.label}
            </div>
            {current.tat && <div className="lf-panel-tat">TAT: {current.tat}</div>}
            {current.detail && <p className="lf-panel-detail">{current.detail}</p>}
            {current.live && (
              <div className={`lf-panel-live ${current.live.alert ? 'alert' : ''}`}>
                <strong>{current.live.n}</strong> {current.live.label}
              </div>
            )}
            {current.how && (
              <>
                <div className="lf-panel-sub">In this CRM {current.auto && <span className="lf-badge auto">auto</span>}</div>
                <p className="lf-panel-detail">{current.how}</p>
              </>
            )}
            {current.to && (
              <button className="btn primary block" onClick={() => nav(current.to)}>
                Open in CRM →
              </button>
            )}
            {current.options?.length > 0 && (
              <>
                <div className="lf-panel-sub">SOP actions / options</div>
                <ul className="lf-panel-list">
                  {current.options.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
