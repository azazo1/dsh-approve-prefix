/**
 * dsh-approve-prefix: 在审批瀑布上按 "单命令前缀" 自动放行沙箱提权请求, 并提供会话级 night 模式.
 *
 * 插件做这些事:
 * 1. 在 `tools/pre-execute` 阶段记下每次工具调用的命令原文, 以 callId 为键;
 * 2. 以 `{ prepend: true }` 把应答器插到 `approval/request` 瀑布最前面, 命令命中放行前缀时
 *    返回 `allowed-once`; 前缀未命中且参数里有 `approved: true` 时返回 `rejected`;
 *    其余 `next()` 交回人工审批 (见 approval/answerer.ts);
 * 3. 在 `system-prompt/assemble` 给发给模型的工具 schema 副本补上 `approved`; 有 tools 服务时
 *    也给全局注册表打补丁, 但 bash 在 agent preset 上时全局 get 看不到, 不能只靠这一条;
 * 4. 有 systemPrompt 服务时, 注册一段系统提示词, 每次组装时列出当前放行前缀, 并简短说明
 *    `approved` 与前缀匹配条件; night 打开时另有一段说明夜里的行为规则;
 * 5. 有 webServer 与 connection 时挂认证 HTTP, 给会话视图 tab 管理当前会话的临时前缀与 night 开关;
 * 6. 有 commands 服务时注册 `/night` 命令, 与对话视图 tab 写同一份会话状态.
 *
 * 放行前缀来自三处, 全部由用户显式给出: profile 装配层的静态 `prefixes`, settings 里由配置页
 * 维护的持久前缀, 以及只在当前会话生效的临时前缀. 插件不从审批结果里学任何东西:
 * dsh 的审批接缝只有 `allowed-once` 一个放行结果, 无法区分 "允许一次" 与更长期的授权.
 *
 * night 是会话级开关, 只存进程内存: 打开期间交互类工具在 `tools/pre-execute` 最外层被拒,
 * 只有命中放行前缀的提权会放行, 其余提权直接拒绝而不弹人工卡片. 重启后开关全部归零,
 * 提示词段随之消失, agent 因此能判断 night 已经结束.
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
    nightBlockedTools: string[];
    nightExemptTools: string[];
    nightCommand: boolean;
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
    nightBlockedTools?: string[];
    nightExemptTools?: string[];
    nightCommand?: boolean;
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
