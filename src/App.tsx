import { useEffect, useState } from 'react';
import { fetchDataset, type Dataset } from './data/model';
import { AccountDetail } from './pages/AccountDetail';
import { ArAnalytics } from './pages/ArAnalytics';
import { BillingDnfb } from './pages/BillingDnfb';
import { Cash } from './pages/Cash';
import { Definitions } from './pages/Definitions';
import { Denials } from './pages/Denials';
import { ExecutiveOverview } from './pages/ExecutiveOverview';
import { Facilities } from './pages/Facilities';
import { FacilityProfile } from './pages/FacilityProfile';
import { MetricAnalysis } from './pages/MetricAnalysis';
import { MidCycle } from './pages/MidCycle';
import { PatientAccess } from './pages/PatientAccess';
import { Payers } from './pages/Payers';
import { RevenueCycle } from './pages/RevenueCycle';
import { AppProvider, useApp } from './state/AppState';
import { FilterPane, Header, NavTabs, StaleBanner, StatusBar, Toasts } from './ui/Shell';

export default function App() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [err, setErr] = useState('');
  const [progress, setProgress] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setErr('');
    fetchDataset(`${import.meta.env.BASE_URL}data/`, (done, total) => setProgress(done / total))
      .then(setDs)
      .catch((e: Error) => setErr(e.message));
  }, [attempt]);

  if (err) {
    return (
      <div className="boot">
        <div className="boot-card" role="alert">
          <h1>The analytics workspace could not load</h1>
          <p>{err}</p>
          <p className="muted small">If this continues, contact the analytics support team and quote the time of the error.</p>
          <button type="button" className="btn btn-primary" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
        </div>
      </div>
    );
  }
  if (!ds) {
    return (
      <div className="boot" role="status">
        <div className="boot-card">
          <h1>Loading RCM Analytics</h1>
          <div className="boot-bar"><span style={{ width: `${Math.max(8, progress * 100)}%` }} /></div>
          <p className="muted small">Loading the analytical model (synthetic prototype data)…</p>
        </div>
      </div>
    );
  }
  return (
    <AppProvider ds={ds}>
      <Workspace />
    </AppProvider>
  );
}

function Workspace() {
  const { route } = useApp();
  return (
    <div className="app">
      <Header />
      <NavTabs />
      <div className="body">
        <FilterPane />
        <main className="canvas" id="main">
          <StaleBanner />
          <Page key={`${route.page}/${route.params.id ?? ''}`} />
        </main>
      </div>
      <StatusBar />
      <Toasts />
    </div>
  );
}

function Page() {
  const { route } = useApp();
  switch (route.page) {
    case 'cycle': return <RevenueCycle />;
    case 'ar': return <ArAnalytics />;
    case 'denials': return <Denials />;
    case 'cash': return <Cash />;
    case 'access': return <PatientAccess />;
    case 'midcycle': return <MidCycle />;
    case 'billing': return <BillingDnfb />;
    case 'payers': return <Payers />;
    case 'facilities': return <Facilities />;
    case 'definitions': return <Definitions />;
    case 'metric': return <MetricAnalysis />;
    case 'facility': return <FacilityProfile />;
    case 'accounts': return <AccountDetail />;
    default: return <ExecutiveOverview />;
  }
}
