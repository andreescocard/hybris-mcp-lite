import { z } from "zod";
import { monitoring } from "../groovy/templates.js";
import type { RegisterTool } from "../toolUtils.js";
import { jsonContent } from "../toolUtils.js";

export const register: RegisterTool = (server, client) => {
  server.tool(
    "monitoring_info",
    "Read-only. Return cluster, memory, threads, cache, or thread-dump diagnostics via tenant-safe Groovy.",
    {
      section: z.enum(["cluster", "memory", "threads", "cache", "dump"]).default("memory")
    },
    async ({ section }: { section: "cluster" | "memory" | "threads" | "cache" | "dump" }) =>
      jsonContent(await client.groovyJson(monitoring(section)))
  );
};
