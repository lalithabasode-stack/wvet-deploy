#!/usr/bin/env node
/**
 * fetch-all-conv-monthly.js
 * Pulls ALL enabled conversion actions at monthly grain for every account.
 * Stores account.conv_monthly = { 'Action Name': { oct25: N, nov25: N, ... } }
 * Used ONLY by compute-correlations.js — does not affect dashboard charts.
 *
 * Usage: node fetch-all-conv-monthly.js
 */

const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: '/Users/lalithabasode/claude/google-ads-mcp/.env' });
const { GoogleAdsApi } = require('google-ads-api');

const MCC_ID     = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '8264811884';
const START_DATE = '2025-01-01';
const JSON_PATH  = './data.json';

const MO_SHORT = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function mkKey(dateStr) {
  // dateStr = 'YYYY-MM-DD' or 'YYYY-MM-01'
  const d = new Date(dateStr + 'T00:00:00');
  return MO_SHORT[d.getMonth()] + String(d.getFullYear()).slice(2);
}

const client = new GoogleAdsApi({
  client_id:     process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
});

function getCustomer(cid) {
  return client.Customer({
    customer_id:      cid,
    login_customer_id: MCC_ID,
    refresh_token:    process.env.GOOGLE_ADS_REFRESH_TOKEN,
  });
}

async function main() {
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const accounts = data.accounts;

  // Only process accounts that have matchback data — no point correlating without ground truth
  const withMB = accounts.filter(a => a.mb && Object.keys(a.mb).length > 0 && a.cid);
  console.log(`Processing ${withMB.length} accounts with matchback data...`);

  const dateTo = new Date().toISOString().slice(0, 10);
  const BATCH  = 10;
  let done = 0;

  const query = `
    SELECT segments.month, segments.conversion_action_name, metrics.all_conversions
    FROM campaign
    WHERE segments.date BETWEEN '${START_DATE}' AND '${dateTo}'
    ORDER BY segments.month`;

  for (let i = 0; i < withMB.length; i += BATCH) {
    const batch = withMB.slice(i, i + BATCH);
    await Promise.all(batch.map(async acct => {
      try {
        const customer = getCustomer(acct.cid);
        const rows = await customer.query(query);
        const convMonthly = {};
        for (const row of rows) {
          const mk  = mkKey(row.segments.month);
          const act = row.segments.conversion_action_name;
          const val = row.metrics.all_conversions || 0;
          if (!val) continue;
          if (!convMonthly[act]) convMonthly[act] = {};
          convMonthly[act][mk] = (convMonthly[act][mk] || 0) + val;
        }
        acct.conv_monthly = convMonthly;
        process.stdout.write('.');
      } catch (err) {
        process.stdout.write('x');
        // Leave conv_monthly unchanged on error
      }
      done++;
    }));
    console.log(` ${Math.min(i + BATCH, withMB.length)}/${withMB.length}`);
  }

  fs.writeFileSync(JSON_PATH, JSON.stringify(data));
  console.log(`\ndone — conv_monthly written for up to ${withMB.length} accounts`);
}

main().catch(err => { console.error(err); process.exit(1); });
