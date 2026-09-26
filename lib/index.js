/**
 * dsh-approve-prefix: 在审批瀑布上按 "单命令前缀" 自动放行沙箱提权请求.
 *
 * 插件做三件事:
 * 1. 在 `tools/pre-execute` 阶段记下每次工具调用的命令原文, 以 callId 为键;
 * 2. 以 `{ prepend: true }` 把应答器插到 `approval/request` 瀑布最前面, 命令命中放行前缀时
 *    返回 `allowed-once`; 前缀未命中且参数里有 `approved: true` 时返回 `rejected`;
 *    其余 `next()` 交回人工审批 (见 approval/answerer.ts);
 * 3. 有 tools 服务时, 给 config.tools 里的工具参数 schema 补上 `approved`, 让模型看得见这个字段;
 * 4. 有 webServer 与 connection 时挂认证 HTTP, 给会话视图 tab 管理当前会话的临时前缀.
 *
 * 放行前缀来自三处, 全部由用户显式给出: profile 装配层的静态 `prefixes`, settings 里由配置页
 * 维护的持久前缀, 以及只在当前会话生效的临时前缀. 插件不从审批结果里学任何东西:
 * dsh 的审批接缝只有 `allowed-once` 一个放行结果, 无法区分 "允许一次" 与更长期的授权.
 *
 * 判定失败, 命令取不回或配置非法时都按 "不自动放行" 处理 (fail-closed).
 *
 * @module dsh-approve-prefix
 */
import { installApprovalAnswerer } from './approval/answerer.js';
import { installApprovedSchemaPatch } from './approval/approved-schema.js';
import { PendingCommands } from './approval/pending-commands.js';
import { normalizeConfig } from './config.js';
import { PersistentPrefixes } from './prefix/persistent.js';
import { TemporaryPrefixes } from './prefix/temporary.js';
import { mountSessionPrefixRoutes } from './session-api/routes.js';
import z from '@deepseek-ai/schemastery';
export const Config = z.object({
    prefixes: z.array(z.string()).default(['gh api']),
    tools: z.array(z.string()).default(['bash']),
    allowedEscalationModes: z.array(z.string()).default(['danger-full-access']),
    extraDeniedCharacters: z.array(z.string()).default([]),
    onlyEscalations: z.boolean().default(true),
    temporaryPrefixLimit: z.number().step(1).min(1).default(32),
    debug: z.boolean().default(false),
    pendingCapacity: z.number().step(1).min(1).default(128),
    persistentPrefixes: z.array(z.object({
        tool: z.string(),
        prefix: z.string(),
    })).default([]).volatile(),
});
/** 插件模块名. */
export const name = 'approve-prefix';
/** 从工具调用的解析参数里取命令文本. */
function readCommand(argumentsValue) {
    if (typeof argumentsValue !== 'object' || argumentsValue === null)
        return undefined;
    const command = argumentsValue['command'];
    return typeof command === 'string' ? command : undefined;
}
/**
 * 模型有没有在参数里写 `approved: true`.
 *
 * 只认严格布尔 true. 字符串 `"true"`, `1`, `"yes"` 都不算, 避免把模型随手填的字段当成自报.
 */
function readSelfApproved(argumentsValue) {
    if (typeof argumentsValue !== 'object' || argumentsValue === null)
        return false;
    return argumentsValue['approved'] === true;
}
/**
 * 安装插件.
 * @param ctx - dsh 的 Cordis Context.
 * @param rawConfig - profile 装配层的 config, 缺省时使用代码默认值.
 */
export function apply(ctx, configInput) {
    const config = normalizeConfig(configInput);
    const pending = new PendingCommands(config.pendingCapacity);
    const temporary = new TemporaryPrefixes(config.temporaryPrefixLimit);
    const persistent = new PersistentPrefixes(() => ({
        persistentPrefixes: configInput.persistentPrefixes.get(),
    }));
    ctx.on('tools/pre-execute', async (execution, next) => {
        if (config.tools.includes(execution.name)) {
            const command = readCommand(execution.arguments);
            if (command !== undefined) {
                pending.remember(String(execution.callId), {
                    command,
                    selfApproved: readSelfApproved(execution.arguments),
                });
            }
        }
        return next();
    });
    installApprovalAnswerer(ctx, { config, pending, temporary, persistent: () => persistent });
    /*
     * tools 也是可选 inject: 没有注册表时审批判定照常, 只是模型看不见 approved 字段.
     * bash 会在 jobs 服务就绪后重新注册, 所以还要听 tools/change 再打一次补丁.
     */
    ctx.inject(['tools'], (toolCtx) => {
        const tools = toolCtx.tools;
        if (tools === undefined)
            return;
        installApprovedSchemaPatch(toolCtx, tools, config.tools);
    });
    /*
     * webServer 与 connection 都要等各自的服务就绪: 没有写进 inject 的服务在 apply 阶段读不到.
     * 两个服务都是可选的, headless 缺席时审批自动放行照常, 只是没有管理面.
     */
    ctx.inject(['webServer', 'connection'], (webCtx) => {
        const webServer = webCtx.webServer;
        if (webServer === undefined)
            return;
        mountSessionPrefixRoutes({
            effect: (callback) => webCtx.effect(callback),
            webServer,
            get: (name) => webCtx.get(name),
        }, {
            list: (sessionKey) => temporary.list(sessionKey),
            replace: (sessionKey, entries) => temporary.replace(sessionKey, entries),
            defaultTool: config.tools[0] ?? 'bash',
            limit: config.temporaryPrefixLimit,
        });
    });
}
//# sourceMappingURL=index.js.map