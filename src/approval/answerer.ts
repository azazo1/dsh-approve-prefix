/**
 * 审批应答: 决定要不要替人工放行这次沙箱提权请求.
 *
 * 判定条件按固定顺序排在一处, 便于逐条核对 (全部满足才放行):
 * 1. 请求来自 `tools` 里配置的工具;
 * 2. 要么请求确实是沙箱提权且目标档位在 `allowedEscalationModes` 内, 要么 `onlyEscalations` 为 false;
 * 3. 命令能按 callId 取回 (记录只消费一次);
 * 4. 命令是单条简单命令, 且 argv 前缀命中静态, 持久或本会话临时前缀之一.
 *
 * 任何一条不满足都 `next()`, 把请求交给下游的人工审批, 既不返回拒绝, 也不改动审批结果.
 * 插件不读审批结果: 放行只有 `allowed-once` 一个词, 从结果里归纳前缀等于让 "允许一次"
 * 变成自动放行.
 *
 * @module dsh-approve-prefix/approval/answerer
 */

import type { PluginConfig } from '../config.js'
import type { ApprovalOutcome, ApprovalRequestLike, PluginContext } from '../host-types.js'
import { judgeSingleCommandPrefix } from '../prefix/judge.js'
import type { PersistentPrefixes } from '../prefix/persistent.js'
import { sessionKeyOf } from '../prefix/session-key.js'
import type { TemporaryPrefixes } from '../prefix/temporary.js'
import { parseEscalationMode } from './escalation.js'
import type { PendingCommands } from './pending-commands.js'

/** 日志里命令文本的最大长度. */
const COMMAND_LOG_LIMIT = 200

/** 截断过长的命令文本, 避免日志被超长参数灌满. */
function shortenCommand(command: string): string {
  return command.length <= COMMAND_LOG_LIMIT ? command : `${command.slice(0, COMMAND_LOG_LIMIT)}...`
}

/** 一次审批应答的判定输入. */
export interface ApprovalDecisionInput {
  /** 从审批理由解析出的提权目标档位, 不是提权请求时为 undefined. */
  readonly escalationMode: string | undefined
  /** 按 callId 取回的命令原文, 取不到时为 undefined. */
  readonly command: string | undefined
  /** 该次请求可用的全部放行前缀 (静态 + 持久 + 本会话临时). */
  readonly prefixes: readonly string[]
  /** 插件配置. */
  readonly config: PluginConfig
}

/** 判定结果. */
export interface ApprovalDecision {
  /** 是否替人工放行. */
  readonly autoApprove: boolean
  /** 判定依据的简短说明, 用于日志与人工排查. */
  readonly detail: string
}

/**
 * 判定一次审批请求是否自动放行.
 * @param input - 判定输入.
 * @returns 判定结果, `autoApprove` 为 false 时应把请求交给下游.
 */
export function decideApproval(input: ApprovalDecisionInput): ApprovalDecision {
  const { escalationMode, command, config } = input
  if (escalationMode === undefined && config.onlyEscalations) {
    return { autoApprove: false, detail: 'not a sandbox escalation' }
  }
  if (escalationMode !== undefined && !config.allowedEscalationModes.includes(escalationMode)) {
    return { autoApprove: false, detail: `escalation to "${escalationMode}" is not configured as auto-approvable` }
  }
  if (command === undefined) return { autoApprove: false, detail: 'no remembered command for this call' }
  const verdict = judgeSingleCommandPrefix(command, input.prefixes, config.extraDeniedCharacters)
  return { autoApprove: verdict.allowed, detail: verdict.detail }
}

/** 应答器需要的宿主状态. */
export interface ApprovalAnswererDeps {
  /** 插件配置. */
  readonly config: PluginConfig
  /** callId 到命令原文的记录表. */
  readonly pending: PendingCommands
  /** 会话级临时前缀表. */
  readonly temporary: TemporaryPrefixes
  /** settings 服务就绪后才有值, 未就绪时按没有持久前缀处理. */
  readonly persistent: () => PersistentPrefixes | undefined
}

/**
 * 把应答器以 `prepend` 方式插到审批瀑布最前面, 抢在人工卡片之前应答.
 * @param ctx - dsh 的 Cordis Context.
 * @param deps - 应答器需要的宿主状态.
 */
export function installApprovalAnswerer(ctx: PluginContext, deps: ApprovalAnswererDeps): void {
  const { config } = deps

  /** 只在 debug 打开时输出转人工的细节. */
  const debug = (message: string): void => {
    if (!config.debug) return
    if (ctx.logger.debug !== undefined) ctx.logger.debug(message)
    else ctx.logger.info(message)
  }

  ctx.on('approval/request', async (request: ApprovalRequestLike, next): Promise<ApprovalOutcome> => {
    if (!config.tools.includes(request.toolName)) return next()
    const escalationMode = parseEscalationMode(request.reason)
    const command = request.callId === undefined ? undefined : deps.pending.consume(String(request.callId))
    const prefixes = [
      ...config.prefixes,
      ...(deps.persistent()?.forTool(request.toolName) ?? []),
      ...deps.temporary.forTool(sessionKeyOf(request.agent), request.toolName),
    ]
    const decision = decideApproval({ escalationMode, command, prefixes, config })

    if (!decision.autoApprove) {
      const subject = command === undefined ? '(no remembered command)' : shortenCommand(command)
      debug(`dsh-approve-prefix: delegating a ${request.toolName} approval: ${decision.detail}; command: ${subject}`)
      return next()
    }

    const subject = escalationMode === undefined ? 'an approval ask' : `a sandbox escalation to ${escalationMode}`
    ctx.logger.info(`dsh-approve-prefix: auto-approved ${subject}: ${decision.detail}; command: ${shortenCommand(command ?? '')}`)
    return 'allowed-once'
  }, { prepend: true })
}
