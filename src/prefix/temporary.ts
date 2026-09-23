/**
 * 会话级临时放行前缀.
 *
 * 表按 session.id 分组: `/approve-prefix-add` 只影响执行该命令的会话, 会话之间不共享,
 * 也不写任何文件, dsh 进程重启即清空. 取不到会话标识时一律视为空表,
 * 避免把临时前缀退化成全局放行.
 *
 * @module dsh-approve-prefix/prefix/temporary
 */

/** 一条临时前缀. */
export interface TemporaryPrefixEntry {
  /** 适用的工具名. */
  readonly tool: string
  /** 空格分隔的命令词序列. */
  readonly prefix: string
}

/** 默认最多同时记住多少个会话的临时前缀. */
export const DEFAULT_SESSION_LIMIT = 64

/** 某个会话的临时前缀表. */
class SessionTable {
  readonly #entries = new Map<string, TemporaryPrefixEntry>()
  readonly #limit: number

  constructor(limit: number) {
    this.#limit = limit
  }

  /** 键的构造方式, 让工具名参与去重. */
  static key(tool: string, prefix: string): string {
    return `${tool}\u0000${prefix}`
  }

  list(): TemporaryPrefixEntry[] {
    return [...this.#entries.values()]
  }

  forTool(tool: string): string[] {
    return [...this.#entries.values()].filter(entry => entry.tool === tool).map(entry => entry.prefix)
  }

  learn(tool: string, prefix: string): boolean {
    const key = SessionTable.key(tool, prefix)
    if (this.#entries.has(key)) return false
    if (this.#entries.size >= this.#limit) {
      const oldest = this.#entries.keys().next()
      if (!oldest.done) this.#entries.delete(oldest.value)
    }
    this.#entries.set(key, { tool, prefix })
    return true
  }

  forget(tool: string, prefix: string): boolean {
    return this.#entries.delete(SessionTable.key(tool, prefix))
  }

  clear(): void {
    this.#entries.clear()
  }

  get size(): number {
    return this.#entries.size
  }
}

/** 按会话分组的临时放行前缀表. */
export class TemporaryPrefixes {
  readonly #bySession = new Map<string, SessionTable>()
  readonly #perSessionLimit: number
  readonly #sessionLimit: number

  /**
   * @param perSessionLimit - 单个会话最多记住多少条前缀.
   * @param sessionLimit - 最多同时记住多少个会话.
   */
  constructor(perSessionLimit: number, sessionLimit = DEFAULT_SESSION_LIMIT) {
    this.#perSessionLimit = perSessionLimit
    this.#sessionLimit = sessionLimit
  }

  /** 取某个会话的表, 没有则返回 undefined. */
  #table(sessionKey: string | undefined): SessionTable | undefined {
    return sessionKey === undefined ? undefined : this.#bySession.get(sessionKey)
  }

  /** 取某个会话的表, 没有就按需创建. */
  #ensureTable(sessionKey: string): SessionTable {
    const existing = this.#bySession.get(sessionKey)
    if (existing !== undefined) return existing
    if (this.#bySession.size >= this.#sessionLimit) {
      const oldest = this.#bySession.keys().next()
      if (!oldest.done) this.#bySession.delete(oldest.value)
    }
    const created = new SessionTable(this.#perSessionLimit)
    this.#bySession.set(sessionKey, created)
    return created
  }

  /**
   * 列出某个会话的临时前缀.
   * @param sessionKey - 会话 id, 可能为 undefined.
   * @returns 该会话的前缀列表, 按加入顺序.
   */
  list(sessionKey: string | undefined): TemporaryPrefixEntry[] {
    return this.#table(sessionKey)?.list() ?? []
  }

  /**
   * 取某个会话里某个工具可用的前缀.
   * @param sessionKey - 会话 id, 可能为 undefined.
   * @param tool - 工具名.
   * @returns 该会话里这个工具的前缀列表.
   */
  forTool(sessionKey: string | undefined, tool: string): string[] {
    return this.#table(sessionKey)?.forTool(tool) ?? []
  }

  /**
   * 往某个会话加入一条前缀.
   * @param sessionKey - 会话 id.
   * @param tool - 工具名.
   * @param prefix - 空格分隔的命令词序列.
   * @returns 是否是这一次新加入的前缀.
   */
  learn(sessionKey: string, tool: string, prefix: string): boolean {
    return this.#ensureTable(sessionKey).learn(tool, prefix)
  }

  /**
   * 从某个会话移除一条前缀.
   * @param sessionKey - 会话 id.
   * @param tool - 工具名.
   * @param prefix - 前缀文本.
   * @returns 是否移除了记录.
   */
  forget(sessionKey: string, tool: string, prefix: string): boolean {
    return this.#table(sessionKey)?.forget(tool, prefix) ?? false
  }

  /**
   * 清空某个会话的临时前缀.
   * @param sessionKey - 会话 id.
   */
  clear(sessionKey: string): void {
    this.#table(sessionKey)?.clear()
  }
}
