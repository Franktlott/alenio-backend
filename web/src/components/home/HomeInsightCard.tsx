import { ChevronRight, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { homeInsightForDate } from "../../lib/home-insight-rotation";
import "./home-insight-card.css";

/**
 * Weekly leadership prompt, same card the phone shows. Rotates every Monday.
 * Seneca prompts open a new Seneca chat; Recognition isn't on the web app yet.
 */
export function HomeInsightCard() {
  const navigate = useNavigate();
  const insight = useMemo(() => homeInsightForDate(), []);
  const destination = insight.destination;
  const ready = destination.type === "seneca";
  const hint = ready ? undefined : "Recognition is coming to the web app";

  return (
    <section
      className="home-insight"
      aria-label={insight.title.replace(/\n/g, " ")}
      data-testid="home-insight"
      data-insight-id={insight.id}
    >
      <img src={insight.image} alt="" className="home-insight-photo" />
      <div className="home-insight-fade" aria-hidden />
      <div className="home-insight-copy">
        <div className="home-insight-label">
          <Sparkles size={13} strokeWidth={2.3} />
          <span>Insight</span>
        </div>
        <h2 className="home-insight-title">{insight.title.replace(/\n/g, " ")}</h2>
        <p className="home-insight-body">{insight.body}</p>
        <button
          type="button"
          className="home-insight-action"
          aria-disabled={!ready}
          title={hint}
          onClick={(event) => {
            if (destination.type !== "seneca") {
              event.preventDefault();
              return;
            }
            navigate(`/seneca?q=${encodeURIComponent(destination.prompt)}`);
          }}
          data-testid="home-insight-action"
        >
          {insight.actionLabel}
          <ChevronRight size={14} strokeWidth={2.4} />
        </button>
      </div>
    </section>
  );
}
