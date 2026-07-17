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
  response: {
    id: string;
    status: string;
    response: unknown;
    failed: boolean;
    notes: string | null;
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
