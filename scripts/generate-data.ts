// Synthetic data generator. ALL DATA IS SYNTHETIC. Fixed seed, so every run gives the same files.
// Run: npm run data. Output: public/data/*.json
//
// The generator simulates the life of each account: registration -> charges -> coding ->
// final bill -> claim edits -> submission -> payment or denial -> appeal -> payment or write-off.
// Aggregate facts (A/R and DNFB snapshots) are built from the same accounts, so the numbers
// reconcile. The account file is a 1-in-N sample (config sampleWeight); the engine scales
// account-based measures by N so the dollar totals match a mid-size health system.
//
// Planted patterns (each one has a traceable cause in the data):
// 1. Net A/R days rise over the last ~8 months. Main driver: Williamson Regional, Humana Medicare
//    Advantage claims pended for medical records, which pile up in the 121–180 day bucket.
// 2. Valley Regional denials rise: Medicare Advantage plans deny for coordination of benefits
//    (MSP / COB questionnaire). Accounts that failed a registration edit are denied more often.
// 3. Cigna underpays: it pays about 93% of expected reimbursement (payment variance).
// 4. DNFB tail at Riverbend (coding backlog) and Lakeside General (unassigned holds, late charges).
// 5. Pine Ridge has a low clean claim rate, mostly registration edits, which feeds eligibility denials.
// 6. Write-offs rise at Williamson Regional and Highland Park in the last 6 months: medical-necessity
//    and timely-filing denials are overturned less often.
// 7. Scheduling falls in the last 4 weeks at Valley Regional, Williamson Regional and Pine Ridge.
// 8. Seasonality: winter volume peak, a March coding backlog at all sites, and a Q1 rise in
//    self-pay after deductibles reset.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCOUNT_STATUS, AR_AGE, BILLED_STATUS, DENIAL_CATEGORIES, DNFB_AGE, DNFB_HOLDS, EDIT_CATEGORIES,
  FACILITIES, FC_SELF_PAY, FINANCIAL_CLASSES, ORGANIZATION, PATIENT_TYPES, PAYERS, REGIONS,
  ROOT_CAUSES, SERVICE_LINES, SOURCE_SYSTEMS,
} from './dimensions';
import {
  monthEndDay, monthIndexOfDay, monthIndexOfKey, monthStartDay, weekday,
} from '../src/data/dates';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(root, 'config/data.config.json'), 'utf8')) as {
  seed: number; endMonth: string; months: number; warmupMonths: number; preliminaryMonths: number;
  claimsPerMonth: number; sampleWeight: number; lastRefreshUtc: string; displayTimeZone: string;
  availabilityBusinessDay: number;
};
const W = cfg.sampleWeight;

// ---------- random ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(cfg.seed);
const chance = (p: number) => rnd() < p;
const uniform = (a: number, b: number) => a + (b - a) * rnd();
const randInt = (a: number, b: number) => Math.floor(uniform(a, b + 1));
function normal(mean = 0, sd = 1) {
  const u = 1 - rnd();
  const v = rnd();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function lognormal(mean: number, cv: number) {
  const s2 = Math.log(1 + cv * cv);
  return Math.exp(normal(Math.log(mean) - s2 / 2, Math.sqrt(s2)));
}
function poisson(lambda: number) {
  if (lambda > 30) return Math.max(0, Math.round(normal(lambda, Math.sqrt(lambda))));
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k++; p *= rnd(); } while (p > l);
  return k - 1;
}
function pick(weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** Stochastic rounding keeps small daily counts unbiased. */
const sround = (x: number) => Math.floor(x + rnd());

// ---------- calendar ----------
const endMi = monthIndexOfKey(cfg.endMonth);
const windowStartMi = endMi - cfg.months + 1;
const genStartMi = windowStartMi - cfg.warmupMonths;
const windowStartDay = monthStartDay(windowStartMi);
const genStartDay = monthStartDay(genStartMi);
const asOfDay = monthEndDay(endMi); // data is complete through this day
/** 0 at window start, 1 at window end. */
const progress = (day: number) => clamp((day - windowStartDay) / (asOfDay - windowStartDay), 0, 1);
const monthsBeforeEnd = (day: number) => endMi - monthIndexOfDay(day);
/** 0 before the pattern starts, ramps to 1 over `ramp` months, measured back from the end. */
const recentRamp = (day: number, startMonthsBack: number, ramp: number) =>
  clamp((startMonthsBack - monthsBeforeEnd(day)) / ramp, 0, 1);

// ---------- facility profiles ----------
interface Profile {
  weight: number;
  cleanStart: number; cleanEnd: number; regShare: number;
  dnfbTail: number; unassignedShare: number; codingBacklog: boolean; lateCharges: number;
  slowMa: boolean; maCobSpike: boolean; woRise: boolean; selfPay: number;
  hasOrders: boolean; hasCalls: boolean; schedDrop: boolean; schedStart: number; schedEnd: number;
  costRate: number; queryRate: number;
}
const P = (o: Partial<Profile> & { weight: number }): Profile => ({
  cleanStart: 0.85, cleanEnd: 0.88, regShare: 0.42, dnfbTail: 0.025, unassignedShare: 0.3,
  codingBacklog: false, lateCharges: 0.03, slowMa: false, maCobSpike: false, woRise: false,
  selfPay: 0.055, hasOrders: true, hasCalls: true, schedDrop: false, schedStart: 0.86, schedEnd: 0.94,
  costRate: 0.029, queryRate: 0.16, ...o,
});
const PROFILES: Profile[] = [
  P({ weight: 0.27, cleanStart: 0.87, cleanEnd: 0.9, maCobSpike: true, schedDrop: true, costRate: 0.026, queryRate: 0.21 }),
  P({ weight: 0.17, cleanStart: 0.84, cleanEnd: 0.87, dnfbTail: 0.09, unassignedShare: 0.25, codingBacklog: true }),
  P({ weight: 0.14, cleanStart: 0.85, cleanEnd: 0.86, slowMa: true, woRise: true, schedDrop: true, costRate: 0.031 }),
  P({ weight: 0.11, cleanStart: 0.86, cleanEnd: 0.9, hasCalls: false }),
  P({ weight: 0.09, cleanStart: 0.83, cleanEnd: 0.88, dnfbTail: 0.08, unassignedShare: 0.75, lateCharges: 0.1 }),
  P({ weight: 0.08, cleanStart: 0.86, cleanEnd: 0.88, woRise: true, selfPay: 0.1, costRate: 0.033 }),
  P({ weight: 0.04, cleanStart: 0.72, cleanEnd: 0.76, regShare: 0.72, schedDrop: true, schedStart: 0.8, schedEnd: 0.9, costRate: 0.042 }),
  P({ weight: 0.04, cleanStart: 0.89, cleanEnd: 0.93, costRate: 0.038 }),
  P({ weight: 0.033, cleanStart: 0.84, cleanEnd: 0.89, hasOrders: false, costRate: 0.04 }),
  P({ weight: 0.027, cleanStart: 0.85, cleanEnd: 0.88, hasCalls: false, costRate: 0.044 }),
];

// ---------- payer behavior (index = payer key) ----------
const MIX_LARGE = [24, 9, 8, 9, 7, 5, 13, 6, 5, 6, 2, 0];
const MIX_CAH = [31, 6, 5, 12, 5, 4, 12, 4, 3, 4, 2, 0];
/** Expected net reimbursement as a share of gross charges. */
const NET_RATIO = [0.3, 0.29, 0.28, 0.24, 0.25, 0.25, 0.46, 0.48, 0.47, 0.45, 0.5, 0.12];
/** Days from submission to payment: mean, sd. */
const PAY_LAG: [number, number][] = [
  [16, 5], [33, 10], [35, 11], [40, 14], [33, 10], [35, 11], [25, 8], [31, 9], [33, 10], [34, 11], [60, 24], [40, 18],
];
/** Paid / expected on paid claims. Cigna (8) underpays. */
const PAY_RATIO = [1.0, 0.996, 0.995, 1.0, 0.978, 0.993, 0.998, 0.996, 0.925, 0.994, 0.99, 1];
/** Initial denial probability per claim. */
const DENIAL_BASE = [0.03, 0.065, 0.068, 0.05, 0.062, 0.066, 0.038, 0.046, 0.05, 0.057, 0.06, 0];

// Service line mix and gross charge per account.
const SVC_MIX_LARGE = [8, 2.5, 22, 7, 17, 22, 9, 12.5];
const SVC_MIX_CAH = [5, 1, 25, 4, 18, 26, 10, 11];
const SVC_CHARGE = [46000, 19000, 4200, 11500, 2600, 720, 1100, 560];
const SVC_CHARGE_CAH = [0.6, 0.75, 0.85, 0.8, 0.9, 0.95, 0.95, 0.95];

// ---------- accounts ----------
// Stored as compact columns. Dates are lags (days) from an anchor date; -1 = not happened by the as-of date.
const COLS = [
  'fac', 'payer', 'svc', 'dd', 'gross', 'net', 'chgLag', 'lateAmt', 'missAmt', 'codeL', 'qry', 'hold',
  'fbL', 'sbL', 'edit', 'rc', 'denL', 'apl', 'payL', 'payAmt', 'pos', 'woL', 'bdL', 'bdAmt', 'chr', 'pend',
] as const;
type Col = typeof COLS[number];
const A: Record<Col, number[]> = Object.fromEntries(COLS.map((c) => [c, []])) as unknown as Record<Col, number[]>;
// Full-precision dates kept in memory for the snapshot builders.
const X = { fbd: [] as number[], sbd: [] as number[], payD: [] as number[], denD: [] as number[], closeD: [] as number[], status: [] as number[] };

const lagOrNone = (event: number, anchor: number) => (event < 0 || event > asOfDay ? -1 : event - anchor);

for (let day = genStartDay; day <= asOfDay; day++) {
  const mi = monthIndexOfDay(day);
  const moy = mi % 12;
  const seasonal = 1 + 0.06 * Math.cos((moy / 12) * 2 * Math.PI); // winter peak
  const growth = 1 + 0.025 * ((day - genStartDay) / 365);
  const dow = weekday(day);
  const dowFactor = dow === 0 || dow === 6 ? 0.6 : 1.16;
  for (const f of FACILITIES) {
    const pr = PROFILES[f.key];
    const cah = f.type === 'Critical Access';
    const lambda = (cfg.claimsPerMonth / 30.4) * pr.weight * seasonal * growth * dowFactor;
    const n = poisson(lambda);
    for (let i = 0; i < n; i++) {
      const p = progress(day);
      const mix = (cah ? MIX_CAH : MIX_LARGE).slice();
      mix[11] = pr.selfPay * 100 * (moy <= 2 ? 1.25 : 1); // deductibles reset in Q1
      if (pr.slowMa) mix[1] *= 2.2; // Humana is the dominant MA plan in Williamson's market
      const payer = pick(mix);
      const fc = PAYERS[payer].fc;
      const svc = pick(cah ? SVC_MIX_CAH : SVC_MIX_LARGE);
      const inpatient = svc <= 1;
      const gross = Math.round(lognormal(SVC_CHARGE[svc] * (cah ? SVC_CHARGE_CAH[svc] : 1), 0.36));
      const net = Math.round(gross * NET_RATIO[payer] * uniform(0.93, 1.07));

      // ----- charge capture -----
      let chgLag = Math.max(0, Math.round(normal(inpatient ? 1.6 : 1.1, 0.8)));
      const late = chance(pr.lateCharges * (svc === 4 || svc === 6 ? 1.6 : 1));
      if (late) chgLag += randInt(4, 12);
      const lateAmt = late ? Math.round(gross * uniform(0.06, 0.25)) : 0;
      const missAmt = chance(cah ? 0.03 : 0.016) ? Math.round(gross * uniform(0.03, 0.12)) : 0;

      // ----- coding and CDI -----
      const qry = inpatient && chance(pr.queryRate) ? 1 : 0;
      let codeLag = inpatient ? Math.max(1, Math.round(normal(2.6, 0.9))) : Math.max(0, Math.round(normal(0.9, 0.6)));
      if (qry) codeLag += randInt(2, 6);
      let hold = 0;
      if (pr.codingBacklog && monthsBeforeEnd(day) <= 5) { codeLag += randInt(1, 4); if (chance(0.4)) hold = 1; }
      if (moy === 2 && chance(0.3)) { codeLag += randInt(2, 6); hold = 1; } // March backlog
      if (qry) hold = 2;

      // ----- final bill (DNFB) -----
      let fbLag = Math.max(codeLag, late ? chgLag : 0) + Math.max(0, Math.round(normal(inpatient ? 1.5 : 0.8, 0.6)));
      if (chance(pr.dnfbTail)) {
        fbLag += randInt(8, 30);
        hold = chance(pr.unassignedShare) ? 6 : pr.codingBacklog ? 1 : pick([0, 0, 2, 3, 4, 0, 6]);
      } else if (chance(0.16)) {
        fbLag += randInt(1, 5);
        if (hold === 0) hold = pick([30, 25, 12, 15, 12, 0, 6]);
      }
      if (late && hold === 0) hold = 3;
      const fbd = day + fbLag;
      const codeD = day + codeLag;

      // ----- claim edits and submission -----
      const cleanRate = pr.cleanStart + (pr.cleanEnd - pr.cleanStart) * p + normal(0, 0.008);
      const isClean = chance(cleanRate);
      let edit = -1;
      let sbLag = pick([58, 26, 10, 6]);
      if (!isClean) {
        edit = pick([pr.regShare, (1 - pr.regShare) * 0.4, (1 - pr.regShare) * 0.3, (1 - pr.regShare) * 0.3]);
        sbLag += randInt(1, 4);
      }
      const sbd = fbd + sbLag;

      // Point-of-service cash for self-pay patients.
      let pos = 0;
      if (fc === FC_SELF_PAY && chance(0.5)) pos = Math.round(net * uniform(0.2, 0.4));

      let rc = -1, denD = -1, apl = 0, payD = -1, payAmt = 0, woD = -1, bdD = -1, bdAmt = 0, chr = 0, pend = 0;
      let closeD = -1;

      if (fc === FC_SELF_PAY) {
        const remaining = net - pos;
        let paid = 0;
        if (chance(0.55)) {
          paid = Math.round(remaining * uniform(0.45, 0.9));
          payD = sbd + randInt(20, 110);
          payAmt = paid;
        }
        if (remaining - paid > 0) {
          chr = chance(0.38) ? 1 : 0; // qualifies for financial assistance
          bdD = sbd + (chr ? randInt(30, 90) : randInt(120, 180));
          bdAmt = remaining - paid;
          closeD = bdD;
        } else {
          closeD = payD;
        }
      } else {
        // ----- initial denial -----
        let pDeny = DENIAL_BASE[payer] * (inpatient ? 1.3 : 1);
        const rcMix = ROOT_CAUSES.map((r) => r.mix);
        if (edit === 0) { // registration errors drive eligibility and COB denials
          pDeny *= 1.6;
          [0, 1, 2].forEach((k) => { rcMix[k] *= 2.2; });
          [14, 15].forEach((k) => { rcMix[k] *= 1.6; });
        }
        if (fc === 1) { [3, 4, 5].forEach((k) => { rcMix[k] *= 1.5; }); [6, 7].forEach((k) => { rcMix[k] *= 1.4; }); }
        if (fc === 2 || fc === 3) [0, 1, 2].forEach((k) => { rcMix[k] *= 1.6; });
        if (fc === 4) [3, 9, 10].forEach((k) => { rcMix[k] *= 1.3; });
        if (!inpatient) { rcMix[6] *= 0.1; rcMix[11] *= 0.1; }
        if (pr.maCobSpike && fc === 1) {
          const spike = clamp((p - 0.3) / 0.55, 0, 1);
          pDeny += 0.24 * spike;
          rcMix[14] *= 1 + 7 * spike;
          rcMix[15] *= 1 + 5 * spike;
        }
        const woLate = pr.woRise && monthsBeforeEnd(day) <= 7;
        if (woLate) { pDeny += 0.025; [6, 7, 8, 18, 19].forEach((k) => { rcMix[k] *= 2.4; }); }

        const lag = PAY_LAG[payer];
        let payLag = Math.round(Math.max(7, normal(lag[0], lag[1])));
        // Pattern 1: Medicare Advantage plans begin pending claims for medical records about
        // 9 months before the end. Humana is the main source; Williamson Regional is hit hardest.
        let pendShare = 0;
        if (payer === 1) pendShare = (pr.slowMa ? 0.9 : inpatient ? 0.5 : 0.15) * recentRamp(day, 9, 6);
        if (payer === 2 && pr.slowMa) pendShare = 0.45 * recentRamp(day, 8, 6);
        if (payer === 2 && f.key === 0) pendShare = (inpatient ? 0.4 : 0.1) * recentRamp(day, 7, 5);
        if (pendShare > 0 && chance(pendShare)) {
          payLag = randInt(110, 200); pend = 1;
        } else if (chance(0.06)) {
          payLag = randInt(65, 170); // slow follow-up tail
        } else if (chance(0.025)) {
          payLag = randInt(185, 420); // disputes, secondary balances, long-running follow-up
        } else if (chance(0.008)) {
          payLag = randInt(370, 640); // stale balances that need clean-up
        }
        if (chance(clamp(pDeny, 0, 0.9))) {
          rc = pick(rcMix);
          const r = ROOT_CAUSES[rc];
          denD = sbd + randInt(12, 32);
          let pOver = r.overturn;
          if (woLate && [6, 7, 8, 18, 19].includes(rc)) pOver *= 0.35;
          apl = chance(r.appeal) ? 1 : 0;
          if (chance(pOver)) {
            payD = denD + (apl ? randInt(45, 140) : randInt(14, 45));
            payAmt = Math.round(net * PAY_RATIO[payer] * uniform(0.985, 1.005));
            closeD = payD;
          } else {
            woD = denD + (apl ? randInt(90, 210) : r.category === 7 ? randInt(20, 60) : randInt(45, 130));
            closeD = woD;
          }
        } else {
          payD = sbd + payLag;
          payAmt = Math.round(net * PAY_RATIO[payer] * uniform(0.985, 1.005));
          closeD = payD;
        }
      }

      // Account status at the as-of date (for the account drill-through).
      let status = -1;
      if (!(closeD !== -1 && closeD <= asOfDay)) {
        if (fbd > asOfDay) status = 0;
        else if (sbd > asOfDay) status = 1;
        else if (fc === FC_SELF_PAY) status = 6;
        else if (denD !== -1 && denD <= asOfDay) status = apl ? 3 : 4;
        else if (pend && asOfDay - sbd > 30) status = 5;
        else status = 2;
      }

      A.fac.push(f.key); A.payer.push(payer); A.svc.push(svc); A.dd.push(day);
      A.gross.push(gross); A.net.push(net);
      A.chgLag.push(chgLag); A.lateAmt.push(lateAmt); A.missAmt.push(missAmt);
      A.codeL.push(lagOrNone(codeD, day)); A.qry.push(qry); A.hold.push(hold);
      A.fbL.push(lagOrNone(fbd, day)); A.sbL.push(lagOrNone(sbd, fbd));
      A.edit.push(sbd <= asOfDay ? edit : -1);
      const denied = denD !== -1 && denD <= asOfDay;
      A.rc.push(denied ? rc : -1); A.denL.push(denied ? denD - sbd : -1); A.apl.push(denied ? apl : 0);
      A.payL.push(lagOrNone(payD, day)); A.payAmt.push(payD !== -1 && payD <= asOfDay ? payAmt : 0);
      A.pos.push(pos);
      A.woL.push(denied ? lagOrNone(woD, denD) : -1);
      A.bdL.push(lagOrNone(bdD, sbd)); A.bdAmt.push(bdD !== -1 && bdD <= asOfDay ? bdAmt : 0);
      A.chr.push(chr); A.pend.push(pend);
      X.fbd.push(fbd); X.sbd.push(sbd); X.payD.push(payD); X.denD.push(denD); X.closeD.push(closeD); X.status.push(status);
    }
  }
}
const nAcc = A.fac.length;

// ---------- A/R month-end snapshots ----------
// Grain: month end x facility x payer x service line x age bucket x account status.
// Values are scaled by the sample weight (they are system-level aggregates).
const arAgeOf = (age: number) => AR_AGE.findIndex((b) => age >= b.min && age <= b.max);
/** Status of an account at a snapshot date. */
function statusAt(i: number, E: number): number {
  const fbd = X.fbd[i], sbd = X.sbd[i], den = X.denD[i];
  if (fbd > E) return 0;
  if (sbd > E) return 1;
  if (PAYERS[A.payer[i]].fc === FC_SELF_PAY) return 6;
  if (den !== -1 && den <= E) return A.apl[i] ? 3 : 4;
  if (A.pend[i] && E - sbd > 30) return 5;
  return 2;
}
const arMap = new Map<string, number[]>();
for (let mi = windowStartMi - 1; mi <= endMi; mi++) {
  const E = monthEndDay(mi);
  for (let i = 0; i < nAcc; i++) {
    const dd = A.dd[i];
    if (dd > E) continue;
    const close = X.closeD[i];
    if (close !== -1 && close <= E) continue;
    let cash = A.pos[i];
    if (X.payD[i] !== -1 && X.payD[i] <= E) cash += A.payAmt[i];
    const g = A.gross[i] - cash;
    const nn = A.net[i] - cash;
    if (g <= 0) continue;
    const k = `${E}|${A.fac[i]}|${A.payer[i]}|${A.svc[i]}|${arAgeOf(E - dd)}|${statusAt(i, E)}`;
    const row = arMap.get(k) ?? [0, 0, 0];
    row[0] += g; row[1] += Math.max(0, nn); row[2] += 1;
    arMap.set(k, row);
  }
}

// ---------- DNFB / DNSP snapshots (weekly Saturdays and month ends) ----------
const snapDays = new Set<number>();
for (let d = windowStartDay - 7; d <= asOfDay; d++) if (weekday(d) === 6) snapDays.add(d);
for (let mi = windowStartMi - 1; mi <= endMi; mi++) snapDays.add(monthEndDay(mi));
const dnfbAgeOf = (age: number) => DNFB_AGE.findIndex((b) => age >= b.min && age <= b.max);
const dnfbMap = new Map<string, number[]>();
const sortedSnaps = [...snapDays].sort((a, b) => a - b);
for (let i = 0; i < nAcc; i++) {
  const dd = A.dd[i];
  if (X.sbd[i] < sortedSnaps[0]) continue;
  for (const S of sortedSnaps) {
    if (S < dd) continue;
    if (S >= X.sbd[i]) break;
    const stage = S < X.fbd[i] ? 0 : 1; // 0 = DNFB, 1 = DNSP (billed, not submitted)
    const hold = stage === 0 ? A.hold[i] : 5;
    const k = `${S}|${A.fac[i]}|${A.svc[i]}|${hold}|${dnfbAgeOf(S - dd)}|${stage}`;
    const row = dnfbMap.get(k) ?? [0, 0];
    row[0] += A.gross[i]; row[1] += 1;
    dnfbMap.set(k, row);
  }
}

// ---------- Patient access, daily per facility (not sampled: full counts) ----------
const FE_COLS = [
  'day', 'fac', 'ordersReceived', 'ordersScheduled', 'scheduleDaysSum', 'openOrdersEod',
  'preRegDue', 'preRegDone', 'eligDue', 'eligVerified', 'authRequired', 'authObtained', 'authPreService',
  'finClearDue', 'finCleared', 'callsOffered', 'callsAnswered', 'callsAbandoned', 'answerWaitSecs',
  'selfPayAccounts', 'screened', 'coverageFound',
] as const;
const FE: Record<string, number[]> = Object.fromEntries(FE_COLS.map((c) => [c, []]));
const lastFourWeeks = asOfDay - 27;
for (const f of FACILITIES) {
  const pr = PROFILES[f.key];
  let open = sround(pr.weight * 2600);
  for (let day = windowStartDay; day <= asOfDay; day++) {
    const dow = weekday(day);
    const wk = dow === 0 || dow === 6 ? 0.2 : 1.32;
    const p = progress(day);
    const moy = monthIndexOfDay(day) % 12;
    const row: Record<string, number> = { day, fac: f.key };
    const regs = poisson(1900 * pr.weight * wk);
    if (pr.hasOrders) {
      const received = poisson(820 * pr.weight * wk);
      let rate = pr.schedStart + (pr.schedEnd - pr.schedStart) * Math.sqrt(p) + normal(0, 0.015);
      if (pr.schedDrop && day >= lastFourWeeks) rate -= 0.14;
      rate = clamp(rate, 0.4, 1);
      const scheduled = Math.min(open + received, sround(received * rate));
      open = Math.max(0, sround(open + received - scheduled - open * 0.025));
      row.ordersReceived = received;
      row.ordersScheduled = scheduled;
      row.scheduleDaysSum = sround(scheduled * clamp(normal(6.5 - 2.5 * p, 0.5), 2, 12));
      row.openOrdersEod = open;
      const due = sround(scheduled * 0.9);
      row.preRegDue = due;
      row.preRegDone = sround(due * clamp(normal(0.94 + 0.02 * p, 0.012), 0.8, 1));
    }
    // Eligibility: all registrations. Lower at Pine Ridge (registration quality issue).
    const eligRate = f.key === 6 ? 0.9 : 0.965 + 0.01 * p;
    row.eligDue = regs;
    row.eligVerified = sround(regs * clamp(normal(eligRate, 0.008), 0.8, 1));
    const authReq = sround(regs * 0.11);
    const authRate = clamp(normal(0.95 - (pr.slowMa ? 0.02 : 0) - (moy <= 1 ? 0.01 : 0), 0.012), 0.8, 1);
    row.authRequired = authReq;
    row.authObtained = sround(authReq * authRate);
    row.authPreService = sround(row.authObtained * clamp(normal(0.9, 0.02), 0.7, 1));
    row.finClearDue = sround(regs * 0.45);
    row.finCleared = sround(row.finClearDue * clamp(normal(0.86 + 0.04 * p - (f.key === 6 ? 0.07 : 0), 0.015), 0.6, 1));
    if (pr.hasCalls) {
      const offered = poisson(620 * pr.weight * wk * (moy <= 1 ? 1.15 : 1));
      const abandoned = sround(offered * clamp(normal(moy <= 1 ? 0.06 : 0.035, 0.008), 0.005, 0.15));
      const answered = offered - abandoned;
      row.callsOffered = offered;
      row.callsAnswered = answered;
      row.callsAbandoned = abandoned;
      row.answerWaitSecs = sround(answered * clamp(normal(moy <= 1 ? 48 : 31, 6), 8, 120));
    }
    const sp = poisson(60 * pr.weight * wk * (pr.selfPay / 0.055) * (moy <= 2 ? 1.25 : 1));
    const screened = sround(sp * clamp(normal(0.6 + 0.2 * p, 0.04), 0.3, 0.98));
    row.selfPayAccounts = sp;
    row.screened = screened;
    row.coverageFound = sround(screened * clamp(normal(0.17, 0.03), 0.05, 0.4));
    for (const c of FE_COLS) FE[c].push(row[c] ?? -1);
  }
}

// ---------- Revenue cycle operating cost, monthly per facility (general ledger) ----------
const cashByFacMonth = new Map<string, number>();
for (let i = 0; i < nAcc; i++) {
  const add = (day: number, v: number) => {
    if (day < windowStartDay || day > asOfDay || v <= 0) return;
    const k = `${A.fac[i]}|${monthIndexOfDay(day)}`;
    cashByFacMonth.set(k, (cashByFacMonth.get(k) ?? 0) + v);
  };
  add(X.payD[i], A.payAmt[i]);
  add(A.dd[i], A.pos[i]);
}
const OPS: Record<string, number[]> = { day: [], fac: [], rcmCost: [] };
for (const f of FACILITIES) {
  const pr = PROFILES[f.key];
  // Cost is mostly fixed (staff, vendors), so it does not follow cash month to month.
  let base = 0;
  for (let mi = windowStartMi; mi <= endMi; mi++) base += cashByFacMonth.get(`${f.key}|${mi}`) ?? 0;
  base = (base / cfg.months) * W * pr.costRate;
  for (let mi = windowStartMi; mi <= endMi; mi++) {
    const drift = 1 + 0.03 * ((mi - windowStartMi) / cfg.months);
    OPS.day.push(monthStartDay(mi));
    OPS.fac.push(f.key);
    OPS.rcmCost.push(Math.round(base * drift * uniform(0.95, 1.05)));
  }
}

// ---------- write ----------
const outDir = join(root, 'public/data');
mkdirSync(outDir, { recursive: true });
const write = (name: string, obj: unknown) => {
  const s = JSON.stringify(obj);
  writeFileSync(join(outDir, name), s);
  return s.length;
};
function mapToCols(map: Map<string, number[]>, keyCols: string[], valCols: string[], scale: number) {
  const cols: Record<string, number[]> = Object.fromEntries([...keyCols, ...valCols].map((c) => [c, []]));
  for (const [k, v] of map) {
    k.split('|').forEach((x, i) => cols[keyCols[i]].push(Number(x)));
    v.forEach((x, i) => cols[valCols[i]].push(Math.round(x * scale)));
  }
  return cols;
}

// Keep only accounts that matter inside the window: open at or after the window start,
// or discharged recently enough to feed the 90-day revenue averages and the cash lag.
const keepFrom = windowStartDay - 130;
const keep: number[] = [];
for (let i = 0; i < nAcc; i++) {
  if (A.dd[i] >= keepFrom || X.closeD[i] === -1 || X.closeD[i] >= windowStartDay) keep.push(i);
}
const accountsOut = Object.fromEntries(COLS.map((k) => [k, keep.map((i) => A[k][i])]));

const sizes: Record<string, number> = {};
sizes['accounts.json'] = write('accounts.json', accountsOut);
sizes['ar.json'] = write('ar.json', mapToCols(arMap, ['day', 'fac', 'payer', 'svc', 'age', 'status'], ['gross', 'net', 'count'], W));
sizes['dnfb.json'] = write('dnfb.json', mapToCols(dnfbMap, ['day', 'fac', 'svc', 'hold', 'age', 'stage'], ['amount', 'count'], W));
sizes['access.json'] = write('access.json', FE);
sizes['ops.json'] = write('ops.json', OPS);
sizes['dims.json'] = write('dims.json', {
  organization: ORGANIZATION, regions: REGIONS, facilities: FACILITIES, financialClasses: FINANCIAL_CLASSES,
  payers: PAYERS, serviceLines: SERVICE_LINES, patientTypes: PATIENT_TYPES, denialCategories: DENIAL_CATEGORIES,
  rootCauses: ROOT_CAUSES.map(({ key, name, category, recoverable }) => ({ key, name, category, recoverable })),
  editCategories: EDIT_CATEGORIES, dnfbHolds: DNFB_HOLDS, dnfbAge: DNFB_AGE, arAge: AR_AGE,
  billedStatus: BILLED_STATUS, accountStatus: ACCOUNT_STATUS, sourceSystems: SOURCE_SYSTEMS,
});
// Planned availability date: Nth business day after each month closes.
const availability: Record<string, string> = {};
for (let mi = windowStartMi; mi <= endMi + 1; mi++) {
  let d = monthEndDay(mi);
  let k = 0;
  while (k < cfg.availabilityBusinessDay) {
    d++;
    const w = weekday(d);
    if (w !== 0 && w !== 6) k++;
  }
  availability[String(mi)] = new Date(d * 86_400_000).toISOString().slice(0, 10);
}
sizes['meta.json'] = write('meta.json', {
  seed: cfg.seed, windowStartMonth: windowStartMi, endMonth: endMi, asOfDay,
  preliminaryMonths: cfg.preliminaryMonths, lastRefreshUtc: cfg.lastRefreshUtc,
  displayTimeZone: cfg.displayTimeZone, sampleWeight: W, accountsCompleteFromDay: keepFrom, availability,
});

console.log(`accounts generated: ${nAcc}, kept: ${keep.length}, ar rows: ${arMap.size}, dnfb rows: ${dnfbMap.size}, access rows: ${FE.day.length}`);
for (const [k, v] of Object.entries(sizes)) console.log(`${k}: ${(v / 1e6).toFixed(2)} MB`);
