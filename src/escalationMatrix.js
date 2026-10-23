// LOTS Head Office escalation matrix ("Escalation Matrix LOTS - April 2026 - V_6(HO)", CRM TABLE).
// Each row: First Time Resolution → Level 1 → Level 2, each with a SPOC (To), an escalation list (Cc) and a TAT.
// Copied from the sheet as written. The changes are marked `fixed` (typos corrected, and the TATs LOTS
// confirmed on 23 Oct 2026). Every row's Level 2 TAT is 3 working days, except Legal (2, as written).
// Rows the sheet does not have (store, e-commerce / app, BDA, membership, general query, festive gifting)
// keep the store / team escalation (Stores & settings) until LOTS sends their matrix.

export const MATRIX_SOURCE = 'Escalation Matrix LOTS – April 2026 – V_6 (HO)';
export const STAGES = ['First Time Resolution', 'Level 1', 'Level 2'];
// HO working hours for TATs in hours (Mon–Sat, holidays excluded) — decided 17 Oct 2026
export const WORK_HOURS = { start: '09:00', end: '21:00' };

const COPY = ['ajay.sharma@cpwi.in', 'cpwi.consultant80@cpwi.in', 'navni.jain@cpwi.in'];
const days = (value, extra) => ({ value, unit: 'days', ...extra });
const hours = (value) => ({ value, unit: 'hours' });
const S = (to, cc, tat, extra = {}) => ({ to, cc, tat, ...extra });

// Supplier rows: same pattern, the category SPOC changes
const supplier = (key, row, sub2, ftr, l1to, l1cc, l2cc) => ({
  key,
  row,
  match: { caseType: 'Request', category: 'New Supplier', sub2 },
  stages: [S(ftr, COPY, days(1)), S(l1to, [...l1cc, 'Amritraj.Kaur@cpwi.in', ...COPY, 'nishant.rayirath@cpwi.in'], days(2)), S(l1to, [...l2cc, 'Nishant.Rayirath@cpwi.in', 'Amritraj.Kaur@cpwi.in', ...COPY, 'p.khamank@cpwi.in'], days(3))],
});

export const HO_MATRIX = [
  {
    key: 'real-estate',
    row: 'Projects – Real Estate',
    match: { caseType: 'Inquiry', category: 'Real Estate' },
    stages: [
      S(['mandvi.Tamrakar@cpwi.in'], ['Sourabh.Shil@cpwi.in', ...COPY], days(1)),
      S(['Mandvi.Tamrakar@cpwi.in'], ['Sourabh.Shil@cpwi.in', 'Amritraj.Kaur@cpwi.in', ...COPY], days(2)),
      S(['Mandvi.Tamrakar@cpwi.in'], ['Sourabh.Shil@cpwi.in', 'Amritraj.Kaur@cpwi.in', ...COPY], days(3)),
    ],
  },
  supplier('sup-fresh', 'Suppliers – Fresh', 'Suppliers - Fresh', ['Dushyant.Gupta@cpwi.in'], ['Dushyant.Gupta@cpwi.in', 'satish.thaker@cpwi.in'], [], []),
  supplier('sup-fmcg-food', 'Suppliers – FMCG – Food', 'Suppliers - FMCG - Food', ['akshit.sharma@cpwi.in'], ['satish.thaker@cpwi.in'], ['akshit.sharma@cpwi.in'], ['akshit.sharma@cpwi.in']),
  supplier('sup-commodities', 'Suppliers – Commodities', 'Suppliers - FMCG - Commodities', ['Dushyant.Gupta@cpwi.in'], ['Dushyant.Gupta@cpwi.in'], ['satish.thaker@cpwi.in'], ['satish.thaker@cpwi.in']),
  supplier('sup-fmcg-nonfood', 'Suppliers – FMCG – Non Food', 'Suppliers - FMCG - Non Food', ['Shalini.Dani@cpwi.in'], ['satish.thaker@cpwi.in'], ['Shalini.Dani@cpwi.in'], ['Shalini.Dani@cpwi.in']),
  supplier('sup-nonfood', 'Suppliers – Non Food', 'Suppliers - Non Food', ['Anu.Bakhshi@cpwi.in'], ['Anu.Bakhshi@cpwi.in'], ['satish.thaker@cpwi.in'], ['satish.thaker@cpwi.in']),
  supplier('sup-df', 'Suppliers – D&F', 'Suppliers - D&F', ['Anu.Bakhshi@cpwi.in'], ['Anu.Bakhshi@cpwi.in'], ['satish.thaker@cpwi.in'], ['satish.thaker@cpwi.in']),
  {
    key: 'legal',
    row: 'Legal',
    match: { caseType: 'Inquiry', category: 'Legal' },
    stages: [
      S(['Hemanshu.Yadav@cpwi.in'], COPY, hours(4)),
      S(['Hemanshu.Yadav@cpwi.in'], ['Amritraj.Kaur@cpwi.in', ...COPY], days(1)),
      S(['Hemanshu.Yadav@cpwi.in'], ['Amritraj.Kaur@cpwi.in', ...COPY, 'p.khamank@cpwi.in', 'Nishant.Rayirath@cpwi.in'], days(2, { fixed: 'Sheet says "Within 2 working" (unit missing): read as 2 working days — confirmed by LOTS (23 Oct 2026)' })),
    ],
  },
  {
    key: 'hr',
    row: 'HR (only if required)',
    match: { caseType: 'Inquiry', category: 'HR or Jobs' },
    stages: [
      S(['Yuktanshi.Srivastava@cpwi.in', 'Apoorv.Tyagi@cpwi.in'], ['cpwi.consultant80@cpwi.in', 'navni.jain@cpwi.in'], days(1)),
      S(['Isha.kohli@cpwi.in'], ['Hemanshu.Yadav@cpwi.in', 'Amritraj.Kaur@cpwi.in', 'cpwi.consultant80@cpwi.in', 'navni.jain@cpwi.in'], days(2), {
        fixed: 'Sheet has “Isha.kohli@cpwi” and “Hemanshu.Yadav@cpwi.in@cpwi”: corrected to …@cpwi.in',
      }),
      S(['Isha.kohli@cpwi.in'], ['Hemanshu.Yadav@cpwi.in', 'Amritraj.Kaur@cpwi.in', 'cpwi.consultant80@cpwi.in', 'navni.jain@cpwi.in', 'p.khamank@cpwi.in', 'Nishant.Rayirath@cpwi.in'], days(3), {
        fixed: 'Sheet has “Hemanshu.Yadav@cpwi.in@cpwi”: corrected to Hemanshu.Yadav@cpwi.in',
      }),
    ],
  },
  {
    key: 'it',
    row: 'IT / Website related queries (only if required)',
    match: { caseType: 'Inquiry', category: 'IT or Website' },
    stages: [
      S(['Tarang.shah@cpwi.in'], ['cpwi.consultant80@cpwi.in', 'navni.jain@cpwi.in'], days(1)),
      S(['Tarang.shah@cpwi.in'], ['Amritraj.Kaur@cpwi.in', 'cpwi.consultant80@cpwi.in', 'navni.jain@cpwi.in'], days(2), { fixed: 'Sheet is missing a comma between Amritraj.Kaur@cpwi.in and cpwi.consultant80@cpwi.in' }),
      S(['Tarang.shah@cpwi.in'], ['Amritraj.Kaur@cpwi.in', 'cpwi.consultant80@cpwi.in', 'navni.jain@cpwi.in', 'p.khamank@cpwi.in', 'vijay.panchal@cpwi.in', 'Nishant.Rayirath@cpwi.in'], days(3)),
    ],
  },
  {
    key: 'admin',
    row: 'Admin Related',
    match: { caseType: 'Inquiry', category: 'Admin Related' },
    stages: [
      S(['varun.tomar@cpwi.in'], ['cpwi.consultant80@cpwi.in', 'navni.jain@cpwi.in', 'tushar.gupta@cpwi.in', 'Rajneesh.verma@cpwi.in'], days(1)),
      S(['varun.tomar@cpwi.in'], ['Amritraj.Kaur@cpwi.in', 'cpwi.consultant80@cpwi.in', 'navni.jain@cpwi.in', 'tushar.gupta@cpwi.in', 'Rajneesh.verma@cpwi.in'], days(2)),
      S(['varun.tomar@cpwi.in'], ['Rajneesh.verma@cpwi.in', 'Amritraj.Kaur@cpwi.in', 'ajay.sharma@cpwi.in', 'cpwi.consultant80@cpwi.in', 'navni.jain@cpwi.in', 'p.khamank@cpwi.in', 'tushar.gupta@cpwi.in', 'vijay.panchal@cpwi.in', 'Nishant.Rayirath@cpwi.in'], days(3, { fixed: 'TAT empty in the sheet: LOTS (23 Oct 2026) confirmed 3 working days, like the other rows' })),
    ],
  },
  {
    key: 'marketing',
    row: 'Marketing Related',
    match: { caseType: 'Inquiry', category: 'Marketing related' }, // case-master spelling (was "Marketing Related", so the row never matched)
    stages: [
      S(['cpwi.consultant80@cpwi.in', 'navni.jain@cpwi.in', 'Rigzin.Yangdol@cpwi.in'], ['navni.jain@cpwi.in'], days(1)),
      S(['cpwi.consultant80@cpwi.in', 'navni.jain@cpwi.in', 'Rigzin.Yangdol@cpwi.in'], ['Amritraj.Kaur@cpwi.in'], days(2)),
      S(['Amritraj.Kaur@cpwi.in', 'cpwi.consultant80@cpwi.in', 'navni.jain@cpwi.in', 'rigzin.yangdol@cpwi.in'], ['Nishant.Rayirath@cpwi.in', 'p.khamank@cpwi.in'], days(3, { fixed: 'TAT empty in the sheet: LOTS (23 Oct 2026) confirmed 3 working days, like the other rows' })),
    ],
  },
];

// Below the CRM TABLE in the sheet (for the team leader; not sent automatically)
export const CRISIS_CONTACTS = {
  title: 'In any crisis situation / miscellaneous',
  people: ['Sumil Mudgal', 'Richa Singh'],
  emails: ['rigzin.yangdol@cpwi.in', 'ajay.sharma@cpwi.in', 'navni.jain@cpwi.in'],
};

const hit = (want, have) => want === undefined || want === have;

/** The matrix row for a case (or null when the sheet has no row for its type). */
export function matrixRowFor(c, rows = HO_MATRIX) {
  if (!c?.caseType) return null;
  return rows.find((r) => hit(r.match.caseType, c.caseType) && hit(r.match.category, c.category) && hit(r.match.sub2, c.sub2)) || null;
}

/** "1 working day" / "4 working hours". */
export function tatText(tat) {
  if (!tat?.value) return 'no TAT';
  return `${tat.value} working ${tat.unit === 'hours' ? 'hour' : 'day'}${tat.value > 1 ? 's' : ''}`;
}

/** Addresses without duplicates (case-insensitive), and nobody in Cc who is already in To. */
export function cleanList(list, not = []) {
  const seen = new Set(not.map((e) => e.toLowerCase()));
  const out = [];
  for (const e of list || []) {
    const k = String(e || '').trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(String(e).trim());
  }
  return out;
}
