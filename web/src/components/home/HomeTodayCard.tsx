import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  SquareArrowOutUpRight,
  SquareCheckBig,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { updateCoreTeamTask } from "../../lib/api";
import {
  TODAY_ITEM_LABEL,
  TODAY_ITEM_TONE,
  browserTimeZone,
  fetchHomeToday,
  isTaskLike,
  laneFor,
  metaLine,
  nextUpIndex,
  scheduleTimeParts,
  todayDateLabel,
  withHoliday,
  type HomeTodayItem,
  type HomeTodayItemType,
  type TodayRowState,
} from "../../lib/home-today";
import "./home-today-card.css";

const TYPE_ICON: Record<HomeTodayItemType, LucideIcon> = {
  task: SquareCheckBig,
  reminder: Bell,
  event: CalendarDays,
  meeting: Video,
  check_in: Users,
  holiday: CalendarDays,
  external: CalendarDays,
};

function Hills() {
  return (
    <svg className="home-today-hills" viewBox="0 0 360 90" preserveAspectRatio="none" aria-hidden>
      <path
        d="M0 58 C40 46 70 70 120 62 C170 54 200 28 250 34 C300 40 330 58 360 48 L360 90 L0 90 Z"
        fill="#E7E0FF"
        opacity="0.85"
      />
      <path
        d="M0 72 C50 60 90 78 150 70 C210 62 250 48 300 56 C330 62 348 68 360 64 L360 90 L0 90 Z"
        fill="#D9CFFF"
        opacity="0.7"
      />
    </svg>
  );
}

function CardHeader({ date }: { date: string }) {
  return (
    <div className="home-today-head">
      <span className="home-today-head-icon">
        <CalendarDays size={16} strokeWidth={2.2} aria-hidden />
      </span>
      <span className="home-today-head-copy">
        <span className="home-today-title">Today</span>
        <span className="home-today-date">{date}</span>
      </span>
    </div>
  );
}

type Props = {
  enabled: boolean;
  onAddToToday?: () => void;
};

export function HomeTodayCard({ enabled, onAddToToday }: Props) {
  const queryClient = useQueryClient();
  const timeZone = browserTimeZone();
  const todayKey = new Date().toDateString();
  const query = useQuery({
    queryKey: ["home-today", todayKey, timeZone],
    queryFn: () => fetchHomeToday(timeZone),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
  const items = useMemo(() => withHoliday(query.data), [query.data]);
  const pending = enabled && query.isPending;

  const [justDoneId, setJustDoneId] = useState<string | null>(null);
  const [menuItem, setMenuItem] = useState<HomeTodayItem | null>(null);
  const [confirmItem, setConfirmItem] = useState<HomeTodayItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const now = Date.now();
  const held = (item: HomeTodayItem) => item.id === justDoneId;
  const active = useMemo(
    () =>
      items
        .filter((item) => laneFor(item, now) !== "past" || held(item))
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, justDoneId, Math.floor(now / 60_000)],
  );
  const activeLanes = active.map((item) => (item.id === justDoneId ? ("past" as const) : laneFor(item, now)));
  const nextIndex = nextUpIndex(active, activeLanes, now);

  const complete = useMutation({
    mutationFn: (item: HomeTodayItem) => updateCoreTeamTask(item.workspace?.id ?? "", item.id, { status: "done" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["home-today"] });
    },
    onError: (err) => {
      setJustDoneId(null);
      setError(err instanceof Error ? err.message : "Couldn't complete that. Try again in a moment.");
    },
  });

  useEffect(() => {
    if (!justDoneId) return;
    const timer = window.setTimeout(() => setJustDoneId(null), 900);
    return () => window.clearTimeout(timer);
  }, [justDoneId]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!menuItem && !confirmItem) return;
    const onDoc = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuItem(null);
        if (!complete.isPending) setConfirmItem(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuItem(null);
        if (!complete.isPending) setConfirmItem(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuItem, confirmItem, complete.isPending]);

  const measureScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const more = el.scrollHeight > el.clientHeight + 12 && el.scrollTop + el.clientHeight < el.scrollHeight - 12;
    setMoreBelow((current) => (current === more ? current : more));
  };

  useEffect(() => {
    measureScroll();
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureScroll);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active.length]);

  const dateLabel = todayDateLabel();

  if (!pending && active.length === 0) {
    return (
      <section className="home-today home-today--empty" data-testid="home-today-empty" aria-label="Today">
        <CardHeader date={dateLabel} />
        <div className="home-today-empty-body">
          <span className="home-today-empty-mark">
            <CalendarCheck size={26} strokeWidth={2.1} aria-hidden />
          </span>
          <p className="home-today-empty-title">You're all caught up</p>
          <p className="home-today-empty-copy">No activities or check-ins scheduled for today.</p>
          {onAddToToday ? (
            <button type="button" className="home-today-empty-add" onClick={onAddToToday} data-testid="home-today-add">
              <Plus size={14} strokeWidth={2.4} aria-hidden />
              Add to today
            </button>
          ) : null}
        </div>
        <Hills />
      </section>
    );
  }

  const lastKey = active.length ? `${active[active.length - 1]!.type}-${active[active.length - 1]!.id}` : "";

  return (
    <section className="home-today" data-testid="home-today-section" aria-label="Today">
      <CardHeader date={dateLabel} />
      <div className="home-today-timeline-wrap">
        <div className="home-today-list" ref={listRef} onScroll={measureScroll} data-testid="home-today-list">
          {pending
            ? null
            : active.map((item, index) => {
                const celebrate = item.id === justDoneId;
                const lane = activeLanes[index];
                const state: TodayRowState = celebrate
                  ? "past"
                  : lane === "late"
                    ? "late"
                    : index === nextIndex
                      ? "next"
                      : "later";
                const key = `${item.type}-${item.id}`;
                return (
                  <TodayRow
                    key={key}
                    item={item}
                    state={state}
                    isLast={key === lastKey}
                    celebrate={celebrate}
                    menuOpen={menuItem?.id === item.id || confirmItem?.id === item.id}
                    onMenu={() => {
                      setConfirmItem(null);
                      setMenuItem((current) => (current?.id === item.id ? null : item));
                    }}
                    menu={
                      menuItem?.id === item.id || confirmItem?.id === item.id ? (
                        <div className="home-today-menu" ref={menuRef} role="dialog" aria-label={item.title}>
                          {confirmItem?.id === item.id ? (
                            <>
                              <p className="home-today-menu-title">
                                Complete {item.type === "reminder" ? "reminder" : "task"}?
                              </p>
                              <p className="home-today-menu-sub">This will move it to completed</p>
                              <button
                                type="button"
                                className={`home-today-menu-primary${item.type === "reminder" ? " home-today-menu-primary--reminder" : ""}`}
                                disabled={complete.isPending}
                                onClick={() => {
                                  setConfirmItem(null);
                                  setJustDoneId(item.id);
                                  complete.mutate(item);
                                }}
                                data-testid="home-today-complete-yes"
                              >
                                {complete.isPending ? (
                                  <Loader2 size={16} className="home-today-spin" aria-hidden />
                                ) : (
                                  `Complete ${item.type === "reminder" ? "reminder" : "task"}`
                                )}
                              </button>
                              <button
                                type="button"
                                className="home-today-menu-cancel"
                                onClick={() => setConfirmItem(null)}
                                disabled={complete.isPending}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <p className="home-today-menu-title">{item.title}</p>
                              <p className="home-today-menu-sub">
                                {TODAY_ITEM_LABEL[item.type]}
                                {item.workspace ? ` · ${item.workspace.name}` : ""}
                              </p>
                              {isTaskLike(item) && item.workspace ? (
                                <button
                                  type="button"
                                  className="home-today-menu-option"
                                  onClick={() => {
                                    setMenuItem(null);
                                    setConfirmItem(item);
                                  }}
                                  data-testid="home-today-complete"
                                >
                                  <span className="home-today-menu-option-icon home-today-menu-option-icon--green">
                                    <Check size={14} strokeWidth={2.6} aria-hidden />
                                  </span>
                                  Mark complete
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="home-today-menu-option"
                                disabled
                                title="Opens in Workspace once it's built"
                              >
                                <span className="home-today-menu-option-icon">
                                  <SquareArrowOutUpRight size={14} strokeWidth={2.3} aria-hidden />
                                </span>
                                {isTaskLike(item) ? `Open ${item.type}` : "View details"}
                              </button>
                            </>
                          )}
                        </div>
                      ) : null
                    }
                  />
                );
              })}
        </div>
        {moreBelow ? (
          <div className="home-today-more" aria-hidden>
            <span className="home-today-more-circle">
              <ChevronDown size={16} strokeWidth={2.6} />
            </span>
          </div>
        ) : null}
      </div>
      {error ? (
        <div className="home-today-error" role="alert">
          {error}
        </div>
      ) : null}
      <Hills />
    </section>
  );
}

function TodayRow({
  item,
  state,
  isLast,
  celebrate,
  menuOpen,
  onMenu,
  menu,
}: {
  item: HomeTodayItem;
  state: TodayRowState;
  isLast: boolean;
  celebrate: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  menu: React.ReactNode;
}) {
  const time = scheduleTimeParts(item);
  const meta = metaLine(item);
  const late = celebrate ? null : meta.late;
  const timeLabel =
    state === "late"
      ? new Date(item.startAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : time.sub
        ? `${time.main} ${time.sub}`
        : time.main;
  const done = state === "past" || celebrate;
  const taskLike = isTaskLike(item);
  const Icon = TYPE_ICON[item.type];
  const tone = TODAY_ITEM_TONE[item.type];
  const label = TODAY_ITEM_LABEL[item.type];
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);

  // The list scrolls, so the menu floats above the page anchored to the row.
  useLayoutEffect(() => {
    if (!menuOpen) {
      setAnchor(null);
      return;
    }
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({ top: rect.bottom - 2, left: rect.left, width: rect.width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [menuOpen]);

  return (
    <div className={`home-today-row${isLast ? " home-today-row--last" : ""}`} data-testid={`home-today-row-${item.id}`}>
      <div className={`home-today-time${done ? " home-today-time--past" : ""}`}>{timeLabel}</div>
      <div className="home-today-rail">
        {isLast ? null : <span className="home-today-rail-line" />}
        <span className="home-today-marker">
          {state === "late" ? (
            <span className="home-today-dot home-today-dot--late" />
          ) : done && taskLike ? (
            <span className="home-today-dot-check">
              <Check size={10} strokeWidth={3} aria-hidden />
            </span>
          ) : (
            <span
              className={`home-today-dot${done ? " home-today-dot--past" : state === "next" ? " home-today-dot--next" : " home-today-dot--later"}`}
            />
          )}
        </span>
      </div>
      <div className="home-today-body">
        <button
          ref={buttonRef}
          type="button"
          className={`home-today-item${menuOpen ? " home-today-item--open" : ""}`}
          onClick={onMenu}
          aria-label={
            late ? `${label}, overdue: ${item.title}` : celebrate ? `${label} complete: ${item.title}` : `${label}: ${item.title}`
          }
          aria-expanded={menuOpen}
        >
          {taskLike && !done ? <span className="home-today-check" aria-hidden /> : null}
          <span className="home-today-item-copy">
            <span className={`home-today-item-title${done ? " home-today-item-title--past" : ""}`}>{item.title}</span>
            <span className={`home-today-item-meta${done ? " home-today-item-meta--past" : ""}`}>
              {late ? (
                <>
                  <span className="home-today-item-meta--late">{late}</span>
                  {meta.line ? ` · ${meta.line}` : null}
                </>
              ) : (
                meta.line
              )}
            </span>
          </span>
          {done && taskLike ? (
            <span className="home-today-pill">Completed</span>
          ) : (
            <span className="home-today-type" style={{ background: tone.surface, color: tone.color }} title={label}>
              <Icon size={12} strokeWidth={2.2} aria-hidden />
            </span>
          )}
        </button>
        {menu && anchor
          ? createPortal(
              <div
                className="home-today-menu-layer"
                style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
              >
                {menu}
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}
