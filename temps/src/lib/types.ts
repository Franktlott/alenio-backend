export type Team = {
  id: string;
  name: string;
};

export type WalkOccurrence = {
  id: string;
  templateId: string;
  status: string;
  windowStart: string;
  dueAt: string;
  graceEndsAt?: string | null;
  completedByName?: string | null;
  startedByName?: string | null;
  template?: { id: string; name: string; description?: string | null };
  schedule?: { id: string; name: string | null };
};

export type TemperatureConfig = {
  comparisonType?: "ABOVE" | "BELOW" | "BETWEEN";
  minimumTemperature?: number;
  maximumTemperature?: number;
  unit?: "F" | "C";
  allowManualEntry?: boolean;
  allowBluetoothProbe?: boolean;
  requireRetestOnFailure?: boolean;
  retestGuidance?: string | null;
  maximumRetests?: number;
};

export type WalkRunCorrectiveAction = {
  id: string;
  title: string;
  actionType: string;
  instructions: string | null;
  required?: boolean;
  blocksCompletion: boolean;
  branch?: "first_failure" | "if_pass" | "if_fail" | null;
  config?: Record<string, unknown> | null;
  status: string;
  completedAt: string | null;
};

export type WalkRunItem = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  instructions: string | null;
  position: number;
  required: boolean;
  config: Record<string, unknown>;
  /** Snapshot CA definitions from the server (present even before a response). */
  correctiveActions?: WalkRunCorrectiveAction[];
  response: {
    id: string;
    status: string;
    response: unknown;
    failed: boolean;
    notes: string | null;
    correctiveActions?: WalkRunCorrectiveAction[];
  } | null;
};

export type WalkRun = {
  id: string;
  teamId: string;
  templateId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  template: { id: string; name: string };
  items: WalkRunItem[];
  progress: {
    total: number;
    answered: number;
    requiredRemaining: number;
  };
};
