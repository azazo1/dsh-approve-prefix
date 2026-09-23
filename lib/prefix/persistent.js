/**
 * 持久放行前缀的读取.
 *
 * 读经 settings scope, 每次判定都重新取当前值, 所以在配置页面保存后立刻生效, 不需要重启.
 * Host 半边不写 settings: 持久前缀只由配置页面 (client 半边) 或手工编辑 settings.yaml 改动.
 *
 * @module dsh-approve-prefix/prefix/persistent
 */
import { PERSISTENT_PREFIXES_FIELD } from './settings.js';
/** 基于 settings scope 的持久前缀表 (只读). */
export class PersistentPrefixes {
    #scope;
    /**
     * @param scope - settings 服务返回的 owner scope.
     */
    constructor(scope) {
        this.#scope = scope;
    }
    /** 读出当前的持久前缀, 过滤掉结构不对的条目. */
    list() {
        const value = this.#scope.get();
        if (typeof value !== 'object' || value === null)
            return [];
        const entries = value[PERSISTENT_PREFIXES_FIELD];
        if (!Array.isArray(entries))
            return [];
        return entries.flatMap((entry) => {
            if (typeof entry !== 'object' || entry === null)
                return [];
            const record = entry;
            const tool = record['tool'];
            const prefix = record['prefix'];
            if (typeof tool !== 'string' || typeof prefix !== 'string')
                return [];
            return [{ tool, prefix }];
        });
    }
    /**
     * 取某个工具当前允许的前缀.
     * @param tool - 工具名.
     * @returns 该工具的前缀列表.
     */
    forTool(tool) {
        return this.list().filter(entry => entry.tool === tool).map(entry => entry.prefix);
    }
}
//# sourceMappingURL=persistent.js.map