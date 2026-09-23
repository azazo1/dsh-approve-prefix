/**
 * 插件接线测试: 用假 Context 驱动 pre-execute 与审批瀑布, 断言放行, 转人工, 持久前缀与
 * 会话级临时前缀的各条分支.
 */

import { describe, expect, test } from 'bun:test'

import type {
  ApprovalOutcome,
  ApprovalRequestLike,
  CommandDefinitionLike,
  CommandResultLike,
  InjectedContext,
  ToolExecutionLike,
} from '../src/host-types.ts'
import { apply } from '../src/index.ts'
import type { ApprovePrefixSettings, PersistentPrefixEntry } from '../src/prefix/settings.ts'

/** 人工拒绝在测试里的占位结果. */
const HUMAN_REJECT: ApprovalOutcome = 'rejected'
/** 人工允许一次在测试里的占位结果. */
const HUMAN_ALLOW: ApprovalOutcome = 'allowed-once'
/** 测试用的两个会话. */
const FIRST_SESSION = 'session-first'
const SECOND_SESSION = 'session-second'

/** 假的 settings 存储, 模拟在配置页面里编辑并跨进程保留的配置. */
interface FakeSettingsStore {
  persistentPrefixes: PersistentPrefixEntry[]
}

/** 假 Context 暴露给测试的驱动接口. */
interface FakeHost {
  /** 走一次 tools/pre-execute, 让插件记下命令. */
  preExecute(execution: { callId: string; command: unknown; name?: string }): Promise<unknown>
  /** 走一次 approval/request; humanOutcome 表示下游应答者给出的结果. */
  approve(request: ApprovalRequestLike, humanOutcome?: ApprovalOutcome): Promise<ApprovalOutcome>
  /** 执行插件注册的斜杠命令; sessionKey 传 null 表示这次调用没有会话身份. */
  runCommand(name: string, rawInput?: string, sessionKey?: string | null): Promise<CommandResultLike>
  /** 插件注册的命令名. */
  commandNames(): string[]
  /** 插件写下的日志. */
  logs: string[]
}

/** 用最小结构实现 Context, 记录监听器与命令, 并在测试里手动触发. */
function createHost(rawConfig?: unknown, store: FakeSettingsStore = { persistentPrefixes: [] }): FakeHost {
  const preExecuteListeners: Array<(execution: ToolExecutionLike, next: () => Promise<unknown>) => Promise<unknown>> = []
  const approvalListeners: Array<(request: ApprovalRequestLike, next: () => Promise<ApprovalOutcome>) => Promise<ApprovalOutcome>> = []
  const commands: CommandDefinitionLike[] = []
  const logs: string[] = []
  const prepended: boolean[] = []


  /* 自引用: inject 回调把同一个假 Context 交给插件, 于是回调里能读到已就绪的服务属性. */
  const ctx: InjectedContext = {
    commands: {
      register(definition: CommandDefinitionLike): unknown {
        commands.push(definition)
        return () => {}
      },
    },
    on(event: string, listener: unknown, options?: { prepend?: boolean }): unknown {
      if (event === 'tools/pre-execute') preExecuteListeners.push(listener as never)
      if (event === 'approval/request') {
        approvalListeners.push(listener as never)
        prepended.push(options?.prepend === true)
      }
      return () => {}
    },
    inject(_dependencies: readonly string[], callback: (context: InjectedContext) => void): unknown {
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
    async preExecute(execution) {
      const value: ToolExecutionLike = {
        name: execution.name ?? 'bash',
        callId: execution.callId,
        arguments: { command: execution.command, description: 'test call' },
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
    async runCommand(name, rawInput = '', sessionKey = FIRST_SESSION as string | null) {
      const definition = commands.find(candidate => candidate.name === name)
      if (definition === undefined) throw new Error(`the plugin registered no ${name} command`)
      return definition.handler({ rawInput, agent: sessionKey === null ? undefined : { session: { id: sessionKey } } })
    },
    commandNames() {
      return commands.map(definition => definition.name)
    },
  }
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
  test('放行单条 gh api 的提权请求', async () => {
    const host = createHost()
    await host.preExecute({ callId: 'call-1', command: 'gh api user --jq .login' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_ALLOW)
    expect(host.logs.join('\n')).toContain('auto-approved a sandbox escalation to danger-full-access')
  })

  test('放行带环境变量前缀的单条 gh api 命令', async () => {
    const host = createHost()
    await host.preExecute({ callId: 'call-1', command: 'ENVA=aaa gh api user' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_ALLOW)
  })

  test('带管道或链式的命令转人工', async () => {
    const host = createHost()
    await host.preExecute({ callId: 'call-1', command: 'gh api user | jq .login' })
    await host.preExecute({ callId: 'call-2', command: 'gh api user; rm -rf /tmp/x' })
    await host.preExecute({ callId: 'call-3', command: 'gh api user && gh auth status' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_REJECT)
    expect(await host.approve(escalation('call-2'))).toBe(HUMAN_REJECT)
    expect(await host.approve(escalation('call-3'))).toBe(HUMAN_REJECT)
  })

  test('前缀不匹配的命令转人工', async () => {
    const host = createHost()
    await host.preExecute({ callId: 'call-1', command: 'gh auth status' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_REJECT)
  })

  test('没有记录命令的审批转人工', async () => {
    const host = createHost()
    expect(await host.approve(escalation('call-unknown'))).toBe(HUMAN_REJECT)
  })

  test('白名单之外的提权档位转人工', async () => {
    const host = createHost()
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve(escalation('call-1', 'workspace-write'))).toBe(HUMAN_REJECT)
  })

  test('默认只应答提权请求', async () => {
    const host = createHost()
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve({ toolName: 'bash', callId: 'call-1', reason: 'a policy plugin asks' })).toBe(HUMAN_REJECT)
  })

  test('onlyEscalations 为 false 时也应答普通审批', async () => {
    const host = createHost({ onlyEscalations: false })
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve({ toolName: 'bash', callId: 'call-1', reason: 'a policy plugin asks' })).toBe(HUMAN_ALLOW)
  })

  test('自定义前缀与额外拒绝字符生效', async () => {
    const host = createHost({ prefixes: ['gh'] })
    await host.preExecute({ callId: 'call-1', command: 'gh auth status' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_ALLOW)
    const strict = createHost({ extraDeniedCharacters: ['-'] })
    await strict.preExecute({ callId: 'call-1', command: 'gh api user --jq .login' })
    expect(await strict.approve(escalation('call-1'))).toBe(HUMAN_REJECT)
  })

  test('非 bash 工具不参与', async () => {
    const host = createHost()
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve({ ...escalation('call-1'), toolName: 'pwsh' })).toBe(HUMAN_REJECT)
  })

  test('一次记录只消费一次', async () => {
    const host = createHost()
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
  test('临时前缀只对执行命令的那个会话生效', async () => {
    const store: FakeSettingsStore = { persistentPrefixes: [] }
    const host = createHost({ prefixes: [] }, store)
    expect((await host.runCommand('approve-prefix-add', 'gh api', FIRST_SESSION)).kind).toBe('success')
    expect(store.persistentPrefixes).toEqual([])
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve(escalation('call-1', 'danger-full-access', FIRST_SESSION))).toBe(HUMAN_ALLOW)
    await host.preExecute({ callId: 'call-2', command: 'gh api user' })
    expect(await host.approve(escalation('call-2', 'danger-full-access', SECOND_SESSION))).toBe(HUMAN_REJECT)
  })

  test('临时前缀不跨实例保留', async () => {
    const store: FakeSettingsStore = { persistentPrefixes: [] }
    const first = createHost({ prefixes: [] }, store)
    await first.runCommand('approve-prefix-add', 'gh api')
    await first.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await first.approve(escalation('call-1'))).toBe(HUMAN_ALLOW)

    const restarted = createHost({ prefixes: [] }, store)
    await restarted.preExecute({ callId: 'call-2', command: 'gh api user' })
    expect(await restarted.approve(escalation('call-2'))).toBe(HUMAN_REJECT)
  })

  test('临时命令不会改动 settings', async () => {
    const store: FakeSettingsStore = { persistentPrefixes: [{ tool: 'bash', prefix: 'gh api' }] }
    const host = createHost({ prefixes: [] }, store)
    await host.runCommand('approve-prefix-add', 'npm run')
    await host.runCommand('approve-prefix-rm', 'npm run')
    await host.runCommand('approve-prefix-clear')
    expect(store.persistentPrefixes).toEqual([{ tool: 'bash', prefix: 'gh api' }])
    await host.preExecute({ callId: 'call-1', command: 'gh api user' })
    expect(await host.approve(escalation('call-1'))).toBe(HUMAN_ALLOW)
  })

  test('rm 与 clear 只影响当前会话', async () => {
    const store: FakeSettingsStore = { persistentPrefixes: [] }
    const host = createHost({ prefixes: [] }, store)
    await host.runCommand('approve-prefix-add', 'npm run', FIRST_SESSION)
    await host.runCommand('approve-prefix-add', 'npm run', SECOND_SESSION)
    expect((await host.runCommand('approve-prefix-rm', 'npm run', FIRST_SESSION)).kind).toBe('success')
    await host.preExecute({ callId: 'call-1', command: 'npm run build' })
    expect(await host.approve(escalation('call-1', 'danger-full-access', FIRST_SESSION))).toBe(HUMAN_REJECT)
    await host.preExecute({ callId: 'call-2', command: 'npm run build' })
    expect(await host.approve(escalation('call-2', 'danger-full-access', SECOND_SESSION))).toBe(HUMAN_ALLOW)

    await host.runCommand('approve-prefix-clear', '', SECOND_SESSION)
    await host.preExecute({ callId: 'call-3', command: 'npm run build' })
    expect(await host.approve(escalation('call-3', 'danger-full-access', SECOND_SESSION))).toBe(HUMAN_REJECT)
  })

  test('命令调用没有会话身份时拒绝临时操作', async () => {
    const host = createHost({ prefixes: [] })
    expect((await host.runCommand('approve-prefix-add', 'gh api', null)).kind).toBe('error')
    expect((await host.runCommand('approve-prefix-rm', 'gh api', null)).kind).toBe('error')
    expect((await host.runCommand('approve-prefix-clear', '', null)).kind).toBe('error')
  })
})

describe('/approve-prefix-* 命令', () => {
  test('只注册 add / rm / list / clear 四条会话级命令', () => {
    const host = createHost()
    expect(host.commandNames()).toEqual([
      'approve-prefix-add',
      'approve-prefix-rm',
      'approve-prefix-list',
      'approve-prefix-clear',
    ])
  })

  test('list 同时给出静态, 持久与当前会话的条目', async () => {
    const store: FakeSettingsStore = { persistentPrefixes: [{ tool: 'bash', prefix: 'gh pr view' }] }
    const host = createHost({ prefixes: ['gh api'] }, store)
    await host.runCommand('approve-prefix-add', 'npm run')
    const result = await host.runCommand('approve-prefix-list')
    expect(result.kind).toBe('success')
    expect(result.text).toContain('gh api')
    expect(result.text).toContain('bash: gh pr view')
    expect(result.text).toContain('bash: npm run')
  })

  test('add 与 rm 回显当前会话的条目', async () => {
    const host = createHost({ prefixes: [] })
    const added = await host.runCommand('approve-prefix-add', 'gh api')
    expect(added.kind).toBe('success')
    expect(added.text).toContain('bash: gh api')
    const removed = await host.runCommand('approve-prefix-rm', 'gh api')
    expect(removed.kind).toBe('success')
    expect(removed.text).toContain('(无)')
  })

  test('临时命令可以用 tool: prefix 指定工具', async () => {
    const store: FakeSettingsStore = { persistentPrefixes: [] }
    const host = createHost({ prefixes: [], tools: ['bash', 'pwsh'] }, store)
    expect((await host.runCommand('approve-prefix-add', 'pwsh: gh api')).kind).toBe('success')
    await host.preExecute({ callId: 'call-1', command: 'gh api user', name: 'pwsh' })
    expect(await host.approve({ ...escalation('call-1'), toolName: 'pwsh' })).toBe(HUMAN_ALLOW)
    await host.preExecute({ callId: 'call-2', command: 'gh api user' })
    expect(await host.approve(escalation('call-2'))).toBe(HUMAN_REJECT)
  })

  test('参数缺失或非法时返回错误', async () => {
    const host = createHost()
    expect((await host.runCommand('approve-prefix-add')).kind).toBe('error')
    expect((await host.runCommand('approve-prefix-add', 'gh api | jq')).kind).toBe('error')
    expect((await host.runCommand('approve-prefix-rm', 'gh api')).kind).toBe('error')
    expect((await host.runCommand('approve-prefix-list', 'extra')).kind).toBe('error')
    expect((await host.runCommand('approve-prefix-clear', 'extra')).kind).toBe('error')
  })
})
