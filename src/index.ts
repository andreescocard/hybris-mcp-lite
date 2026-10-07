#!/usr/bin/env node
// Local HAC instances usually use self-signed certificates. TLS verification is
// only disabled when explicitly requested.
if (process.env.HAC_INSECURE_TLS === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { HacClient } from "./hacClient.js";
import { register as registerBeans } from "./tools/beans.js";
import { register as registerConfig } from "./tools/config.js";
import { register as registerCronjob } from "./tools/cronjob.js";
import { register as registerLogs } from "./tools/logs.js";
import { register as registerMonitoring } from "./tools/monitoring.js";
import { register as registerSearch } from "./tools/search.js";
import { register as registerTypeSystem } from "./tools/typesystem.js";
import type { RegisterTool } from "./toolUtils.js";

const server = new McpServer({
  name: "hybris-hac-mcp-lite",
  version: "0.1.0"
});

const client = new HacClient();
const registrars: RegisterTool[] = [
  registerSearch,
  registerLogs,
  registerTypeSystem,
  registerConfig,
  registerBeans,
  registerMonitoring,
  registerCronjob
];

for (const register of registrars) {
  register(server, client);
}

const transport = new StdioServerTransport();
await server.connect(transport);
