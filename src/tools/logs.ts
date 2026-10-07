import { z } from "zod";
import type { RegisterTool } from "../toolUtils.js";
import { jsonContent } from "../toolUtils.js";

export const register: RegisterTool = (server, client) => {
  server.tool(
    "logs_tail",
    "Read-only. Tail the local SAP Commerce/HAC console log. Optional grep filters the tailed source lines.",
    {
      lines: z.number().int().min(1).max(2000).default(200),
      grep: z.string().optional()
    },
    async ({ lines, grep }: { lines: number; grep?: string }) => jsonContent(await client.logsTail(lines, grep))
  );
};
