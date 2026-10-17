import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

// Setup pages in one place, so the menu only has what agents use every day.
const PAGES = [
  ['/settings', 'settings', 'Stores & settings', 'Store and team contacts, escalation matrix, holidays, agents, SparkTG, backup'],
  ['/automation', 'zap', 'Automation', 'Mailbox, automatic emails, Teams email previews, timers, agent shifts, activity log, outbox'],
  ['/case-workflows', 'workflow', 'Case workflows', 'Owner team, TAT and steps for every case type'],
  ['/workflow', 'workflow', 'LOTS workflow chart', 'The SOP flow with live counts'],
  ['/escalation-flow', 'workflow', 'Escalation flow', 'HO escalation matrix as a flow: First Time Resolution → Level 1 → Level 2, per case type'],
  ['/picklists', 'check', 'Picklists', 'Values of every dropdown'],
  ['/dependencies', 'swap', 'Dependencies', 'Which values go together (case type → category → …)'],
];

export default function Admin() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <span className="muted">Setup for team leaders. Agents don't need these pages day to day.</span>
        </div>
      </div>
      <div className="admin-grid">
        {PAGES.map(([to, icon, title, sub]) => (
          <Link key={to} to={to} className="card admin-tile">
            <Icon name={icon} />
            <div>
              <strong>{title}</strong>
              <div className="muted small">{sub}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
