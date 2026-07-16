import type { SiteConfig } from "../../src/config/types.js";

export const site: SiteConfig = {
  id: "bagrot",
  database: "test",
  uriEnv: "BAGROT_MONGODB_URI",
  retentionDays: 30,
  enabled: true,
};
