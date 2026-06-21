export function SenecaDisclaimer() {
  return (
    <p className="seneca-disclaimer">
      Seneca can suggest coaching language. Review before saving.
    </p>
  );
}

export function SenecaBrandMark() {
  return (
    <span className="seneca-brand" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="9" cy="10" r="1" fill="currentColor" />
        <circle cx="15" cy="10" r="1" fill="currentColor" />
      </svg>
      Seneca
    </span>
  );
}
