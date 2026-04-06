// compute-correlations.js
// Computes Pearson r for all 2^n-1 subsets of conversion actions vs monthly
// matchback for every account that has both conv_monthly AND mb data.
// Falls back to daily fields for accounts without conv_monthly (e.g. managed 12).
// Stores results in account.corr — used only by the Correlation tab.
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
  if (!acct.daily || Object.keys(acct.daily).length === 0) return null;
  const monthly = {};
  for (const d of Object.values(acct.daily)) {
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
// e.g. "Click to Call on Website-Payson Family Pet Hospital" → "Click to Call on Website"
function normaliseLabel(raw, acctName) {
  let s = raw;
  // Remove exact account name (with common separators)
  s = s.replace(new RegExp('[\\s\\-–]+' + acctName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*$', 'i'), '');
  // Remove trailing GA4 source tags e.g. " - GA4", "(GA4)", "- GA4"
  s = s.replace(/[\s\-–]+GA4.*$/i, '').replace(/\s*\(GA4\).*$/i, '');
  return s.trim() || raw;
}

let processed = 0, skipped = 0;

for (const acct of data.accounts) {
  if (!acct.mb || Object.keys(acct.mb).length === 0) { skipped++; continue; }

  const actionMap = fromConvMonthly(acct) || fromDaily(acct);
  if (!actionMap) { skipped++; continue; }

  // Find months where both matchback > 0 and at least one action > 0
  const mbKeys = Object.keys(acct.mb).filter(mk => (acct.mb[mk] || 0) > 0);
  const overlap = mbKeys.filter(mk =>
    Object.values(actionMap).some(byMk => (byMk[mk] || 0) > 0)
  ).sort();

  if (overlap.length < 3) { skipped++; continue; }

  const mbVals = overlap.map(mk => acct.mb[mk]);

  // Filter to actions with any non-zero data in overlap months
  const activeActions = Object.entries(actionMap)
    .filter(([, byMk]) => overlap.some(mk => (byMk[mk] || 0) > 0))
    .map(([rawLabel, byMk]) => ({
      rawLabel,
      label: normaliseLabel(rawLabel, acct.name),
      byMk,
    }));

  if (activeActions.length === 0) { skipped++; continue; }

  // Sort by individual r desc, cap at 20 to keep combos manageable
  const withR = activeActions.map(a => ({
    ...a,
    r: pearson(overlap.map(mk => a.byMk[mk] || 0), mbVals) || 0,
  })).sort((a, b) => b.r - a.r);

  const usedActions = withR.slice(0, 20);
  const totalCombos = (1 << usedActions.length) - 1;

  // All-actions r
  const allXs = overlap.map(mk =>
    usedActions.reduce((s, { byMk }) => s + (byMk[mk] || 0), 0)
  );
  const allR = pearson(allXs, mbVals);

  // Per-action r — keyed by raw label (exact Google Ads name) for actionability
  const perAction = {};
  for (const { rawLabel, byMk } of usedActions) {
    const xs = overlap.map(mk => byMk[mk] || 0);
    perAction[rawLabel] = +(pearson(xs, mbVals) || 0).toFixed(4);
  }

  // All 2^n-1 combos
  const combos = [];
  for (let mask = 1; mask <= totalCombos; mask++) {
    const subset = usedActions.filter((_, i) => (mask >> i) & 1);
    const xs = overlap.map(mk => subset.reduce((s, { byMk }) => s + (byMk[mk] || 0), 0));
    const r = pearson(xs, mbVals);
    if (r !== null) combos.push({
      r: +r.toFixed(4),
      actions: subset.map(a => a.rawLabel),          // raw for detail card
      actionsDisplay: subset.map(a => a.label),      // normalised for summary chips
    });
  }
  combos.sort((a, b) => b.r - a.r);

  acct.corr = {
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
    source:          acct.conv_monthly ? 'conv_monthly' : 'daily_fields',
  };

  processed++;
  if (processed <= 20 || processed % 50 === 0) {
    console.log(`${acct.name}: all_r=${acct.corr.all_r} best_r=${acct.corr.best_r} Δ=+${(acct.corr.delta*100).toFixed(1)}pp (${overlap.length}mo, ${usedActions.length} actions, ${totalCombos} combos) [${acct.corr.source}]`);
  }
}

fs.writeFileSync(JSON_PATH, JSON.stringify(data));
console.log(`\nDone. Processed: ${processed} | Skipped (no data): ${skipped}`);
