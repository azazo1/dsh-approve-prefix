/**
 * 会话级临时放行前缀.
 *
 * 表按 session.id 分组: `/approve-prefix-add` 只影响执行该命令的会话, 会话之间不共享,
 * 也不写任何文件, dsh 进程重启即清空. 取不到会话标识时一律视为空表,
 * 避免把临时前缀退化成全局放行.
 *
 * @module dsh-approve-prefix/prefix/temporary
 */
/** 默认最多同时记住多少个会话的临时前缀. */
export const DEFAULT_SESSION_LIMIT = 64;
/** 某个会话的临时前缀表. */
class SessionTable {
    #entries = new Map();
    #limit;
    constructor(limit) {
        this.#limit = limit;
    }
    /** 键的构造方式, 让工具名参与去重. */
    static key(tool, prefix) {
        return `${tool}\u0000${prefix}`;
    }
    list() {
        return [...this.#entries.values()];
    }
    forTool(tool) {
        return [...this.#entries.values()].filter(entry => entry.tool === tool).map(entry => entry.prefix);
    }
    learn(tool, prefix) {
        const key = SessionTable.key(tool, prefix);
        if (this.#entries.has(key))
            return false;
        if (this.#entries.size >= this.#limit) {
            const oldest = this.#entries.keys().next();
            if (!oldest.done)
                this.#entries.delete(oldest.value);
        }
        this.#entries.set(key, { tool, prefix });
        return true;
    }
    forget(tool, prefix) {
        return this.#entries.delete(SessionTable.key(tool, prefix));
    }
    clear() {
        this.#entries.clear();
    }
    get size() {
        return this.#entries.size;
    }
}
/** 按会话分组的临时放行前缀表. */
export class TemporaryPrefixes {
    #bySession = new Map();
    #perSessionLimit;
    #sessionLimit;
    /**
     * @param perSessionLimit - 单个会话最多记住多少条前缀.
     * @param sessionLimit - 最多同时记住多少个会话.
     */
    constructor(perSessionLimit, sessionLimit = DEFAULT_SESSION_LIMIT) {
        this.#perSessionLimit = perSessionLimit;
        this.#sessionLimit = sessionLimit;
    }
    /** 取某个会话的表, 没有则返回 undefined. */
    #table(sessionKey) {
        return sessionKey === undefined ? undefined : this.#bySession.get(sessionKey);
    }
    /** 取某个会话的表, 没有就按需创建. */
    #ensureTable(sessionKey) {
        const existing = this.#bySession.get(sessionKey);
        if (existing !== undefined)
            return existing;
        if (this.#bySession.size >= this.#sessionLimit) {
            const oldest = this.#bySession.keys().next();
            if (!oldest.done)
                this.#bySession.delete(oldest.value);
        }
        const created = new SessionTable(this.#perSessionLimit);
        this.#bySession.set(sessionKey, created);
        return created;
    }
    /**
     * 列出某个会话的临时前缀.
     * @param sessionKey - 会话 id, 可能为 undefined.
     * @returns 该会话的前缀列表, 按加入顺序.
     */
    list(sessionKey) {
        return this.#table(sessionKey)?.list() ?? [];
    }
    /**
     * 取某个会话里某个工具可用的前缀.
     * @param sessionKey - 会话 id, 可能为 undefined.
     * @param tool - 工具名.
     * @returns 该会话里这个工具的前缀列表.
     */
    forTool(sessionKey, tool) {
        return this.#table(sessionKey)?.forTool(tool) ?? [];
    }
    /**
     * 往某个会话加入一条前缀.
     * @param sessionKey - 会话 id.
     * @param tool - 工具名.
     * @param prefix - 空格分隔的命令词序列.
     * @returns 是否是这一次新加入的前缀.
     */
    learn(sessionKey, tool, prefix) {
        return this.#ensureTable(sessionKey).learn(tool, prefix);
    }
    /**
     * 从某个会话移除一条前缀.
     * @param sessionKey - 会话 id.
     * @param tool - 工具名.
     * @param prefix - 前缀文本.
     * @returns 是否移除了记录.
     */
    forget(sessionKey, tool, prefix) {
        return this.#table(sessionKey)?.forget(tool, prefix) ?? false;
    }
    /**
     * 清空某个会话的临时前缀.
     * @param sessionKey - 会话 id.
     */
    clear(sessionKey) {
        this.#table(sessionKey)?.clear();
    }
}
//# sourceMappingURL=temporary.js.map