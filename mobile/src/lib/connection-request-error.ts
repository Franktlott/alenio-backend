type ApiErrorLike = Error & {
  body?: {
    error?: {
      code?: string;
      retryAt?: string;
      remainingSeconds?: number;
    };
  } | null;
};

export function connectionRequestErrorMessage(error: unknown): string {
  const apiError =
    error instanceof Error ? (error as ApiErrorLike) : null;
  if (
    apiError?.body?.error?.code === "CONNECTION_REQUEST_COOLDOWN"
  ) {
    const retryAt = apiError.body.error.retryAt;
    if (retryAt) {
      const date = new Date(retryAt);
      if (!Number.isNaN(date.getTime())) {
        return `This request was recently declined. You can try again ${date.toLocaleDateString(
          undefined,
          { month: "short", day: "numeric" },
        )}.`;
      }
    }
    const remainingSeconds = apiError.body.error.remainingSeconds;
    if (typeof remainingSeconds === "number" && remainingSeconds > 0) {
      const days = Math.max(1, Math.ceil(remainingSeconds / 86_400));
      return `This request was recently declined. Try again in ${days} day${
        days === 1 ? "" : "s"
      }.`;
    }
    return "This request was recently declined. Please wait before trying again.";
  }
  return error instanceof Error ? error.message : "Could not send connection request";
}
