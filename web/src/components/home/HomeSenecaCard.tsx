import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { queryKeys } from "../../lib/query-keys";
import { fetchSenecaConversations, senecaWhenLabel } from "../../lib/seneca-chat-api";
import "./home-cards.css";

const STARTERS = ["Set a goal", "Prep a conversation", "Build a habit"];
const STARTER_PROMPTS: Record<string, string> = {
  "Set a goal": "Help me set a goal for this month",
  "Prep a conversation": "Prep me for a hard conversation",
  "Build a habit": "Help me build a better habit",
};

function senecaLink(prompt: string) {
  return `/seneca?q=${encodeURIComponent(prompt)}`;
}

/** Recent Seneca chats, or a first-time welcome when there are none. */
export function HomeSenecaCard() {
  const { me } = useEnterpriseShell();
  const history = useQuery({
    queryKey: queryKeys.senecaConversations,
    queryFn: fetchSenecaConversations,
    enabled: Boolean(me),
    staleTime: 30_000,
  });
  const recent = (history.data ?? []).slice(0, 3);
  const firstTime = history.isSuccess && recent.length === 0;

  return (
    <section className="hc-card" aria-label="Seneca" data-testid="home-seneca">
      <div className="hc-head">
        <span className="hc-icon">
          <img src="/seneca-icon.png" alt="" />
        </span>
        <span className="hc-head-copy">
          <span className="hc-title">{firstTime ? "Meet Seneca" : "Pick up with Seneca"}</span>
          <span className="hc-sub">{firstTime ? "Your personal growth coach" : "Your coach, right where you left off"}</span>
        </span>
      </div>

      {history.isLoading ? (
        <div className="hc-list" aria-hidden>
          <span className="hc-skel" />
          <span className="hc-skel" />
          <span className="hc-skel" />
        </div>
      ) : firstTime || history.isError ? (
        <div className="hc-hello">
          <h4>What's on your mind today?</h4>
          <p>Talk through a decision, prep for a hard conversation, or set a goal.</p>
          <div className="hc-chips">
            {STARTERS.map((label) => (
              <Link key={label} to={senecaLink(STARTER_PROMPTS[label])} className="hc-chip">
                {label}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <ul className="hc-list">
          {recent.map((c) => (
            <li key={c.id}>
              <Link to={`/seneca?c=${encodeURIComponent(c.id)}`} className="hc-row">
                <span className="hc-row-icon">
                  <MessageSquare size={16} strokeWidth={2.2} />
                </span>
                <span className="hc-row-copy">
                  <span className="hc-row-title">{c.title || "Chat with Seneca"}</span>
                  <span className="hc-row-sub">{senecaWhenLabel(c.updatedAt)}</span>
                </span>
                <ChevronRight size={16} strokeWidth={2.3} className="hc-chev" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link to="/seneca" className="hc-cta" data-testid="home-seneca-open">
        {firstTime ? "Start a conversation" : "Ask Seneca anything"}
      </Link>
    </section>
  );
}
