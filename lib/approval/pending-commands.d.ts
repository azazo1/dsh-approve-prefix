/**
 * callId 到命令文本的短期映射.
 *
 * 提权审批请求只带 toolName 与 reason, 命令原文必须在 tools/pre-execute 阶段记下,
 * 到审批阶段按 callId 取回. 映射有容量上限, 超限时淘汰最旧的一条, 避免长会话里无界增长;
 * 每条记录只消费一次, 同一个 callId 的第二次审批拿不到命令, 于是转人工.
 *
 * 同时记下模型有没有在参数里写 `approved: true` (严格布尔), 供前缀未命中时决定
 * 是转人工还是直接拒绝.
 *
 * @module dsh-approve-prefix/approval/pending-commands
 */
/** 一次待审批工具调用记下的内容. */
export interface PendingCall {
    /** 命令原文. */
    readonly command: string;
    /** 参数里的 `approved` 是否严格等于布尔 true. */
    readonly selfApproved: boolean;
}
/** 有界的一次性命令记录表. */
export declare class PendingCommands {
    #private;
    /**
     * @param capacity - 最多同时保留多少条记录.
     */
    constructor(capacity: number);
    /** 当前保留的记录条数. */
    get size(): number;
    /**
     * 记录一次工具调用.
     * @param callId - 工具调用 id.
     * @param call - 命令原文与是否自报 approved.
     */
    remember(callId: string, call: PendingCall): void;
    /**
     * 取回并移除一次工具调用.
     * @param callId - 工具调用 id.
     * @returns 记下的内容, 没有记录时返回 undefined.
     */
    consume(callId: string): PendingCall | undefined;
}
