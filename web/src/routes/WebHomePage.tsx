import { HomeDiscoverRow } from "../components/home/HomeDiscoverRow";
import { HomeGetStartedCard } from "../components/home/HomeGetStartedCard";
import { HomeInsightCard } from "../components/home/HomeInsightCard";
import { HomeNetworkCard } from "../components/home/HomeNetworkCard";
import { HomeSenecaCard } from "../components/home/HomeSenecaCard";
import { HomeTodayCard } from "../components/home/HomeTodayCard";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { greetingForHour } from "../lib/alenio-go-dashboard";
import "./web-home.css";

/** Same mountain as the phone, three lights. Follows the greeting's clock. */
function heroForHour(hour: number): string {
  if (hour < 12) return "/alenio-home-hero-morning.jpg";
  if (hour < 17) return "/alenio-home-hero-afternoon.jpg";
  return "/alenio-home-hero-sunset.jpg";
}

export function WebHomePage() {
  const { me, teams } = useEnterpriseShell();
  const hour = new Date().getHours();
  const firstName = (me?.name ?? me?.email ?? "there").trim().split(/[\s@]+/)[0] || "there";
  const hasWorkspace = (teams?.length ?? 0) > 0;

  return (
    <div className="web-home" data-testid="web-home">
      <header className="web-home-hero" data-testid="web-home-hero">
        <img src={heroForHour(hour)} alt="" className="web-home-hero-photo" />
        <div className="web-home-hero-fade" aria-hidden />
        <div className="web-home-hero-copy">
          <h1>
            {greetingForHour(hour)}, {firstName}.
          </h1>
          <p>Stay connected, make progress, and grow your impact.</p>
        </div>
      </header>
      <div className="web-home-body">
        <div className="web-home-main" data-testid="web-home-main">
          {/* Today needs a workspace; until then, Get started takes its place. */}
          {teams === null ? null : hasWorkspace ? (
            <HomeTodayCard enabled={Boolean(me)} />
          ) : (
            <HomeGetStartedCard />
          )}
          <HomeSenecaCard />
          <HomeNetworkCard />
        </div>
        <div className="web-home-bottom" data-testid="web-home-bottom">
          <HomeInsightCard />
          <HomeDiscoverRow />
        </div>
      </div>
    </div>
  );
}
