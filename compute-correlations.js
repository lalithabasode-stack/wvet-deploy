// compute-correlations.js
// Computes Pearson r for all 2^n-1 subsets of conversion actions vs monthly
// matchback — separately for Invoca (phone) and Vetstoria (online booking).
// Stores results in account.corr_inv and account.corr_vet.
// Used only by the Correlation tab.
//
// Usage: node compute-correlations.js [path/to/data.json]

const fs = require('fs');
const JSON_PATH = process.argv[2] || './data.json';
const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

const MO = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

// Fallback daily-field actions for accounts without conv_monthly
const DAILY_ACTIONS = [
  { key: 'nc_call',   label: 'New Client (Industry) (call extensions)'            },
  { key: 'nc_web',    label: 'New Client (Industry) (web page calls)'             },
  { key: 'appt_call', label: 'Appointment Booked (Conversion) (call extensions)'  },
  { key: 'appt_web',  label: 'Appointment Booked (Conversion) (web page calls)'   },
  { key: 'nca_call',  label: 'New Client Appointment (call extensions)'           },
  { key: 'nca_web',   label: 'New Client Appointment (web page calls)'            },
];

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

// Build action map from conv_monthly: { label: { mk: value } }
function fromConvMonthly(acct) {
  const cm = acct.conv_monthly;
  if (!cm || Object.keys(cm).length === 0) return null;
  return cm;
}

// Build action map from daily fields (fallback)
function fromDaily(acct) {
  if (!acct.daily || acct.daily.length === 0) return null;
  const monthly = {};
  for (const d of acct.daily) {
    const dt = new Date(d.date);
    const mk = MO[dt.getMonth()] + String(dt.getFullYear()).slice(2);
    for (const { key, label } of DAILY_ACTIONS) {
      if (!monthly[label]) monthly[label] = {};
      monthly[label][mk] = (monthly[label][mk] || 0) + (d[key] || 0);
    }
  }
  return monthly;
}

// Strip hospital name suffix from action names for display normalisation
function normaliseLabel(raw, acctName) {
  let s = raw;
  s = s.replace(new RegExp('[\\s\\-–]+' + acctName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*$', 'i'), '');
  s = s.replace(/[\s\-–]+GA4.*$/i, '').replace(/\s*\(GA4\).*$/i, '');
  return s.trim() || raw;
}

// Core correlation engine — runs against any mbObj (mb_inv or mb_vet)
function computeCorr(actionMap, mbObj, acctName, source) {
  const mbKeys = Object.keys(mbObj).filter(mk => (mbObj[mk] || 0) > 0);
  const overlap = mbKeys.filter(mk =>
    Object.values(actionMap).some(byMk => (byMk[mk] || 0) > 0)
  ).sort();

  if (overlap.length < 3) return null;

  const mbVals = overlap.map(mk => mbObj[mk]);

  const activeActions = Object.entries(actionMap)
    .filter(([, byMk]) => overlap.some(mk => (byMk[mk] || 0) > 0))
    .map(([rawLabel, byMk]) => ({
      rawLabel,
      label: normaliseLabel(rawLabel, acctName),
      byMk,
    }));

  if (activeActions.length === 0) return null;

  const withR = activeActions.map(a => ({
    ...a,
    r: pearson(overlap.map(mk => a.byMk[mk] || 0), mbVals) || 0,
  })).sort((a, b) => b.r - a.r);

  const usedActions = withR.slice(0, 20);
  const totalCombos = (1 << usedActions.length) - 1;

  const allXs = overlap.map(mk =>
    usedActions.reduce((s, { byMk }) => s + (byMk[mk] || 0), 0)
  );
  const allR = pearson(allXs, mbVals);

  const perAction = {};
  for (const { rawLabel, byMk } of usedActions) {
    const xs = overlap.map(mk => byMk[mk] || 0);
    perAction[rawLabel] = +(pearson(xs, mbVals) || 0).toFixed(4);
  }

  const combos = [];
  for (let mask = 1; mask <= totalCombos; mask++) {
    const subset = usedActions.filter((_, i) => (mask >> i) & 1);
    const xs = overlap.map(mk => subset.reduce((s, { byMk }) => s + (byMk[mk] || 0), 0));
    const r = pearson(xs, mbVals);
    if (r !== null) combos.push({
      r: +r.toFixed(4),
      actions: subset.map(a => a.rawLabel),
      actionsDisplay: subset.map(a => a.label),
    });
  }
  combos.sort((a, b) => b.r - a.r);

  return {
    n_actions:       usedActions.length,
    total_combos:    totalCombos,
    all_r:           +(allR || 0).toFixed(4),
    best_r:          combos[0]?.r ?? null,
    best_combo:      combos[0]?.actions ?? [],
    best_combo_disp: combos[0]?.actionsDisplay ?? [],
    delta:           +((combos[0]?.r ?? 0) - (allR || 0)).toFixed(4),
    top10:           combos.slice(0, 10),
    per_action:      perAction,
    months_used:     overlap.length,
    source,
  };
}

let processed = 0, skipped = 0;

for (const acct of data.accounts) {
  const hasMbInv = acct.mb_inv && Object.keys(acct.mb_inv).some(mk => (acct.mb_inv[mk] || 0) > 0);
  const hasMbVet = acct.mb_vet && Object.keys(acct.mb_vet).some(mk => (acct.mb_vet[mk] || 0) > 0);

  if (!hasMbInv && !hasMbVet) { skipped++; continue; }

  const actionMap = fromConvMonthly(acct) || fromDaily(acct);
  if (!actionMap) { skipped++; continue; }

  const src = acct.conv_monthly ? 'conv_monthly' : 'daily_fields';

  acct.corr_inv = hasMbInv ? computeCorr(actionMap, acct.mb_inv, acct.name, src) : null;
  acct.corr_vet = hasMbVet ? computeCorr(actionMap, acct.mb_vet, acct.name, src) : null;
  delete acct.corr;

  if (acct.corr_inv || acct.corr_vet) {
    processed++;
    if (processed <= 20 || processed % 50 === 0) {
      const inv = acct.corr_inv;
      const vet = acct.corr_vet;
      const invStr = inv ? `inv_r=${inv.best_r} (${inv.months_used}mo)` : 'inv=—';
      const vetStr = vet ? `vet_r=${vet.best_r} (${vet.months_used}mo)` : 'vet=—';
      console.log(`${acct.name}: ${invStr} ${vetStr} [${src}]`);
    }
  } else {
    skipped++;
  }
}

fs.writeFileSync(JSON_PATH, JSON.stringify(data));
console.log(`\nDone. Processed: ${processed} | Skipped (no data): ${skipped}`);
