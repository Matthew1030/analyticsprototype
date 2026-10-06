// Synthetic data generator. All data is synthetic. Fixed seed.
// Run: npm run data. Output: public/data/*.json
//
// Planted patterns (each one has a cause in the data):
// 1. Hospital A denials rise: Medicare Advantage plans deny for coordination of
//    benefits. Accounts that failed a registration edit are denied more often.
// 2. Commercial Plan B underpays: it pays about 82% of expected net revenue.
// 3. Hospital C aged A/R: "All Other" payers pay very slowly at Hospital C.
// 4. DNFB tail at Hospitals B and E: accounts with no assigned owner wait 11+ days.
// 5. Hospital G low clean claim rate: most edit failures are registration edits.
// 6. Write-offs rise at Hospitals C and F in the last 5 months: medical necessity
//    and timely filing denials are overturned less often.
// 7. Scheduling falls in the last 4 weeks at Hospitals A, C and G (staffing).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AR_AGE, BILLED_STATUS, CLIENT, DENIAL_CATEGORIES, DENIAL_REASONS, DENIAL_TO_WRITEOFF,
  DNFB_AGE, DNFB_HOLDS, EDIT_CATEGORIES, FACILITIES, FINANCIAL_CLASSES, PAYERS,
  SERVICE_LINES, WORK_QUEUES, WRITEOFF_REASONS,
} from './dimensions';
import {
  monthEndDay, monthIndexOfDay, monthIndexOfKey, monthStartDay, weekday,
} from '../src/data/dates';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(root, 'config/data.config.json'), 'utf8')) as {
  seed: number; endMonth: string; months: number; warmupMonths: number;
  preliminaryMonths: number; claimsPerMonth: number; lastRefreshUtc: string;
  availabilityBusinessDay: number;
};

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

// ---------- facility profiles ----------
interface Profile {
  weight: number;
  cleanStart: number; cleanEnd: number; regShare: number;
  dnfbTail: number; slowAllOther: boolean; woRise: boolean;
  maCobSpike: boolean; selfPay: number;
  hasOrders: boolean; hasCalls: boolean; schedDrop: boolean;
  schedStart: number; schedEnd: number;
}
const P = (o: Partial<Profile> & { weight: number }): Profile => ({
  cleanStart: 0.6, cleanEnd: 0.66, regShare: 0.5, dnfbTail: 0.03, slowAllOther: false,
  woRise: false, maCobSpike: false, selfPay: 0.06, hasOrders: true, hasCalls: true,
  schedDrop: false, schedStart: 0.55, schedEnd: 0.93, ...o,
});
const PROFILES: Profile[] = [
  P({ weight: 0.26, cleanStart: 0.67, cleanEnd: 0.73, maCobSpike: true, schedDrop: true, schedStart: 0.6, schedEnd: 0.97 }),
  P({ weight: 0.18, cleanStart: 0.58, cleanEnd: 0.64, dnfbTail: 0.13 }),
  P({ weight: 0.12, cleanStart: 0.62, cleanEnd: 0.65, slowAllOther: true, woRise: true, schedDrop: true }),
  P({ weight: 0.1, cleanStart: 0.59, cleanEnd: 0.64, hasCalls: false }),
  P({ weight: 0.09, cleanStart: 0.56, cleanEnd: 0.67, dnfbTail: 0.12 }),
  P({ weight: 0.08, cleanStart: 0.63, cleanEnd: 0.67, woRise: true, selfPay: 0.12 }),
  P({ weight: 0.05, cleanStart: 0.5, cleanEnd: 0.56, regShare: 0.72, schedDrop: true, schedStart: 0.5, schedEnd: 0.9 }),
  P({ weight: 0.045, cleanStart: 0.71, cleanEnd: 0.8 }),
  P({ weight: 0.04, cleanStart: 0.6, cleanEnd: 0.68, hasOrders: false }),
  P({ weight: 0.035, cleanStart: 0.62, cleanEnd: 0.69, hasCalls: false }),
];

// Payer behavior. payLag = days from submission to payment.
const PAYER_MIX_COMMUNITY = [22, 10, 8, 10, 7, 5, 14, 8, 5, 2, 6];
const PAYER_MIX_CAH = [28, 7, 5, 13, 5, 4, 12, 7, 4, 2, 8];
const NET_RATIO = [0.3, 0.28, 0.24, 0.25, 0.25, 0.25, 0.45, 0.5, 0.48, 0.55, 0.08];
const PAY_LAG: [number, number][] = [
  [16, 5], [30, 10], [32, 10], [36, 12], [28, 10], [30, 10], [24, 8], [33, 12], [35, 12], [65, 30], [45, 20],
];
const PAY_RATIO = [1, 0.99, 0.99, 1, 0.99, 0.99, 1, 0.99, 0.82, 0.98, 1];
const DENIAL_BASE = [0.06, 0.11, 0.11, 0.08, 0.1, 0.1, 0.08, 0.09, 0.09, 0.14, 0];
const REASON_MIX = [8, 2, 3, 4, 25, 10, 18, 10, 9, 1, 2, 3, 5];
const OVERTURN = [0.62, 0.45, 0.9, 0.88, 0.94, 0.78, 0.86, 0.58, 0.35, 0.9, 0.6, 0.1, 0.7];

// Service line mix by patient type and gross charge per claim.
const SVC_MIX_COMMUNITY = [7, 2.5, 24, 7, 17, 22, 9, 11.5];
const SVC_MIX_CAH = [5, 1, 26, 4, 18, 26, 10, 10];
const SVC_CHARGE = [38000, 16000, 3600, 9500, 2300, 650, 950, 520];
const SVC_CHARGE_CAH_FACTOR = [0.6, 0.75, 0.85, 0.8, 0.9, 0.95, 0.95, 0.95];

// ---------- claims ----------
const C = {
  id: [] as number[], fac: [] as number[], payer: [] as number[], svc: [] as number[],
  dd: [] as number[], fbd: [] as number[], sbd: [] as number[],
  gross: [] as number[], net: [] as number[], clean: [] as number[], edit: [] as number[],
  hold: [] as number[], denR: [] as number[], denD: [] as number[], denAmt: [] as number[],
  payD: [] as number[], payAmt: [] as number[], pos: [] as number[],
  woD: [] as number[], woAmt: [] as number[], woR: [] as number[],
  bdD: [] as number[], bdAmt: [] as number[], closeD: [] as number[],
};
const fut = (d: number) => (d > asOfDay ? -1 : d);

let nextId = 100001;
for (let day = genStartDay; day <= asOfDay; day++) {
  const mi = monthIndexOfDay(day);
  const seasonal = 1 + 0.06 * Math.cos(((mi % 12) / 12) * 2 * Math.PI); // winter peak
  const growth = 1 + 0.03 * ((day - genStartDay) / 365);
  const dow = weekday(day);
  const dowFactor = dow === 0 || dow === 6 ? 0.55 : 1.18;
  for (const f of FACILITIES) {
    const pr = PROFILES[f.key];
    const cah = f.type === 'Critical Access';
    const lambda = (cfg.claimsPerMonth / 30.4) * pr.weight * seasonal * growth * dowFactor;
    const n = poisson(lambda);
    for (let i = 0; i < n; i++) {
      const p = progress(day);
      const mix = (cah ? PAYER_MIX_CAH : PAYER_MIX_COMMUNITY).slice();
      mix[10] = pr.selfPay * 100;
      if (pr.slowAllOther) { mix[7] *= 1.6; mix[8] *= 1.6; mix[9] *= 1.6; }
      const payer = pick(mix);
      const fc = PAYERS[payer].fc;
      const svc = pick(cah ? SVC_MIX_CAH : SVC_MIX_COMMUNITY);
      const inpatient = svc <= 1;
      const gross = Math.round(lognormal(SVC_CHARGE[svc] * (cah ? SVC_CHARGE_CAH_FACTOR[svc] : 1), 0.5));
      const net = Math.round(gross * NET_RATIO[payer] * uniform(0.9, 1.1));

      // Final billing (DNFB). Routine lag, then optional delay with a hold reason.
      let fbLag = Math.round(Math.max(0, normal(inpatient ? 4.5 : 2.6, 1.2)));
      let hold = 0;
      if (chance(pr.dnfbTail)) {
        fbLag += randInt(9, 32);
        hold = chance(0.6) ? 6 : 2;
      } else if (chance(0.22)) {
        fbLag += randInt(1, 6);
        hold = pick([0, 35, 25, 15, 10, 5, 10]);
      }
      // Coding backlog in late winter (all sites).
      if ((mi % 12) === 2 && chance(0.25)) { fbLag += randInt(2, 6); hold = 1; }
      const fbd = day + fbLag;

      // Claim edits (clean claim) and release (DNSP).
      const cleanRate = pr.cleanStart + (pr.cleanEnd - pr.cleanStart) * p + normal(0, 0.01);
      const isClean = chance(cleanRate);
      let edit = -1;
      let sbLag = pick([60, 30, 7, 3]);
      if (!isClean) {
        edit = pick([pr.regShare, (1 - pr.regShare) * 0.5, (1 - pr.regShare) * 0.3, (1 - pr.regShare) * 0.2]);
        sbLag += randInt(0, 3);
      }
      const sbd = fbd + sbLag;

      // Point-of-service cash for self-pay patients.
      let pos = 0;
      if (fc === 6 && chance(0.25)) pos = Math.round(net * uniform(0.15, 0.3));

      let denR = -1, denD = -1, denAmt = 0, payD = -1, payAmt = 0;
      let woD = -1, woAmt = 0, woR = -1, bdD = -1, bdAmt = 0, closeD = -1;

      if (fc === 6) {
        // Self pay: some patients pay, the rest goes to bad debt.
        const remaining = net - pos;
        let paid = 0;
        if (chance(0.6)) {
          paid = Math.round(remaining * uniform(0.5, 0.9));
          payD = sbd + randInt(20, 90);
          payAmt = paid;
        }
        bdD = sbd + randInt(110, 190);
        bdAmt = remaining - paid;
        closeD = bdD;
      } else {
        // Initial denial.
        let pDeny = DENIAL_BASE[payer] * (inpatient ? 1.25 : 1);
        if (edit === 0) pDeny *= 1.5; // registration errors drive eligibility and COB denials
        const reasonMix = REASON_MIX.slice();
        if (edit === 0) { reasonMix[4] *= 1.6; reasonMix[5] *= 1.6; }
        if (pr.maCobSpike && fc === 1) {
          const spike = clamp((p - 0.25) / 0.6, 0, 1);
          pDeny += 0.42 * spike;
          reasonMix[4] *= 1 + 5 * spike;
        }
        const late = pr.woRise && monthsBeforeEnd(day) <= 6;
        if (late) { pDeny += 0.03; reasonMix[7] *= 2.5; reasonMix[11] *= 2.5; }
        const lag = PAY_LAG[payer];
        let payLag = Math.round(Math.max(7, normal(lag[0], lag[1])));
        if (pr.slowAllOther && fc === 5) {
          payLag = chance(0.6) ? randInt(110, 450) : Math.round(payLag * 2.5);
        } else if (chance(0.07)) {
          payLag = randInt(70, 240); // slow payer follow-up tail
        }
        if (chance(clamp(pDeny, 0, 0.9))) {
          denR = pick(reasonMix);
          denD = sbd + randInt(12, 32);
          denAmt = gross;
          let pOver = OVERTURN[denR];
          if (late && (denR === 7 || denR === 11)) pOver *= 0.3;
          const appealDays = chance(0.2) ? randInt(60, 200) : chance(0.04) ? randInt(330, 520) : 0;
          if (chance(pOver)) {
            payD = denD + randInt(18, 75) + appealDays + (pr.slowAllOther && fc === 5 ? randInt(40, 200) : 0);
            payAmt = Math.round(net * PAY_RATIO[payer]);
            closeD = payD;
          } else {
            woD = denD + appealDays + (denR === 11 ? randInt(20, 60) : randInt(55, 160));
            woAmt = net;
            woR = DENIAL_TO_WRITEOFF[denR];
            closeD = woD;
          }
        } else {
          payD = sbd + payLag;
          payAmt = Math.round(net * PAY_RATIO[payer] * uniform(0.97, 1.0));
          closeD = payD;
        }
      }

      C.id.push(nextId++); C.fac.push(f.key); C.payer.push(payer); C.svc.push(svc);
      C.dd.push(day); C.fbd.push(fut(fbd)); C.sbd.push(fut(sbd));
      C.gross.push(gross); C.net.push(net);
      C.clean.push(sbd <= asOfDay ? (isClean ? 1 : 0) : -1);
      C.edit.push(sbd <= asOfDay ? edit : -1);
      C.hold.push(hold);
      C.denR.push(denD >= 0 && denD <= asOfDay ? denR : -1);
      C.denD.push(fut(denD));
      C.denAmt.push(denD >= 0 && denD <= asOfDay ? denAmt : 0);
      C.payD.push(fut(payD)); C.payAmt.push(payD >= 0 && payD <= asOfDay ? payAmt : 0);
      C.pos.push(pos);
      C.woD.push(fut(woD)); C.woAmt.push(woD >= 0 && woD <= asOfDay ? woAmt : 0);
      C.woR.push(woD >= 0 && woD <= asOfDay ? woR : -1);
      C.bdD.push(fut(bdD)); C.bdAmt.push(bdD >= 0 && bdD <= asOfDay ? bdAmt : 0);
      C.closeD.push(fut(closeD));
    }
  }
}
const nClaims = C.id.length;

// ---------- A/R month-end snapshots ----------
// Grain: month end x facility x payer x service line x age bucket x billed status.
const arAgeOf = (age: number) => AR_AGE.findIndex((b) => age >= b.min && age <= b.max);
const arMap = new Map<string, number[]>();
for (let mi = windowStartMi - 3; mi <= endMi; mi++) {
  const E = monthEndDay(mi);
  for (let i = 0; i < nClaims; i++) {
    const dd = C.dd[i];
    if (dd > E) continue;
    const close = C.closeD[i];
    if (close !== -1 && close <= E) continue;
    let cash = C.pos[i];
    if (C.payD[i] !== -1 && C.payD[i] <= E) cash += C.payAmt[i];
    const gross = C.gross[i] - cash;
    const net = C.net[i] - cash;
    if (gross <= 0) continue;
    const fbd = C.fbd[i];
    const billed = fbd === -1 || fbd > E ? 0 : PAYERS[C.payer[i]].fc === 6 ? 2 : 1;
    const k = `${E}|${C.fac[i]}|${C.payer[i]}|${C.svc[i]}|${arAgeOf(E - dd)}|${billed}`;
    const row = arMap.get(k) ?? [0, 0, 0];
    row[0] += gross; row[1] += Math.max(0, net); row[2] += 1;
    arMap.set(k, row);
  }
}

// ---------- DNFB / DNSP snapshots (weekly Saturdays and month ends) ----------
const snapDays = new Set<number>();
for (let d = monthStartDay(windowStartMi) - 120; d <= asOfDay; d++) {
  if (weekday(d) === 6) snapDays.add(d);
}
for (let mi = windowStartMi - 3; mi <= endMi; mi++) snapDays.add(monthEndDay(mi));
const dnfbAgeOf = (age: number) => DNFB_AGE.findIndex((b) => age >= b.min && age <= b.max);
const dnfbMap = new Map<string, number[]>();
const sortedSnaps = [...snapDays].sort((a, b) => a - b);
for (let i = 0; i < nClaims; i++) {
  const dd = C.dd[i];
  const fbd = C.fbd[i] === -1 ? Infinity : C.fbd[i];
  const sbd = C.sbd[i] === -1 ? Infinity : C.sbd[i];
  for (const S of sortedSnaps) {
    if (S < dd) continue;
    if (S >= sbd) break;
    const stage = S < fbd ? 0 : 1; // 0 = DNFB, 1 = DNSP
    const hold = stage === 0 ? C.hold[i] : 5;
    const k = `${S}|${C.fac[i]}|${C.svc[i]}|${hold}|${dnfbAgeOf(S - dd)}|${stage}`;
    const row = dnfbMap.get(k) ?? [0, 0];
    row[0] += C.gross[i]; row[1] += 1;
    dnfbMap.set(k, row);
  }
}

// ---------- Work queues (mid cycle and back end), daily ----------
const wqMap = new Map<string, number[]>();
const addWq = (day: number, fac: number, task: number, idx: 0 | 1) => {
  if (day < windowStartDay || day > asOfDay || day === -1) return;
  const k = `${day}|${fac}|${task}`;
  const row = wqMap.get(k) ?? [0, 0];
  row[idx] += 1;
  wqMap.set(k, row);
};
for (let i = 0; i < nClaims; i++) {
  const f = C.fac[i];
  addWq(C.dd[i], f, 0, 0);
  addWq(C.fbd[i], f, 0, 1);
  addWq(C.fbd[i], f, 1, 0);
  addWq(C.sbd[i], f, 1, 1);
  if (C.clean[i] === 0) {
    addWq(C.sbd[i] - 3, f, 2, 0);
    addWq(C.sbd[i], f, 2, 1);
  }
  if (C.denD[i] !== -1) {
    addWq(C.denD[i], f, 3, 0);
    const res = C.denR[i] !== -1 && C.closeD[i] !== -1 ? C.closeD[i] : -1;
    addWq(res, f, 3, 1);
  }
  if (C.sbd[i] !== -1 && PAYERS[C.payer[i]].fc !== 6) {
    const q = C.sbd[i] + 45;
    if (C.closeD[i] === -1 || C.closeD[i] > q) {
      addWq(q, f, 4, 0);
      addWq(C.closeD[i], f, 4, 1);
    }
  }
}

// ---------- Front end, daily per facility ----------
const FE_COLS = [
  'day', 'fac', 'ordersReceived', 'ordersScheduled', 'scheduleDaysSum', 'openOrdersEod',
  'preRegDue', 'preRegSameDay', 'preReg1Day', 'preReg2Day', 'dpa2Due', 'dpa2Done',
  'callsOffered', 'callsAnswered', 'callsAbandoned', 'answerWaitSecs',
  'selfPayAccounts', 'screened', 'eligibleScreened', 'converted', 'appsInitiated',
  'ipAdmissions', 'ipPriorDayDone',
] as const;
const FE: Record<string, number[]> = Object.fromEntries(FE_COLS.map((c) => [c, []]));
const lastFourWeeks = asOfDay - 27;
for (const f of FACILITIES) {
  const pr = PROFILES[f.key];
  let open = sround(pr.weight * 900);
  for (let day = windowStartDay; day <= asOfDay; day++) {
    const dow = weekday(day);
    const wk = dow === 0 || dow === 6 ? 0.25 : 1.25;
    const p = progress(day);
    const ramp = clamp(p * 1.4, 0, 1); // service volume ramps up over the window
    const row: Record<string, number> = { day, fac: f.key };
    if (pr.hasOrders) {
      const received = poisson(185 * pr.weight * wk * (0.3 + 0.7 * ramp));
      let rate = pr.schedStart + (pr.schedEnd - pr.schedStart) * Math.sqrt(p) + normal(0, 0.03);
      if (pr.schedDrop && day >= lastFourWeeks) rate -= 0.22;
      rate = clamp(rate, 0.3, 1);
      const scheduled = Math.min(open + received, sround(received * rate));
      open = Math.max(0, sround(open + received - scheduled - open * 0.02));
      const due = sround(scheduled * 0.92);
      row.ordersReceived = received;
      row.ordersScheduled = scheduled;
      row.scheduleDaysSum = sround(scheduled * clamp(normal(9 - 5 * p, 0.6), 2, 12));
      row.openOrdersEod = open;
      row.preRegDue = due;
      row.preRegSameDay = sround(due * clamp(normal(0.992, 0.004), 0.95, 1));
      row.preReg1Day = sround(due * clamp(normal(0.975, 0.012), 0.9, 1));
      row.preReg2Day = sround(due * clamp(normal(0.79, 0.03), 0.6, 0.95));
      const d2 = sround(due * 0.55);
      row.dpa2Due = d2;
      row.dpa2Done = sround(d2 * clamp(normal(0.87, 0.025), 0.7, 0.99));
      row.ipAdmissions = poisson(6 * pr.weight * wk);
      row.ipPriorDayDone = sround(row.ipAdmissions * clamp(normal(0.8, 0.05), 0.5, 1));
    }
    if (pr.hasCalls) {
      const offered = poisson(300 * pr.weight * wk * (0.3 + 0.7 * ramp));
      const abandoned = sround(offered * clamp(normal(0.021, 0.006), 0.002, 0.06));
      const answered = offered - abandoned;
      row.callsOffered = offered;
      row.callsAnswered = answered;
      row.callsAbandoned = abandoned;
      row.answerWaitSecs = sround(answered * clamp(normal(7, 1.5), 3, 40));
    }
    const sp = poisson(22 * pr.weight * wk * (pr.selfPay / 0.06));
    const screened = sround(sp * clamp(normal(0.4 + 0.3 * p, 0.05), 0.2, 0.95));
    const eligible = sround(screened * 0.32);
    row.selfPayAccounts = sp;
    row.screened = screened;
    row.eligibleScreened = eligible;
    row.converted = sround(eligible * clamp(normal(0.36, 0.06), 0.1, 0.7));
    row.appsInitiated = sround(eligible * 0.28 + (rnd() < 0.5 ? 1 : 0));
    for (const c of FE_COLS) FE[c].push(row[c] ?? -1);
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
function mapToCols(map: Map<string, number[]>, keyCols: string[], valCols: string[]) {
  const cols: Record<string, number[]> = Object.fromEntries([...keyCols, ...valCols].map((c) => [c, []]));
  for (const [k, v] of map) {
    k.split('|').forEach((x, i) => cols[keyCols[i]].push(Number(x)));
    v.forEach((x, i) => cols[valCols[i]].push(Math.round(x)));
  }
  return cols;
}

// Keep only claims that matter inside the window: open at or after the window start,
// or discharged recently enough to feed the 90-day revenue averages and the cash lag.
const keepFrom = windowStartDay - 120;
const keep: number[] = [];
for (let i = 0; i < nClaims; i++) {
  if (C.dd[i] >= keepFrom || C.closeD[i] === -1 || C.closeD[i] >= windowStartDay) keep.push(i);
}
const claimsOut = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, keep.map((i) => v[i])]));

const sizes: Record<string, number> = {};
sizes['claims.json'] = write('claims.json', claimsOut);
sizes['ar.json'] = write('ar.json', mapToCols(arMap, ['day', 'fac', 'payer', 'svc', 'age', 'billed'], ['gross', 'net', 'count']));
sizes['dnfb.json'] = write('dnfb.json', mapToCols(dnfbMap, ['day', 'fac', 'svc', 'hold', 'age', 'stage'], ['amount', 'count']));
sizes['workqueue.json'] = write('workqueue.json', mapToCols(wqMap, ['day', 'fac', 'task'], ['assigned', 'completed']));
sizes['frontend.json'] = write('frontend.json', FE);
sizes['dims.json'] = write('dims.json', {
  client: CLIENT, facilities: FACILITIES, financialClasses: FINANCIAL_CLASSES, payers: PAYERS,
  serviceLines: SERVICE_LINES, denialCategories: DENIAL_CATEGORIES, denialReasons: DENIAL_REASONS,
  writeOffReasons: WRITEOFF_REASONS, editCategories: EDIT_CATEGORIES, dnfbHolds: DNFB_HOLDS,
  dnfbAge: DNFB_AGE, arAge: AR_AGE, billedStatus: BILLED_STATUS, workQueues: WORK_QUEUES,
});
// Planned availability date: Nth business day after each month closes.
const availability: Record<string, string> = {};
for (let mi = windowStartMi; mi <= endMi; mi++) {
  let d = monthEndDay(mi);
  let n = 0;
  while (n < cfg.availabilityBusinessDay) {
    d++;
    const w = weekday(d);
    if (w !== 0 && w !== 6) n++;
  }
  availability[String(mi)] = new Date(d * 86_400_000).toISOString().slice(0, 10);
}
sizes['meta.json'] = write('meta.json', {
  seed: cfg.seed, windowStartMonth: windowStartMi, endMonth: endMi, asOfDay,
  preliminaryMonths: cfg.preliminaryMonths, lastRefreshUtc: cfg.lastRefreshUtc, availability,
});

console.log(`claims generated: ${nClaims}, kept: ${keep.length}, ar rows: ${arMap.size}, dnfb rows: ${dnfbMap.size}, workqueue rows: ${wqMap.size}, frontend rows: ${FE.day.length}`);
for (const [k, v] of Object.entries(sizes)) console.log(`${k}: ${(v / 1e6).toFixed(2)} MB`);
