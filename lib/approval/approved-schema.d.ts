/**
 * 把 `approved` 补进 bash / pwsh (以及 config.tools 里其他工具) 的参数 schema.
 *
 * 模型只填 schema 里出现的字段, 所以必须让 schema 本身带上这个字段.
 *
 * dsh 0.2.2-rc.1 起, `system-prompt/assemble` 瀑布经过的对象是 PromptPresentation,
 * 不再携带 `tools`: 工具声明由各自的 provider 在瀑布之前生成并 structuredClone 好,
 * 瀑布之后改不到这一次下发的副本. 因此除了旧路径, 还要在装配发生之前改注册表里的
 * 活 parameters: `agent/created` 早于首次装配, `tools/change` 覆盖 bash 因 jobs
 * 服务就绪而重新注册的情况. 0.2.1 及更早仍走 assemble 副本那条旧路径, 两条都留.
 *
 * 本模块的监听器不得抛错: tools/change 监听器抛错会回滚注册, assemble 监听器抛错会让组装失败.
 *
 * @module dsh-approve-prefix/approval/approved-schema
 */
import type { PluginContext, ToolsServiceLike } from '../host-types.js';
/** 模型可见的 `approved` 字段说明, 跟 bash 其他参数一样用英文. */
export declare const APPROVED_PARAMETER_DESCRIPTION: string;
/** 写入工具 schema 的 `approved` 节点. */
export declare const APPROVED_PARAMETER: {
    readonly type: "boolean";
    readonly description: string;
};
/** 注册表里一份工具定义, 只取要改的 parameters. */
export interface PatchableTool {
    readonly parameters: unknown;
}
/**
 * 在一份 JSON Schema 对象根上补 `properties.approved`.
 * @param parameters - 工具的 parameters, 期望是 `{ type: 'object', properties: ... }`.
 * @returns 是否改写了对象.
 */
export declare function patchApprovedParameter(parameters: unknown): boolean;
/**
 * 给一组工具 schema 里名字命中的那些补 `approved`.
 *
 * `tools` 收 `unknown`: dsh 0.2.2-rc.1 起装配对象没有 `tools` 字段, 拿到的是
 * undefined. 这里必须按空集合处理, 不能抛错.
 *
 * @param tools - 注册表定义或组装结果里的工具; 非数组一律忽略.
 * @param names - 要补字段的工具名, 通常是 config.tools.
 */
export declare function patchApprovedTools(tools: unknown, names: readonly string[]): void;
/**
 * 给当前全局可见的配置工具打补丁, 并在工具集变化时再打.
 *
 * 这只能打到全局层. bash / pwsh 在 agent preset 上注册时 `tools.get(name)` 是 undefined,
 * agent 平面那份要靠 {@link installApprovedDefinitionPatch} 或 assemble 副本路径.
 * @param ctx - 用于监听 tools/change.
 * @param tools - 工具注册表.
 * @param names - 要补字段的工具名, 通常是 config.tools.
 */
export declare function installApprovedSchemaPatch(ctx: Pick<PluginContext, 'on'>, tools: ToolsServiceLike, names: readonly string[]): void;
/**
 * 在 `system-prompt/assemble` 上给发给模型的 schema 副本补 `approved`.
 *
 * 这条是 dsh 0.2.1 及更早的路径: assemble 会 structuredClone parameters,
 * 且 bash 在 agent 平面, 只改全局注册表打不到模型; 监听器 await next() 后再改,
 * 改的是这一次实际下发的副本.
 *
 * dsh 0.2.2-rc.1 起装配对象不再带 `tools`, 这里还会顺手把看到的 scope 交给
 * {@link installApprovedDefinitionPatch}, 让下一轮装配前能改到活定义; 首轮由
 * `agent/created` 覆盖. 不得抛错.
 *
 * @param ctx - 用于监听 assemble 瀑布.
 * @param names - 要补字段的工具名, 通常是 config.tools.
 * @param scopes - 可选: 记录装配上下文里的 agent / scope, 供装配前改写活定义.
 */
export declare function installApprovedAssemblyPatch(ctx: Pick<PluginContext, 'on' | 'get'>, names: readonly string[], scopes?: ScopeRememberer): void;
/** 记下一个装配 scope, 供 {@link installApprovedDefinitionPatch} 的重打补丁使用. */
export interface ScopeRememberer {
    /**
     * 记住 scope 并立刻给它可见的配置工具补 `approved`; 非对象入参忽略.
     * @param scope - 装配上下文里的 agent 或 scope.
     */
    remember(scope: unknown): void;
}
/**
 * 在装配发生之前给注册表里的活 definitions 补 `approved`.
 *
 * dsh 0.2.2-rc.1 起工具声明由 provider 在瀑布之前投影并克隆, 所以要改的是
 * `ctx.tools.get(name, scope)` 返回的活定义. 时机用 `agent/created`
 * (宿主保证它在 agentCtx 上的 scoped 工具注册之后、首次装配之前) 与
 * `tools/change` (bash 因 jobs 服务就绪而重新注册时).
 *
 * @param ctx - 插件 context; 需要 on / get / inject.
 * @param names - 要补字段的工具名, 通常是 config.tools.
 * @returns 可交给 assemble 钩子的 scope 记录器, 用于诊断用裸装配兜底.
 */
export declare function installApprovedDefinitionPatch(ctx: Pick<PluginContext, 'on' | 'get' | 'inject'>, names: readonly string[]): ScopeRememberer;
