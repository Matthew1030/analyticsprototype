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

export const FINANCIAL_CLASSES = [
  'Medicare',
  'Medicare Advantage',
  'Medicaid',
  'Medicaid Managed Care',
  'Commercial',
  'Other Government / WC',
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
  { key: 7, name: 'Aetna', fc: 4 },
  { key: 8, name: 'Cigna', fc: 4 },
  { key: 9, name: 'UnitedHealthcare Commercial', fc: 4 },
  { key: 10, name: 'Workers Comp / Auto / Tricare', fc: 5 },
  { key: 11, name: 'Self Pay', fc: 6 },
];

export const SERVICE_LINES = [
  { key: 0, name: 'Medical / Surgical', department: 'Inpatient Nursing', patientType: 'Inpatient' },
  { key: 1, name: 'Obstetrics', department: 'Labor and Delivery', patientType: 'Inpatient' },
  { key: 2, name: 'Emergency', department: 'Emergency Department', patientType: 'Emergency' },
  { key: 3, name: 'Outpatient Surgery', department: 'Surgical Services', patientType: 'Outpatient' },
  { key: 4, name: 'Imaging', department: 'Radiology', patientType: 'Outpatient' },
  { key: 5, name: 'Laboratory', department: 'Laboratory', patientType: 'Outpatient' },
  { key: 6, name: 'Therapy', department: 'Rehabilitation', patientType: 'Outpatient' },
  { key: 7, name: 'Clinic', department: 'Hospital Clinics', patientType: 'Outpatient' },
];

export const PATIENT_TYPES = ['Inpatient', 'Emergency', 'Outpatient'];

/** Denial category. `owner` is the revenue-cycle area that usually owns prevention. */
export const DENIAL_CATEGORIES = [
  { key: 0, name: 'Eligibility', owner: 'Patient Access' },
  { key: 1, name: 'Authorization', owner: 'Patient Access' },
  { key: 2, name: 'Medical necessity', owner: 'Clinical Documentation' },
  { key: 3, name: 'Coding', owner: 'Coding' },
  { key: 4, name: 'Documentation', owner: 'Clinical Documentation' },
  { key: 5, name: 'Coordination of benefits', owner: 'Patient Access' },
  { key: 6, name: 'Duplicate claim', owner: 'Billing' },
  { key: 7, name: 'Timely filing', owner: 'Billing' },
  { key: 8, name: 'Missing information / records', owner: 'Billing' },
];

/**
 * Denial root cause. `recoverable` = the denial can usually be corrected or appealed.
 * `mix` = base weight, `overturn` = chance the denial is paid after appeal or correction,
 * `appeal` = chance the denial is formally appealed (others are corrected and rebilled or written off).
 */
export const ROOT_CAUSES = [
  { key: 0, name: 'Coverage terminated before date of service', category: 0, recoverable: true, mix: 6, overturn: 0.55, appeal: 0.15 },
  { key: 1, name: 'Member ID invalid or not found', category: 0, recoverable: true, mix: 5, overturn: 0.9, appeal: 0.05 },
  { key: 2, name: 'Eligibility not verified at registration', category: 0, recoverable: true, mix: 4, overturn: 0.7, appeal: 0.1 },
  { key: 3, name: 'No prior authorization on file', category: 1, recoverable: true, mix: 8, overturn: 0.45, appeal: 0.7 },
  { key: 4, name: 'Authorization expired or dates mismatch', category: 1, recoverable: true, mix: 4, overturn: 0.7, appeal: 0.6 },
  { key: 5, name: 'Authorized units or level of care exceeded', category: 1, recoverable: true, mix: 3, overturn: 0.5, appeal: 0.6 },
  { key: 6, name: 'Inpatient status not supported (observation)', category: 2, recoverable: true, mix: 6, overturn: 0.42, appeal: 0.85 },
  { key: 7, name: 'Diagnosis does not support procedure', category: 2, recoverable: true, mix: 4, overturn: 0.5, appeal: 0.6 },
  { key: 8, name: 'Coverage criteria (LCD/NCD) not met', category: 2, recoverable: false, mix: 3, overturn: 0.2, appeal: 0.4 },
  { key: 9, name: 'Invalid code or modifier combination', category: 3, recoverable: true, mix: 5, overturn: 0.9, appeal: 0.05 },
  { key: 10, name: 'Bundling / NCCI edit', category: 3, recoverable: true, mix: 4, overturn: 0.6, appeal: 0.3 },
  { key: 11, name: 'DRG downgrade (clinical validation)', category: 3, recoverable: true, mix: 3, overturn: 0.45, appeal: 0.9 },
  { key: 12, name: 'Missing physician order or signature', category: 4, recoverable: true, mix: 4, overturn: 0.8, appeal: 0.2 },
  { key: 13, name: 'Insufficient clinical documentation', category: 4, recoverable: true, mix: 4, overturn: 0.55, appeal: 0.7 },
  { key: 14, name: 'Other primary payer on file (MSP)', category: 5, recoverable: true, mix: 7, overturn: 0.85, appeal: 0.05 },
  { key: 15, name: 'COB questionnaire not on file', category: 5, recoverable: true, mix: 5, overturn: 0.88, appeal: 0.05 },
  { key: 16, name: 'Exact duplicate submission', category: 6, recoverable: false, mix: 3, overturn: 0.05, appeal: 0 },
  { key: 17, name: 'Corrected claim not flagged as replacement', category: 6, recoverable: true, mix: 2, overturn: 0.9, appeal: 0 },
  { key: 18, name: 'Filed after payer deadline', category: 7, recoverable: false, mix: 3, overturn: 0.08, appeal: 0.3 },
  { key: 19, name: 'Corrected claim filed late', category: 7, recoverable: false, mix: 1, overturn: 0.15, appeal: 0.3 },
  { key: 20, name: 'Itemized bill requested', category: 8, recoverable: true, mix: 4, overturn: 0.92, appeal: 0 },
  { key: 21, name: 'Medical records requested, not received', category: 8, recoverable: true, mix: 5, overturn: 0.8, appeal: 0.1 },
];

export const EDIT_CATEGORIES = [
  { key: 0, name: 'Registration / demographics', owner: 'Patient Access' },
  { key: 1, name: 'Coding', owner: 'Coding' },
  { key: 2, name: 'Charge', owner: 'Charge Capture' },
  { key: 3, name: 'Payer-specific', owner: 'Billing' },
];

export const DNFB_HOLDS = [
  { key: 0, name: 'Within bill hold (routine)', owner: 'Billing' },
  { key: 1, name: 'Awaiting coding', owner: 'Coding' },
  { key: 2, name: 'Physician query (CDI)', owner: 'Clinical Documentation' },
  { key: 3, name: 'Charge reconciliation', owner: 'Charge Capture' },
  { key: 4, name: 'Registration incomplete', owner: 'Patient Access' },
  { key: 5, name: 'Billing edit hold', owner: 'Billing' },
  { key: 6, name: 'Unassigned', owner: 'Unassigned' },
];

export const DNFB_AGE = [
  { key: 0, name: '0–3 days', min: 0, max: 3 },
  { key: 1, name: '4–7 days', min: 4, max: 7 },
  { key: 2, name: '8–14 days', min: 8, max: 14 },
  { key: 3, name: '15+ days', min: 15, max: 99999 },
];

export const AR_AGE = [
  { key: 0, name: '0–30', min: 0, max: 30 },
  { key: 1, name: '31–60', min: 31, max: 60 },
  { key: 2, name: '61–90', min: 61, max: 90 },
  { key: 3, name: '91–120', min: 91, max: 120 },
  { key: 4, name: '121–180', min: 121, max: 180 },
  { key: 5, name: '181–365', min: 181, max: 365 },
  { key: 6, name: '365+', min: 366, max: 99999 },
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

export const SOURCE_SYSTEMS = [
  { key: 'pas', name: 'Patient accounting (billing system)', feeds: 'Accounts, charges, transactions, A/R snapshots', cadence: 'Daily, 4:00 AM' },
  { key: 'clearinghouse', name: 'Claims clearinghouse (837/835/277)', feeds: 'Claim submissions, edits, remittances, denials', cadence: 'Daily, 3:30 AM' },
  { key: 'adt', name: 'Registration / ADT', feeds: 'Encounters, eligibility, authorizations', cadence: 'Hourly' },
  { key: 'scheduling', name: 'Scheduling and contact center', feeds: 'Orders, appointments, call statistics', cadence: 'Daily, 2:00 AM' },
  { key: 'coding', name: 'Coding and CDI worklists', feeds: 'Coding status, physician queries', cadence: 'Daily, 4:30 AM' },
  { key: 'gl', name: 'General ledger', feeds: 'Revenue cycle operating cost', cadence: 'Monthly, after close' },
];
