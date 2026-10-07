import { z } from "zod";
import { cronjob } from "../groovy/templates.js";
import type { RegisterTool } from "../toolUtils.js";
import { jsonContent } from "../toolUtils.js";

export const register: RegisterTool = (server, client) => {
  server.tool(
    "cronjob",
    "Read-only. List cronjobs (action=list) or return the status of one by code (action=status).",
    {
      action: z.enum(["list", "status"]).default("list"),
      code: z.string().optional()
    },
    async ({ action, code }: { action: "list" | "status"; code?: string }) => {
      if (action === "status" && !code) {
        throw new Error('cronjob action="status" requires code.');
      }
      return jsonContent(await client.groovyJson(cronjob(action, code)));
    }
  );
};
