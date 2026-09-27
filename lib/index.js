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
import { installApprovalAnswerer } from './approval/answerer.js';
import { installApprovedAssemblyPatch, installApprovedSchemaPatch } from './approval/approved-schema.js';
import { installInteractiveToolGuard } from './approval/block-interactive.js';
import { PendingCommands } from './approval/pending-commands.js';
import { installNightCommand } from './command/night.js';
import { DEFAULT_NIGHT_CONTEXT, DEFAULT_PREFIXES, DEFAULT_TOOLS, normalizeConfig, presentToolNames, } from './config.js';
import { DEFAULT_NIGHT_BLOCKED_TOOLS, DEFAULT_NIGHT_EXEMPT_TOOLS } from './night/blocked.js';
import { NightStates } from './night/state.js';
import { PersistentPrefixes } from './prefix/persistent.js';
import { sessionKeyOf } from './prefix/session-key.js';
import { TemporaryPrefixes } from './prefix/temporary.js';
import { ALLOW_PREFIX_SECTION_NAME, ALLOW_PREFIX_SECTION_ORDER, renderAllowPrefixSection, } from './prompt/allow-prefixes.js';
import { NIGHT_SECTION_NAME, NIGHT_SECTION_ORDER, renderNightSection, } from './prompt/night-mode.js';
import { mountSessionPrefixRoutes } from './session-api/routes.js';
import z from '@deepseek-ai/schemastery';
export const Config = z.object({
    prefixes: z.array(z.string()).default([...DEFAULT_PREFIXES]),
    tools: z.array(z.string()).default([...DEFAULT_TOOLS]),
    allowedEscalationModes: z.array(z.string()).default(['danger-full-access']),
    extraDeniedCharacters: z.array(z.string()).default([]),
    onlyEscalations: z.boolean().default(true),
    temporaryPrefixLimit: z.number().step(1).min(1).default(32),
    debug: z.boolean().default(false),
    pendingCapacity: z.number().step(1).min(1).default(128),
    nightBlockedTools: z.array(z.string()).default([...DEFAULT_NIGHT_BLOCKED_TOOLS]),
    nightExemptTools: z.array(z.string()).default([...DEFAULT_NIGHT_EXEMPT_TOOLS]),
    nightCommand: z.boolean().default(true),
    nightContext: z.string().default(DEFAULT_NIGHT_CONTEXT),
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
 * 从 `ctx.get('tools')` 取出按名查找.
 * @param value - 可能还没就绪的 tools 服务.
 * @returns 查得到工具时的查找函数, 否则 undefined. 第二参是 agent / scope, 用来看见 preset 平面上的 bash.
 */
function toolLookup(value) {
    if (typeof value !== 'object' || value === null || !('get' in value))
        return undefined;
    const get = value.get;
    if (typeof get !== 'function')
        return undefined;
    return (name, scope) => get.call(value, name, scope);
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
    const night = new NightStates();
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
    /*
     * 交互工具拦截注册在命令记录之后: 同一个事件的监听器按注册顺序入栈,
     * 拦截器命中时不调用 next(), 于是记录与下游 pre-execute 都不会跑, 工具体也不执行.
     */
    installInteractiveToolGuard(ctx, {
        states: night,
        blocked: config.nightBlockedTools,
        exempt: config.nightExemptTools,
    });
    installApprovalAnswerer(ctx, { config, pending, temporary, night, persistent: () => persistent });
    installApprovedAssemblyPatch(ctx, config.tools);
    /*
     * tools 也是可选 inject: 没有注册表时审批判定照常, 发给模型的 schema 仍靠 assemble 补丁.
     * 全局层若有 bash, 这里再打一次活定义, 并听 tools/change (jobs 就绪后重新注册).
     */
    ctx.inject(['tools'], (toolCtx) => {
        const tools = toolCtx.tools;
        if (tools === undefined)
            return;
        installApprovedSchemaPatch(toolCtx, tools, config.tools);
    });
    /*
     * systemPrompt 同样可选: 没有提示词服务时审批照常, 只是模型看不到当前前缀表.
     * 文本闭包每次组装都重读持久表, 当前会话的临时表, 以及这个会话的 night 状态.
     */
    ctx.inject(['systemPrompt'], (promptCtx) => {
        const systemPrompt = promptCtx.systemPrompt;
        if (systemPrompt === undefined)
            return;
        systemPrompt.section({
            name: ALLOW_PREFIX_SECTION_NAME,
            order: ALLOW_PREFIX_SECTION_ORDER,
            interpolate: false,
            text: (context) => {
                const lookup = toolLookup(promptCtx.get('tools'));
                const scope = context.scope ?? context.agent;
                return renderAllowPrefixSection({
                    tools: presentToolNames(config.tools, lookup === undefined ? undefined : name => lookup(name, scope)),
                    staticPrefixes: config.prefixes,
                    persistent: persistent.list(),
                    temporary: temporary.list(sessionKeyOf(context.agent)),
                    allowedEscalationModes: config.allowedEscalationModes,
                    extraDeniedCharacters: config.extraDeniedCharacters,
                    onlyEscalations: config.onlyEscalations,
                });
            },
        });
        systemPrompt.section({
            name: NIGHT_SECTION_NAME,
            order: NIGHT_SECTION_ORDER,
            interpolate: false,
            text: (context) => renderNightSection({
                on: night.isOn(sessionKeyOf(context.agent)),
                blockedTools: config.nightBlockedTools,
                exemptTools: config.nightExemptTools,
                allowedEscalationModes: config.allowedEscalationModes,
            }),
        });
    });
    /*
     * commands 是可选的: 没有命令注册表时对话视图 tab 照样能开关 night, 只是没有 /night.
     * 注册用 inject 等命令服务就绪, 因为 apply 阶段它可能还没 provide.
     */
    if (config.nightCommand) {
        ctx.inject(['commands'], (commandCtx) => {
            const registered = installNightCommand(commandCtx, {
                states: night,
                contextText: config.nightContext,
            });
            if (!registered) {
                commandCtx.logger.warn('dsh-approve-prefix: commands service is present but has no register(); /night is unavailable');
            }
        });
    }
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
            defaultTool: () => presentToolNames(config.tools, toolLookup(webCtx.get('tools')))[0] ?? 'bash',
            limit: config.temporaryPrefixLimit,
            night: (sessionKey) => night.isOn(sessionKey),
            setNight: (sessionKey, on) => { night.set(sessionKey, on); },
            blockedTools: config.nightBlockedTools,
            exemptTools: config.nightExemptTools,
        });
    });
}
//# sourceMappingURL=index.js.map