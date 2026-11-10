// Best-effort parser for pasted contact details. Free, no AI: regex + label matching.
// Returns a partial form object (only fields that could be detected). The agent reviews before saving.

const LABELS = {
  salutation: /^(salutation|title|mr\/ms)$/i,
  firstName: /^(first\s*name|fname|given\s*name)$/i,
  lastName: /^(last\s*name|lname|surname|family\s*name)$/i,
  name: /^(name|contact\s*name|owner\s*name|customer\s*name)$/i,
  businessName: /^(business\s*name|business|company|company\s*name|firm|firm\s*name|shop\s*name|store\s*name)$/i,
  businessAddress: /^(address|business\s*address|addr|location|street)$/i,
  businessAddress2: /^(address\s*2|address2|address\s*line\s*2)$/i,
  businessCity: /^(city|business\s*city|town)$/i,
  businessPincode: /^(pincode|pin\s*code|pin|zip|postal\s*code)$/i,
  businessLandmark: /^(landmark)$/i,
  businessLicenceType: /^(licence\s*type|license\s*type)$/i,
  businessLicenceNumber: /^(licence\s*no|license\s*no|licence\s*number|license\s*number|business\s*licence)$/i,
  gstNumber: /^(gst|gstin|gst\s*no|gst\s*number)$/i,
  panCard: /^(pan|pan\s*no|pan\s*number|pan\s*card)$/i,
  cardNo: /^(card\s*no|card\s*number|membership\s*no|membership\s*number|member\s*no)$/i,
  businessLandline: /^(landline|phone\s*landline|business\s*phone)$/i,
  businessLanguage: /^(language)$/i,
  contactType: /^(contact\s*type|type)$/i,
  registeredStoreCode: /^(store|store\s*code|registered\s*store)$/i,
  gender: /^(gender)$/i,
  birthday: /^(birthday|dob|date\s*of\s*birth)$/i,
  sourceOfInformation: /^(source|source\s*of\s*information)$/i,
  assignedTo: /^(assigned\s*to)$/i,
  consentId: /^(consent\s*id)$/i,
  uploadFileName: /^(upload\s*file|file\s*name)$/i,
  taxExemption: /^(tax\s*exemption)$/i,
  drugLicence: /^(drug\s*licence|drug\s*license)$/i,
  turnover: /^(turnover)$/i,
  employees: /^(employees|no\.?\s*of\s*employees)$/i,
  timezone: /^(timezone|time\s*zone)$/i,
};

const SALUTATIONS = ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'];

function splitName(raw) {
  const s = String(raw || '').trim();
  let salutation = '';
  let rest = s;
  for (const sal of SALUTATIONS) {
    if (rest.toLowerCase().startsWith(sal.toLowerCase().replace('.', ''))) {
      // match "Mr" or "Mr."
      const re = new RegExp('^' + sal.replace('.', '\\.?') + '\\s*', 'i');
      if (re.test(rest)) { salutation = sal; rest = rest.replace(re, '').trim(); break; }
    }
  }
  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { salutation, firstName: '', lastName: '' };
  if (parts.length === 1) return { salutation, firstName: parts[0], lastName: '' };
  return { salutation, firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function pickEmails(text) {
  const re = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const found = [...new Set(text.match(re) || [])];
  return found.map((a, i) => ({ type: i === 0 ? 'Primary' : 'Secondary', address: a }));
}

function pickPhones(text) {
  // 10-digit Indian mobiles
  const re = /\b[6-9]\d{9}\b/g;
  const found = [...new Set(text.match(re) || [])];
  return found.map((n, i) => ({ type: i === 0 ? 'Mobile' : 'Alternate', number: n }));
}

function pickGSTIN(text) {
  const m = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b/);
  return m ? m[0] : '';
}

function pickPAN(text) {
  const m = text.match(/\b[A-Z]{5}\d{4}[A-Z]\b/);
  return m ? m[0] : '';
}

function pickPincode(text) {
  const m = text.match(/\b\d{6}\b/);
  return m ? m[0] : '';
}

function pickCardNo(text) {
  // membership/card numbers are usually 6-12 alphanumeric, often after "card"
  const m = text.match(/card\s*(no|number|#)?\s*[:\-]?\s*([A-Za-z0-9]{4,15})/i);
  return m ? m[2] : '';
}

export function parseContactText(text) {
  const out = {};
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1) label: value lines
  for (const line of lines) {
    const m = line.match(/^([^:]+?)\s*[:\-]\s*(.+)$/);
    if (!m) continue;
    const label = m[1].trim();
    const value = m[2].trim();
    if (!value) continue;
    let matched = false;
    for (const [field, re] of Object.entries(LABELS)) {
      if (re.test(label)) {
        if (field === 'name') {
          const n = splitName(value);
          if (n.salutation && !out.salutation) out.salutation = n.salutation;
          if (n.firstName && !out.firstName) out.firstName = n.firstName;
          if (n.lastName && !out.lastName) out.lastName = n.lastName;
        } else if (field === 'firstName' || field === 'lastName') {
          out[field] = value;
        } else {
          out[field] = value;
        }
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // unknown label -> maybe business name if not set
  }

  // 2) if no name parsed but a single "name" not labelled, try first line as name
  if (!out.firstName && !out.businessName && lines.length) {
    // heuristic: first non-empty line that isn't a key:value
    const first = lines.find((l) => !/[:]/.test(l));
    if (first && first.length < 60) {
      const n = splitName(first);
      if (n.firstName) { out.salutation = out.salutation || n.salutation; out.firstName = n.firstName; out.lastName = n.lastName; }
    }
  }

  // 3) scan whole text for unlabelled patterns
  if (!out.emails || !out.emails.length) {
    const emails = pickEmails(text);
    if (emails.length) out.emails = emails;
  }
  if (!out.phones || !out.phones.length) {
    const phones = pickPhones(text);
    if (phones.length) out.phones = phones;
  }
  if (!out.gstNumber) {
    const g = pickGSTIN(text);
    if (g) out.gstNumber = g;
  }
  if (!out.panCard) {
    const p = pickPAN(text);
    if (p) out.panCard = p;
  }
  if (!out.businessPincode) {
    const pc = pickPincode(text);
    if (pc) out.businessPincode = pc;
  }
  if (!out.cardNo) {
    const c = pickCardNo(text);
    if (c) out.cardNo = c;
  }

  // 4) if businessName not set but firstName exists, leave businessName empty (don't guess)
  // 5) ensure emails/phones arrays exist if partial
  if (out.emails && !out.emails.length) delete out.emails;
  if (out.phones && !out.phones.length) delete out.phones;

  return out;
}

export default parseContactText;