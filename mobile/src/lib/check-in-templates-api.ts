import { api } from "@/lib/api/api";
import type {
  OneOnOneTemplate,
  OneOnOneTemplateField,
} from "@/lib/member-profile-api";

export type CheckInTemplate = OneOnOneTemplate & {
  libraryKey?: string | null;
};

export type CheckInLibraryTemplate = {
  key: string;
  title: string;
  description: string | null;
  fields: OneOnOneTemplateField[];
};

export type CheckInTemplateInput = {
  title: string;
  description: string | null;
  fields: OneOnOneTemplateField[];
  leaderPrep: string[];
};

function templatesPath(teamId: string): string {
  return `/api/teams/${encodeURIComponent(teamId)}/one-on-one-templates`;
}

export function fetchCheckInTemplates(teamId: string): Promise<CheckInTemplate[]> {
  return api.get<CheckInTemplate[]>(templatesPath(teamId));
}

export function fetchCheckInTemplateLibrary(): Promise<CheckInLibraryTemplate[]> {
  return api.get<CheckInLibraryTemplate[]>("/api/check-in-template-library");
}

export function addCheckInTemplateFromLibrary(
  teamId: string,
  libraryKey: string,
): Promise<CheckInTemplate> {
  return api.post<CheckInTemplate>(
    `${templatesPath(teamId)}/from-library/${encodeURIComponent(libraryKey)}`,
    {},
  );
}

export function createCheckInTemplate(
  teamId: string,
  input: CheckInTemplateInput,
): Promise<CheckInTemplate> {
  return api.post<CheckInTemplate>(templatesPath(teamId), input);
}

export function updateCheckInTemplate(
  teamId: string,
  templateId: string,
  input: CheckInTemplateInput,
): Promise<CheckInTemplate> {
  return api.patch<CheckInTemplate>(
    `${templatesPath(teamId)}/${encodeURIComponent(templateId)}`,
    input,
  );
}

export function deleteCheckInTemplate(
  teamId: string,
  templateId: string,
): Promise<{ deleted: boolean }> {
  return api.delete<{ deleted: boolean }>(
    `${templatesPath(teamId)}/${encodeURIComponent(templateId)}`,
  );
}
