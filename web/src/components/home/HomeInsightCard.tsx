import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  homeInsightForDate,
  mapApiHomeInsight,
} from "../../lib/home-insight-rotation";
import { fetchHomeInsightsPublic } from "../../lib/home-insights-api";
import "./home-insight-card.css";

/**
 * Leadership prompt on Home. Server picks the live card from admin schedule
 * (automatic daily/weekly or a manual pin).
 */
export function HomeInsightCard() {
  const navigate = useNavigate();
  const { data: remote } = useQuery({
    queryKey: ["home-insights"],
    queryFn: fetchHomeInsightsPublic,
    staleTime: 5 * 60_000,
  });
  const insight = useMemo(() => {
    if (remote?.current) return mapApiHomeInsight(remote.current);
    const deck = (remote?.cards ?? []).map(mapApiHomeInsight);
    return homeInsightForDate(new Date(), deck);
  }, [remote]);
  const destination = insight.destination;
  const ready = destination.type === "seneca" || destination.type === "discover";
  const hint =
    destination.type === "recognition" ? "Recognition is coming to the web app" : undefined;

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
            if (destination.type === "seneca") {
              navigate(`/seneca?q=${encodeURIComponent(destination.prompt)}`);
              return;
            }
            if (destination.type === "discover") {
              navigate(`/discover/${encodeURIComponent(destination.slug)}`);
              return;
            }
            event.preventDefault();
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
