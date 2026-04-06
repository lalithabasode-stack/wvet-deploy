// compute-correlations.js
// For each managed account, computes Pearson r for all 2^n-1 subsets of
// conversion actions vs monthly matchback. Stores full results in data.json.

const fs = require('fs');
const JSON_PATH = process.argv[2] || './data.json';
const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

const MANAGED_NAMES = [
  'Payson Family Pet Hospital','Cherrelyn Animal Hospital','Mukilteo Veterinary Hospital',
  'Chico Creek Animal Hospital','Mission Valley Veterinary Clinic','Cimarron Animal Hospital',
  'Arkansas Veterinary Clinic','Barker Animal Hospital','Laurel Pet Hospital',
  'Kings Trail Animal Hospital','Abel Pet Clinic','Animal Clinic East'
];

const MO = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

const ACTIONS = [
  { key: 'nc_call',   label: 'NC Industry (call ext)'   },
  { key: 'nc_web',    label: 'NC Industry (web calls)'  },
  { key: 'appt_call', label: 'Appt Booked (call ext)'   },
  { key: 'appt_web',  label: 'Appt Booked (web calls)'  },
  { key: 'nca_call',  label: 'NC Appointment (call ext)' },
  { key: 'nca_web',   label: 'NC Appointment (web calls)'},
];

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a,b)=>a+b,0)/n;
  const my = ys.reduce((a,b)=>a+b,0)/n;
  let num=0, dx=0, dy=0;
  for (let i=0;i<n;i++){
    const a=xs[i]-mx, b=ys[i]-my;
    num+=a*b; dx+=a*a; dy+=b*b;
  }
  if (dx===0||dy===0) return 0;
  return num/Math.sqrt(dx*dy);
}

function subsets(arr) {
  const result = [];
  for (let mask=1; mask<(1<<arr.length); mask++) {
    result.push(arr.filter((_,i)=>(mask>>i)&1));
  }
  return result;
}

for (const acct of data.accounts) {
  if (!MANAGED_NAMES.includes(acct.name)) continue;
  if (!acct.daily || !acct.mb) continue;

  // Build monthly action sums
  const monthly = {};
  for (const d of Object.values(acct.daily)) {
    const dt = new Date(d.date);
    const mk = MO[dt.getMonth()] + String(dt.getFullYear()).slice(2);
    if (!monthly[mk]) monthly[mk] = {};
    for (const {key} of ACTIONS) monthly[mk][key] = (monthly[mk][key]||0) + (d[key]||0);
  }

  // Find months with both action data and matchback > 0
  const overlap = Object.keys(monthly).filter(mk => {
    const mb = acct.mb[mk];
    const tot = ACTIONS.reduce((s,{key})=>s+(monthly[mk][key]||0),0);
    return mb != null && mb > 0 && tot > 0;
  }).sort();

  if (overlap.length < 3) {
    console.log(acct.name + ': not enough overlap months (' + overlap.length + ')');
    continue;
  }

  const mbVals = overlap.map(mk => acct.mb[mk]);

  // Filter to actions that have any non-zero data
  const activeActions = ACTIONS.filter(({key}) => overlap.some(mk => (monthly[mk][key]||0) > 0));
  const n = activeActions.length;
  const totalCombos = (1 << n) - 1;

  // Compute r for all subsets
  const combos = [];
  for (let mask=1; mask<=totalCombos; mask++) {
    const subset = activeActions.filter((_,i)=>(mask>>i)&1);
    const xs = overlap.map(mk => subset.reduce((s,{key})=>s+(monthly[mk][key]||0),0));
    const r = pearson(xs, mbVals);
    if (r !== null) combos.push({ r: +r.toFixed(4), actions: subset.map(a=>a.label) });
  }

  combos.sort((a,b)=>b.r-a.r);

  // All-actions r
  const allXs = overlap.map(mk => activeActions.reduce((s,{key})=>s+(monthly[mk][key]||0),0));
  const allR = pearson(allXs, mbVals);

  // Per-action individual r
  const perAction = {};
  for (const {key, label} of activeActions) {
    const xs = overlap.map(mk => monthly[mk][key]||0);
    perAction[label] = +(pearson(xs, mbVals)||0).toFixed(4);
  }

  // Store results
  acct.corr = {
    n_actions:     n,
    total_combos:  totalCombos,
    all_r:         +(allR||0).toFixed(4),
    best_r:        combos[0]?.r ?? null,
    best_combo:    combos[0]?.actions ?? [],
    delta:         +((combos[0]?.r ?? 0) - (allR||0)).toFixed(4),
    top10:         combos.slice(0, 10),
    per_action:    perAction,
    months_used:   overlap.length,
  };

  console.log(acct.name + ': all_r=' + acct.corr.all_r + ' best_r=' + acct.corr.best_r + ' delta=+' + (acct.corr.delta*100).toFixed(1) + 'pp (' + overlap.length + ' months, ' + totalCombos + ' combos)');
}

fs.writeFileSync(JSON_PATH, JSON.stringify(data));
console.log('\ndata.json updated with corr field for all managed accounts');
