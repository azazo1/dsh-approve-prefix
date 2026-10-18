/**
 * 工具反馈的改写: 本插件自动拒绝时的说明, 以及宿主 "拒绝即终结" 尾句的替换.
 * 审批仍只返回 rejected, 原因经 post-execute 关联到同一次失败调用.
 * @module dsh-approve-prefix/approval/rejection-feedback
 */

import type { ApprovalRequestLike, PluginContext, ToolExecutionLike } from '../host-types.js'
import { sessionKeyOf } from '../prefix/session-key.js'

/** 与 night 系统提示词一致的拒绝后指引. */
export const NIGHT_REJECTION_GUIDANCE
  = 'Night mode is on for this session. The user is away and will not answer. '
    + 'Do not retry expecting a human dialog. Decide what you can, finish other work, and report what remains blocked.'

/** 自检失败不是人工拒绝, 也不能据此推断 night 已开启. */
export function selfCheckRejection(detail: string, night: boolean): string {
  return 'Rejected automatically by dsh-approve-prefix: approved: true claimed that this command matched an allow prefix, '
    + `but the prefix check failed: ${detail}. This is not a human rejection. `
    + (night
      ? `${NIGHT_REJECTION_GUIDANCE} Omitting approved does not bypass Night mode.`
      : 'Night mode is off for this session. approved is a self-check, not a request for approval. '
        + 'To request human approval for this command, omit approved; a real prefix match is auto-approved either way.')
}

/** 宿主把拒绝一律描述成人工拒绝的开头, 认领本插件自己拒绝时也靠它. */
const HOST_REJECTION_PREFIX = /^the user rejected (?:escalating |tool ")/

/**
 * 宿主拒绝沙箱提权的整句: 前段与主体词被捕获, 尾句必须逐字一致.
 * 尾句由 dsh-sandbox 的 approveEscalation 固定, 它一变说明宿主改了措辞.
 */
const HOST_ESCALATION_REJECTION
  = /^(the user rejected escalating this (\S+) to "[^"]+"); it stays denied, so stop and explain instead of working around it$/

/**
 * 把宿主 "拒绝即终结" 的尾句换成允许重新阐述后再发起的表述.
 * 只认领逐字相同的宿主文案: 尾句变了就原样放行, 不猜宿主的新意思.
 * @param message - 宿主给出的工具错误文本.
 * @returns 改写后的整句, 不是这句宿主文案时返回 undefined.
 */
export function retryableRejection(message: string): string | undefined {
  const match = HOST_ESCALATION_REJECTION.exec(message)
  if (match === null) return undefined
  const head = match[1]
  const subject = match[2]
  if (head === undefined || subject === undefined) return undefined
  return `${head}; if this ${subject} is still necessary, `
    + 're-request it with a clearer justification, though a repeat ask may be rejected again'
}

/** 有界的一次性反馈表, 以会话, 工具名和 callId 共同关联, 不替其它拒绝原因下结论. */
export class RejectionFeedback {
  readonly #entries = new Map<string, string>()

  constructor(private readonly capacity: number) {}

  private key(agent: unknown, toolName: string, callId: string | undefined): string | undefined {
    const session = sessionKeyOf(agent)
    return session === undefined || callId === undefined ? undefined : JSON.stringify([session, toolName, callId])
  }

  /** 只有插件已经决定拒绝时才记录, 不参与审批判定. */
  remember(request: ApprovalRequestLike, message: string): void {
    const key = this.key(request.agent, request.toolName, request.callId)
    if (key === undefined) return
    if (!this.#entries.has(key) && this.#entries.size >= this.capacity) {
      const oldest = this.#entries.keys().next()
      if (!oldest.done) this.#entries.delete(oldest.value)
    }
    this.#entries.set(key, message)
  }

  private consume(execution: ToolExecutionLike): string | undefined {
    const key = this.key(execution.agent, execution.name, execution.callId)
    if (key === undefined) return undefined
    const message = this.#entries.get(key)
    this.#entries.delete(key)
    return message
  }

  /** 该次失败调用要替换成的文本: 插件自己的拒绝说明优先, 否则只换宿主的终结尾句. */
  private replacement(message: string | undefined, host: string): string | undefined {
    if (message === undefined) return retryableRejection(host)
    return HOST_REJECTION_PREFIX.test(host) ? message : undefined
  }

  /** 只改写拒绝类错误: 插件自动拒绝的整段, 或任何来源拒绝时的宿主终结尾句. */
  install(ctx: PluginContext): void {
    ctx.on('tools/pre-execute', async (execution, next) => {
      this.consume(execution)
      return next()
    })
    ctx.on('tools/post-execute', async (execution, result, next) => {
      const message = this.consume(execution)
      const decision = await next()
      if (!result.isError || decision.kind !== 'accept'
        || decision.content !== undefined || 'value' in decision) return decision
      const text = this.replacement(message, result.error?.message ?? '')
      if (text === undefined) return decision
      return {
        kind: 'block',
        feedback: [{ type: 'text', text: `Error: ${text}` }],
        additionalContexts: [...(result.additionalContexts ?? []), ...(decision.additionalContexts ?? [])],
      }
    })
  }
}
