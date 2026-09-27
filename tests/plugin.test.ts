/**
 * 插件接线测试: 用假 Context 驱动 pre-execute, 审批瀑布与会话前缀 HTTP, 断言放行,
 * 转人工, 持久前缀与会话级临时前缀的各条分支.
 */

import { describe, expect, test } from 'bun:test'

import { APPROVED_PARAMETER_DESCRIPTION } from '../src/approval/approved-schema.ts'
import type {
  ApprovalOutcome,
  ApprovalRequestLike,
  HttpRequestLike,
  HttpResponseLike,
  InjectedContext,
  PromptAssemblyLike,
  PromptSectionLike,
  ToolDefinitionLike,
  ToolExecutionLike,
  WebServerRouteLike,
} from '../src/host-types.ts'
import { apply } from '../src/index.ts'
import type { ApprovePrefixSettings, PersistentPrefixEntry } from '../src/prefix/settings.ts'
import { ALLOW_PREFIX_SECTION_NAME, ALLOW_PREFIX_SECTION_ORDER } from '../src/prompt/allow-prefixes.ts'
import { prefixesPath } from '../src/session-api/paths.ts'

/** 人工拒绝在测试里的占位结果. */
const HUMAN_REJECT: ApprovalOutcome = 'rejected'
/** 人工允许一次在测试里的占位结果. */
const HUMAN_ALLOW: ApprovalOutcome = 'allowed-once'
/** 测试用的两个会话. */
const FIRST_SESSION = 'session-first'
const SECOND_SESSION = 'session-second'
/** 生产默认 prefixes 为空. 需要命中前缀的判定用例必须显式传入. */
const MATCH_PREFIXES = { prefixes: ['gh api'] }

/** 假的 settings 存储, 模拟在配置页面里编辑并跨进程保留的配置. */
interface FakeSettingsStore {
  persistentPrefixes: PersistentPrefixEntry[]
}

/** 假 HTTP 响应. */
interface HttpResult {
  status: number
  headers: Record<string, string>
  body: string
}

/** 假 Context 暴露给测试的驱动接口. */
interface FakeHost {
  /** 走一次 tools/pre-execute, 让插件记下命令. */
  preExecute(execution: { callId: string; command: unknown; name?: string; approved?: unknown }): Promise<unknown>
  /** 走一次 approval/request; humanOutcome 表示下游应答者给出的结果. */
  approve(request: ApprovalRequestLike, humanOutcome?: ApprovalOutcome): Promise<ApprovalOutcome>
  /** 走一次已注册的 HTTP 路由. */
  request(method: string, url: string, init?: { body?: unknown; headers?: Record<string, string> }): Promise<HttpResult>
  /** 之后的请求按这个结果拒绝; undefined 表示过关. */
  setRejection(value: 401 | 403 | undefined): void
  /** 之后的请求拿不到 connection 服务. */
  setConnectionPresent(value: boolean): void
  /** 插件写下的日志. */
  logs: string[]
  /** 当前某工具的 parameters, 用于看 schema 补丁. */
  toolParameters(name: string): unknown
  /** 模拟 bash 重新注册, 触发 tools/change. */
  replaceTool(name: string, parameters: Record<string, unknown>): void
  /** 走一次 system-prompt/assemble, 看发给模型的 schema 补丁. */
  assemble(assembly: PromptAssemblyLike): Promise<PromptAssemblyLike>
  /** 插件注册的系统提示词段. */
  sections: PromptSectionLike[]
}

interface CreateHostOptions {
  webServer?: boolean
  connection?: boolean
}

/** 用最小结构实现 Context, 记录监听器与路由, 并在测试里手动触发. */
function createHost(
  rawConfig?: unknown,
  store: FakeSettingsStore = { persistentPrefixes: [] },
  options: CreateHostOptions = {},
): FakeHost {
  const preExecuteListeners: Array<(execution: ToolExecutionLike, next: () => Promise<unknown>) => Promise<unknown>> = []
  const approvalListeners: Array<(request: ApprovalRequestLike, next: () => Promise<ApprovalOutcome>) => Promise<ApprovalOutcome>> = []
  const changeListeners: Array<() => void> = []
  const assembleListeners: Array<(
    assembly: PromptAssemblyLike,
    context: { agent?: unknown; scope?: unknown },
    next: () => Promise<PromptAssemblyLike>,
  ) => Promise<PromptAssemblyLike>> = []
  const routes: WebServerRouteLike[] = []
  const logs: string[] = []
  const prepended: boolean[] = []
  let rejection: 401 | 403 | undefined
  let connectionPresent = options.connection !== false
  const webEnabled = options.webServer !== false
  const sections: PromptSectionLike[] = []
  const toolRegistry = new Map<string, ToolDefinitionLike>([
    ['bash', { parameters: { type: 'object', properties: { command: { type: 'string' }, description: { type: 'string' } }, required: ['command', 'description'] } }],
    ['pwsh', { parameters: { type: 'object', properties: { command: { type: 'string' }, description: { type: 'string' } }, required: ['command', 'description'] } }],
  ])

  const connectionHandle = {
    requestRejection(): 401 | 403 | undefined {
      return rejection
    },
  }

  /* 自引用: inject 回调把同一个假 Context 交给插件, 于是回调里能读到已就绪的服务属性. */
  const ctx: InjectedContext = {
    get(name: string): unknown {
      if (name === 'connection') return connectionPresent ? connectionHandle : undefined
      if (name === 'tools') return ctx.tools
      return undefined
    },
    tools: {
      get(name: string): ToolDefinitionLike | undefined {
        return toolRegistry.get(name)
      },
    },
    systemPrompt: {
      section(section: PromptSectionLike): () => void {
        sections.push(section)
        return () => {}
      },
    },
    webServer: webEnabled
      ? {
        register(route: WebServerRouteLike): unknown {
          routes.push(route)
          return () => {}
        },
      }
      : undefined,
    on(event: string, listener: unknown, options?: { prepend?: boolean }): unknown {
      if (event === 'tools/pre-execute') preExecuteListeners.push(listener as never)
      if (event === 'tools/change') changeListeners.push(listener as () => void)
      if (event === 'system-prompt/assemble') assembleListeners.push(listener as never)
      if (event === 'approval/request') {
        approvalListeners.push(listener as never)
        prepended.push(options?.prepend === true)
      }
      return () => {}
    },
    inject(dependencies: readonly string[], callback: (context: InjectedContext) => void): unknown {
      const ready = dependencies.every((dep) => {
        if (dep === 'webServer') return webEnabled
        if (dep === 'connection') return connectionPresent
        if (dep === 'tools') return true
        return true
      })
      if (!ready) return undefined
      callback(ctx)
      return undefined
    },
    effect<T>(callback: () => T): T {
      return callback()
    },
    logger: {
      info: (message: string) => { logs.push(message) },
      warn: (message: string) => { logs.push(message) },
      debug: (message: string) => { logs.push(message) },
    },
  }

  const configInput = {
    ...(typeof rawConfig === 'object' && rawConfig !== null ? rawConfig : {}),
    persistentPrefixes: {
      get: (): ApprovePrefixSettings['persistentPrefixes'] =>
        store.persistentPrefixes.map(entry => ({ ...entry })),
    },
  }
  apply(ctx, configInput)
  if (!prepended.every(value => value)) throw new Error('the approval listener must be prepended')

  return {
    logs,
    sections,
    toolParameters(name) {
      return toolRegistry.get(name)?.parameters
    },
    replaceTool(name, parameters) {
      toolRegistry.set(name, { parameters })
      for (const listener of changeListeners) listener()
    },
    async assemble(assembly) {
      let index = 0
      const next = async (): Promise<PromptAssemblyLike> => {
        const listener = assembleListeners[index]
        index += 1
        return listener === undefined ? assembly : listener(assembly, {}, next)
      }
      return next()
    },
    async preExecute(execution) {
      const argumentsValue: Record<string, unknown> = { command: execution.command, description: 'test call' }
      if ('approved' in execution) argumentsValue['approved'] = execution.approved
      const value: ToolExecutionLike = {
        name: execution.name ?? 'bash',
        callId: execution.callId,
        arguments: argumentsValue,
      }
      for (const listener of preExecuteListeners) {
        const result = await listener(value, async () => 'allow')
        if (result !== undefined) return result
      }
      return undefined
    },
    async approve(request, humanOutcome = HUMAN_REJECT) {
      let index = 0
      const next = async (): Promise<ApprovalOutcome> => {
        index += 1
        const listener = approvalListeners[index]
        return listener === undefined ? humanOutcome : listener(request, next)
      }
      const first = approvalListeners[0]
      if (first === undefined) return humanOutcome
      return first(request, next)
    },
    async request(method, url, init) {
      const pathname = url.split('?')[0] ?? url
      const route = matchRoute(routes, pathname)
      if (route === undefined) return { status: 404, headers: {}, body: '' }
      const bodyText = init?.body === undefined ? '' : JSON.stringify(init.body)
      const headers: Record<string, string> = { ...init?.headers }
      if (init?.body !== undefined && headers['content-type'] === undefined) headers['content-type'] = 'application/json'
      const req: HttpRequestLike = {
        method,
        url,
        headers,
        async *[Symbol.asyncIterator]() {
          if (bodyText !== '') yield bodyText
        },
      }
      const state: HttpResult = { status: 0, headers: {}, body: '' }
      const res: HttpResponseLike = {
        writeHead(status, responseHeaders) {
          state.status = status
          state.headers = responseHeaders ?? {}
        },
        end(chunk) {
          state.body = chunk ?? ''
        },
      }
      await route.handler(req, res)
      return state
    },
    setRejection(value) {
      rejection = value
    },
    setConnectionPresent(value) {
      connectionPresent = value
    },
  }
}

function matchRoute(routes: readonly WebServerRouteLike[], pathname: string): WebServerRouteLike | undefined {
  const exact = routes.find(route => route.kind === 'exact' && route.path === pathname)
  if (exact !== undefined) return exact
  let best: WebServerRouteLike | undefined
  for (const route of routes) {
    if (route.kind !== 'prefix') continue
    if (pathname === route.path || pathname.startsWith(`${route.path}/`)) {
      if (best === undefined || route.path.length > best.path.length) best = route
    }
  }
  return best
}

function payloadOf(result: HttpResult): { entries: PersistentPrefixEntry[]; defaultTool: string; limit: number } {
  return JSON.parse(result.body) as { entries: PersistentPrefixEntry[]; defaultTool: string; limit: number }
}

/** 构造一次沙箱提权审批请求. */
function escalation(callId: string, mode = 'danger-full-access', sessionKey: string = FIRST_SESSION): ApprovalRequestLike {
  return {
    toolName: 'bash',
    callId,
    reason: `escalate sandbox to ${mode}: the command needs host credentials`,
    agent: { session: { id: sessionKey } },
  }
}

describe('静态前缀判定', () => {
  test('默认静态前缀为空, 不自动放行 gh api', async () => {
    const host = createHost()
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_REJECT)
    expect(host.logs.some(line => line.includes('auto-approved'))).toBe(false)
  })

  test('放行单条 gh api 的提权请求', async () => {
    const host = createHost(MATCH_PREFIXES)
    await host.preExecute({ callId: 'call-1', command: 'gh api user --jq .login' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_ALLOW)
    expect(host.logs.join('\n')).toContain('auto-approved a sandbox escalation to danger-full-access')
  })

  test('放行带环境变量前缀的单条 gh api 命令', async () => {
    const host = createHost(MATCH_PREFIXES)
    await host.preExecute({ callId: 'call-1', command: 'ENVA=aaa gh api user' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_ALLOW)
  })

  test('带管道或链式的命令转人工', async () => {
    const host = createHost(MATCH_PREFIXES)
    await host.preExecute({ callId: 'call-1', command: 'gh api user | jq .login' })
    await host.preExecute({ callId: 'call-2', command: 'gh api user; rm -rf /tmp/x' })
    await host.preExecute({ callId: 'call-3', command: 'gh api user && gh auth status' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_REJECT)
    expect(await host.approve(escalation('call-2'))).toBe(HUMAN_REJECT)
    expect(await host.approve(escalation('call-3'))).toBe(HUMAN_REJECT)
  })

  test('前缀不匹配的命令转人工', async () => {
    const host = createHost(MATCH_PREFIXES)
    await host.preExecute({ callId: 'call-1', command: 'gh auth status' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_REJECT)
  })

  test('没有记录命令的审批转人工', async () => {
    const host = createHost()
    expect(await host.approve(escalation('call-unknown'))).toBe(HUMAN_REJECT)
  })

  test('白名单之外的提权档位转人工', async () => {
    const host = createHost(MATCH_PREFIXES)
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve(escalation('call-1', 'workspace-write'))).toBe(HUMAN_REJECT)
  })

  test('默认只应答提权请求', async () => {
    const host = createHost(MATCH_PREFIXES)
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve({ toolName: 'bash', callId: 'call-1', reason: 'a policy plugin asks' })).toBe(HUMAN_REJECT)
  })

  test('onlyEscalations 为 false 时也应答普通审批', async () => {
    const host = createHost({ ...MATCH_PREFIXES, onlyEscalations: false })
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve({ toolName: 'bash', callId: 'call-1', reason: 'a policy plugin asks' })).toBe(HUMAN_ALLOW)
  })

  test('自定义前缀与额外拒绝字符生效', async () => {
    const host = createHost({ prefixes: ['gh'] })
    await host.preExecute({ callId: 'call-1', command: 'gh auth status' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_ALLOW)
    const strict = createHost({ ...MATCH_PREFIXES, extraDeniedCharacters: ['-'] })
    await strict.preExecute({ callId: 'call-1', command: 'gh api user --jq .login' })
    expect(await strict.approve(escalation('call-1'))).toBe(HUMAN_REJECT)
  })

  test('未列入 tools 的工具不参与', async () => {
    const host = createHost(MATCH_PREFIXES)
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve({ ...escalation('call-1'), toolName: 'python' })).toBe(HUMAN_REJECT)
  })

  test('一次记录只消费一次', async () => {
    const host = createHost(MATCH_PREFIXES)
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_ALLOW)
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_REJECT)
  })

  test('非法配置在加载时抛错', () => {
    expect(() => createHost({ weird: true })).toThrow(/unknown config key/)
    expect(() => createHost({ allowedEscalationModes: ['full'] })).toThrow(/unknown mode/)
    expect(() => createHost({ allowedEscalationModes: [] })).toThrow(/must not be empty/)
    expect(() => createHost({ tools: [] })).toThrow(/must not be empty/)
    expect(() => createHost({ pendingCapacity: 0 })).toThrow(/pendingCapacity/)
    expect(() => createHost({ temporaryPrefixLimit: 0 })).toThrow(/temporaryPrefixLimit/)
  })
})

describe('模型自报 approved: true', () => {
  test('前缀未命中且写了布尔 true 时直接拒绝, 不转人工', async () => {
    const host = createHost()
    await host.preExecute({ callId: 'call-1', command: 'rm -rf /', approved: true })
    expect(await host.approve(escalation('call-1'), 'cancelled')).toBe('rejected')
  })

  test('前缀未命中但没写 approved 时仍转人工', async () => {
    const host = createHost()
    await host.preExecute({ callId: 'call-1', command: 'rm -rf /' })
    expect(await host.approve(escalation('call-1'), 'cancelled')).toBe('cancelled')
  })

  test('approved 不是布尔 true 时仍转人工', async () => {
    const host = createHost()
    await host.preExecute({ callId: 'call-1', command: 'rm -rf /', approved: 'true' })
    expect(await host.approve(escalation('call-1'), 'cancelled')).toBe('cancelled')
  })

  test('前缀命中时即使写了 approved: true 也放行', async () => {
    const host = createHost(MATCH_PREFIXES)
    await host.preExecute({ callId: 'call-1', command: 'gh api user', approved: true })
    expect(await host.approve(escalation('call-1'), 'cancelled')).toBe(HUMAN_ALLOW)
  })

  test('档位不在白名单时即使写了 approved: true 也转人工', async () => {
    const host = createHost(MATCH_PREFIXES)
    await host.preExecute({ callId: 'call-1', command: 'gh api user', approved: true })
    expect(await host.approve(escalation('call-1', 'workspace-write'), 'cancelled')).toBe('cancelled')
  })

  test('pwsh 同样认 approved: true', async () => {
    const host = createHost({ prefixes: [], tools: ['bash', 'pwsh'] })
    await host.preExecute({ callId: 'call-1', command: 'rm -rf /', name: 'pwsh', approved: true })
    expect(await host.approve({ ...escalation('call-1'), toolName: 'pwsh' }, 'cancelled')).toBe('rejected')
  })

  test('把 approved 补进 bash 的参数 schema', () => {
    const host = createHost()
    const parameters = host.toolParameters('bash') as { properties: { approved: { type: string; description: string } } }
    expect(parameters.properties.approved.type).toBe('boolean')
    expect(parameters.properties.approved.description).toBe(APPROVED_PARAMETER_DESCRIPTION)
    expect((parameters as { required?: string[] }).required).not.toContain('approved')
  })

  test('默认也给已注册的 pwsh 补 approved', () => {
    const host = createHost()
    const parameters = host.toolParameters('pwsh') as { properties: { approved: { type: string } } }
    expect(parameters.properties.approved.type).toBe('boolean')
  })

  test('显式只配 bash 时不改 pwsh', () => {
    const host = createHost({ tools: ['bash'] })
    const parameters = host.toolParameters('pwsh') as { properties: { approved?: unknown } }
    expect(parameters.properties.approved).toBeUndefined()
  })

  test('tools/change 后给重新注册的工具再补一次', () => {
    const host = createHost()
    host.replaceTool('bash', { type: 'object', properties: { command: { type: 'string' } } })
    const parameters = host.toolParameters('bash') as { properties: { approved: { type: string } } }
    expect(parameters.properties.approved.type).toBe('boolean')
  })

  test('assemble 给发给模型的 schema 副本补 approved, 不改其它工具', async () => {
    const host = createHost({ tools: ['bash'] })
    const bashParameters = { type: 'object', properties: { command: { type: 'string' } } }
    const otherParameters = { type: 'object', properties: { path: { type: 'string' } } }
    const assembled = await host.assemble({
      tools: [
        { name: 'bash', parameters: bashParameters },
        { name: 'read', parameters: otherParameters },
      ],
    })
    expect((assembled.tools[0]?.parameters as { properties: { approved: { type: string } } }).properties.approved.type).toBe('boolean')
    expect((assembled.tools[1]?.parameters as { properties: { approved?: unknown } }).properties.approved).toBeUndefined()
  })

  test('assemble 也能补上全局注册表里没有的 bash (agent 平面)', async () => {
    const host = createHost({ tools: ['bash'] })
    host.replaceTool('bash', { type: 'object', properties: { command: { type: 'string' } } })
    const clone = { type: 'object', properties: { command: { type: 'string' } } }
    const assembled = await host.assemble({ tools: [{ name: 'bash', parameters: clone }] })
    expect((assembled.tools[0]?.parameters as { properties: { approved: { type: string } } }).properties.approved.type).toBe('boolean')
  })
})

describe('点击允许一次不会带来自动放行', () => {
  test('人工放行之后, 同类请求仍然转人工', async () => {
    const host = createHost({ prefixes: [] })
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve(escalation('call-1'), HUMAN_ALLOW)).toBe(HUMAN_ALLOW)
    await host.preExecute({ callId: 'call-2', command: 'gh api user' })
    expect(await host.approve(escalation('call-2'))).toBe(HUMAN_REJECT)
    await host.preExecute({ callId: 'call-3', command: 'gh api repos' })
    expect(await host.approve(escalation('call-3'))).toBe(HUMAN_REJECT)
    expect(host.logs.some(line => line.includes('auto-approved'))).toBe(false)
  })

  test('人工拒绝同样不会改变后续判定', async () => {
    const host = createHost({ prefixes: [] })
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve(escalation('call-1'), HUMAN_REJECT)).toBe(HUMAN_REJECT)
    await host.preExecute({ callId: 'call-2', command: 'gh api user' })
    expect(await host.approve(escalation('call-2'))).toBe(HUMAN_REJECT)
  })
})

describe('持久前缀 (来自 settings)', () => {
  test('settings 里的前缀对所有会话生效', async () => {
    const store: FakeSettingsStore = { persistentPrefixes: [{ tool: 'bash', prefix: 'gh api' }] }
    const host = createHost({ prefixes: [] }, store)
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve(escalation('call-1', 'danger-full-access', FIRST_SESSION))).toBe(HUMAN_ALLOW)
    await host.preExecute({ callId: 'call-2', command: 'gh api repos' })
    expect(await host.approve(escalation('call-2', 'danger-full-access', SECOND_SESSION))).toBe(HUMAN_ALLOW)
  })

  test('settings 变更立即生效, 不需要重启', async () => {
    const store: FakeSettingsStore = { persistentPrefixes: [] }
    const host = createHost({ prefixes: [] }, store)
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_REJECT)
    store.persistentPrefixes = [{ tool: 'bash', prefix: 'gh api' }]
    await host.preExecute({ callId: 'call-2', command: 'gh api user' })
    expect(await host.approve(escalation('call-2'))).toBe(HUMAN_ALLOW)
  })

  test('持久前缀只匹配对应工具', async () => {
    const store: FakeSettingsStore = { persistentPrefixes: [{ tool: 'pwsh', prefix: 'gh api' }] }
    const host = createHost({ prefixes: [], tools: ['bash', 'pwsh'] }, store)
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_REJECT)
  })
})

describe('会话级临时前缀', () => {
  test('临时前缀只对写入的那个会话生效', async () => {
    const store: FakeSettingsStore = { persistentPrefixes: [] }
    const host = createHost({ prefixes: [] }, store)
    const put = await host.request('PUT', prefixesPath(FIRST_SESSION), { body: { entries: [{ tool: 'bash', prefix: 'gh api' }] } })
    expect(put.status).toBe(200)
    expect(store.persistentPrefixes).toEqual([])
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve(escalation('call-1', 'danger-full-access', FIRST_SESSION))).toBe(HUMAN_ALLOW)
    await host.preExecute({ callId: 'call-2', command: 'gh api user' })
    expect(await host.approve(escalation('call-2', 'danger-full-access', SECOND_SESSION))).toBe(HUMAN_REJECT)
  })

  test('临时前缀不跨实例保留', async () => {
    const store: FakeSettingsStore = { persistentPrefixes: [] }
    const first = createHost({ prefixes: [] }, store)
    await first.request('PUT', prefixesPath(FIRST_SESSION), { body: { entries: [{ tool: 'bash', prefix: 'gh api' }] } })
    await first.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await first.approve(escalation('call-1'))).toBe(HUMAN_ALLOW)

    const restarted = createHost({ prefixes: [] }, store)
    await restarted.preExecute({ callId: 'call-2', command: 'gh api user' })
    expect(await restarted.approve(escalation('call-2'))).toBe(HUMAN_REJECT)
  })

  test('临时写入不会改动 settings', async () => {
    const store: FakeSettingsStore = { persistentPrefixes: [{ tool: 'bash', prefix: 'gh api' }] }
    const host = createHost({ prefixes: [] }, store)
    await host.request('PUT', prefixesPath(FIRST_SESSION), { body: { entries: [{ tool: 'bash', prefix: 'npm run' }] } })
    await host.request('PUT', prefixesPath(FIRST_SESSION), { body: { entries: [] } })
    expect(store.persistentPrefixes).toEqual([{ tool: 'bash', prefix: 'gh api' }])
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_ALLOW)
  })

  test('PUT 清空只影响当前会话', async () => {
    const store: FakeSettingsStore = { persistentPrefixes: [] }
    const host = createHost({ prefixes: [] }, store)
    await host.request('PUT', prefixesPath(FIRST_SESSION), { body: { entries: [{ tool: 'bash', prefix: 'npm run' }] } })
    await host.request('PUT', prefixesPath(SECOND_SESSION), { body: { entries: [{ tool: 'bash', prefix: 'npm run' }] } })
    expect((await host.request('PUT', prefixesPath(FIRST_SESSION), { body: { entries: [] } })).status).toBe(200)
    await host.preExecute({ callId: 'call-1', command: 'npm run build' })
    expect(await host.approve(escalation('call-1', 'danger-full-access', FIRST_SESSION))).toBe(HUMAN_REJECT)
    await host.preExecute({ callId: 'call-2', command: 'npm run build' })
    expect(await host.approve(escalation('call-2', 'danger-full-access', SECOND_SESSION))).toBe(HUMAN_ALLOW)
  })

  test('可以用非默认工具名写入临时前缀', async () => {
    const store: FakeSettingsStore = { persistentPrefixes: [] }
    const host = createHost({ prefixes: [], tools: ['bash', 'custom'] }, store)
    expect((await host.request('PUT', prefixesPath(FIRST_SESSION), { body: { entries: [{ tool: 'custom', prefix: 'gh api' }] } })).status).toBe(200)
    await host.preExecute({ callId: 'call-1', command: 'gh api user', name: 'custom' })
    expect(await host.approve({ ...escalation('call-1'), toolName: 'custom' })).toBe(HUMAN_ALLOW)
    await host.preExecute({ callId: 'call-2', command: 'gh api user' })
    expect(await host.approve(escalation('call-2'))).toBe(HUMAN_REJECT)
  })
})

describe('系统提示词', () => {
  function render(section: PromptSectionLike, sessionKey?: string): string {
    if (typeof section.text !== 'function') return section.text
    return section.text(sessionKey === undefined ? {} : { agent: { session: { id: sessionKey } } })
  }

  test('列出静态, 持久和当前会话临时前缀, 并说明 approved', async () => {
    const store: FakeSettingsStore = {
      persistentPrefixes: [{ tool: 'bash', prefix: 'git status' }],
    }
    const host = createHost({ prefixes: ['gh api'], tools: ['bash', 'pwsh'] }, store)
    expect(host.sections).toHaveLength(1)
    const section = host.sections[0]
    expect(section?.name).toBe(ALLOW_PREFIX_SECTION_NAME)
    expect(section?.order).toBe(ALLOW_PREFIX_SECTION_ORDER)
    expect(section?.interpolate).toBe(false)
    if (section === undefined) return

    const first = render(section, FIRST_SESSION)
    expect(first).toContain('`gh api`')
    expect(first).toContain('`git status` (saved)')
    expect(first).toContain('approved:')
    expect(first).toContain('one simple command')
    expect(first).not.toContain('npm test')

    const put = await host.request('PUT', prefixesPath(FIRST_SESSION), {
      body: { entries: [{ tool: 'bash', prefix: 'npm test' }] },
    })
    expect(put.status).toBe(200)
    const updated = render(section, FIRST_SESSION)
    expect(updated).toContain('`npm test` (this session)')
    expect(render(section, SECOND_SESSION)).not.toContain('npm test')
    expect(render(section)).not.toContain('npm test')

    store.persistentPrefixes = []
    expect(render(section, FIRST_SESSION)).not.toContain('git status')
    expect(render(section, FIRST_SESSION)).toContain('pwsh:')
    expect(render(section, FIRST_SESSION)).toContain('parsed by local pwsh')
  })

  test('提示词不列出注册表里没有的工具', () => {
    const host = createHost({ tools: ['bash', 'missing'] })
    const section = host.sections[0]
    expect(section).toBeDefined()
    if (section === undefined || typeof section.text !== 'function') return
    const text = section.text({ agent: { session: { id: FIRST_SESSION } } })
    expect(text).toContain('- bash:')
    expect(text).toContain('- none')
    expect(text).not.toContain('missing')
    expect(text).not.toContain('gh api')
    expect(text).not.toContain('/usr/bin/gh')
  })
})

describe('会话临时前缀 HTTP', () => {
  test('鉴权拒绝时不改表', async () => {
    const host = createHost({ prefixes: [] })
    host.setRejection(401)
    const denied = await host.request('PUT', prefixesPath(FIRST_SESSION), { body: { entries: [{ tool: 'bash', prefix: 'gh api' }] } })
    expect(denied.status).toBe(401)
    host.setRejection(undefined)
    const listed = await host.request('GET', prefixesPath(FIRST_SESSION))
    expect(listed.status).toBe(200)
    expect(payloadOf(listed).entries).toEqual([])
  })

  test('connection 缺席 fail-closed 为 503', async () => {
    const host = createHost({ prefixes: [] })
    host.setConnectionPresent(false)
    const result = await host.request('GET', prefixesPath(FIRST_SESSION))
    expect(result.status).toBe(503)
  })

  test('GET 与 PUT 读写同一会话, 跨会话互不可见', async () => {
    const host = createHost({ prefixes: [] })
    const put = await host.request('PUT', prefixesPath(FIRST_SESSION), { body: { entries: [{ tool: 'bash', prefix: 'gh api' }] } })
    expect(put.status).toBe(200)
    expect(payloadOf(put).entries).toEqual([{ tool: 'bash', prefix: 'gh api' }])
    expect(payloadOf(put).defaultTool).toBe('bash')
    expect(payloadOf(put).limit).toBe(32)
    const other = await host.request('GET', prefixesPath(SECOND_SESSION))
    expect(payloadOf(other).entries).toEqual([])
    const same = await host.request('GET', prefixesPath(FIRST_SESSION))
    expect(payloadOf(same).entries).toEqual([{ tool: 'bash', prefix: 'gh api' }])
  })

  test('非法前缀 400 且不改表', async () => {
    const host = createHost({ prefixes: [] })
    await host.request('PUT', prefixesPath(FIRST_SESSION), { body: { entries: [{ tool: 'bash', prefix: 'gh api' }] } })
    const invalid = await host.request('PUT', prefixesPath(FIRST_SESSION), { body: { entries: [{ tool: 'bash', prefix: 'gh api | jq' }] } })
    expect(invalid.status).toBe(400)
    const listed = await host.request('GET', prefixesPath(FIRST_SESSION))
    expect(payloadOf(listed).entries).toEqual([{ tool: 'bash', prefix: 'gh api' }])
  })

  test('超限拒绝且不改表', async () => {
    const host = createHost({ prefixes: [], temporaryPrefixLimit: 1 })
    await host.request('PUT', prefixesPath(FIRST_SESSION), { body: { entries: [{ tool: 'bash', prefix: 'gh api' }] } })
    const over = await host.request('PUT', prefixesPath(FIRST_SESSION), {
      body: { entries: [{ tool: 'bash', prefix: 'gh api' }, { tool: 'bash', prefix: 'npm run' }] },
    })
    expect(over.status).toBe(400)
    const listed = await host.request('GET', prefixesPath(FIRST_SESSION))
    expect(payloadOf(listed).entries).toEqual([{ tool: 'bash', prefix: 'gh api' }])
  })

  test('对不上的会话路径是 404', async () => {
    const host = createHost({ prefixes: [] })
    const missing = await host.request('GET', '/api/plugins/dsh-approve-prefix/sessions')
    expect(missing.status).toBe(404)
    const badId = await host.request('GET', '/api/plugins/dsh-approve-prefix/sessions/not valid/prefixes')
    expect(badId.status).toBe(404)
  })

  test('没有 webServer 时审批照常', async () => {
    const host = createHost({ prefixes: ['gh api'] }, { persistentPrefixes: [] }, { webServer: false })
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_ALLOW)
    const listed = await host.request('GET', prefixesPath(FIRST_SESSION))
    expect(listed.status).toBe(404)
  })
})
