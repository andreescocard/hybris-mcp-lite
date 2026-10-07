import { z } from "zod";
import { configGet } from "../groovy/templates.js";
import { maskConfig } from "../mask.js";
import type { RegisterTool } from "../toolUtils.js";
import { jsonContent } from "../toolUtils.js";

export const register: RegisterTool = (server, client) => {
  server.tool(
    "config_get",
    "Read-only. Return a configuration property by key, or all visible keys when key is omitted. Values of keys matching pass/secret/token/key/credential are masked.",
    {
      key: z.string().optional()
    },
    async ({ key }: { key?: string }) => jsonContent(maskConfig(await client.groovyJson(configGet(key))))
  );
};
