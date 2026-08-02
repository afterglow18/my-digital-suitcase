import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Redirect, Router as WouterRouter } from 'wouter';
import { useState, useCallback, useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import WardrobePage from './pages/wardrobe';
import GeneratePage from './pages/generate';
import SavedPage from './pages/saved';
import FavoritesPage from './pages/favorites';
import AccountPage from './pages/account';
import WelcomePage from './pages/welcome';
import { queryClient } from '@/lib/queryClient';
import { INDEXER_EVENT } from '@/lib/visionIndexer';

// ── First-launch welcome ──────────────────────────────────────────────────────
const ENTERED_KEY = "suitcase-entered";

function hasEntered(): boolean {
  try {
    return (
      sessionStorage.getItem(ENTERED_KEY) === "1" ||
      new URLSearchParams(window.location.search).get("preview") === "1"
    );
  } catch {
    return false;
  }
}

function markEntered() {
  try { sessionStorage.setItem(ENTERED_KEY, "1"); } catch {}
}

// ── Indexing progress toast ───────────────────────────────────────────────────
// Simple self-contained floating banner — no external toast library needed.

function IndexingToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const handler = (e: Event) => {
      const { total, finished } = (
        e as CustomEvent<{ done: number; total: number; finished: boolean }>
      ).detail;

      if (total === 0) return;

      if (!finished) {
        setVisible(true);
        if (hideTimer) clearTimeout(hideTimer);
      } else {
        // Brief delay so the "ready" state is visible, then fade out
        hideTimer = setTimeout(() => setVisible(false), 2000);
      }
    };

    window.addEventListener(INDEXER_EVENT, handler);
    return () => {
      window.removeEventListener(INDEXER_EVENT, handler);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200]
                 px-4 py-2.5 rounded-xl border-2 border-black
                 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                 font-bold text-xs uppercase tracking-wider
                 flex items-center gap-2 pointer-events-none
                 whitespace-nowrap"
    >
      <span className="w-2 h-2 rounded-full bg-black animate-pulse inline-block" />
      Preparing photo search…
    </div>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────
function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/"         component={WardrobePage}  />
        <Route path="/generate" component={GeneratePage}  />
        <Route path="/saved"    component={SavedPage}     />
        <Route path="/favorites" component={FavoritesPage} />
        <Route path="/account"  component={AccountPage}   />
        <Redirect to="/" />
      </Switch>
    </AppLayout>
  );
}

// ── App shell — shows welcome on first session, then the app ─────────────────
function AppShell() {
  const [entered, setEntered] = useState<boolean>(hasEntered);

  const handleEnter = useCallback(() => {
    markEntered();
    setEntered(true);
  }, []);

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      {entered ? (
        <Router />
      ) : (
        <WelcomePage onEnter={handleEnter} />
      )}
    </WouterRouter>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
      <IndexingToast />
    </QueryClientProvider>
  );
}

export default App;
