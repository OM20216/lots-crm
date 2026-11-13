import HoMatrixCard, { ContactMatrixCard, StoreMatrixCard } from '../components/HoMatrixCard.jsx';

// The escalation matrix is a big setup page of its own, so it does not sit inside Stores & settings.
export default function EscalationMatrix() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Escalation matrix</h1>
          <span className="muted">Who gets the email at each level, with the TATs. HO, store and team rows. Edit any row; it applies at once, also to cases already escalated. See it as a flow chart on <a href="/escalation-flow">Escalation flow</a>.</span>
        </div>
      </div>
      <HoMatrixCard />
      <StoreMatrixCard />
      <ContactMatrixCard />
    </>
  );
}