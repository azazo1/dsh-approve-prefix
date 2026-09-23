/**
 * dsh-approve-prefix: 在审批瀑布上按 "单命令前缀" 自动放行沙箱提权请求.
 *
 * 插件做三件事:
 * 1. 在 `tools/pre-execute` 阶段记下每次工具调用的命令原文, 以 callId 为键;
 * 2. 以 `{ prepend: true }` 把应答器插到 `approval/request` 瀑布最前面, 只在命令命中放行
 *    前缀时返回 `allowed-once`, 其余一律 `next()` 交回人工审批 (见 approval/answerer.ts);
 * 3. 注册四条 `/approve-prefix-*` 命令, 管理当前会话的临时前缀.
 *
 * 放行前缀来自三处, 全部由用户显式给出: profile 装配层的静态 `prefixes`, settings 里由配置页
 * 维护的持久前缀, 以及只在当前会话生效的临时前缀. 插件不从审批结果里学任何东西:
 * dsh 的审批接缝只有 `allowed-once` 一个放行结果, 无法区分 "允许一次" 与更长期的授权.
 *
 * 判定失败, 命令取不回或配置非法时都按 "不自动放行" 处理 (fail-closed).
 *
 * @module dsh-approve-prefix
 */
import type { PluginContext } from './host-types.js';
import type { Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { PersistentPrefixEntry } from './prefix/settings.js';
export interface Config {
    prefixes: string[];
    tools: string[];
    allowedEscalationModes: string[];
    extraDeniedCharacters: string[];
    onlyEscalations: boolean;
    temporaryPrefixLimit: number;
    debug: boolean;
    pendingCapacity: number;
    persistentPrefixes: Volatile<PersistentPrefixEntry[]>;
}
interface ConfigInput {
    prefixes?: string[];
    tools?: string[];
    allowedEscalationModes?: string[];
    extraDeniedCharacters?: string[];
    onlyEscalations?: boolean;
    temporaryPrefixLimit?: number;
    debug?: boolean;
    pendingCapacity?: number;
    persistentPrefixes?: PersistentPrefixEntry[];
}
export declare const Config: z<ConfigInput, Config>;
/** 插件模块名. */
export declare const name = "approve-prefix";
/**
 * 安装插件.
 * @param ctx - dsh 的 Cordis Context.
 * @param rawConfig - profile 装配层的 config, 缺省时使用代码默认值.
 */
export declare function apply(ctx: PluginContext, configInput: Config): void;
export {};
