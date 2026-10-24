// The contact fields: same sections and fields as the LOTS contact form in Vtiger (labels = Vtiger's field names).
// Shared by the contact form (browser) and the Vtiger contacts import (browser CSV and server API).

export const YES_NO = ['Yes', 'No'];
export const OPT_IN = ['Single opt-in (user)', 'Double opt-in', 'Opted out', 'None'];
export const CITIES = ['Delhi', 'New Delhi', 'Noida', 'Greater Noida', 'Ghaziabad', 'Gurugram', 'Faridabad', 'Other'];
export const LANGUAGES = ['English', 'Hindi', 'Punjabi', 'Urdu', 'Other'];
export const LICENCES = ['GST Registration', 'FSSAI Licence', 'Drug Licence', 'Certificate of Incorporation', 'Society / Public Trust Registration', 'APMC Licence', 'Govt Department Authorisation', 'MSME / Udyam Registration', 'Weights & Measures Licence', 'Trade Licence', 'Shops & Establishments Registration'];
export const SOURCES = ['Walk-in at store', 'Inbound call', 'Email', 'Website / App', 'BDA', 'Outbound call', 'Referral', 'Advertisement / Offer', 'Other'];
export const CONTACT_TYPES = ['Registered Member', 'Add-on Member', 'Prospect / Lead', 'Supplier / Vendor', 'B2C Customer', 'Other'];

// key, label, type, extra
const f = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
export const SECTIONS = [
  {
    id: 'validation', title: 'Validation',
    fields: [
      f('salutation', 'Salutation', 'select', { options: ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'] }),
      f('firstName', 'First Name', 'text', { required: true }),
      f('lastName', 'Last Name', 'text', { required: true }),
      f('emails', 'Email', 'emails'),
      f('businessName', 'Business Name'),
      f('businessAddress', 'Business Address', 'textarea'),
      f('businessAddress2', 'Business Address 2', 'textarea'),
      f('businessCity', 'Business City'),
      f('businessCityPicklist', 'Business City Picklist', 'select', { options: CITIES }),
      f('businessLandmark', 'Business Address LANDMARK', 'textarea'),
      f('businessPincode', 'Business Pincode', 'text', { pattern: /^\d{6}$/, patternMsg: 'Enter a 6-digit pincode.' }),
      f('businessLicenceType', 'Business Licence Type', 'datalist', { options: LICENCES }),
      f('businessLicenceNumber', 'Business License Number'),
      f('businessLicenceExpiry', 'Business License Expiry Date', 'date'),
      f('gstNumber', 'Business GSTI Number', 'text', { upper: true, pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, patternMsg: 'GSTIN should be 15 characters, e.g. 07ABCDE1234F1Z5.' }),
      f('businessLandline', 'Business Landline'),
      f('segment3', 'Segment3', 'datalist', { optionsFrom: (v, pk) => pk.list('Customer Group'), hint: 'Customer group' }),
      f('segment4', 'Segment4', 'datalist', { optionsFrom: (v, pk) => (v.segment3 && pk.dependents('Customer Type', 'Customer Group', v.segment3).length ? pk.dependents('Customer Type', 'Customer Group', v.segment3) : pk.list('Customer Type')), hint: 'Customer type' }),
      f('sourceOfInformation', 'Source of Information', 'select', { options: SOURCES, required: true }),
    ],
  },
  {
    id: 'updated', title: 'Updated Contact Details Block',
    fields: [f('mobileUpdation', 'Mobile Number Updation', 'select', { options: YES_NO }), f('emailUpdation', 'Email ID Updation', 'select', { options: YES_NO })],
  },
  {
    id: 'contact', title: 'Contact Information',
    fields: [
      f('phones', 'Phone', 'phones', { required: true }),
      f('contactType', 'Contact Type', 'select', { options: CONTACT_TYPES, required: true }),
      f('doNotCall', 'Do Not Call', 'checkbox'),
      f('customerStatus', 'Customer Status', 'select', { options: ['Active', 'Inactive', 'Blocked'], hint: 'Blocked: card blocked (add-on cards too)' }),
      f('dateOfJoining', 'Date of Joining', 'date'),
      f('registeredStoreCode', 'Registered store code', 'store'),
      f('registeredStoreName', 'Registered store name', 'readonly'),
      f('birthday', 'Birthday', 'date'),
      f('gender', 'Gender', 'select', { options: ['Male', 'Female', 'Other'] }),
      f('emailOptIn', 'Email Opt-in', 'select', { options: OPT_IN }),
      f('smsOptIn', 'SMS opt-in', 'select', { options: OPT_IN }),
      f('language', 'Language', 'select', { options: LANGUAGES }),
      f('timezone', 'Timezone', 'select', { options: ['Asia/Kolkata'] }),
    ],
  },
  {
    id: 'membership', title: 'Membership Details',
    fields: [
      f('cardNo', 'Membership Card No.', 'text', { hint: 'Used to recognise the caller' }),
      f('taxExemption', 'Business Tax Exemption', 'select', { options: YES_NO }),
      f('drugLicence', 'Business Drug License'),
      f('licenceIssuingDate', 'Business Licence Issuing Date', 'date'),
      f('businessLanguage', 'Business Language Preference', 'select', { options: LANGUAGES }),
      f('panCard', 'Business Pan Card', 'text', { upper: true, pattern: /^[A-Z]{5}[0-9]{4}[A-Z]$/, patternMsg: 'PAN should look like ABCDE1234F.' }),
      f('turnover', 'Business Turnover'),
      f('employees', 'Business No of Employees', 'text', { pattern: /^\d*$/, patternMsg: 'Numbers only.' }),
      f('consentId', 'Consent Id'),
    ],
  },
  {
    id: 'custom', title: 'Custom Information',
    fields: [f('assignedTo', 'Assigned To', 'agent', { required: true }), f('uploadFileName', 'Upload File Name'), f('dateOfDataUpload', 'Date of Data Upload', 'date')],
  },
  {
    id: 'address', title: 'Address Details',
    fields: [
      f('shippingAddress', 'Shipping Address', 'textarea'),
      f('shippingCity', 'Shipping City'),
      f('shippingPin', 'Shipping PIN Code', 'text', { pattern: /^\d{6}$/, patternMsg: 'Enter a 6-digit PIN code.' }),
      f('shippingState', 'Shipping State Name'),
      f('shippingCityPicklist', 'Shipping City Picklist', 'select', { options: CITIES }),
      f('shippingCountry', 'Shipping Country'),
      f('businessState', 'Business State'),
      f('businessStateCode', 'Business State Code'),
      f('businessCountry', 'Business Country'),
      f('shippingName', 'Shipping Name'),
      f('shippingLandline', 'Shipping Landline'),
      f('shippingStateCode', 'Shipping State Code'),
    ],
  },
  { id: 'addon', title: 'Details of Addon Member', fields: [f('addons', 'Add-on members', 'addons')] },
  { id: 'description', title: 'Description Details', fields: [f('description', 'Description', 'richtext'), f('needValidation', 'Need Validation', 'checkbox')] },
  {
    id: 'socials', title: 'Socials',
    fields: [f('linkedinUrl', 'Linkedin URL'), f('linkedinFollowers', 'Linkedin Followers'), f('facebookUrl', 'Facebook URL'), f('facebookFollowers', 'Facebook Followers')],
  },
];

export const EMPTY = {
  salutation: '', firstName: '', lastName: '', emails: [{ type: 'Primary', address: '' }], businessName: '', businessAddress: '', businessAddress2: '', businessCity: '',
  businessCityPicklist: '', businessLandmark: '', businessPincode: '', businessLicenceType: '', businessLicenceNumber: '', businessLicenceExpiry: '', gstNumber: '',
  businessLandline: '', segment3: '', segment4: '', sourceOfInformation: '', mobileUpdation: '', emailUpdation: '', phones: [{ type: 'Mobile', number: '' }],
  contactType: '', doNotCall: false, customerStatus: 'Active', dateOfJoining: '', registeredStoreCode: '', registeredStoreName: '', birthday: '', gender: '',
  emailOptIn: 'Single opt-in (user)', smsOptIn: 'Single opt-in (user)', language: '', timezone: '', cardNo: '', taxExemption: '', drugLicence: '', licenceIssuingDate: '',
  businessLanguage: '', panCard: '', turnover: '', employees: '', consentId: '', assignedTo: '', uploadFileName: '', dateOfDataUpload: '', shippingAddress: '',
  shippingCity: '', shippingPin: '', shippingState: '', shippingCityPicklist: '', shippingCountry: 'India', businessState: '', businessStateCode: '', businessCountry: 'India',
  shippingName: '', shippingLandline: '', shippingStateCode: '', addons: [], description: '', needValidation: false, linkedinUrl: '', linkedinFollowers: '',
  facebookUrl: '', facebookFollowers: '',
};

// Form → member record (core fields the rest of the CRM uses + the full form for editing later).
export function toMember(v, stores) {
  const phones = v.phones.map((p) => p.number.trim()).filter(Boolean);
  const emails = v.emails.map((e) => e.address.trim()).filter(Boolean);
  const ownerName = [v.firstName, v.lastName].filter(Boolean).join(' ');
  return {
    businessName: v.businessName || ownerName,
    ownerName,
    phone: phones[0] || '',
    altPhone: phones[1] || '',
    otherPhones: phones.slice(2),
    email: emails[0] || '',
    otherEmails: emails.slice(1),
    cardNo: v.cardNo,
    gstin: v.gstNumber,
    licenceType: v.businessLicenceType,
    customerGroup: v.segment3,
    customerType: v.segment4,
    homeStore: v.registeredStoreCode,
    address: [v.businessAddress, v.businessAddress2, v.businessLandmark, v.businessCity || v.businessCityPicklist, v.businessPincode].filter(Boolean).join(', '),
    status: v.customerStatus === 'Blocked' ? 'Blocked' : 'Active',
    doNotCall: v.doNotCall,
    addOnCards: v.addons.map((a) => ({ name: [a.firstName, a.lastName].filter(Boolean).join(' '), phone: a.mobile, cardNo: a.cardNo, relationship: a.relationship, landline: a.landline, dob: a.dob })),
    notes: String(v.description || '').trim(),
    contact: { ...v, registeredStoreName: stores.find((s) => s.code === v.registeredStoreCode)?.name || '' },
  };
}
