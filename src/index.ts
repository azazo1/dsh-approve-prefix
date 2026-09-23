/**
 * dsh-approve-prefix: 在审批瀑布上按 "单命令前缀" 自动放行沙箱提权请求.
 *
 * 插件做三件事:
 * 1. 在 `tools/pre-execute` 阶段记下每次工具调用的命令原文, 以 callId 为键;
 * 2. 以 `{ prepend: true }` 把应答器插到 `approval/request` 瀑布最前面, 只在命令命中放行
 *    前缀时返回 `allowed-once`, 其余一律 `next()` 交回人工审批 (见 approval/answerer.ts);
 * 3. 注册四条 `/approve-prefix-*` 命令, 管理当前会话的临时前缀.
 *
 * 放行前缀来自三处, 全部由用户显式给出: profile 装配层的静态 `prefixes`, settings 里由配置页
 * 维护的持久前缀, 以及只在当前会话生效的临时前缀. 插件不从审批结果里学任何东西:
 * dsh 的审批接缝只有 `allowed-once` 一个放行结果, 无法区分 "允许一次" 与更长期的授权.
 *
 * 判定失败, 命令取不回或配置非法时都按 "不自动放行" 处理 (fail-closed).
 *
 * @module dsh-approve-prefix
 */

import { installApprovalAnswerer } from './approval/answerer.js'
import { PendingCommands } from './approval/pending-commands.js'
import { createApprovePrefixCommands } from './commands/approve-prefix.js'
import { normalizeConfig } from './config.js'
import type { PluginContext } from './host-types.js'
import { PersistentPrefixes } from './prefix/persistent.js'
import { ApprovePrefixSettingsSchema, SETTINGS_NAMESPACE } from './prefix/settings.js'
import { TemporaryPrefixes } from './prefix/temporary.js'

/** 插件模块名. */
export const name = 'approve-prefix'

/** 从工具调用的解析参数里取命令文本. */
function readCommand(argumentsValue: unknown): string | undefined {
  if (typeof argumentsValue !== 'object' || argumentsValue === null) return undefined
  const command = (argumentsValue as Record<string, unknown>)['command']
  return typeof command === 'string' ? command : undefined
}

/**
 * 安装插件.
 * @param ctx - dsh 的 Cordis Context.
 * @param rawConfig - profile 装配层的 config, 缺省时使用代码默认值.
 */
export function apply(ctx: PluginContext, rawConfig?: unknown): void {
  const config = normalizeConfig(rawConfig)
  const pending = new PendingCommands(config.pendingCapacity)
  const temporary = new TemporaryPrefixes(config.temporaryPrefixLimit)
  let persistent: PersistentPrefixes | undefined

  ctx.on('tools/pre-execute', async (execution, next) => {
    if (config.tools.includes(execution.name)) {
      const command = readCommand(execution.arguments)
      if (command !== undefined) pending.remember(String(execution.callId), command)
    }
    return next()
  })

  installApprovalAnswerer(ctx, { config, pending, temporary, persistent: () => persistent })

  /*
   * settings 与 commands 都要等各自的服务就绪: 没有写进 inject 的服务在 apply 阶段读不到,
   * 直接读会让注册被静默跳过. 两个服务都是可选的, 缺席时插件的主体功能照常工作.
   */
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = settingsCtx.settings
    if (settings === undefined) return
    const store = new PersistentPrefixes(settings.register(SETTINGS_NAMESPACE, ApprovePrefixSettingsSchema))
    persistent = store
    settingsCtx.inject(['commands'], (commandCtx) => {
      const commands = commandCtx.commands
      if (commands === undefined) return
      const definitions = createApprovePrefixCommands({
        staticPrefixes: config.prefixes,
        tools: config.tools,
        persistent: store,
        temporary,
      })
      for (const definition of definitions) commandCtx.effect(() => commands.register(definition))
    })
  })
}
