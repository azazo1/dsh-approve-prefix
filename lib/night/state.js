/**
 * 会话级 night 开关.
 *
 * 只存当前进程内存, 按 session.id 分组, 不写 settings 也不写会话日志:
 * 进程重启即全部关掉, 提示词随之退回普通模式, agent 因此能看出 night 已经结束.
 *
 * 取不到会话标识时一律按关处理, 不会把 night 退化成全局状态.
 *
 * @module dsh-approve-prefix/night/state
 */
/** 默认最多同时记住多少个会话的 night 状态. */
export const DEFAULT_NIGHT_SESSION_LIMIT = 64;
/**
 * 按会话分组的 night 开关表.
 *
 * 只记录打开过的会话: 关掉时删除条目, 所以表的大小等于此刻处于 night 的会话数.
 */
export class NightStates {
    #on = new Set();
    #sessionLimit;
    /**
     * @param sessionLimit - 最多同时记住多少个处于 night 的会话.
     */
    constructor(sessionLimit = DEFAULT_NIGHT_SESSION_LIMIT) {
        this.#sessionLimit = sessionLimit;
    }
    /**
     * 某个会话此刻是否处于 night.
     * @param sessionKey - 会话 id, 可能为 undefined.
     * @returns 取不到会话或没打开过时为 false.
     */
    isOn(sessionKey) {
        return sessionKey === undefined ? false : this.#on.has(sessionKey);
    }
    /**
     * 打开某个会话的 night.
     * @param sessionKey - 会话 id.
     * @returns 这次写入是否真的改变了状态.
     */
    turnOn(sessionKey) {
        if (this.#on.has(sessionKey))
            return false;
        if (this.#on.size >= this.#sessionLimit) {
            const oldest = this.#on.values().next();
            if (!oldest.done)
                this.#on.delete(oldest.value);
        }
        this.#on.add(sessionKey);
        return true;
    }
    /**
     * 关掉某个会话的 night.
     * @param sessionKey - 会话 id.
     * @returns 这次写入是否真的改变了状态.
     */
    turnOff(sessionKey) {
        return this.#on.delete(sessionKey);
    }
    /**
     * 写入一个明确的开关值.
     * @param sessionKey - 会话 id, 取不到时什么都不做.
     * @param on - 目标状态.
     * @returns on / off 表示写入了新状态, unchanged 表示原本就是这个状态.
     */
    set(sessionKey, on) {
        if (sessionKey === undefined)
            return 'unchanged';
        const changed = on ? this.turnOn(sessionKey) : this.turnOff(sessionKey);
        if (!changed)
            return 'unchanged';
        return on ? 'on' : 'off';
    }
    /**
     * 取反某个会话的 night.
     * @param sessionKey - 会话 id, 取不到时什么都不做.
     * @returns 取反后的状态; 取不到会话时为 undefined.
     */
    toggle(sessionKey) {
        if (sessionKey === undefined)
            return undefined;
        if (this.isOn(sessionKey)) {
            this.turnOff(sessionKey);
            return false;
        }
        this.turnOn(sessionKey);
        return true;
    }
    /**
     * 丢弃某个会话的状态.
     * @param sessionKey - 会话 id.
     */
    forget(sessionKey) {
        this.#on.delete(sessionKey);
    }
}
//# sourceMappingURL=state.js.map