/**
 * Weekly leadership Insight card. Same twelve prompts and rotation as the phone
 * (mobile/src/lib/home-insight-rotation.ts) so both apps show the same card each week.
 * Live deck from `/api/home-insights` is preferred when available.
 */

import type { HomeInsightCard as ApiCard, HomeInsightDestination as ApiDestination } from "./home-insights-api";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ROTATION_EPOCH_UTC = Date.UTC(2026, 7, 24);

export type HomeInsightDestination =
  | { type: "recognition" }
  | { type: "seneca"; prompt: string }
  | { type: "discover"; slug: string };

export type HomeInsightCard = {
  id: string;
  slug?: string;
  title: string;
  body: string;
  actionLabel: string;
  image: string;
  destination: HomeInsightDestination;
};

const img = (name: string) => `/insight/leadership-week-${name}.jpg`;

export const HOME_INSIGHT_CARDS: readonly HomeInsightCard[] = [
  {
    id: "recognition",
    slug: "recognition",
    title: "Who deserves\nrecognition today?",
    body: "Notice the contribution that made someone else’s work easier.",
    actionLabel: "Recognize someone",
    image: img("recognition"),
    destination: { type: "recognition" },
  },
  {
    id: "psychological-safety",
    slug: "psychological-safety",
    title: "What is your team\nhesitant to say?",
    body: "The most useful truth may be the one people do not yet feel safe sharing.",
    actionLabel: "Explore with Seneca",
    image: img("psychological-safety"),
    destination: {
      type: "seneca",
      prompt:
        "Help me identify one practical way to make it safer for people around me to raise concerns, disagree, or admit mistakes.",
    },
  },
  {
    id: "priority-clarity",
    slug: "priority-clarity",
    title: "If everything matters,\nwhat truly comes first?",
    body: "Clear leadership is often deciding what the team can stop carrying.",
    actionLabel: "Clarify with Seneca",
    image: img("priority-clarity"),
    destination: {
      type: "seneca",
      prompt:
        "Help me narrow my current priorities. Ask me a few questions, then help me name the one outcome that should come first and what can wait.",
    },
  },
  {
    id: "coaching",
    slug: "coaching",
    title: "Are you solving—or\nhelping someone grow?",
    body: "A strong question can build more capability than a quick answer.",
    actionLabel: "Coach with Seneca",
    image: img("coaching"),
    destination: {
      type: "seneca",
      prompt:
        "Give me three thoughtful coaching questions I can use instead of immediately solving a problem for someone.",
    },
  },
  {
    id: "delegation",
    slug: "delegation",
    title: "What are you holding\nthat someone else could own?",
    body: "Delegation is not unloading work. It is transferring trust and clarity.",
    actionLabel: "Think with Seneca",
    image: img("delegation"),
    destination: {
      type: "seneca",
      prompt:
        "Help me choose one responsibility I should delegate, define the outcome clearly, and decide how to support without taking it back.",
    },
  },
  {
    id: "accountability",
    slug: "accountability",
    title: "Can accountability\nfeel fair and human?",
    body: "High standards work best when expectations are clear and blame stays out.",
    actionLabel: "Plan with Seneca",
    image: img("accountability"),
    destination: {
      type: "seneca",
      prompt:
        "Help me prepare an accountability conversation that is direct about the standard, curious about the cause, and clear about the next step.",
    },
  },
  {
    id: "belonging",
    slug: "belonging",
    title: "Who is present but\nnot truly included?",
    body: "Belonging grows when leaders notice whose voice is missing from the room.",
    actionLabel: "Reflect with Seneca",
    image: img("belonging"),
    destination: {
      type: "seneca",
      prompt:
        "Help me spot where someone may be present but not fully included, and suggest one respectful action I can take this week.",
    },
  },
  {
    id: "customer-perspective",
    slug: "customer-perspective",
    title: "What does this feel like\nfrom their side?",
    body: "The customer’s experience often reveals what internal metrics cannot.",
    actionLabel: "Explore with Seneca",
    image: img("customer-perspective"),
    destination: {
      type: "seneca",
      prompt:
        "Help me examine a current decision from the customer’s perspective. Ask what they see, feel, need, and where friction may be hidden.",
    },
  },
  {
    id: "leading-change",
    slug: "leading-change",
    title: "What would make change\nfeel possible?",
    body: "People move sooner when the next step is visible and the reason feels real.",
    actionLabel: "Plan with Seneca",
    image: img("leading-change"),
    destination: {
      type: "seneca",
      prompt:
        "Help me explain an upcoming change in a way that makes the reason, the next step, and what will remain stable feel clear.",
    },
  },
  {
    id: "sustainable-pace",
    slug: "sustainable-pace",
    title: "Is the pace creating\nprogress—or exhaustion?",
    body: "Sustainable teams protect the energy required to keep doing excellent work.",
    actionLabel: "Check the pace",
    image: img("sustainable-pace"),
    destination: {
      type: "seneca",
      prompt:
        "Help me assess whether my current pace is sustainable and identify one pressure I can reduce without lowering the standard.",
    },
  },
  {
    id: "healthy-conflict",
    slug: "healthy-conflict",
    title: "What disagreement\ncould improve the outcome?",
    body: "Healthy conflict makes the work stronger when the goal stays shared.",
    actionLabel: "Prepare with Seneca",
    image: img("healthy-conflict"),
    destination: {
      type: "seneca",
      prompt:
        "Help me raise a disagreement constructively. I want to be candid, preserve trust, and keep the conversation focused on the best outcome.",
    },
  },
  {
    id: "future-leaders",
    slug: "future-leaders",
    title: "Who could lead more\nif you made room?",
    body: "Future leaders grow when someone entrusts them with meaningful ownership.",
    actionLabel: "Develop with Seneca",
    image: img("future-leaders"),
    destination: {
      type: "seneca",
      prompt:
        "Help me identify someone who is ready for more ownership and design a stretch opportunity that is meaningful but well supported.",
    },
  },
];

function mapDestination(destination: ApiDestination): HomeInsightDestination {
  if (destination.type === "recognition") return { type: "recognition" };
  if (destination.type === "discover") return { type: "discover", slug: destination.slug };
  return { type: "seneca", prompt: destination.prompt };
}

export function mapApiHomeInsight(card: ApiCard): HomeInsightCard {
  const bundled = HOME_INSIGHT_CARDS.find((row) => row.slug === card.slug || row.id === card.slug);
  const image =
    card.imageUrl && (/^https:\/\//i.test(card.imageUrl) || card.imageUrl.startsWith("/"))
      ? card.imageUrl
      : bundled?.image ?? img(card.slug);

  return {
    id: card.id,
    slug: card.slug,
    title: card.title,
    body: card.body,
    actionLabel: card.actionLabel,
    image,
    destination: mapDestination(card.destination),
  };
}

export function utcMondayStart(date: Date): number {
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - mondayOffset);
}

export function weeklyRotationIndex(date: Date, itemCount: number): number {
  if (!Number.isInteger(itemCount) || itemCount < 1) {
    throw new Error("Weekly rotation requires at least one item.");
  }
  const elapsedWeeks = Math.floor((utcMondayStart(date) - ROTATION_EPOCH_UTC) / WEEK_MS);
  return ((elapsedWeeks % itemCount) + itemCount) % itemCount;
}

export function homeInsightForDate(
  date = new Date(),
  deck: readonly HomeInsightCard[] = HOME_INSIGHT_CARDS,
): HomeInsightCard {
  const cards = deck.length > 0 ? deck : HOME_INSIGHT_CARDS;
  return cards[weeklyRotationIndex(date, cards.length)]!;
}
