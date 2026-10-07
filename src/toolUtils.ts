import type { HacClient } from "./hacClient.js";

export type ToolRegistrar = {
  tool: (...args: any[]) => unknown;
};

export type RegisterTool = (server: ToolRegistrar, client: HacClient) => void;

export function jsonContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

