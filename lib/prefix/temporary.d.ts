/**
 * 会话级临时放行前缀.
 *
 * 表按 session.id 分组: 会话视图 tab 的整表替换只影响当前会话, 会话之间不共享,
 * 也不写任何文件, dsh 进程重启即清空. 取不到会话标识时一律视为空表,
 * 避免把临时前缀退化成全局放行.
 *
 * @module dsh-approve-prefix/prefix/temporary
 */
import { type PrefixEntry, type PrefixWriteError } from './entry.js';
/** 一条临时前缀. */
export type TemporaryPrefixEntry = PrefixEntry;
export type { PrefixWriteError };
/** 默认最多同时记住多少个会话的临时前缀. */
export declare const DEFAULT_SESSION_LIMIT = 64;
/** 按会话分组的临时放行前缀表. */
export declare class TemporaryPrefixes {
    #private;
    /**
     * @param perSessionLimit - 单个会话最多记住多少条前缀.
     * @param sessionLimit - 最多同时记住多少个会话.
     */
    constructor(perSessionLimit: number, sessionLimit?: number);
    /**
     * 列出某个会话的临时前缀.
     * @param sessionKey - 会话 id, 可能为 undefined.
     * @returns 该会话的前缀列表, 按加入顺序.
     */
    list(sessionKey: string | undefined): TemporaryPrefixEntry[];
    /**
     * 取某个会话里某个工具可用的前缀.
     * @param sessionKey - 会话 id, 可能为 undefined.
     * @param tool - 工具名.
     * @returns 该会话里这个工具的前缀列表.
     */
    forTool(sessionKey: string | undefined, tool: string): string[];
    /**
     * 往某个会话加入一条前缀.
     *
     * 超限时淘汰最旧一条, 这是判定侧旧行为; UI 写入请走 `replace`, 超限会拒绝.
     * @param sessionKey - 会话 id.
     * @param tool - 工具名.
     * @param prefix - 空格分隔的命令词序列.
     * @returns 是否是这一次新加入的前缀.
     */
    learn(sessionKey: string, tool: string, prefix: string): boolean;
    /**
     * 用一整表替换某个会话的临时前缀, 保序.
     *
     * 任一条非法, 重复, 或条数超过上限时不改表.
     * @param sessionKey - 会话 id.
     * @param entries - 待写入条目.
     * @returns 通过时为 undefined, 否则是失败原因.
     */
    replace(sessionKey: string, entries: readonly TemporaryPrefixEntry[]): PrefixWriteError | undefined;
    /**
     * 从某个会话移除一条前缀.
     * @param sessionKey - 会话 id.
     * @param tool - 工具名.
     * @param prefix - 前缀文本.
     * @returns 是否移除了记录.
     */
    forget(sessionKey: string | undefined, tool: string, prefix: string): boolean;
    /**
     * 清空某个会话的临时前缀.
     * @param sessionKey - 会话 id.
     */
    clear(sessionKey: string | undefined): void;
}
