/** 放行前缀变更的去重与会话上下文注入. */
import type { AgentLike } from '../host-types.js';
import type { PrefixEntry } from '../prefix/entry.js';
/**
 * 忽略顺序, 重复条目与前缀空白差异, 只比较实际的工具前缀集合.
 * @param entries - 当前前缀条目.
 * @returns 用于比较前后集合的稳定键.
 */
export declare function prefixEntriesKey(entries: readonly PrefixEntry[]): string;
/**
 * 把最新规则排入下一模型步骤, 不唤醒空闲 agent, 不开启新一轮对话.
 * @param agent - 接收变更的已加载 agent.
 * @param text - 与该 agent 系统提示词一致的完整前缀规则.
 * @returns 无返回值.
 */
export declare function injectAllowPrefixUpdate(agent: AgentLike, text: string): void;
