import { z } from "zod";
import { typeInfo } from "../groovy/templates.js";
import type { RegisterTool } from "../toolUtils.js";
import { jsonContent } from "../toolUtils.js";

export const register: RegisterTool = (server, client) => {
  server.tool(
    "type_info",
    "Read-only. Return SAP Commerce type attributes, deployment data, and subtypes via a tenant-safe Groovy template.",
    {
      type: z.string().min(1)
    },
    async ({ type }: { type: string }) => jsonContent(await client.groovyJson(typeInfo(type)))
  );
};
