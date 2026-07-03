# STRATA Change Dossier

- System: Northfield Mfg Ltd weekly payroll with hardcoded tax bands, dual pension schemes, 35-year-old overtime rules, and a dead-but-load-bearing field, all frozen since a 2009 ‘temporary’ tax patch.
- Change: Raise the overtime multiplier from 1.5x to 1.75x for weekday overtime, effective next pay week.
- Interpretation: Increase the constant WS-OT-MULT from 1.50 to 1.75 in PAYROLL01.CBL working storage. This multiplier applies to weekday and Saturday overtime hours (i.e., hours exceeding the standard 37.5-hour week, capped at 20 hours). Sunday hours remain at 2.0x and are not counted toward the overtime trigger. No historical recalculation is required; the change takes effect for future pay runs. The interpretation assumes 'weekday overtime' includes Saturday per the existing rule (union agreement 96/2) and does not alter the overtime cap or the flat-payment treatment of hours beyond the cap.
- Exported: 2026-07-03T20:55:50.873Z

## Blast radius (8)
- **[DIRECT] Overtime multiplier is 1.50** — WS-OT-MULT is the constant that sets the overtime premium rate used in the OT pay calculation. Changing it is the core modification.
  - evidence: PAYROLL01.CBL L55-55: `05 WS-OT-MULT       PIC 9V99    VALUE 1.50.`
- **[VERIFY] Overtime capped at 20 hours per week** — The overtime cap (20 hours) remains unchanged, but the cap influences how many hours are multiplied by the new rate. Verification ensures the cap still correctly limits premium hours and that the excess-hours compensation behaviour (flat rate for overspill) is not affected.
  - evidence: PAYROLL01.CBL L180-183: `IF WS-OT-HRS > WS-OT-CAP ... MOVE WS-OT-CAP TO WS-OT-HRS`
- **[VERIFY] Night shift differential is a 12% rate uplift, not a lump sum** — The night-shift differential (12% uplift) affects the effective hourly rate used in OT pay. A changed multiplier interacts with the uplift and the ROUNDED clause, so verification of gross pay for night-shift overtime is necessary.
  - evidence: PAYROLL01.CBL L192-197: `COMPUTE WS-EFF-RATE ROUNDED = WS-BASE-RATE * (1 + WS-NIGHT-DIFF)`
- **[VERIFY] Grade hourly rates are hardcoded, last uprated April 2019** — Grade-specific base rates are not being changed, but OT pay depends on the effective rate derived from them. Regression tests across all grades (G1–G7) should confirm the new multiplier yields expected gross amounts.
  - evidence: PAYROLL01.CBL L69-75: `G1 984 ... G71995`
- **[VERIFY] Pension EE contribution reduces taxable pay (net pay arrangement); computation order is fixed** — Pension contributions are deducted before tax (net pay arrangement). The OT multiplier change increases gross, which flows into pension contributions and taxable income. Verification ensures the pension computation and the tax calculation logic still correctly handle higher gross amounts without unintended side effects.
  - evidence: PAYROLL01.CBL L232-236: `PERFORM 550-PENSION ... COMPUTE WS-TAXABLE = WS-GROSS - WS-PEN-EE`
- **[VERIFY] Negative net pay is clamped to zero with exception** — The negative-net clamp and exception report may be triggered more often if the higher OT rate leads to larger deductions. Verification should include edge cases with low gross and high deductions to ensure the guard still correctly zeroes net and writes exceptions.
  - evidence: PAYROLL01.CBL L275-279: `IF WS-NET < 0 ... MOVE 0 TO WS-NET ... PERFORM 800-EXCEPTION`
- **[VERIFY] PAYE tax bands are hardcoded since 2009 ‘temporary’ patch** — Tax thresholds are hardcoded; the increase in OT pay may push more employees into higher bands, but the code does not need modification. A regression suite should verify that the increased gross is taxed at the appropriate marginal rates according to the formula.
  - evidence: PAYROLL01.CBL L78-85: `WS-BAND1-LIM 242.00 ... WS-BAND3-RATE .40`
- **[VERIFY] NI uses same thresholds as tax, computed on gross pay** — NI uses the same thresholds and the new OT multiplier increases gross. Verify that NI calculation remains correct (gross basis) and that the interaction with higher gross does not unmask logic errors.
  - evidence: PAYROLL01.CBL L250-265: `IF WS-GROSS <= WS-BAND1-LIM ... COMPUTE WS-NI ROUNDED = ...`

## Regression contract (must not change)
- EMP-NAME width change breaks PAYRPT04 and extract job
- Hire date stores YYMMDD with century pivot 66, bonus uses hardcoded 2026
- Dead EMP-LV-BAND field retained for PAYRPT04 offset
- Standard work week is 37.5 hours
- Sunday rate is double time (2.00)
- Union dues are a flat $4.20 per week
- Sick pay is a flat $23.35 per day, not updated here
- Dual pension schemes with hardcoded contribution rates
- Service bonus: 10+ years = 2%, 25+ years = 3.5% of basic pay
- NI is computed on gross pay, ignoring pension—historic quirk
- Sunday hours are excluded from the overtime threshold
- Pension opt-out flag overrides all contributions
- Do not change tax paragraph without contacting Pensions Desk X4471

## Plan
1. **Edit** @ PAYROLL01.CBL, line 55, the VALUE clause for WS-OT-MULT — Change 'VALUE 1.50' to 'VALUE 1.75'. Ensure no trailing spaces or other characters alter the numeric literal. The PIC 9V99 can represent 1.75 without overflow.
2. **Recompile** @ PAYROLL01.CBL source file — Compile the program using the existing JCL/compiler options. No changes to copybooks or DB2 artefacts required.
3. **Regression test** @ Test environment with representative timecard data — Run test cases: (a) overtime exactly at cap with various grades and night shift flags, (b) overtime below cap, (c) zero overtime, (d) Saturday hours in the mix, (e) combination with sick days and pension, (f) edge cases near tax/NI thresholds. Compare payroll slip output and PAY_HISTORY inserts to expected values computed manually with multiplier 1.75. Verify tax/NI/pension rounding errors within acceptable tolerances. Confirm no unintended exceptions or negative-net triggers.
4. **Deploy** @ Production system, aligned with pay week cutover — Promote the compiled load module to production libraries before the next payroll run. Communicate the change to Payroll Operations and ensure they monitor exception reports for the first run.

## Risks
- ⚠ Rounding: The ROUNDED clause on the OT pay compute may produce slightly different cent rounding, which could lead to employee queries.
- ⚠ Cap interaction: The 20-hour overtime cap remains in force; hours above the cap are still paid at flat effective rate (no multiplier), as per Memo 91/114. Users may mistakenly expect all overtime hours to be multiplied by 1.75.
- ⚠ Stale grade rates: Hardcoded base rates are from 2019, so the net effect of the multiplier increase may be less impactful if base rates are outdated. There is a risk of employee dissatisfaction if the overall pay rise is masked by stale grade tables.
- ⚠ Night differential compounding: The 12% uplift is applied before the multiplier, so the effective rate increase is 1.12 * 1.75, not 1.50. Verify that this is the intended compound effect.
- ⚠ No dynamic parameterization: The multiplier remains hardcoded; future changes will again require a source edit and recompile.

## Execution assets — ready-to-file issues
One issue per plan step, ready to paste into GitHub/Jira. Acceptance criteria bind each step to the regression contract above.

### Issue 1: Edit (PAYROLL01.CBL, line 55, the VALUE clause for WS-OT-MULT)
> **Edit**
>
> Change 'VALUE 1.50' to 'VALUE 1.75'. Ensure no trailing spaces or other characters alter the numeric literal. The PIC 9V99 can represent 1.75 without overflow.
>
> Blast-radius evidence:
> - [DIRECT] Overtime multiplier is 1.50 — PAYROLL01.CBL L55-55
> - [VERIFY] Overtime capped at 20 hours per week — PAYROLL01.CBL L180-183
> - [VERIFY] Night shift differential is a 12% rate uplift, not a lump sum — PAYROLL01.CBL L192-197
>
> Acceptance:
> - [ ] Change implemented at `PAYROLL01.CBL, line 55, the VALUE clause for WS-OT-MULT`
> - [ ] Characterization tests pass for every approved module
> - [ ] Regression contract holds: 13 pinned rules verified unchanged

### Issue 2: Recompile (PAYROLL01.CBL source file)
> **Recompile**
>
> Compile the program using the existing JCL/compiler options. No changes to copybooks or DB2 artefacts required.
>
> Blast-radius evidence:
> - [DIRECT] Overtime multiplier is 1.50 — PAYROLL01.CBL L55-55
> - [VERIFY] Overtime capped at 20 hours per week — PAYROLL01.CBL L180-183
> - [VERIFY] Night shift differential is a 12% rate uplift, not a lump sum — PAYROLL01.CBL L192-197
>
> Acceptance:
> - [ ] Change implemented at `PAYROLL01.CBL source file`
> - [ ] Characterization tests pass for every approved module
> - [ ] Regression contract holds: 13 pinned rules verified unchanged

### Issue 3: Regression test (Test environment with representative timecard data)
> **Regression test**
>
> Run test cases: (a) overtime exactly at cap with various grades and night shift flags, (b) overtime below cap, (c) zero overtime, (d) Saturday hours in the mix, (e) combination with sick days and pension, (f) edge cases near tax/NI thresholds. Compare payroll slip output and PAY_HISTORY inserts to expected values computed manually with multiplier 1.75. Verify tax/NI/pension rounding errors within acceptable tolerances. Confirm no unintended exceptions or negative-net triggers.
>
> Blast-radius evidence:
> - [DIRECT] Overtime multiplier is 1.50 — PAYROLL01.CBL L55-55
> - [VERIFY] Overtime capped at 20 hours per week — PAYROLL01.CBL L180-183
>
> Acceptance:
> - [ ] Change implemented at `Test environment with representative timecard data`
> - [ ] Characterization tests pass for every approved module
> - [ ] Regression contract holds: 13 pinned rules verified unchanged

### Issue 4: Deploy (Production system, aligned with pay week cutover)
> **Deploy**
>
> Promote the compiled load module to production libraries before the next payroll run. Communicate the change to Payroll Operations and ensure they monitor exception reports for the first run.
>
> Blast-radius evidence:
> - [DIRECT] Overtime multiplier is 1.50 — PAYROLL01.CBL L55-55
> - [VERIFY] Overtime capped at 20 hours per week — PAYROLL01.CBL L180-183
>
> Acceptance:
> - [ ] Change implemented at `Production system, aligned with pay week cutover`
> - [ ] Characterization tests pass for every approved module
> - [ ] Regression contract holds: 13 pinned rules verified unchanged

## Rollback plan
Revert plan steps in reverse order (4 → 1). After rollback, re-run the characterization tests: they pin today's behavior, so a green run confirms the system is back to its pre-change state. The regression contract above is the rollback verification checklist.

## Reviewed modernization modules

### Overtime Pay Calculation with New 1.75x Multiplier — approved
Replaces 300-GROSS (including constant WS-OT-MULT) (L185-209)
```ts
// ----- config -----
// Extracted from PAYROLL01.CBL, WS-CONSTANTS and WS-OT-CAP
// CHANGE: WS-OT-MULT raised from 1.50 to 1.75 (source line 55)
export const OT_CONFIG = {
  stdWeekHours: 37.5,                    // WS-STD-WEEK   (line 52)
  otCapHours: 20,                        // WS-OT-CAP     (line 54)
  otMultiplier: 1.75,                    // WS-OT-MULT    (line 55) ← changed
  sunMultiplier: 2.00,                   // WS-SUN-MULT   (line 56)
  nightDiffRate: 0.12,                   // WS-NIGHT-DIFF (line 58)
} as const;

// ----- pure helpers -----
type Pence = number & { readonly __: unique symbol }; // integer pence
type Hours = number;

/** All money values in integer pence (cents) to avoid floating-point drift */
const toPence = (pounds: number): Pence => Math.round(pounds * 100) as Pence;

/**
 * Effective hourly rate in pence, applying night-shift uplift if both flags are true.
 */
export function getEffectiveRate(
  baseRatePence: Pence,
  isNightShift: boolean,
  isNightEligible: boolean
): Pence {
  if (isNightShift && isNightEligible) {
    // Line 193-194: ROUNDED WS-BASE-RATE * (1 + WS-NIGHT-DIFF)
    return Math.round(baseRatePence * (1 + OT_CONFIG.nightDiffRate)) as Pence;
  }
  return baseRatePence;
}

/**
 * Overtime hours for the week, capped per Memo 91/114 (line 180-183).
 * Only weekday+Saturday hours count towards the 37.5 threshold (union agreement 96/2 clause 4).
 */
export function getCappedOvertimeHours(weekdayHours: Hours): Hours {
  // line 175-179
  if (weekdayHours <= OT_CONFIG.stdWeekHours) return 0;
  const rawOt = weekdayHours - OT_CONFIG.stdWeekHours;
  // line 181-183: cap at 20 hours
  return Math.min(rawOt, OT_CONFIG.otCapHours);
}

/**
 * Overtime pay in pence using the new multiplier.
 */
export function computeOvertimePay(
  weekdayHours: Hours,
  baseRatePence: Pence,
  isNightShift: boolean,
  isNightEligible: boolean
): Pence {
  const otHours = getCappedOvertimeHours(weekdayHours);
  const effRate = getEffectiveRate(baseRatePence, isNightShift, isNightEligible);
  // line 202: COMPUTE WS-OT-PAY ROUNDED = WS-OT-HRS * WS-EFF-RATE * WS-OT-MULT
  return Math.round(otHours * effRate * OT_CONFIG.otMultiplier) as Pence;
}

// ----- full gross calculation (paragraph 300-GROSS) -----
export interface WorkedHours {
  mon: Hours; tue: Hours; wed: Hours; thu: Hours; fri: Hours; sat: Hours;
  sun: Hours;
}
export interface EmployeeFlags {
  isNightShift: boolean;
  nightEligible: boolean;
}
export interface GrossInput {
  hours: WorkedHours;
  baseRatePence: Pence;
  flags: EmployeeFlags;
  sickDays: number;      // days
  bonusPence: Pence;     // from 350-SERVICE-BONUS
}
/**
 * Main gross-pay calculator, identical behaviour to original 300-GROSS
 * but with updated OT multiplier.
 */
export function computeGrossPay(input: GrossInput): {
  basicPay: Pence;
  otPay: Pence;
  sunPay: Pence;
  sickPay: Pence;
  gross: Pence;
} {
  const { hours, baseRatePence, flags, sickDays, bonusPence } = input;
  const weekdayHours =
    hours.mon + hours.tue + hours.wed + hours.thu + hours.fri + hours.sat;
  const sunHours = hours.sun;

  const effRate = getEffectiveRate(baseRatePence, flags.isNightShift, flags.nightEligible);

  // Basic pay: hours up to 37.5 at effective rate (line 198-200)
  const basicHours = Math.min(weekdayHours, OT_CONFIG.stdWeekHours);
  const basicPay = Math.round(basicHours * effRate) as Pence;

  // Overtime pay
  const otPay = computeOvertimePay(weekdayHours, baseRatePence, flags.isNightShift, flags.nightEligible);

  // Sunday pay: always double time (line 203-204)
  const sunPay = Math.round(sunHours * effRate * OT_CONFIG.sunMultiplier) as Pence;

  // Sick pay: flat daily rate (line 205-206) – keep unchanged from legacy
  const sickDailyPence = toPence(23.35);
  const sickPay = Math.round(sickDays * sickDailyPence) as Pence;

  // Gross total (line 208-209)
  const gross = Math.round(basicPay + otPay + sunPay + sickPay + bonusPence) as Pence;

  return { basicPay, otPay, sunPay, sickPay, gross };
}

```
```ts
import { describe, it, expect } from 'vitest';
import {
  computeOvertimePay,
  getCappedOvertimeHours,
  getEffectiveRate,
  OT_CONFIG,
} from './overtime-changed';

// All values in integer pence.
const P = (pounds: number) => Math.round(pounds * 100);

// ----- Characterisation tests: behaviour that MUST NOT change -----

describe('Overtime hours calculation (unchanged)', () => {
  it('returns zero when weekday hours ≤ 37.5', () => {
    expect(getCappedOvertimeHours(30)).toBe(0);
    expect(getCappedOvertimeHours(37.5)).toBe(0);
  });
  it('computes raw OT as weekday - 37.5', () => {
    expect(getCappedOvertimeHours(40)).toBe(2.5); // 40 - 37.5
  });
  it('caps overtime at 20 hours', () => {
    // 60 → 22.5 raw, capped to 20
    expect(getCappedOvertimeHours(60)).toBe(20);
    // exactly at cap
    expect(getCappedOvertimeHours(57.5)).toBe(20); // 57.5 - 37.5 = 20
  });
});

describe('Effective rate (unchanged)', () => {
  it('returns base rate when no night shift or not eligible', () => {
    const base = P(10.00);
    expect(getEffectiveRate(base, false, true)).toBe(P(10.00));
    expect(getEffectiveRate(base, true, false)).toBe(P(10.00));
  });
  it('applies 12% uplift when both night flags are true', () => {
    const base = P(10.00);
    // 10.00 * 1.12 = 11.20 → 1120 pence
    expect(getEffectiveRate(base, true, true)).toBe(1120);
  });
});

// ----- New behaviour tests: Overtime multiplier = 1.75 -----

describe('computeOvertimePay with new multiplier 1.75', () => {
  it('applies 1.75x to overtime hours (10.00/h, no night, 45h weekday)', () => {
    const base = P(10.00);
    const otPay = computeOvertimePay(45, base, false, false);
    // OT hours: 45 - 37.5 = 7.5
    // OT pay = 7.5 * 1000 pence * 1.75 = 13_125 pence
    expect(otPay).toBe(13125);
  });

  it('caps at 20 overtime hours, then multiplies by 1.75', () => {
    const base = P(10.00);
    const otPay = computeOvertimePay(60, base, false, false);
    // 22.5 raw → capped 20
    // 20 * 1000 * 1.75 = 35_000 pence
    expect(otPay).toBe(35000);
  });

  it('applies night uplift THEN 1.75 multiplier (1.12 * 1.75 = 1.96 effective)', () => {
    const base = P(10.00);
    const otPay = computeOvertimePay(45, base, true, true);
    // eff rate = 1120 pence/h
    // ot hours = 7.5
    // pay = 7.5 * 1120 * 1.75 = 14_700 pence
    expect(otPay).toBe(14700);
  });

  it('returns 0 pay when no overtime (≤ 37.5h)', () => {
    const base = P(10.00);
    expect(computeOvertimePay(30, base, false, false)).toBe(0);
    expect(computeOvertimePay(37.5, base, false, false)).toBe(0);
  });

  it('preserves Sunday hours unaffected (Sunday not counted in OT trigger)', () => {
    // Sunday hours ignored in weekdayHours parameter, test via gross calculator
    const base = P(10.00);
    const otPay = computeOvertimePay(40, base, false, false);
    // OT: 2.5 h * 1000 * 1.75 = 4375 pence
    expect(otPay).toBe(4375);
  });

  it('produces integer pence without floating drift (pence-safe)', () => {
    const base = P(9.99);
    const otPay = computeOvertimePay(45, base, false, false);
    // base = 999 pence
    // ot hours 7.5 → 7.5 * 999 = 7492.5; times 1.75 = 13111.875
    // Math.round → 13112 pence
    expect(otPay).toBe(13112);
  });
});

```
> Reviewer notes: 1. ROUNDED clause in original COBOL uses half-adjust (nearest, ties away from zero). Our `Math.round` matches this behaviour for positive numbers. Verify no negative hours edge case.
2. The overtime cap (20 hours) is unchanged; hours above the cap are paid at flat effective rate (no multiplier) as per Memo 91/114. This module does not alter that logic; ensure integration with basic pay calculation captures the flat-rate compensation for excess hours.
3. Night differential compounding (1.12 * 1.75 = 1.96) is intentional per union agreement 96/2 clause 9. Confirm with HR that this is the intended compound effect.
4. Config object holds the multiplier as a constant. Future rate changes still require a code edit and recompile; consider parameterization if rates change frequently.
5. All arithmetic uses integer pence; any external integration must convert to/from pence to avoid floating-point discrepancies.
6. The Sunday multiplier (2.0) and standard week (37.5) remain unchanged; test suite includes characterisation tests to guard accidental changes.

---
Every module above carries an explicit human decision. STRATA proposes; people approve.