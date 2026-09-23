/**
 * 持久放行前缀的读取.
 *
 * 读经 settings scope, 每次判定都重新取当前值, 所以在配置页面保存后立刻生效, 不需要重启.
 * Host 半边不写 settings: 持久前缀只由配置页面 (client 半边) 或手工编辑 settings.yaml 改动.
 *
 * @module dsh-approve-prefix/prefix/persistent
 */
import { type PersistentPrefixEntry } from './settings.js';
/** 基于当前插件 Config 的持久前缀表 (只读). */
export declare class PersistentPrefixes {
    #private;
    /**
     * @param current - 每次判定时读取当前持久前缀值.
     */
    constructor(current: () => unknown);
    /** 读出当前的持久前缀, 过滤掉结构不对的条目. */
    list(): PersistentPrefixEntry[];
    /**
     * 取某个工具当前允许的前缀.
     * @param tool - 工具名.
     * @returns 该工具的前缀列表.
     */
    forTool(tool: string): string[];
}
