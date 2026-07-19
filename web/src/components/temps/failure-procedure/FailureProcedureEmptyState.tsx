type Props = {
  onCreate: () => void;
};

export function FailureProcedureEmptyState({ onCreate }: Props) {
  return (
    <div className="fp-empty" role="status">
      <strong>Failure Procedure</strong>
      <p>No corrective actions have been configured.</p>
      <button type="button" className="fp-primary-btn" onClick={onCreate}>
        Enter first step
      </button>
    </div>
  );
}
