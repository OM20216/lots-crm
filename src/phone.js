// Indian mobile-number helpers used by the dialer and the call-related forms.
// A valid mobile is 10 digits, starts with 6-9, and is not an obvious fake
// pattern (all same digit, sequential 1234567890 / 9876543210, repeating pairs).

export function normalizeMobile(raw) {
  return String(raw || '').replace(/\D/g, '').slice(-10);
}

function isSequential(digits) {
  let asc = true;
  let desc = true;
  for (let i = 1; i < digits.length; i++) {
    const prev = Number(digits[i - 1]);
    const cur = Number(digits[i]);
    if (cur !== (prev + 1) % 10) asc = false;
    if (cur !== (prev - 1 + 10) % 10) desc = false;
  }
  return asc || desc;
}

export function isValidMobile(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length !== 10) return false;
  if (!/^[6-9]/.test(d)) return false;
  if (/^(\d)\1{9}$/.test(d)) return false;
  if (isSequential(d)) return false;
  if (/^(\d{2})\1{4}$/.test(d)) return false;
  if (/^(\d{3})\1{3}$/.test(d)) return false;
  return true;
}

export function mobileError(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length !== 10) return 'Must be exactly 10 digits (currently ' + d.length + ').';
  if (!/^[6-9]/.test(d)) return 'Indian mobile numbers start with 6, 7, 8 or 9.';
  if (/^(\d)\1{9}$/.test(d)) return 'Not a valid number (all digits the same).';
  if (isSequential(d)) return 'Not a valid number (sequential digits).';
  if (/^(\d{2})\1{4}$/.test(d) || /^(\d{3})\1{3}$/.test(d)) return 'Not a valid number (repeating pattern).';
  return '';
}