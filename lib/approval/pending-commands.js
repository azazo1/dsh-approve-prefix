/**
 * callId 到命令文本的短期映射.
 *
 * 提权审批请求只带 toolName 与 reason, 命令原文必须在 tools/pre-execute 阶段记下,
 * 到审批阶段按 callId 取回. 映射有容量上限, 超限时淘汰最旧的一条, 避免长会话里无界增长;
 * 每条记录只消费一次, 同一个 callId 的第二次审批拿不到命令, 于是转人工.
 *
 * @module dsh-approve-prefix/approval/pending-commands
 */
/** 有界的一次性命令记录表. */
export class PendingCommands {
    #entries = new Map();
    #capacity;
    /**
     * @param capacity - 最多同时保留多少条记录.
     */
    constructor(capacity) {
        this.#capacity = capacity;
    }
    /** 当前保留的记录条数. */
    get size() {
        return this.#entries.size;
    }
    /**
     * 记录一次工具调用的命令文本.
     * @param callId - 工具调用 id.
     * @param command - 该调用的命令原文.
     */
    remember(callId, command) {
        if (!this.#entries.has(callId) && this.#entries.size >= this.#capacity) {
            const oldest = this.#entries.keys().next();
            if (!oldest.done)
                this.#entries.delete(oldest.value);
        }
        this.#entries.set(callId, command);
    }
    /**
     * 取回并移除一次工具调用的命令文本.
     * @param callId - 工具调用 id.
     * @returns 命令原文, 没有记录时返回 undefined.
     */
    consume(callId) {
        const command = this.#entries.get(callId);
        if (command !== undefined)
            this.#entries.delete(callId);
        return command;
    }
}
//# sourceMappingURL=pending-commands.js.map