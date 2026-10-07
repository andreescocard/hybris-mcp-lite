import { typeInfo, configGet, beanInfo, cronjob, monitoring } from "../src/groovy/templates.js";
import { HacClient } from "../src/hacClient.js";
import { maskConfig } from "../src/mask.js";

type Smoke = {
  name: string;
  run: () => Promise<unknown> | unknown;
};

const client = new HacClient();

const smokes: Smoke[] = [
  { name: "flexible_search", run: () => client.flexibleSearch("SELECT {PK} FROM {Product}", 1) },
  { name: "type_info", run: () => client.groovyJson(typeInfo("Product")) },
  { name: "config_get", run: async () => maskConfig(await client.groovyJson(configGet("build.version"))) },
  { name: "beans_info", run: () => client.groovyJson(beanInfo("modelService")) },
  { name: "monitoring_info", run: () => client.groovyJson(monitoring("memory")) },
  { name: "cronjob_list", run: () => client.groovyJson(cronjob("list")) },
  { name: "logs_tail", run: () => client.logsTail(5) }
];

let failures = 0;
for (const smoke of smokes) {
  try {
    const result = await smoke.run();
    console.log(`PASS ${smoke.name}`);
    console.log(JSON.stringify(result, null, 2).slice(0, 1000));
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${smoke.name}`);
    console.error(error instanceof Error ? error.stack ?? error.message : error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}
