import { createMiddleware } from "hono/factory";
import {
  createCorrelationId,
  runWithCorrelation,
} from "../lib/authorization/correlation";

export const correlationMiddleware = createMiddleware(async (c, next) => {
  const incoming =
    c.req.header("x-request-id") ?? c.req.header("x-correlation-id");
  const correlationId = createCorrelationId(incoming);
  c.header("x-request-id", correlationId);
  await runWithCorrelation(correlationId, () => next());
});
