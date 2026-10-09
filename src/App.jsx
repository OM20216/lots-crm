import { lazy, Suspense, useEffect, useState, useCallback } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { api, currentAgent } from './api.js';
import { MetaContext } from './ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewCase from './pages/NewCase.jsx';
import EmailInbox from './pages/EmailInbox.jsx';
import MissedCalls from './pages/MissedCalls.jsx';
import Cases from './pages/Cases.jsx';
import CaseDetail from './pages/CaseDetail.jsx';
import Followups from './pages/Followups.jsx';
import Leads from './pages/Leads.jsx';
import Contacts from './pages/Contacts.jsx';
import ContactForm from './pages/ContactForm.jsx';
import Knowledge from './pages/Knowledge.jsx';
import Settings from './pages/Settings.jsx';
import Automation from './pages/Automation.jsx';
import Calls from './pages/Calls.jsx';
const LotsFlow = lazy(() => import('./pages/LotsFlow.jsx'));
import { SparkTGProvider } from './sparktg.jsx';
import { CallerPanel, Dialer } from './components/Dialer.jsx';
import Icon from './components/Icon.jsx';
import MissedBar from './components/MissedBar.jsx';
import { useSparkTG } from './sparktg.jsx';

function NavItem({ to, end, icon, label, count, accent, plain }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-item ${accent ? 'accent' : ''} ${isActive && !plain ? 'active' : ''}`} title={label}>
      <Icon name={icon} />
      <span className="nav-label">{label}</span>
      {count ? <span className="count">{count}</span> : null}
    </NavLink>
  );
}

function TopBar({ agent, onSwitch }) {
  const { hasWidget, ready, ssoStatus } = useSparkTG();
  const dialer = !hasWidget ? ['grey', 'Dialer not set up'] : ready && ssoStatus === 'success' ? ['green', 'Dialer ready'] : ready ? ['yellow', 'Dialer: sign in'] : ['grey', 'Dialer loading'];
  return (
    <header className="topbar">
      <div className="topbar-title">LOTS Wholesale Solutions · Customer Care</div>
      <MissedBar />
      <div className="topbar-right">
        <span className="topbar-status" title={dialer[1]}>
          <span className={`dot ${dialer[0]}`} /> {dialer[1]}
        </span>
        <span className="topbar-agent">{agent}</span>
        <span className="role-badge">Agent</span>
        <button className="btn sm" onClick={onSwitch}>
          <Icon name="swap" size={14} /> Switch agent
        </button>
      </div>
    </header>
  );
}

function SignIn({ agents, onSignIn }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  return (
    <div className="signin">
      <div className="card signin-card">
        <div className="brand big">
          <span className="logo">LOTS</span> Customer Care CRM
        </div>
        <p className="muted">Choose your name. It is recorded on every case you touch.</p>
        <div className="agent-list">
          {agents.map((a) => (
            <button key={a} className="btn" onClick={() => onSignIn(a)}>
              {a}
            </button>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSignIn(name.trim(), true, email.trim());
          }}
        >
          <input placeholder="New agent name" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="email" placeholder="SparkTG login email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn primary">Add &amp; sign in</button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [meta, setMeta] = useState({ stores: [], agents: [], agentEmails: {} });
  const [agent, setAgent] = useState(currentAgent());
  const [stats, setStats] = useState(null);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('lots-menu-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem('lots-menu-collapsed', c ? '0' : '1');
      } catch {
        /* storage unavailable */
      }
      return !c;
    });

  const loadMeta = useCallback(() => api.get('/meta').then(setMeta).catch(() => {}), []);
  const refreshStats = useCallback(() => api.get('/stats').then(setStats).catch(() => {}), []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!agent) return;
    refreshStats();
    const t = setInterval(refreshStats, 30000);
    return () => clearInterval(t);
  }, [agent, refreshStats]);

  async function signIn(name, isNew, email) {
    if (isNew) await api.post('/agents', { name, email });
    try {
      localStorage.setItem('lots-agent', name);
    } catch {
      /* storage unavailable */
    }
    setAgent(name);
    loadMeta();
  }

  function signOut() {
    try {
      localStorage.removeItem('lots-agent');
    } catch {
      /* storage unavailable */
    }
    setAgent('');
  }

  if (!agent) return <SignIn agents={meta.agents} onSignIn={signIn} />;

  return (
    <MetaContext.Provider value={{ ...meta, agent, stats, refreshStats, reloadMeta: loadMeta }}>
      <SparkTGProvider widgetUrl={meta.widgetUrl} agentEmail={meta.agentEmails?.[agent] || ''} onCallLogged={refreshStats}>
      <div className={`layout ${collapsed ? 'collapsed' : ''}`}>
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-logo">L</span>
            <span className="brand-text">
              <strong>LOTS</strong>
              <small>Customer Care CRM</small>
            </span>
          </div>
          <button className="collapse-btn" onClick={toggleCollapsed} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={14} />
          </button>
          <nav>
            {/* Grouped as in the SOP: case handling, the communication channels, store escalation, reference */}
            <NavItem to="/" end icon="dashboard" label="Dashboard" />
            <NavItem to="/workflow" icon="workflow" label="LOTS Workflow" />

            <div className="nav-group">Case handling</div>
            <NavItem to="/new" icon="cases" label="Log new case" accent />
            <NavItem to={`/cases?assignedTo=${encodeURIComponent(agent)}&status=Pending,Waiting,Escalated,Resolved`} icon="user" label="My queue" count={stats?.mine} plain />
            <NavItem to="/cases" icon="search" label="Search cases" />

            <div className="nav-group">Channels</div>
            <NavItem to="/calls" icon="incoming" label="Calls" />
            <NavItem to="/emails" icon="mail" label="Email inbox" count={stats?.pendingEmails} />
            <NavItem to="/leads" icon="outgoing" label="Outbound leads" count={stats?.leadsDue} />

            <div className="nav-group">Store escalation</div>
            <NavItem to="/followups" icon="store" label="Store follow-ups" count={stats?.byStatus?.Escalated} />

            <div className="nav-group">Reference</div>
            <NavItem to="/contacts" icon="members" label="Contacts" />
            <NavItem to="/kb" icon="book" label="SOP knowledge base" />

            <div className="nav-group">Admin</div>
            <NavItem to="/automation" icon="zap" label="Automation" />
            <NavItem to="/settings" icon="settings" label="Stores & settings" />
          </nav>
          <div className="sidebar-foot">
            <div>Customer care 1860-123-5687</div>
            <div>contactus@cpwi.in · everyday 9 AM – 9 PM</div>
          </div>
        </aside>
        <div className="shell">
        <TopBar agent={agent} onSwitch={signOut} />
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewCase />} />
            <Route path="/emails" element={<EmailInbox />} />
            <Route path="/missed" element={<MissedCalls />} />
            <Route path="/cases" element={<Cases />} />
            <Route path="/cases/:id" element={<CaseDetail />} />
            <Route path="/followups" element={<Followups />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/contacts/new" element={<><Contacts /><ContactForm /></>} />
            <Route path="/contacts/:id" element={<><Contacts /><ContactForm /></>} />
            <Route path="/members" element={<Navigate to="/contacts" replace />} />
            <Route path="/kb" element={<Knowledge />} />
            <Route path="/automation" element={<Automation />} />
            <Route path="/calls" element={<Calls />} />
            <Route
              path="/workflow"
              element={
                <Suspense fallback={<div className="empty">Loading workflow…</div>}>
                  <LotsFlow />
                </Suspense>
              }
            />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        </div>
      </div>
      <Dialer />
      <CallerPanel />
      </SparkTGProvider>
    </MetaContext.Provider>
  );
}
