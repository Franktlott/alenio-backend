import { useState } from "react";
import type { TempProgramDetailRow, TempProgramValidation } from "../../lib/api";
import {
  deleteTeamTemperatureAssignment,
  deleteTeamTemperatureCheckItem,
  deleteTeamTemperatureCorrectiveTemplate,
  deleteTeamTemperatureEquipment,
  deleteTeamTemperatureEquipmentGroup,
  deleteTeamTemperatureSchedule,
  patchTeamTemperatureProgram,
  postTeamTemperatureAssignment,
  postTeamTemperatureCheckItem,
  postTeamTemperatureCorrectiveRule,
  postTeamTemperatureCorrectiveTemplate,
  postTeamTemperatureEquipment,
  postTeamTemperatureEquipmentGroup,
  postTeamTemperatureProgramActivate,
  postTeamTemperatureProgramArchive,
  postTeamTemperatureProgramNewDraft,
  postTeamTemperatureProgramValidate,
  postTeamTemperatureSchedule,
} from "../../lib/api";
import {
  ASSIGNMENT_TYPE_OPTIONS,
  canEditTempProgram,
  CHECK_TYPE_OPTIONS,
  CONDITION_TYPE_OPTIONS,
  CORRECTIVE_ACTION_OPTIONS,
  formatScheduleSummary,
  formatTempProgramSaveError,
  formatTempRange,
  SCHEDULE_TYPE_OPTIONS,
  tempProgramStatusClass,
  tempProgramStatusLabel,
  validationSummary,
} from "../../lib/temperature-programs-display";

type Tab = "overview" | "structure" | "schedules" | "assignments" | "corrective";

type Props = {
  teamId: string;
  canManage: boolean;
  program: TempProgramDetailRow;
  onRefresh: () => void;
  onProgramUpdated: (program: TempProgramDetailRow) => void;
  onNavigateToProgram: (programId: string) => void;
};

export function TemperatureProgramDetail({
  teamId,
  canManage,
  program,
  onRefresh,
  onProgramUpdated,
  onNavigateToProgram,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [validation, setValidation] = useState<TempProgramValidation | null>(null);
  const editable = canManage && canEditTempProgram(program);

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage(formatTempProgramSaveError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="temp-prog-detail">
      <header className="temp-prog-detail-head">
        <div>
          <div className="temp-prog-detail-title-row">
            <h2>{program.name}</h2>
            <span className={tempProgramStatusClass(program.status)}>{tempProgramStatusLabel(program.status)}</span>
            <span className="temp-prog-version">v{program.versionNumber}</span>
          </div>
          {program.description ? <p className="enterprise-muted temp-prog-detail-desc">{program.description}</p> : null}
        </div>
        {canManage ? (
          <div className="temp-prog-detail-actions">
            <button
              type="button"
              className="temp-prog-btn-secondary"
              disabled={busy}
              onClick={() =>
                void runAction(async () => {
                  const result = await postTeamTemperatureProgramValidate(teamId, program.id);
                  setValidation(result.validation);
                  setMessage(validationSummary(result.validation));
                })
              }
            >
              Validate
            </button>
            {program.status === "draft" ? (
              <button
                type="button"
                className="temp-prog-btn-primary"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    const result = await postTeamTemperatureProgramActivate(teamId, program.id);
                    setValidation(result.validation);
                    onRefresh();
                    setMessage("Program activated.");
                  })
                }
              >
                Activate
              </button>
            ) : null}
            {program.status === "active" ? (
              <>
                <button
                  type="button"
                  className="temp-prog-btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    void runAction(async () => {
                      await postTeamTemperatureProgramArchive(teamId, program.id);
                      onRefresh();
                      setMessage("Program archived.");
                    })
                  }
                >
                  Archive
                </button>
                <button
                  type="button"
                  className="temp-prog-btn-primary"
                  disabled={busy}
                  onClick={() =>
                    void runAction(async () => {
                      const result = await postTeamTemperatureProgramNewDraft(teamId, program.id);
                      onProgramUpdated(result.program);
                      onNavigateToProgram(result.program.id);
                      setMessage(`Draft v${result.program.versionNumber} created.`);
                    })
                  }
                >
                  New draft version
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </header>

      {message ? <p className="temp-prog-banner">{message}</p> : null}
      {!editable && canManage ? (
        <p className="temp-prog-banner temp-prog-banner--muted">
          This version is locked. Create a new draft version to edit configuration.
        </p>
      ) : null}

      <nav className="temp-prog-tabs" role="tablist">
        {(
          [
            ["overview", "Overview"],
            ["structure", "Structure"],
            ["schedules", "Schedules"],
            ["assignments", "Assignments"],
            ["corrective", "Corrective actions"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`temp-prog-tab${tab === id ? " temp-prog-tab--active" : ""}`}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="temp-prog-detail-body">
        {tab === "overview" ? (
          <OverviewTab
            key={program.id}
            program={program}
            validation={validation}
            editable={editable}
            busy={busy}
            onSave={async (body) => {
              const updated = await patchTeamTemperatureProgram(teamId, program.id, body);
              onProgramUpdated(updated);
              setMessage("Program updated.");
            }}
          />
        ) : null}
        {tab === "structure" ? (
          <StructureTab teamId={teamId} program={program} editable={editable} onRefresh={onRefresh} />
        ) : null}
        {tab === "schedules" ? (
          <SchedulesTab teamId={teamId} program={program} editable={editable} onRefresh={onRefresh} />
        ) : null}
        {tab === "assignments" ? (
          <AssignmentsTab teamId={teamId} program={program} editable={editable} onRefresh={onRefresh} />
        ) : null}
        {tab === "corrective" ? (
          <CorrectiveTab teamId={teamId} program={program} editable={editable} onRefresh={onRefresh} />
        ) : null}
      </div>
    </div>
  );
}

function OverviewTab({
  program,
  validation,
  editable,
  busy,
  onSave,
}: {
  program: TempProgramDetailRow;
  validation: TempProgramValidation | null;
  editable: boolean;
  busy: boolean;
  onSave: (body: { name?: string; description?: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState(program.name);
  const [description, setDescription] = useState(program.description ?? "");

  const groupCount = program.groups.length;
  const equipmentCount = program.groups.reduce((n, g) => n + g.equipment.length, 0);
  const checkCount = program.groups.reduce(
    (n, g) => n + g.equipment.reduce((m, e) => m + e.checkItems.length, 0),
    0,
  );

  return (
    <div className="temp-prog-panel-grid">
      <section className="temp-prog-panel-card">
        <h3>Program details</h3>
        {editable ? (
          <form
            className="temp-prog-form"
            onSubmit={(e) => {
              e.preventDefault();
              void onSave({ name: name.trim(), description: description.trim() || null });
            }}
          >
            <label className="temp-prog-field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="temp-prog-field">
              <span>Description</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </label>
            <button type="submit" className="temp-prog-btn-primary" disabled={busy}>
              Save details
            </button>
          </form>
        ) : (
          <dl className="temp-prog-dl">
            <div>
              <dt>Name</dt>
              <dd>{program.name}</dd>
            </div>
            <div>
              <dt>Description</dt>
              <dd>{program.description || "—"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{tempProgramStatusLabel(program.status)}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>v{program.versionNumber}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="temp-prog-panel-card">
        <h3>Configuration summary</h3>
        <ul className="temp-prog-summary-list">
          <li>{groupCount} equipment group{groupCount === 1 ? "" : "s"}</li>
          <li>{equipmentCount} equipment item{equipmentCount === 1 ? "" : "s"}</li>
          <li>{checkCount} check item{checkCount === 1 ? "" : "s"}</li>
          <li>{program.schedules.length} schedule{program.schedules.length === 1 ? "" : "s"}</li>
          <li>{program.assignments.length} assignment{program.assignments.length === 1 ? "" : "s"}</li>
          <li>{program.correctiveActionTemplates.length} corrective template{program.correctiveActionTemplates.length === 1 ? "" : "s"}</li>
        </ul>
      </section>

      {validation ? (
        <section className="temp-prog-panel-card temp-prog-panel-card--wide">
          <h3>Validation</h3>
          <p className={validation.isValid ? "temp-prog-valid-ok" : "temp-prog-valid-bad"}>
            {validationSummary(validation)}
          </p>
          {validation.errors.length > 0 ? (
            <ul className="temp-prog-valid-list temp-prog-valid-list--error">
              {validation.errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {validation.warnings.length > 0 ? (
            <ul className="temp-prog-valid-list temp-prog-valid-list--warn">
              {validation.warnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function StructureTab({
  teamId,
  program,
  editable,
  onRefresh,
}: {
  teamId: string;
  program: TempProgramDetailRow;
  editable: boolean;
  onRefresh: () => void;
}) {
  const [groupName, setGroupName] = useState("");
  const [equipmentGroupId, setEquipmentGroupId] = useState(program.groups[0]?.id ?? "");
  const [equipmentName, setEquipmentName] = useState("");
  const [checkEquipmentId, setCheckEquipmentId] = useState("");
  const [checkName, setCheckName] = useState("");
  const [checkType, setCheckType] = useState("hot_holding");
  const [minTemp, setMinTemp] = useState("");
  const [maxTemp, setMaxTemp] = useState("");

  const allEquipment = program.groups.flatMap((g) => g.equipment.map((e) => ({ ...e, groupName: g.name })));

  return (
    <div className="temp-prog-structure">
      {editable ? (
        <section className="temp-prog-inline-add">
          <h3>Add equipment group</h3>
          <form
            className="temp-prog-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!groupName.trim()) return;
              void postTeamTemperatureEquipmentGroup(teamId, program.id, { name: groupName.trim() }).then(() => {
                setGroupName("");
                onRefresh();
              });
            }}
          >
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Hot Holding" />
            <button type="submit" className="temp-prog-btn-primary">
              Add group
            </button>
          </form>
        </section>
      ) : null}

      {program.groups.map((group) => (
        <section key={group.id} className="temp-prog-group-card">
          <header className="temp-prog-group-head">
            <h3>{group.name}</h3>
            {editable ? (
              <button
                type="button"
                className="temp-prog-btn-ghost temp-prog-btn-ghost--danger"
                onClick={() => {
                  if (!window.confirm(`Remove group "${group.name}"?`)) return;
                  void deleteTeamTemperatureEquipmentGroup(teamId, program.id, group.id).then(onRefresh);
                }}
              >
                Remove
              </button>
            ) : null}
          </header>
          {group.description ? <p className="enterprise-muted">{group.description}</p> : null}

          {group.equipment.length === 0 ? (
            <p className="enterprise-muted temp-prog-muted-inline">No equipment in this group yet.</p>
          ) : (
            group.equipment.map((equipment) => (
              <article key={equipment.id} className="temp-prog-equipment-card">
                <header>
                  <strong>{equipment.name}</strong>
                  {equipment.locationHint ? <span className="enterprise-muted"> · {equipment.locationHint}</span> : null}
                  {editable ? (
                    <button
                      type="button"
                      className="temp-prog-btn-ghost temp-prog-btn-ghost--danger"
                      onClick={() => {
                        if (!window.confirm(`Remove "${equipment.name}"?`)) return;
                        void deleteTeamTemperatureEquipment(teamId, program.id, equipment.id).then(onRefresh);
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </header>
                {equipment.checkItems.length === 0 ? (
                  <p className="enterprise-muted temp-prog-muted-inline">No check items yet.</p>
                ) : (
                  <ul className="temp-prog-check-list">
                    {equipment.checkItems.map((item) => (
                      <li key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          <span className="enterprise-muted">
                            {" "}
                            · {formatTempRange(item.minTemp, item.maxTemp, item.tempUnit)} · {item.checkType.replace(/_/g, " ")}
                          </span>
                        </div>
                        {item.correctiveActionRules.length > 0 ? (
                          <span className="temp-prog-rule-count">
                            {item.correctiveActionRules.length} corrective rule{item.correctiveActionRules.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        {editable ? (
                          <button
                            type="button"
                            className="temp-prog-btn-ghost temp-prog-btn-ghost--danger"
                            onClick={() => {
                              void deleteTeamTemperatureCheckItem(teamId, program.id, item.id).then(onRefresh);
                            }}
                          >
                            Remove
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))
          )}
        </section>
      ))}

      {editable && program.groups.length > 0 ? (
        <>
          <section className="temp-prog-inline-add">
            <h3>Add equipment</h3>
            <form
              className="temp-prog-inline-form temp-prog-inline-form--grid"
              onSubmit={(e) => {
                e.preventDefault();
                if (!equipmentGroupId || !equipmentName.trim()) return;
                void postTeamTemperatureEquipment(teamId, program.id, {
                  equipmentGroupId,
                  name: equipmentName.trim(),
                }).then(() => {
                  setEquipmentName("");
                  onRefresh();
                });
              }}
            >
              <select value={equipmentGroupId} onChange={(e) => setEquipmentGroupId(e.target.value)}>
                {program.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <input value={equipmentName} onChange={(e) => setEquipmentName(e.target.value)} placeholder="Hot Holding Unit 1" />
              <button type="submit" className="temp-prog-btn-primary">
                Add equipment
              </button>
            </form>
          </section>

          <section className="temp-prog-inline-add">
            <h3>Add check item</h3>
            <form
              className="temp-prog-inline-form temp-prog-inline-form--grid"
              onSubmit={(e) => {
                e.preventDefault();
                if (!checkEquipmentId || !checkName.trim()) return;
                void postTeamTemperatureCheckItem(teamId, program.id, {
                  equipmentId: checkEquipmentId,
                  name: checkName.trim(),
                  checkType,
                  minTemp: minTemp ? Number(minTemp) : null,
                  maxTemp: maxTemp ? Number(maxTemp) : null,
                  tempUnit: "F",
                }).then(() => {
                  setCheckName("");
                  setMinTemp("");
                  setMaxTemp("");
                  onRefresh();
                });
              }}
            >
              <select value={checkEquipmentId} onChange={(e) => setCheckEquipmentId(e.target.value)} required>
                <option value="">Select equipment…</option>
                {allEquipment.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.groupName} · {e.name}
                  </option>
                ))}
              </select>
              <input value={checkName} onChange={(e) => setCheckName(e.target.value)} placeholder="Hot food product temperature" />
              <select value={checkType} onChange={(e) => setCheckType(e.target.value)}>
                {CHECK_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input value={minTemp} onChange={(e) => setMinTemp(e.target.value)} placeholder="Min °F" inputMode="decimal" />
              <input value={maxTemp} onChange={(e) => setMaxTemp(e.target.value)} placeholder="Max °F" inputMode="decimal" />
              <button type="submit" className="temp-prog-btn-primary">
                Add check item
              </button>
            </form>
          </section>
        </>
      ) : null}
    </div>
  );
}

function SchedulesTab({
  teamId,
  program,
  editable,
  onRefresh,
}: {
  teamId: string;
  program: TempProgramDetailRow;
  editable: boolean;
  onRefresh: () => void;
}) {
  const [name, setName] = useState("Daily checks");
  const [scheduleType, setScheduleType] = useState("specific_times");
  const [specificTimes, setSpecificTimes] = useState("06:00, 10:00, 14:00, 18:00");

  return (
    <div className="temp-prog-stack">
      <ul className="temp-prog-item-list">
        {program.schedules.map((schedule) => (
          <li key={schedule.id} className="temp-prog-item-row">
            <div>
              <strong>{schedule.name}</strong>
              <span className="enterprise-muted"> · {formatScheduleSummary(schedule)}</span>
            </div>
            {editable ? (
              <button
                type="button"
                className="temp-prog-btn-ghost temp-prog-btn-ghost--danger"
                onClick={() => void deleteTeamTemperatureSchedule(teamId, program.id, schedule.id).then(onRefresh)}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {editable ? (
        <form
          className="temp-prog-form temp-prog-panel-card"
          onSubmit={(e) => {
            e.preventDefault();
            void postTeamTemperatureSchedule(teamId, program.id, {
              name: name.trim(),
              scheduleType,
              specificTimes:
                scheduleType === "specific_times"
                  ? specificTimes.split(",").map((t) => t.trim()).filter(Boolean)
                  : [],
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }).then(onRefresh);
          }}
        >
          <h3>Add schedule</h3>
          <label className="temp-prog-field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="temp-prog-field">
            <span>Type</span>
            <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value)}>
              {SCHEDULE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {scheduleType === "specific_times" ? (
            <label className="temp-prog-field">
              <span>Times (comma-separated, 24h)</span>
              <input value={specificTimes} onChange={(e) => setSpecificTimes(e.target.value)} />
            </label>
          ) : null}
          <button type="submit" className="temp-prog-btn-primary">
            Add schedule
          </button>
        </form>
      ) : null}
    </div>
  );
}

function AssignmentsTab({
  teamId,
  program,
  editable,
  onRefresh,
}: {
  teamId: string;
  program: TempProgramDetailRow;
  editable: boolean;
  onRefresh: () => void;
}) {
  const [assignmentType, setAssignmentType] = useState("company");
  const [targetId, setTargetId] = useState(teamId);

  return (
    <div className="temp-prog-stack">
      <ul className="temp-prog-item-list">
        {program.assignments.map((row) => (
          <li key={row.id} className="temp-prog-item-row">
            <div>
              <strong>{row.assignmentType}</strong>
              <span className="enterprise-muted"> · {row.assignmentTargetId}</span>
            </div>
            {editable ? (
              <button
                type="button"
                className="temp-prog-btn-ghost temp-prog-btn-ghost--danger"
                onClick={() => void deleteTeamTemperatureAssignment(teamId, program.id, row.id).then(onRefresh)}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {editable ? (
        <form
          className="temp-prog-form temp-prog-panel-card"
          onSubmit={(e) => {
            e.preventDefault();
            void postTeamTemperatureAssignment(teamId, program.id, {
              assignmentType,
              assignmentTargetId: targetId.trim(),
            }).then(onRefresh);
          }}
        >
          <h3>Add assignment</h3>
          <label className="temp-prog-field">
            <span>Type</span>
            <select value={assignmentType} onChange={(e) => setAssignmentType(e.target.value)}>
              {ASSIGNMENT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="temp-prog-field">
            <span>Target ID</span>
            <input value={targetId} onChange={(e) => setTargetId(e.target.value)} />
          </label>
          <button type="submit" className="temp-prog-btn-primary">
            Add assignment
          </button>
        </form>
      ) : null}
    </div>
  );
}

function CorrectiveTab({
  teamId,
  program,
  editable,
  onRefresh,
}: {
  teamId: string;
  program: TempProgramDetailRow;
  editable: boolean;
  onRefresh: () => void;
}) {
  const [name, setName] = useState("");
  const [actionType, setActionType] = useState("reheat_product");
  const [checkItemId, setCheckItemId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [conditionType, setConditionType] = useState("below_min");

  const checkItems = program.groups.flatMap((g) =>
    g.equipment.flatMap((e) => e.checkItems.map((c) => ({ ...c, label: `${g.name} · ${e.name} · ${c.name}` }))),
  );

  return (
    <div className="temp-prog-stack">
      <section>
        <h3>Templates</h3>
        <ul className="temp-prog-item-list">
          {program.correctiveActionTemplates.map((template) => (
            <li key={template.id} className="temp-prog-item-row">
              <div>
                <strong>{template.name}</strong>
                <span className="enterprise-muted"> · {template.actionType.replace(/_/g, " ")}</span>
              </div>
              {editable ? (
                <button
                  type="button"
                  className="temp-prog-btn-ghost temp-prog-btn-ghost--danger"
                  onClick={() => void deleteTeamTemperatureCorrectiveTemplate(teamId, program.id, template.id).then(onRefresh)}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {editable ? (
        <>
          <form
            className="temp-prog-form temp-prog-panel-card"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              void postTeamTemperatureCorrectiveTemplate(teamId, program.id, {
                name: name.trim(),
                actionType,
                requiresRecheck: actionType === "reheat_product",
                recheckDelayMinutes: actionType === "reheat_product" ? 15 : null,
              }).then(() => {
                setName("");
                onRefresh();
              });
            }}
          >
            <h3>Add corrective template</h3>
            <label className="temp-prog-field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Reheat and recheck" />
            </label>
            <label className="temp-prog-field">
              <span>Action type</span>
              <select value={actionType} onChange={(e) => setActionType(e.target.value)}>
                {CORRECTIVE_ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="temp-prog-btn-primary">
              Add template
            </button>
          </form>

          <form
            className="temp-prog-form temp-prog-panel-card"
            onSubmit={(e) => {
              e.preventDefault();
              if (!checkItemId || !templateId) return;
              void postTeamTemperatureCorrectiveRule(teamId, program.id, {
                checkItemId,
                correctiveActionTemplateId: templateId,
                conditionType,
                isDefault: true,
              }).then(onRefresh);
            }}
          >
            <h3>Attach rule to check item</h3>
            <label className="temp-prog-field">
              <span>Check item</span>
              <select value={checkItemId} onChange={(e) => setCheckItemId(e.target.value)} required>
                <option value="">Select check item…</option>
                {checkItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="temp-prog-field">
              <span>Corrective action</span>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
                <option value="">Select template…</option>
                {program.correctiveActionTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="temp-prog-field">
              <span>When</span>
              <select value={conditionType} onChange={(e) => setConditionType(e.target.value)}>
                {CONDITION_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="temp-prog-btn-primary">
              Attach rule
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
