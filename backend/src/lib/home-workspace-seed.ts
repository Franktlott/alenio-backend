/** Default Alenio Workspace promo card (no-workspace Home). */

export type HomeWorkspaceSeedCard = {
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
  destinationType: "create" | "join";
  displayOrder: number;
};

export const HOME_WORKSPACE_SEED_CARDS: readonly HomeWorkspaceSeedCard[] = [
  {
    slug: "create-workspace",
    title: "Ready for a shared\nworkspace?",
    body: "Create a workspace for your team — or join with an invite code.",
    actionLabel: "Create a workspace",
    accessibilityLabel: "Create a workspace",
    imagePath: "/insight/leadership-week-psychological-safety.jpg",
    surfaceColor: "#1A0B3A",
    fadeColors: [
      "rgba(20,9,56,0.96)",
      "rgba(26,11,69,0.86)",
      "rgba(42,15,99,0.05)",
    ],
    borderColor: "#2A0F63",
    titleColor: "#FFFFFF",
    bodyColor: "rgba(255,255,255,0.72)",
    buttonColors: ["#5B32D6", "#7C4DFF"],
    destinationType: "create",
    displayOrder: 0,
  },
];
