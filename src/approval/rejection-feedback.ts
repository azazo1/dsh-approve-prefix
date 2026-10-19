/**
 * 本插件自动拒绝时的模型可见反馈.
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

  /** 只替换宿主把本插件的 rejected 误称为人工拒绝的错误, 不覆盖成功, 取消或其它插件反馈. */
  install(ctx: PluginContext): void {
    ctx.on('tools/pre-execute', async (execution, next) => {
      this.consume(execution)
      return next()
    })
    ctx.on('tools/post-execute', async (execution, result, next) => {
      const message = this.consume(execution)
      const decision = await next()
      if (message === undefined || !result.isError
        || !/^the user rejected (?:escalating |tool ")/.test(result.error?.message ?? '')
        || decision.kind !== 'accept' || decision.content !== undefined || 'value' in decision) return decision
      return {
        kind: 'block',
        feedback: [{ type: 'text', text: `Error: ${message}` }],
        additionalContexts: [...(result.additionalContexts ?? []), ...(decision.additionalContexts ?? [])],
      }
    })
  }
}
