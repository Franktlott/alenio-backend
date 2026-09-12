export function isSubtaskSharedComplete(input: {
  completed: boolean;
  completionCount: number;
}): boolean {
  return input.completed || input.completionCount > 0;
}
