import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DashboardTopBar } from "../components/DashboardTopBar";
import { EnterpriseLayout } from "../components/EnterpriseLayout";
import { EnterprisePageLoading } from "../components/EnterprisePageLoading";
import { OneOnOneAssociateFeedbackForm } from "../components/OneOnOneAssociateFeedbackForm";
import {
  fetchOneOnOneAssociateFeedbackContext,
  fetchWebMe,
  fetchWebTeams,
  type OneOnOneAssociateFeedbackContext,
  type WebMeUser,
  type WebTeamRow,
} from "../lib/api";
import { ASSOCIATE_FEEDBACK_SECTION_TITLE } from "../lib/one-on-one-feedback";
import { enterpriseTeamNavTitle } from "../lib/enterprise-nav";

export function OneOnOneFeedbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const teamId = searchParams.get("teamId")?.trim() ?? "";
  const memberUserId = searchParams.get("memberUserId")?.trim() ?? "";
  const meetingId = searchParams.get("meetingId")?.trim() ?? "";
  const fieldId = searchParams.get("fieldId")?.trim() ?? "";

  const [me, setMe] = useState<WebMeUser | null | undefined>(undefined);
  const [teams, setTeams] = useState<WebTeamRow[] | null>(null);
  const [context, setContext] = useState<OneOnOneAssociateFeedbackContext | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [u, t] = await Promise.all([fetchWebMe(), fetchWebTeams()]);
        if (cancelled) return;
        setMe(u);
        setTeams(t ?? []);
      } catch (e) {
        if (cancelled) return;
        setMe(null);
        setTeams([]);
        setErr(e instanceof Error ? e.message : "Could not load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!teamId || !memberUserId || !meetingId || !fieldId) {
      setErr("This feedback link is incomplete.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchOneOnOneAssociateFeedbackContext(teamId, memberUserId, meetingId, fieldId);
        if (cancelled) return;
        setContext(data);
        setErr(null);
      } catch (e) {
        if (cancelled) return;
        setContext(null);
        setErr(e instanceof Error ? e.message : "Could not load feedback form.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, memberUserId, meetingId, fieldId]);

  if (me === undefined) {
    return <EnterprisePageLoading label="Loading your check-in" fullScreen />;
  }

  const workspaceId = teamId;
  const showPlanNav = teams !== null && !!workspaceId && teams.find((t) => t.id === workspaceId)?.role === "owner";
  const showActivityExecuteNav =
    teams === null || !workspaceId || teams.find((t) => t.id === workspaceId)?.hasTeamFeatures === true;
  const teamNavLabel = enterpriseTeamNavTitle(
    teams !== null && workspaceId ? teams.find((t) => t.id === workspaceId)?.role : undefined,
  );

  return (
    <EnterpriseLayout
      activeNav="execute"
      teams={teams ?? []}
      selectedTeamId={workspaceId}
      onTeamChange={(id) => {
        if (id !== workspaceId) navigate("/dashboard");
      }}
      user={me ?? null}
      onSignOutNavigate={(path) => navigate(path)}
      topBar={
        <DashboardTopBar user={me ?? null} pageTitle={ASSOCIATE_FEEDBACK_SECTION_TITLE} />
      }
      showPlanNav={showPlanNav}
      showActivityExecuteNav={showActivityExecuteNav}
      teamNavLabel={teamNavLabel}
    >
      <div className="enterprise-dashboard-inner oneone-feedback-page">
        <Link to="/dashboard" className="create-task-back">
          ← Back to dashboard
        </Link>

        <article className="enterprise-card enterprise-oneone-feedback-card">
          <header className="enterprise-oneone-feedback-card-head">
            <p className="enterprise-oneone-templates-kicker">After your check-in</p>
            <h1 className="enterprise-oneone-feedback-card-title">{ASSOCIATE_FEEDBACK_SECTION_TITLE}</h1>
          </header>

          {err && !context ? <p className="enterprise-form-error" role="alert">{err}</p> : null}
          {context ? (
            <OneOnOneAssociateFeedbackForm
              teamId={teamId}
              memberUserId={memberUserId}
              meetingId={meetingId}
              context={context}
            />
          ) : null}
        </article>
      </div>
    </EnterpriseLayout>
  );
}
