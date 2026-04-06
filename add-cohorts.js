// add-cohorts.js — reads cohort data from Google Sheet and writes to data.json
const https = require('https');
const fs    = require('fs');

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/1d93xWlH95KXjmCpht9CwxqNmaGGCnqFc/gviz/tq?tqx=out:csv&gid=232188416';

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307) && res.headers.location && redirects > 0) {
        return get(res.headers.location, redirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve(buf));
    }).on('error', reject);
  });
}

// Parse a single CSV line respecting quoted fields
function parseLine(line) {
  const fields = [];
  let inQ = false, f = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { fields.push(f.trim()); f = ''; continue; }
    f += ch;
  }
  fields.push(f.trim());
  return fields;
}

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Manual overrides for accounts whose names differ between data.json and the sheet
const MANUAL = {
  'animal care of carters creek':               { cohort:'Ready for Growth',       code:'L-200' },
  'unleashed at carters creek':                 { cohort:'Ready for Growth',       code:'L-200' }, // sister location
  'blackhawk veterinary hospital g1':           { cohort:'Preparing for Growth',   code:'L-046' },
  'echo hollow veterinary hospital  & urgent care': { cohort:'Growth',             code:'L-324' },
  'paws and claws animal hospital':             { cohort:'Preparing for Growth',   code:'L-176' },
};

async function main() {
  console.log('Fetching cohort sheet…');
  const csv = await get(SHEET_CSV);
  const lines = csv.split('\n').filter(l => l.trim());

  // Build name → cohort map (skip header row 0 and Total row 1)
  const cohortMap = {};        // normalized name → cohort
  const locationCodeMap = {};  // normalized name → location code
  for (let i = 2; i < lines.length; i++) {
    const f = parseLine(lines[i]);
    const code   = f[0];   // L-001
    const name   = f[1];   // Location Name
    const cohort = f[2];   // Growth / Ready for Growth / Preparing for Growth
    if (name && cohort) {
      cohortMap[normalize(name)]  = cohort;
      locationCodeMap[normalize(name)] = code;
    }
  }
  console.log(`Sheet: ${Object.keys(cohortMap).length} accounts with cohorts`);

  const raw  = fs.readFileSync('./data.json', 'utf8');
  const data = JSON.parse(raw);

  let matched = 0, unmatched = [];

  for (const acct of data.accounts) {
    const key = normalize(acct.name);

    // 0. Manual override
    const nameLower = acct.name.toLowerCase().trim();
    if (MANUAL[nameLower]) {
      acct.cohort      = MANUAL[nameLower].cohort;
      acct.locationCode = MANUAL[nameLower].code;
      matched++;
      continue;
    }

    // 1. Exact normalized match
    if (cohortMap[key]) {
      acct.cohort      = cohortMap[key];
      acct.locationCode = locationCodeMap[key];
      matched++;
      continue;
    }

    // 2. One name contains the other (handles minor trailing/leading differences)
    let found = null, foundCode = null;
    for (const [sheetKey, c] of Object.entries(cohortMap)) {
      if (key.includes(sheetKey) || sheetKey.includes(key)) {
        found = c; foundCode = locationCodeMap[sheetKey]; break;
      }
    }
    if (found) {
      acct.cohort      = found;
      acct.locationCode = foundCode;
      matched++;
      continue;
    }

    // 3. No match
    acct.cohort      = null;
    acct.locationCode = null;
    unmatched.push(acct.name);
  }

  console.log(`Matched: ${matched}  |  Unmatched: ${unmatched.length}`);
  if (unmatched.length) console.log('Unmatched accounts:\n  ' + unmatched.join('\n  '));

  fs.writeFileSync('./data.json', JSON.stringify(data));
  console.log('data.json updated with cohort + locationCode fields');
}

main().catch(err => { console.error(err); process.exit(1); });
