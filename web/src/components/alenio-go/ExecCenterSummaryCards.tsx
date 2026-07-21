import { sparkPoints } from "../../lib/walks/exec-center-utils";

type PeriodCard = {
  key: string;
  label: string;
  rate: number;
  tone: "blue" | "orange" | "green" | "purple";
  deltaText: string;
  deltaUp: boolean | null;
  priorRate: number;
};

type Props = {
  todayRate: number;
  yesterdayRate: number;
  weekRate: number;
  days30Rate: number;
  priorWeekRate: number;
  prior30Rate: number;
  dayBeforeYesterdayRate: number;
  openActions: number;
  todayDelta: { text: string; up: boolean | null };
  yesterdayDelta: { text: string; up: boolean | null };
  weekDelta: { text: string; up: boolean | null };
  days30Delta: { text: string; up: boolean | null };
};

function Sparkline({ tone, current, prior }: { tone: PeriodCard["tone"]; current: number; prior: number }) {
  return (
    <svg className={`exec-center-spark exec-center-spark--${tone}`} viewBox="0 0 52 32" aria-hidden>
      <path d={sparkPoints(current, prior)} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

function IconClipboardLock() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M9 5h6a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h1V7a2 2 0 0 1 2-2z" />
      <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
      <rect x="9" y="12" width="6" height="5" rx="1" />
      <path d="M11 12V11a1 1 0 0 1 2 0v1" />
    </svg>
  );
}

function deltaClass(up: boolean | null) {
  if (up == null) return "";
  return up ? "is-up" : "is-down";
}

function deltaPrefix(up: boolean | null) {
  if (up == null) return "";
  return up ? "▲ " : "▼ ";
}

export function ExecCenterSummaryCards({
  todayRate,
  yesterdayRate,
  weekRate,
  days30Rate,
  priorWeekRate,
  prior30Rate,
  dayBeforeYesterdayRate,
  openActions,
  todayDelta,
  yesterdayDelta,
  weekDelta,
  days30Delta,
}: Props) {
  const periods: PeriodCard[] = [
    {
      key: "today",
      label: "Today",
      rate: todayRate,
      tone: "blue",
      deltaText: `${deltaPrefix(todayDelta.up)}${todayDelta.text} vs yesterday`,
      deltaUp: todayDelta.up,
      priorRate: yesterdayRate,
    },
    {
      key: "yesterday",
      label: "Yesterday",
      rate: yesterdayRate,
      tone: "orange",
      deltaText: `${deltaPrefix(yesterdayDelta.up)}${yesterdayDelta.text} vs day before`,
      deltaUp: yesterdayDelta.up,
      priorRate: dayBeforeYesterdayRate,
    },
    {
      key: "week",
      label: "This Week",
      rate: weekRate,
      tone: "green",
      deltaText: `${deltaPrefix(weekDelta.up)}${weekDelta.text} vs last week`,
      deltaUp: weekDelta.up,
      priorRate: priorWeekRate,
    },
    {
      key: "days30",
      label: "Last 30 Days",
      rate: days30Rate,
      tone: "purple",
      deltaText: `${deltaPrefix(days30Delta.up)}${days30Delta.text} vs prior 30 days`,
      deltaUp: days30Delta.up,
      priorRate: prior30Rate,
    },
  ];

  return (
    <section className="exec-center-kpis" aria-label="Completion summary">
      {periods.map((card) => (
        <article
          key={card.key}
          className={`exec-center-kpi-card exec-center-kpi-card--${card.tone}`}
        >
          <span className="exec-center-kpi-label">{card.label}</span>
          <div className="exec-center-kpi-row">
            <span className="exec-center-kpi-value">
              {card.rate}
              <em>%</em>
            </span>
            <Sparkline tone={card.tone} current={card.rate} prior={card.priorRate} />
          </div>
          <span className={`exec-center-kpi-sub ${deltaClass(card.deltaUp)}`}>{card.deltaText}</span>
        </article>
      ))}

      <article className="exec-center-kpi-card exec-center-kpi-card--actions" aria-label="Open actions">
        <span className="exec-center-kpi-label">Open Actions</span>
        <div className="exec-center-kpi-row">
          <span className="exec-center-kpi-value exec-center-kpi-value--actions">{openActions}</span>
          <span className="exec-center-kpi-actions-ico" aria-hidden>
            <IconClipboardLock />
          </span>
        </div>
        <span className="exec-center-kpi-sub">Requires attention</span>
      </article>
    </section>
  );
}
