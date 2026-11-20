// Cash + A/R (v1 (B) only, src/config/v1.ts): are we collecting cash on time, and is A/R aging?
// One screen: two hero KPIs (cash collections, net A/R days) and three small modules. Below: cash
// vs. goal and the net A/R days trend (stacked), A/R > 90 days by hospital, cash by payor group.

import { V1B_VIEWS } from '../config/v1';
import { CanvasHeader } from '../ui/Shell';
import { BreakdownVisual, FillGrid, KpiHeroRow, TrendVisual } from '../ui/widgets';
import { CashVsGoal } from './EnterpriseOverview';

export function CashAr() {
  const v = V1B_VIEWS['cash-ar'];
  return (
    <div className="page v1b">
      <CanvasHeader compact />
      <KpiHeroRow hero={v.hero} modules={v.modules} />
      <FillGrid className="v1b-cash">
        <div className="v1b-stack">
          <CashVsGoal months={13} />
          <TrendVisual id="net_ar_days" months={13} title="Net A/R days trend" />
        </div>
        <BreakdownVisual id="ar_gt90_pct" dim="facility" title="A/R > 90 days by hospital" showCompare={false} />
        <BreakdownVisual id="cash" dim="financialClass" title="Cash collections by payor group" showCompare={false} />
      </FillGrid>
    </div>
  );
}
