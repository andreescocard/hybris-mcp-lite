export function typeInfo(typeCode: string): string {
  return wrapJson(`
    def typeCode = ${gstring(typeCode)}
    def typeService = spring.getBean("typeService")
    def composed = typeService.getComposedTypeForCode(typeCode)
    def attrs = composed.getDeclaredattributedescriptors().collect { a ->
      [
        qualifier: a.qualifier,
        type: a.attributeType?.code,
        localized: a.localized,
        optional: a.optional,
        unique: a.unique,
        partOf: a.partOf,
        persistence: a.persistenceClass?.simpleName
      ]
    }.sort { it.qualifier }
    [
      code: composed.code,
      superType: composed.superType?.code,
      table: composed.table,
      jaloClass: composed.jaloClass?.name,
      itemClass: composed.itemClass?.name,
      attributes: attrs,
      subtypes: typeService.getAllSubTypes(composed).collect { it.code }.sort()
    ]
  `);
}

export function configGet(key?: string): string {
  return wrapJson(`
    def configurationService = spring.getBean("configurationService")
    def cfg = configurationService.configuration
    def key = ${gstring(key ?? "")}
    if (key) {
      [key: key, value: cfg.getString(key, null)]
    } else {
      def keys = []
      cfg.getKeys().each { keys << it }
      [properties: keys.sort().collectEntries { [(it): cfg.getString(it, null)] }]
    }
  `);
}

export function beanInfo(name: string): string {
  return wrapJson(`
    def name = ${gstring(name)}
    def bean = spring.getBean(name)
    [
      name: name,
      className: bean.getClass().name,
      targetClassName: org.springframework.aop.support.AopUtils.getTargetClass(bean)?.name,
      aliases: spring.getAliases(name) as List
    ]
  `);
}

export function cronjob(action: "list" | "status", code?: string): string {
  return wrapJson(`
    def action = ${gstring(action)}
    def code = ${gstring(code ?? "")}
    def flexibleSearchService = spring.getBean("flexibleSearchService")
    if (action == "list") {
      def q = new de.hybris.platform.servicelayer.search.FlexibleSearchQuery("SELECT {code},{status},{result} FROM {CronJob} ORDER BY {modifiedtime} DESC")
      q.setCount(100)
      def rows = flexibleSearchService.search(q).result.collect { [code: it[0], status: "\${it[1]}", result: "\${it[2]}"] }
      [cronjobs: rows]
    } else {
      def model = flexibleSearchService.searchUnique("SELECT {pk} FROM {CronJob} WHERE {code}=?code", [code: code])
      [code: model.code, status: "\${model.status}", result: "\${model.result}"]
    }
  `);
}

export function monitoring(section: "cluster" | "memory" | "threads" | "cache" | "dump"): string {
  return wrapJson(`
    def section = ${gstring(section)}
    def runtime = Runtime.runtime
    if (section == "memory") {
      [
        maxMemory: runtime.maxMemory(),
        totalMemory: runtime.totalMemory(),
        freeMemory: runtime.freeMemory(),
        usedMemory: runtime.totalMemory() - runtime.freeMemory(),
        processors: runtime.availableProcessors()
      ]
    } else if (section == "threads" || section == "dump") {
      def mx = java.lang.management.ManagementFactory.threadMXBean
      def infos = mx.dumpAllThreads(section == "dump", section == "dump").collect {
        [id: it.threadId, name: it.threadName, state: "\${it.threadState}", lockName: it.lockName]
      }
      [threadCount: mx.threadCount, peakThreadCount: mx.peakThreadCount, threads: infos]
    } else if (section == "cache") {
      def cacheController = spring.getBean("cacheController")
      [className: cacheController.getClass().name, string: cacheController.toString()]
    } else {
      def clusterService = spring.getBean("clusterService")
      [enabled: clusterService.isClusteringEnabled(), nodeId: clusterService.clusterId, nodes: clusterService.getClusterNodes()]
    }
  `);
}

function wrapJson(expression: string): string {
  return `
import de.hybris.platform.core.Registry
import groovy.json.JsonOutput

def __mcp_result
def __mcp_error
def __mcp_thread = new Thread({
  try {
    Registry.activateMasterTenant()
    def spring = Registry.applicationContext
    __mcp_result = (${expression})
  } catch (Throwable t) {
    __mcp_error = [error: t.class.name, message: t.message, stacktrace: org.apache.commons.lang.exception.ExceptionUtils.getStackTrace(t)]
  }
} as Runnable)
__mcp_thread.start()
__mcp_thread.join()
return JsonOutput.toJson(__mcp_error ?: __mcp_result)
`.trim();
}

function gstring(value: string): string {
  return JSON.stringify(value);
}
