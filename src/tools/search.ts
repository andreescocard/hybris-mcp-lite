import { z } from "zod";
import type { RegisterTool } from "../toolUtils.js";
import { jsonContent } from "../toolUtils.js";

export const register: RegisterTool = (server, client) => {
  server.tool(
    "flexible_search",
    "Read-only. Run HAC FlexibleSearch against the configured local HAC. Optional translate=true returns generated SQL only.",
    {
      query: z.string().min(1),
      maxCount: z.number().int().min(1).max(200).default(200),
      translate: z.boolean().default(false)
    },
    async ({ query, maxCount, translate }: { query: string; maxCount: number; translate: boolean }) =>
      jsonContent(await client.flexibleSearch(query, maxCount, translate))
  );
};
