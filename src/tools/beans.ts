import { z } from "zod";
import { beanInfo } from "../groovy/templates.js";
import type { RegisterTool } from "../toolUtils.js";
import { jsonContent } from "../toolUtils.js";

export const register: RegisterTool = (server, client) => {
  server.tool(
    "beans_info",
    "Read-only. Return Spring bean implementation and aliases using the HAC application context.",
    {
      name: z.string().min(1)
    },
    async ({ name }: { name: string }) => jsonContent(await client.groovyJson(beanInfo(name)))
  );
};
