/**
 * 从 agent 视图里取会话标识.
 *
 * dsh 的命令调用与审批请求都会带上 agent, 而 agent 持有它驱动的 session.
 * 会话内的临时状态以 session.id 为键, 因此同一个进程里的不同会话互不影响.
 *
 * @module dsh-approve-prefix/prefix/session-key
 */
/**
 * 取一个 agent 视图所属会话的标识.
 * @param agent - 审批请求或命令调用携带的 agent, 可能是 undefined.
 * @returns 会话 id, 取不到时返回 undefined.
 */
export function sessionKeyOf(agent) {
    if (typeof agent !== 'object' || agent === null)
        return undefined;
    const session = agent['session'];
    if (typeof session !== 'object' || session === null)
        return undefined;
    const id = session['id'];
    return typeof id === 'string' && id !== '' ? id : undefined;
}
//# sourceMappingURL=session-key.js.map