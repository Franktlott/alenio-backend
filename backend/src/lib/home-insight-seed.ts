/** Default Home Insight deck (matches mobile/web bundled cards). */

export type HomeInsightSeedCard = {
  slug: string;
  title: string;
  body: string;
  actionLabel: string;
  accessibilityLabel: string;
  imagePath: string;
  surfaceColor: string;
  fadeColors: [string, string, string];
  borderColor: string;
  titleColor: string;
  bodyColor: string;
  buttonColors: [string, string];
  destinationType: "recognition" | "seneca";
  senecaPrompt: string;
  displayOrder: number;
};

const img = (name: string) => `/insight/leadership-week-${name}.jpg`;

export const HOME_INSIGHT_SEED_CARDS: readonly HomeInsightSeedCard[] = [
  {
    slug: "recognition",
    title: "Who deserves\nrecognition today?",
    body: "Notice the contribution that made someone else’s work easier.",
    actionLabel: "Recognize someone",
    accessibilityLabel: "Open Recognition Hub",
    imagePath: img("recognition"),
    surfaceColor: "#F7F1FF",
    fadeColors: ["#F7F1FF", "rgba(247,241,255,0.94)", "rgba(247,241,255,0)"],
    borderColor: "#E6D8FF",
    titleColor: "#17172B",
    bodyColor: "#69677B",
    buttonColors: ["#5B32D6", "#7C4DFF"],
    destinationType: "recognition",
    senecaPrompt: "",
    displayOrder: 0,
  },
  {
    slug: "psychological-safety",
    title: "What is your team\nhesitant to say?",
    body: "The most useful truth may be the one people do not yet feel safe sharing.",
    actionLabel: "Explore with Seneca",
    accessibilityLabel: "Ask Seneca about psychological safety",
    imagePath: img("psychological-safety"),
    surfaceColor: "#F5F5FC",
    fadeColors: ["#F5F5FC", "rgba(245,245,252,0.94)", "rgba(245,245,252,0)"],
    borderColor: "#DFE3F4",
    titleColor: "#172033",
    bodyColor: "#667085",
    buttonColors: ["#5265D8", "#7766E8"],
    destinationType: "seneca",
    senecaPrompt:
      "Help me identify one practical way to make it safer for people around me to raise concerns, disagree, or admit mistakes.",
    displayOrder: 1,
  },
  {
    slug: "priority-clarity",
    title: "If everything matters,\nwhat truly comes first?",
    body: "Clear leadership is often deciding what the team can stop carrying.",
    actionLabel: "Clarify with Seneca",
    accessibilityLabel: "Ask Seneca about priority clarity",
    imagePath: img("priority-clarity"),
    surfaceColor: "#101F38",
    fadeColors: ["#101F38", "rgba(16,31,56,0.96)", "rgba(16,31,56,0)"],
    borderColor: "#243B5C",
    titleColor: "#FFFFFF",
    bodyColor: "#C8D4E6",
    buttonColors: ["#3B82F6", "#6366F1"],
    destinationType: "seneca",
    senecaPrompt:
      "Help me narrow my current priorities. Ask me a few questions, then help me name the one outcome that should come first and what can wait.",
    displayOrder: 2,
  },
  {
    slug: "coaching",
    title: "Are you solving—or\nhelping someone grow?",
    body: "A strong question can build more capability than a quick answer.",
    actionLabel: "Coach with Seneca",
    accessibilityLabel: "Ask Seneca for a coaching question",
    imagePath: img("coaching"),
    surfaceColor: "#FFF3EA",
    fadeColors: ["#FFF3EA", "rgba(255,243,234,0.95)", "rgba(255,243,234,0)"],
    borderColor: "#F4D9CA",
    titleColor: "#2D1D1A",
    bodyColor: "#7C625B",
    buttonColors: ["#D7654D", "#A855A0"],
    destinationType: "seneca",
    senecaPrompt:
      "Give me three thoughtful coaching questions I can use instead of immediately solving a problem for someone.",
    displayOrder: 3,
  },
  {
    slug: "delegation",
    title: "What are you holding\nthat someone else could own?",
    body: "Delegation is not unloading work. It is transferring trust and clarity.",
    actionLabel: "Think with Seneca",
    accessibilityLabel: "Ask Seneca about delegation",
    imagePath: img("delegation"),
    surfaceColor: "#062D3D",
    fadeColors: ["#062D3D", "rgba(6,45,61,0.96)", "rgba(6,45,61,0)"],
    borderColor: "#174D5E",
    titleColor: "#FFFFFF",
    bodyColor: "#C3DDE4",
    buttonColors: ["#0F8B8D", "#2D6A9F"],
    destinationType: "seneca",
    senecaPrompt:
      "Help me choose one responsibility I should delegate, define the outcome clearly, and decide how to support without taking it back.",
    displayOrder: 4,
  },
  {
    slug: "accountability",
    title: "Can accountability\nfeel fair and human?",
    body: "High standards work best when expectations are clear and blame stays out.",
    actionLabel: "Plan with Seneca",
    accessibilityLabel: "Ask Seneca about healthy accountability",
    imagePath: img("accountability"),
    surfaceColor: "#F7F4EF",
    fadeColors: ["#F7F4EF", "rgba(247,244,239,0.95)", "rgba(247,244,239,0)"],
    borderColor: "#DED9D0",
    titleColor: "#192438",
    bodyColor: "#667085",
    buttonColors: ["#243B5A", "#376A6D"],
    destinationType: "seneca",
    senecaPrompt:
      "Help me prepare an accountability conversation that is direct about the standard, curious about the cause, and clear about the next step.",
    displayOrder: 5,
  },
  {
    slug: "belonging",
    title: "Who is present but\nnot truly included?",
    body: "Belonging grows when leaders notice whose voice is missing from the room.",
    actionLabel: "Reflect with Seneca",
    accessibilityLabel: "Ask Seneca about belonging",
    imagePath: img("belonging"),
    surfaceColor: "#FFF0E8",
    fadeColors: ["#FFF0E8", "rgba(255,240,232,0.95)", "rgba(255,240,232,0)"],
    borderColor: "#F2D4C7",
    titleColor: "#321D2B",
    bodyColor: "#785E67",
    buttonColors: ["#9D416A", "#D66C58"],
    destinationType: "seneca",
    senecaPrompt:
      "Help me spot where someone may be present but not fully included, and suggest one respectful action I can take this week.",
    displayOrder: 6,
  },
  {
    slug: "customer-perspective",
    title: "What does this feel like\nfrom their side?",
    body: "The customer’s experience often reveals what internal metrics cannot.",
    actionLabel: "Explore with Seneca",
    accessibilityLabel: "Ask Seneca about customer perspective",
    imagePath: img("customer-perspective"),
    surfaceColor: "#F3F2F0",
    fadeColors: ["#F3F2F0", "rgba(243,242,240,0.95)", "rgba(243,242,240,0)"],
    borderColor: "#DDDDE4",
    titleColor: "#1C2333",
    bodyColor: "#697386",
    buttonColors: ["#148BA8", "#684FDB"],
    destinationType: "seneca",
    senecaPrompt:
      "Help me examine a current decision from the customer’s perspective. Ask what they see, feel, need, and where friction may be hidden.",
    displayOrder: 7,
  },
  {
    slug: "leading-change",
    title: "What would make change\nfeel possible?",
    body: "People move sooner when the next step is visible and the reason feels real.",
    actionLabel: "Plan with Seneca",
    accessibilityLabel: "Ask Seneca about leading change",
    imagePath: img("leading-change"),
    surfaceColor: "#F2EFF4",
    fadeColors: ["#F2EFF4", "rgba(242,239,244,0.95)", "rgba(242,239,244,0)"],
    borderColor: "#DED5E5",
    titleColor: "#251B32",
    bodyColor: "#70657A",
    buttonColors: ["#6D3FD1", "#C35A83"],
    destinationType: "seneca",
    senecaPrompt:
      "Help me explain an upcoming change in a way that makes the reason, the next step, and what will remain stable feel clear.",
    displayOrder: 8,
  },
  {
    slug: "sustainable-pace",
    title: "Is the pace creating\nprogress—or exhaustion?",
    body: "Sustainable teams protect the energy required to keep doing excellent work.",
    actionLabel: "Check the pace",
    accessibilityLabel: "Ask Seneca about sustainable pace",
    imagePath: img("sustainable-pace"),
    surfaceColor: "#F7F0E8",
    fadeColors: ["#F7F0E8", "rgba(247,240,232,0.95)", "rgba(247,240,232,0)"],
    borderColor: "#E5D8C9",
    titleColor: "#283126",
    bodyColor: "#6B7466",
    buttonColors: ["#668A55", "#7360A6"],
    destinationType: "seneca",
    senecaPrompt:
      "Help me assess whether my current pace is sustainable and identify one pressure I can reduce without lowering the standard.",
    displayOrder: 9,
  },
  {
    slug: "healthy-conflict",
    title: "What disagreement\ncould improve the outcome?",
    body: "Healthy conflict makes the work stronger when the goal stays shared.",
    actionLabel: "Prepare with Seneca",
    accessibilityLabel: "Ask Seneca about constructive conflict",
    imagePath: img("healthy-conflict"),
    surfaceColor: "#FFF7ED",
    fadeColors: ["#FFF7ED", "rgba(255,247,237,0.95)", "rgba(255,247,237,0)"],
    borderColor: "#F1DFCD",
    titleColor: "#2A2530",
    bodyColor: "#756D78",
    buttonColors: ["#E06B50", "#3D7FC4"],
    destinationType: "seneca",
    senecaPrompt:
      "Help me raise a disagreement constructively. I want to be candid, preserve trust, and keep the conversation focused on the best outcome.",
    displayOrder: 10,
  },
  {
    slug: "future-leaders",
    title: "Who could lead more\nif you made room?",
    body: "Future leaders grow when someone entrusts them with meaningful ownership.",
    actionLabel: "Develop with Seneca",
    accessibilityLabel: "Ask Seneca about developing future leaders",
    imagePath: img("future-leaders"),
    surfaceColor: "#F7EEDC",
    fadeColors: ["#F7EEDC", "rgba(247,238,220,0.95)", "rgba(247,238,220,0)"],
    borderColor: "#E5D1AA",
    titleColor: "#27213A",
    bodyColor: "#71677A",
    buttonColors: ["#9B6A21", "#4E477D"],
    destinationType: "seneca",
    senecaPrompt:
      "Help me identify someone who is ready for more ownership and design a stretch opportunity that is meaningful but well supported.",
    displayOrder: 11,
  },
];
