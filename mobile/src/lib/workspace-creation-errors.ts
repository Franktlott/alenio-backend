type ApiErrorLike = Error & {
  body?: { error?: { code?: string } } | null;
};

export function workspaceCreationErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as ApiErrorLike).body?.error?.code;
    if (code === "TRIAL_ALREADY_USED" || code === "PAID_PLAN_REQUIRED") {
      return "Your free trial has already been used. Choose a paid plan to create this workspace.";
    }
    if (code === "TRIAL_AVAILABLE") {
      return "Your free Operations trial is still available. Start the trial to create this workspace.";
    }
    if (code === "TEAM_NAME_TAKEN") return error.message;
    if (code === "NOT_CONFIGURED") {
      return "Secure checkout is temporarily unavailable. Please try again later.";
    }
    if (error.message) return error.message;
  }
  return "Could not create this workspace right now. Please try again.";
}
