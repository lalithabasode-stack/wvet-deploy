// parse-matchback-new.js
// Reads "CPA by Month - Paid Search (3).xlsx" (wide format) and writes
// mb, mb_inv, mb_vet into data.json for all matched accounts.
//
// Excel layout:
//   Col 0: L-Code (L-001 … L-401)
//   Col 1: Practice Name
//   Col 2: Managed Accounts ("Y" or blank)
//   Then 5 cols per month: Total | Invoca | Online Booking | Expense | CPA
//
// Month order (from row 0 serial dates):
//   45741=Mar-25  45772=Apr-25  45802=May-25  45833=Jun-25
//   45863=Jul-25  45894=Aug-25  45925=Sep-25  45955=Oct-25
//   45986=Nov-25  46016=Dec-25  46047=Jan-26  46078=Feb-26

const fs   = require('fs');
const XLSX = require('xlsx');

const XLSX_PATH = process.argv[2] || '/Users/lalithabasode/Downloads/CPA by Month - Paid Search (3).xlsx';
const JSON_PATH = process.argv[3] || '/Users/lalithabasode/wvet-deploy/data.json';

// Columns 3,8,13,18,23,28,33,38,43,48,53,58 are month start columns
const MONTH_COLS = [
  { col: 3,  key: 'mar' },
  { col: 8,  key: 'apr' },
  { col: 13, key: 'may' },
  { col: 18, key: 'jun' },
  { col: 23, key: 'jul' },
  { col: 28, key: 'aug' },
  { col: 33, key: 'sep' },
  { col: 38, key: 'oct' },
  { col: 43, key: 'nov' },
  { col: 48, key: 'dec' },
  { col: 53, key: 'jan' },
  { col: 58, key: 'feb' },
];

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const wb   = XLSX.readFile(XLSX_PATH);
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: 0 });

const data     = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const accounts = data.accounts;

// Build lookup by locationCode (primary) and normalized name (fallback)
const byCode = {};
const byName = {};
for (const a of accounts) {
  if (a.locationCode) byCode[a.locationCode.toUpperCase()] = a;
  byName[normalize(a.name)] = a;
}

let matched = 0, unmatched = [];

for (let ri = 2; ri < rows.length; ri++) {
  const row = rows[ri];
  const lcode = String(row[0] || '').trim().toUpperCase(); // e.g. "L-001"
  const name  = String(row[1] || '').trim();
  if (!lcode.match(/^L-\d+/)) continue;

  // Match by L-Code first, then name
  let acct = byCode[lcode];
  if (!acct) {
    const nk = normalize(name);
    acct = byName[nk];
    if (!acct) {
      // Substring fallback
      acct = accounts.find(a => normalize(a.name).includes(nk) || nk.includes(normalize(a.name)));
    }
  }

  if (!acct) {
    unmatched.push(`${lcode} ${name}`);
    continue;
  }

  if (!acct.mb)     acct.mb     = {};
  if (!acct.mb_inv) acct.mb_inv = {};
  if (!acct.mb_vet) acct.mb_vet = {};

  for (const { col, key } of MONTH_COLS) {
    const total  = Number(row[col]     || 0);
    const invoca = Number(row[col + 1] || 0);
    const online = Number(row[col + 2] || 0);
    // Only write if there's any data (skip fully-zero months)
    if (total > 0 || invoca > 0 || online > 0) {
      acct.mb[key]     = total;
      acct.mb_inv[key] = invoca;
      acct.mb_vet[key] = online;
    }
  }

  matched++;
}

// Rebuild monthly totals
for (const m of (data.monthly || [])) {
  const mk = m.month;
  const tot = accounts.reduce((s, a) => s + (a.mb && a.mb[mk] != null ? a.mb[mk] : 0), 0);
  if (tot > 0) m.mb = tot;
}

fs.writeFileSync(JSON_PATH, JSON.stringify(data));
console.log(`Matched: ${matched}  |  Unmatched: ${unmatched.length}`);
if (unmatched.length) console.log('Unmatched:\n  ' + unmatched.join('\n  '));
console.log('data.json updated with mb / mb_inv / mb_vet for all 300 accounts');
