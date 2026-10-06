import { useEffect, useState } from 'react';
import { fetchDataset, type Dataset } from './data/model';
import { ClaimList } from './pages/ClaimList';
import { DetailAr } from './pages/DetailAr';
import { DetailClaims } from './pages/DetailClaims';
import { DetailDnfb } from './pages/DetailDnfb';
import { Operational } from './pages/Operational';
import { PeriodChange } from './pages/PeriodChange';
import { Scorecard } from './pages/Scorecard';
import { SignIn } from './pages/SignIn';
import { AppProvider, useApp } from './state/AppState';
import { ActionBar, FilterBar, Header, Nav, SelectionsBar, Toasts } from './ui/Shell';

const SESSION_KEY = 'rcm-proto-user';

function readSession(): string | null {
  try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
}
function writeSession(v: string | null) {
  try { if (v) sessionStorage.setItem(SESSION_KEY, v); else sessionStorage.removeItem(SESSION_KEY); } catch { /* storage may be blocked */ }
}

export default function App() {
  const [user, setUser] = useState<string | null>(readSession);
  const [ds, setDs] = useState<Dataset | null>(null);
  const [err, setErr] = useState('');

  // Load data only after sign-in: no data is shown before the user signs in.
  useEffect(() => {
    if (!user || ds) return;
    fetchDataset(`${import.meta.env.BASE_URL}data/`).then(setDs).catch((e: Error) => setErr(e.message));
  }, [user, ds]);

  if (!user) return <SignIn onSignIn={(u) => { writeSession(u); setUser(u); }} />;
  if (err) return <div className="loading">Data could not load: {err}</div>;
  if (!ds) return <div className="loading" role="status">Loading data…</div>;
  return (
    <AppProvider ds={ds} user={user}>
      <Layout onSignOut={() => { writeSession(null); setUser(null); }} />
    </AppProvider>
  );
}

function Layout({ onSignOut }: { onSignOut: () => void }) {
  const { page } = useApp();
  return (
    <div className="app">
      <Header onSignOut={onSignOut} />
      <FilterBar />
      <SelectionsBar />
      <div className="navrow">
        <Nav />
        <ActionBar />
      </div>
      <main>
        {page === 'scorecard' && <Scorecard />}
        {page === 'operational' && <Operational />}
        {page === 'change' && <PeriodChange />}
        {page === 'dnfb' && <DetailDnfb />}
        {page === 'claims' && <DetailClaims />}
        {page === 'ar' && <DetailAr />}
        {page === 'claimlist' && <ClaimList />}
      </main>
      <footer className="app-footer">Synthetic data only. Prototype for discussion; the production build is a Qlik Cloud app.</footer>
      <Toasts />
    </div>
  );
}
