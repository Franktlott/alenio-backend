import type { PrismaClient } from "@prisma/client";
import { SENECA_GLOBAL_CORE } from "./seneca-global-core";
import { SENECA_DATA_GROUNDING_RULES } from "./seneca-grounding";
import {
  getPublishedOrDraftOperational,
  getPublishedOrDraftStudio,
  listActiveKnowledge,
  listPromptTemplates,
  type SenecaOwnerRef,
  workspaceOwner,
} from "./seneca-config-service";
import type { SenecaPromptTemplateKey } from "./seneca-config-types";

export type AssembledSenecaPrompt = {
  systemPrompt: string;
  promptVersion: string;
  knowledgeUsed: string[];
  contextLayers: string[];
  studioVersion: number | null;
  operationalVersion: number | null;
};

/**
 * Prompt assembly chain (future-proof for Organizations):
 * Global Core → (Organization Studio) → Workspace Studio → Operational Context → request context
 */
export async function assembleSenecaSystemPrompt(
  prisma: PrismaClient,
  opts: {
    owner: SenecaOwnerRef;
    /** Optional Organization owner for future inheritance. */
    organizationOwner?: SenecaOwnerRef | null;
    templateKey?: SenecaPromptTemplateKey | null;
    userContext?: string | null;
    requestContext?: string | null;
  },
): Promise<AssembledSenecaPrompt> {
  const layers: string[] = [];
  const knowledgeUsed: string[] = [];

  layers.push(`# Global Seneca Core v${SENECA_GLOBAL_CORE.version}`);
  layers.push(SENECA_GLOBAL_CORE.baseSystemPrompt);
  layers.push("## Safety rules\n" + SENECA_GLOBAL_CORE.safetyRules.map((r) => `- ${r}`).join("\n"));
  layers.push("## Privacy rules\n" + SENECA_GLOBAL_CORE.privacyRules.map((r) => `- ${r}`).join("\n"));
  layers.push(
    "## Coaching framework\n" + SENECA_GLOBAL_CORE.coachingFramework.map((r) => `- ${r}`).join("\n"),
  );
  layers.push(
    "## Response formatting\n" + SENECA_GLOBAL_CORE.responseFormatting.map((r) => `- ${r}`).join("\n"),
  );
  layers.push(SENECA_DATA_GROUNDING_RULES);

  // Future: if opts.organizationOwner, load ORGANIZATION STUDIO here.

  const studio = await getPublishedOrDraftStudio(prisma, opts.owner);
  layers.push(`# Workspace Seneca Studio (${studio.source}, v${studio.row?.version ?? 0})`);
  layers.push(`Tone: ${studio.data.tone}`);
  layers.push(`Response length: ${studio.data.responseLength}`);
  layers.push(`Coaching style: ${studio.data.coachingStyle}`);
  layers.push(`Ask follow-up questions before responding: ${studio.data.askFollowUps ? "yes" : "no"}`);
  if (studio.data.alwaysDo.length) {
    layers.push("## Always do\n" + studio.data.alwaysDo.map((i) => `- ${i}`).join("\n"));
  }
  if (studio.data.neverDo.length) {
    layers.push("## Never do\n" + studio.data.neverDo.map((i) => `- ${i}`).join("\n"));
  }
  if (studio.data.leadershipPhilosophy.trim()) {
    layers.push("## Leadership philosophy\n" + studio.data.leadershipPhilosophy.trim());
  }
  if (studio.data.approvedTerms.length) {
    layers.push("## Prefer terminology\n" + studio.data.approvedTerms.map((t) => `- ${t}`).join("\n"));
  }
  if (studio.data.avoidedTerms.length) {
    layers.push("## Avoid terminology\n" + studio.data.avoidedTerms.map((t) => `- ${t}`).join("\n"));
  }

  const operational = await getPublishedOrDraftOperational(prisma, opts.owner);
  layers.push(`# Workspace Operational Context (${operational.source}, v${operational.row?.version ?? 0})`);
  if (operational.data.currentPriorities.length) {
    layers.push(
      "## Current priorities\n" + operational.data.currentPriorities.map((p) => `- ${p}`).join("\n"),
    );
  }
  if (operational.data.currentGoals.length) {
    layers.push(
      "## Current goals\n" +
        operational.data.currentGoals
          .map((g) => `- ${g.title}${g.description ? `: ${g.description}` : ""} [${g.status}]`)
          .join("\n"),
    );
  }
  if (operational.data.currentInitiatives.length) {
    layers.push(
      "## Current initiatives\n" + operational.data.currentInitiatives.map((i) => `- ${i}`).join("\n"),
    );
  }
  if (operational.data.focusAreas.length) {
    layers.push("## Focus areas\n" + operational.data.focusAreas.map((f) => `- ${f}`).join("\n"));
  }
  if (operational.data.workspaceNotes.trim()) {
    layers.push("## Workspace notes\n" + operational.data.workspaceNotes.trim());
  }
  layers.push(
    "## Recognition preferences\n" +
      Object.entries(operational.data.recognitionPreferences)
        .map(([k, v]) => `- ${k}: ${v ? "yes" : "no"}`)
        .join("\n"),
  );

  const knowledge = await listActiveKnowledge(prisma, opts.owner);
  if (knowledge.length) {
    layers.push("# Knowledge base (active documents only)");
    for (const doc of knowledge.slice(0, 12)) {
      knowledgeUsed.push(`${doc.title} v${doc.version}`);
      const body = doc.contentText.trim().slice(0, 4000);
      layers.push(`## ${doc.title} (${doc.category})\n${doc.description ?? ""}\n${body}`);
    }
  }

  if (opts.templateKey) {
    const templates = await listPromptTemplates(prisma, opts.owner);
    const match = templates.find((t) => t.templateKey === opts.templateKey);
    if (match?.instructions.trim()) {
      layers.push(`# Prompt template: ${match.title}\n${match.instructions.trim()}`);
    }
  }

  if (opts.userContext?.trim()) {
    layers.push("# Current user context\n" + opts.userContext.trim());
  }
  if (opts.requestContext?.trim()) {
    layers.push("# Current request context\n" + opts.requestContext.trim());
  }

  const promptVersion = [
    `global:${SENECA_GLOBAL_CORE.version}`,
    `studio:${studio.row?.version ?? 0}:${studio.source}`,
    `ops:${operational.row?.version ?? 0}:${operational.source}`,
  ].join("|");

  return {
    systemPrompt: layers.join("\n\n"),
    promptVersion,
    knowledgeUsed,
    contextLayers: ["global", "studio", "operational", "knowledge", "user", "request"],
    studioVersion: studio.row?.version ?? null,
    operationalVersion: operational.row?.version ?? null,
  };
}

export async function assembleForWorkspaceTeam(
  prisma: PrismaClient,
  teamId: string,
  opts: Omit<Parameters<typeof assembleSenecaSystemPrompt>[1], "owner"> = {},
) {
  return assembleSenecaSystemPrompt(prisma, {
    ...opts,
    owner: workspaceOwner(teamId),
  });
}
