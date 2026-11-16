import { useState, useEffect } from 'react';
import { SpaceBackground } from './components/SpaceBackground';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { PulseModal } from './components/PulseModal';
import { OverviewView } from './features/overview/OverviewView';
import { AnalyticsView } from './features/analytics/AnalyticsView';
import { AlertsView } from './features/alerts/AlertsView';
import { DigitalTwinView } from './features/twin/DigitalTwin';
import { BehavioralHealthView } from './features/behavioral/BehavioralHealthView';
import { MissionSetupView } from './features/setup/MissionSetupView';
import { CockpitDataProvider } from './api/CockpitData';
import type { ViewId } from './components/NavPill';

export default function App() {
  const [activeView, setActiveView] = useState<ViewId>('overview');
  const [activeCrew, setActiveCrew] = useState('okafor');
  const [pulseOpen, setPulseOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('avia-theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('avia-theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  function renderView() {
    switch (activeView) {
      case 'overview':   return <OverviewView onNavigate={setActiveView} />;
      case 'twin':       return <DigitalTwinView activeCrew={activeCrew} />;
      case 'analytics':  return <AnalyticsView activeCrew={activeCrew} theme={theme} />;
      case 'alerts':     return <AlertsView />;
      case 'behavioral': return <BehavioralHealthView activeCrew={activeCrew} theme={theme} />;
      case 'setup':      return <MissionSetupView />;
      default:           return <OverviewView />;
    }
  }

  return (
    <CockpitDataProvider>
      <SpaceBackground theme={theme} />
      <div className="app-shell">
        <TopBar
          onPulseClick={() => setPulseOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          onToggleSidebar={() => setMobileMenuOpen((prev) => !prev)}
        />

        <Sidebar
          activeCrew={activeCrew}
          onCrewSelect={setActiveCrew}
          activeView={activeView}
          onViewChange={(v) => {
            setActiveView(v);
            setMobileMenuOpen(false);
          }}
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          theme={theme}
          onToggleTheme={toggleTheme}
          onPulseClick={() => setPulseOpen(true)}
        />

        {mobileMenuOpen && (
          <div
            className="sidebar-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        <main className="main-canvas" role="main" aria-label="Main view">
          {renderView()}
        </main>

        {pulseOpen && (
          <PulseModal onClose={() => setPulseOpen(false)} />
        )}
      </div>
    </CockpitDataProvider>
  );
}
