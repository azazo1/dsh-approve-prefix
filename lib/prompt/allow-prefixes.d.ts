/**
 * 把当前放行前缀和匹配规则写成系统提示词的一段.
 *
 * 文本在每次组装时现算: 静态前缀来自配置, 持久前缀来自 settings, 临时前缀只取
 * 当前会话. 模型看到的是此刻会自动放行的前缀, 不是启动时的快照.
 * 段放在系统提示词尾部, 前缀变化只改尾部 token.
 *
 * @module dsh-approve-prefix/prompt/allow-prefixes
 */
import type { PrefixEntry } from '../prefix/entry.js';
/** 系统提示词段名. */
export declare const ALLOW_PREFIX_SECTION_NAME = "approve-prefix:allow-prefixes";
/**
 * 段顺序.
 *
 * 第一方 persona 后缀是 10200. 放在它后面, 前缀表变化不会改写前面的稳定前缀.
 */
export declare const ALLOW_PREFIX_SECTION_ORDER = 10300;
/** 渲染一段系统提示词所需的当前放行状态. */
export interface AllowPrefixPromptInput {
    /** 参与判定的工具名. */
    readonly tools: readonly string[];
    /** 配置里的静态前缀, 对每个配置工具都生效. */
    readonly staticPrefixes: readonly string[];
    /** 持久前缀, 按工具名过滤. */
    readonly persistent: readonly PrefixEntry[];
    /** 当前会话的临时前缀, 按工具名过滤. 没有会话时为空. */
    readonly temporary: readonly PrefixEntry[];
    /** 允许自动放行的提权档位. */
    readonly allowedEscalationModes: readonly string[];
    /** 额外拒绝字符, 对命令原文整串扫描. */
    readonly extraDeniedCharacters: readonly string[];
    /** 为 false 时, 非提权审批也走同一套规则. */
    readonly onlyEscalations: boolean;
}
/**
 * 渲染系统提示词段.
 *
 * 文案用英文, 与 bash / pwsh 参数 schema 以及宿主系统提示词一致.
 * @param input - 当前放行状态.
 * @returns 段文本. 调用方应关闭变量插值, 前缀里可能出现花括号.
 */
export declare function renderAllowPrefixSection(input: AllowPrefixPromptInput): string;
