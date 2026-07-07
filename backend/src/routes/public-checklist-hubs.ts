import { Hono } from "hono";
import {
  parseGoFrontendSettings,
  resolveGoHeroImage,
} from "../lib/go-frontend-settings";
import { resolveGoAlertSoundUrl } from "../lib/go-alert-sounds";
import { findTeamByGoHubToken } from "../lib/go-hub";
import { assertGoDeviceLinked, GO_DEVICE_UNLINKED_MESSAGE } from "../lib/workplace-alerts";

const publicChecklistHubsRouter = new Hono();

publicChecklistHubsRouter.get("/:hubToken", async (c) => {
  const hubToken = c.req.param("hubToken")?.trim();
  if (!hubToken) return c.json({ error: { message: "Not found" } }, 404);

  const team = await findTeamByGoHubToken(hubToken);
  if (!team) return c.json({ error: { message: "Checklist page not found" } }, 404);

  const deviceId = c.req.query("deviceId")?.trim();
  if (deviceId) {
    const linked = await assertGoDeviceLinked(team.id, deviceId);
    if (!linked.ok) {
      return c.json(
        { error: { message: GO_DEVICE_UNLINKED_MESSAGE, code: linked.code } },
        403,
      );
    }
  }

  const goFrontendSettings = parseGoFrontendSettings(team.goFrontendSettings);
  const heroImage = resolveGoHeroImage(team.image, goFrontendSettings);
  const alertSoundUrl = resolveGoAlertSoundUrl();

  c.header("Cache-Control", "no-store");

  return c.json({
    data: {
      team: { name: team.name, image: heroImage },
      checklists: [],
      alertSoundUrl,
    },
  });
});

export { publicChecklistHubsRouter };
