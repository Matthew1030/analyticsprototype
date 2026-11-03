// Static dimension members. ALL DATA IS SYNTHETIC.
// Organization and facility names are fictional. Payer names are used for realism only:
// every figure attached to them is generated and describes no real payer.

export const ORGANIZATION = { key: 0, name: 'Cumberland Valley Health', shortName: 'CVH' };

export const REGIONS = ['North Region', 'Central Region', 'South Region'];

export interface FacilityDef {
  key: number;
  name: string;
  short: string;
  type: 'Critical Access' | 'Community' | 'Regional Referral';
  beds: number;
  region: number;
  city: string;
}

export const FACILITIES: FacilityDef[] = [
  { key: 0, name: 'Valley Regional Medical Center', short: 'Valley Regional', type: 'Regional Referral', beds: 312, region: 1, city: 'Cumberland' },
  { key: 1, name: 'Riverbend Medical Center', short: 'Riverbend', type: 'Community', beds: 198, region: 1, city: 'Riverbend' },
  { key: 2, name: 'Williamson Regional Hospital', short: 'Williamson Regional', type: 'Community', beds: 164, region: 2, city: 'Franklin' },
  { key: 3, name: 'Cumberland Community Hospital', short: 'Cumberland Community', type: 'Community', beds: 126, region: 0, city: 'Ashby' },
  { key: 4, name: 'Lakeside General Hospital', short: 'Lakeside General', type: 'Community', beds: 104, region: 0, city: 'Lake Marion' },
  { key: 5, name: 'Highland Park Medical Center', short: 'Highland Park', type: 'Community', beds: 88, region: 2, city: 'Highland' },
  { key: 6, name: 'Pine Ridge Community Hospital', short: 'Pine Ridge', type: 'Critical Access', beds: 25, region: 0, city: 'Pine Ridge' },
  { key: 7, name: 'Clearwater Memorial Hospital', short: 'Clearwater Memorial', type: 'Critical Access', beds: 25, region: 2, city: 'Clearwater' },
  { key: 8, name: 'Brookfield County Hospital', short: 'Brookfield County', type: 'Critical Access', beds: 22, region: 1, city: 'Brookfield' },
  { key: 9, name: 'Stone River Hospital', short: 'Stone River', type: 'Critical Access', beds: 18, region: 0, city: 'Stone River' },
];

/** Payor groups of the client's workbook (QHC RCM Dashboard). Self Pay stays last (FC_SELF_PAY). */
export const FINANCIAL_CLASSES = [
  'Medicare',
  'Medicare Managed',
  'Medicaid',
  'Medicaid Managed',
  'Blue Cross',
  'All Other',
  'Self Pay',
];
export const FC_SELF_PAY = 6;

export const PAYERS = [
  { key: 0, name: 'Medicare Part A/B', fc: 0 },
  { key: 1, name: 'Humana Medicare Advantage', fc: 1 },
  { key: 2, name: 'UnitedHealthcare Medicare Advantage', fc: 1 },
  { key: 3, name: 'State Medicaid (FFS)', fc: 2 },
  { key: 4, name: 'Wellpoint Medicaid', fc: 3 },
  { key: 5, name: 'UnitedHealthcare Community Plan', fc: 3 },
  { key: 6, name: 'BlueCross BlueShield', fc: 4 },
  { key: 7, name: 'Aetna', fc: 5 },
  { key: 8, name: 'Cigna', fc: 5 },
  { key: 9, name: 'UnitedHealthcare Commercial', fc: 5 },
  { key: 10, name: 'Workers Comp / Auto / Tricare', fc: 5 },
  { key: 11, name: 'Self Pay', fc: 6 },
];

/** `posService`: the workbook's POS service split (ED, Inpatient, SDC, Other). */
export const SERVICE_LINES = [
  { key: 0, name: 'Medical / Surgical', department: 'Inpatient Nursing', patientType: 'Inpatient', posService: 'Inpatient' },
  { key: 1, name: 'Obstetrics', department: 'Labor and Delivery', patientType: 'Inpatient', posService: 'Inpatient' },
  { key: 2, name: 'Emergency', department: 'Emergency Department', patientType: 'Emergency', posService: 'ED' },
  { key: 3, name: 'Outpatient Surgery', department: 'Surgical Services', patientType: 'Outpatient', posService: 'SDC' },
  { key: 4, name: 'Imaging', department: 'Radiology', patientType: 'Outpatient', posService: 'Other' },
  { key: 5, name: 'Laboratory', department: 'Laboratory', patientType: 'Outpatient', posService: 'Other' },
  { key: 6, name: 'Therapy', department: 'Rehabilitation', patientType: 'Outpatient', posService: 'Other' },
  { key: 7, name: 'Clinic', department: 'Hospital Clinics', patientType: 'Outpatient', posService: 'Other' },
];

/** The workbook's POS service groups, in its order. */
export const POS_SERVICES = ['ED', 'Inpatient', 'SDC', 'Other'];

export const PATIENT_TYPES = ['Inpatient', 'Emergency', 'Outpatient'];

/**
 * Initial denial reason: the 12 reasons of the client's workbook, in its order. `owner` is the
 * revenue-cycle area that usually owns prevention. `woReason` is the workbook's denial write-off
 * reason (WRITEOFF_REASONS) that a write-off after this denial counts under.
 */
export const DENIAL_CATEGORIES = [
  { key: 0, name: 'Authorization', owner: 'Patient Access', woReason: 4 },
  { key: 1, name: 'Benefits Exhausted', owner: 'Patient Access', woReason: 3 },
  { key: 2, name: 'Billing', owner: 'Billing', woReason: 6 },
  { key: 3, name: 'Coding', owner: 'Coding', woReason: 6 },
  { key: 4, name: 'Coordination Of Benefits', owner: 'Patient Access', woReason: 3 },
  { key: 5, name: 'Eligibility', owner: 'Patient Access', woReason: 3 },
  { key: 6, name: 'Lacks Information/Med Records', owner: 'Clinical Documentation', woReason: 1 },
  { key: 7, name: 'Medical Necessity', owner: 'Clinical Documentation', woReason: 0 },
  { key: 8, name: 'Non-Covered', owner: 'Patient Access', woReason: 0 },
  { key: 9, name: 'Payer', owner: 'Billing', woReason: 6 },
  { key: 10, name: 'Provider', owner: 'Clinical Documentation', woReason: 2 },
  { key: 11, name: 'Timely Filing', owner: 'Billing', woReason: 5 },
];

/** Denial write-off reasons of the client's workbook, in its order. */
export const WRITEOFF_REASONS = ['Medical Necessity', 'Clinical Documentation', 'Credentials', 'Insurance Verification', 'Authorization', 'Timely Filing', 'Other'];

/**
 * Denial root cause. `recoverable` = the denial can usually be corrected or appealed.
 * `mix` = base weight, `overturn` = chance the denial is paid after appeal or correction,
 * `appeal` = chance the denial is formally appealed (others are corrected and rebilled or written off).
 */
export const ROOT_CAUSES = [
  { key: 0, name: 'Coverage terminated before date of service', category: 5, recoverable: true, mix: 6, overturn: 0.55, appeal: 0.15 },
  { key: 1, name: 'Member ID invalid or not found', category: 5, recoverable: true, mix: 5, overturn: 0.9, appeal: 0.05 },
  { key: 2, name: 'Eligibility not verified at registration', category: 5, recoverable: true, mix: 4, overturn: 0.7, appeal: 0.1 },
  { key: 3, name: 'No prior authorization on file', category: 0, recoverable: true, mix: 8, overturn: 0.45, appeal: 0.7 },
  { key: 4, name: 'Authorization expired or dates mismatch', category: 0, recoverable: true, mix: 4, overturn: 0.7, appeal: 0.6 },
  { key: 5, name: 'Authorized units or level of care exceeded', category: 0, recoverable: true, mix: 3, overturn: 0.5, appeal: 0.6 },
  { key: 6, name: 'Inpatient status not supported (observation)', category: 7, recoverable: true, mix: 6, overturn: 0.42, appeal: 0.85 },
  { key: 7, name: 'Diagnosis does not support procedure', category: 7, recoverable: true, mix: 4, overturn: 0.5, appeal: 0.6 },
  { key: 8, name: 'Coverage criteria (LCD/NCD) not met', category: 8, recoverable: false, mix: 3, overturn: 0.2, appeal: 0.4 },
  { key: 9, name: 'Invalid code or modifier combination', category: 3, recoverable: true, mix: 5, overturn: 0.9, appeal: 0.05 },
  { key: 10, name: 'Bundling / NCCI edit', category: 3, recoverable: true, mix: 4, overturn: 0.6, appeal: 0.3 },
  { key: 11, name: 'DRG downgrade (clinical validation)', category: 3, recoverable: true, mix: 3, overturn: 0.45, appeal: 0.9 },
  { key: 12, name: 'Missing physician order or signature', category: 10, recoverable: true, mix: 4, overturn: 0.8, appeal: 0.2 },
  { key: 13, name: 'Insufficient clinical documentation', category: 6, recoverable: true, mix: 4, overturn: 0.55, appeal: 0.7 },
  { key: 14, name: 'Other primary payer on file (MSP)', category: 4, recoverable: true, mix: 7, overturn: 0.85, appeal: 0.05 },
  { key: 15, name: 'COB questionnaire not on file', category: 4, recoverable: true, mix: 5, overturn: 0.88, appeal: 0.05 },
  { key: 16, name: 'Exact duplicate submission', category: 2, recoverable: false, mix: 3, overturn: 0.05, appeal: 0 },
  { key: 17, name: 'Corrected claim not flagged as replacement', category: 2, recoverable: true, mix: 2, overturn: 0.9, appeal: 0 },
  { key: 18, name: 'Filed after payer deadline', category: 11, recoverable: false, mix: 3, overturn: 0.08, appeal: 0.3 },
  { key: 19, name: 'Corrected claim filed late', category: 11, recoverable: false, mix: 1, overturn: 0.15, appeal: 0.3 },
  { key: 20, name: 'Itemized bill requested', category: 9, recoverable: true, mix: 4, overturn: 0.92, appeal: 0 },
  { key: 21, name: 'Medical records requested, not received', category: 6, recoverable: true, mix: 5, overturn: 0.8, appeal: 0.1 },
  { key: 22, name: 'Benefit maximum reached', category: 1, recoverable: false, mix: 3, overturn: 0.1, appeal: 0.2 },
];

export const EDIT_CATEGORIES = [
  { key: 0, name: 'Registration / demographics', owner: 'Patient Access' },
  { key: 1, name: 'Coding', owner: 'Coding' },
  { key: 2, name: 'Charge', owner: 'Charge Capture' },
  { key: 3, name: 'Payer-specific', owner: 'Billing' },
];

/**
 * DNFB hold reason (not in the client's workbook: v3+). `group` is the workbook's DNFB owner
 * (DNFB_OWNERS), which the workbook does have.
 */
export const DNFB_HOLDS = [
  { key: 0, name: 'Within bill hold (routine)', owner: 'Billing', group: 2 },
  { key: 1, name: 'Awaiting coding', owner: 'Coding', group: 1 },
  { key: 2, name: 'Physician query (CDI)', owner: 'Clinical Documentation', group: 1 },
  { key: 3, name: 'Charge reconciliation', owner: 'Charge Capture', group: 1 },
  { key: 4, name: 'Registration incomplete', owner: 'Patient Access', group: 0 },
  { key: 5, name: 'Billing edit hold', owner: 'Billing', group: 2 },
  { key: 6, name: 'Unassigned', owner: 'Unassigned', group: 3 },
];

/** DNFB owner of the client's workbook ("Aged by Owner"). */
export const DNFB_OWNERS = ['Front End', 'Mid Cycle', 'Back End', 'Other'];

/** DNFB (days from discharge) and DNSP (days from import) aging of the client's workbook. */
export const DNFB_AGE = [
  { key: 0, name: '<4 days', min: 0, max: 3 },
  { key: 1, name: '4–6 days', min: 4, max: 6 },
  { key: 2, name: '7–10 days', min: 7, max: 10 },
  { key: 3, name: '11+ days', min: 11, max: 99999 },
];

/** A/R aging of the client's workbook (Insurance AR and Self Pay AR buckets), days from discharge. */
export const AR_AGE = [
  { key: 0, name: '0–90', min: 0, max: 90 },
  { key: 1, name: '91–180', min: 91, max: 180 },
  { key: 2, name: '181–360', min: 181, max: 360 },
  { key: 3, name: '361+', min: 361, max: 99999 },
];

export const BILLED_STATUS = ['Unbilled', 'Billed – insurance', 'Billed – self pay'];

/** Status of an open account (account drill-through). */
export const ACCOUNT_STATUS = [
  'Not final billed',
  'Billed, awaiting submission',
  'Submitted, in process',
  'Denied, in appeal',
  'Denied, rework',
  'Pended, records requested',
  'Patient balance',
];

/** Data sources named in the client's workbook (Metric Listing, "Data Source(s)"). Cadence: D / W / M as the workbook lists. */
export const SOURCE_SYSTEMS = [
  { key: 'scheduling', name: 'Revenue Protect', feeds: 'Scheduling orders, PAC deferrals, pre-registration and financial clearance, self-pay eligibility and enrollment', cadence: 'Daily, weekly, monthly' },
  { key: 'calls', name: 'Centralized Call System', feeds: 'PAC call volume and call performance', cadence: 'Daily, weekly, monthly' },
  { key: 'pas', name: 'Medhost', feeds: 'POS collections, DNFB (discharged not final billed)', cadence: 'Daily, weekly, monthly' },
  { key: 'clearinghouse', name: 'SSI (R1)', feeds: 'DNSP (not sent to payor), claim exports and imports, clean claim rate', cadence: 'Daily, weekly, monthly' },
  { key: 'epars', name: 'ePars (R1)', feeds: 'R1 assigned tasks', cadence: 'Daily, weekly, monthly' },
  { key: 'denials', name: 'Initial Denials (R1)', feeds: 'Initial denials by reason and payor group', cadence: 'Weekly, monthly' },
  { key: 'atb', name: 'Medhost ATB', feeds: 'Gross A/R, insurance and self-pay aging, A/R by payor group', cadence: 'Weekly, monthly' },
  { key: 'gl', name: 'RCA / Kodiak', feeds: 'Net revenue, debit net A/R days', cadence: 'Monthly' },
  { key: 'txn', name: 'Medhost Transactions', feeds: 'Gross revenue, cash posted, adjustments, write-offs, bad debt transfers', cadence: 'Daily, weekly, monthly' },
];
