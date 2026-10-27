// Exports the static spec content (metric catalog, ELT framework, targets, capabilities, client KPI
// coverage, pages and filter fields) to docs/spec/catalog.json for the spec workbook.
// Read-only: it does not change the prototype. Run: npx tsx scripts/export-spec.ts

import { writeFileSync } from 'node:fs';
import { FIELD_LABEL } from '../src/engine/engine';
import { FRAMEWORK } from '../src/engine/framework';
import { METRICS } from '../src/engine/metrics';
import { CONFIG, staticTarget, watchFor } from '../src/engine/status';
import { CAPABILITIES } from '../src/config/priorities';
import { KPI_COVERAGE } from '../src/config/kpiCoverage';
import { PAGES, SECTIONS } from '../src/ui/Shell';

const metrics = METRICS.map((m) => {
  const raw = (CONFIG.targets as Record<string, { target: unknown; watch: unknown }>)[m.id];
  const target = raw?.target === 'dynamic' || m.target ? 'dynamic' : staticTarget(m.id);
  return {
    id: m.id, code: m.code ?? '', name: m.name, short: m.short ?? '', area: m.area, unit: m.unit,
    direction: m.direction, type: m.type, definition: m.definition, calculation: m.calculation,
    sourceFields: m.sourceFields, multiDef: !!m.multiDef, fact: m.fact, page: m.page,
    target, watch: target === 'dynamic' ? (raw?.watch ?? null) : watchFor(m.id, typeof target === 'number' ? target : null),
  };
});

const out = {
  metrics,
  framework: FRAMEWORK,
  cashGoalPctOfNpsr: CONFIG.cashGoalPctOfNpsr,
  capabilities: CAPABILITIES,
  kpiCoverage: KPI_COVERAGE,
  pages: PAGES,
  sections: SECTIONS,
  fields: FIELD_LABEL,
};
writeFileSync('docs/spec/catalog.json', JSON.stringify(out, null, 1));
console.log(`metrics ${metrics.length}, capabilities ${CAPABILITIES.length}, kpis ${KPI_COVERAGE.length}, pages ${PAGES.length}`);
