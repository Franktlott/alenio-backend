/**
 * One-shot: remove enterprise org owners/admins from org workspaces.
 * They manage at organization level only.
 *
 *   cd backend && bun run scripts/detach-enterprise-org-admins.ts
 */
import { detachAllEnterpriseOrgAdminsFromWorkspaces } from "../src/lib/enterprise-org-access";

async function main() {
  const result = await detachAllEnterpriseOrgAdminsFromWorkspaces();
  console.log(
    `[detach-enterprise-org-admins] orgs=${result.organizations} removedTeamMemberships=${result.removed}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
