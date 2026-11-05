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
/** 模型可见的 `approved` 字段说明, 跟 bash 其他参数一样用英文. */
export const APPROVED_PARAMETER_DESCRIPTION = 'Optional self-check. Set true only after verifying that this exact command is one simple command whose argv starts with an allow prefix listed for this tool in the system prompt and satisfies all matching rules. '
    + 'This field does not request approval, enable or disable Night mode, or change session state. '
    + 'If any condition is uncertain, omit this field. If true but the prefix check fails, the call is rejected without a human dialog. '
    + 'When Night mode is off, omitting this field keeps the dialog.';
/** 写入工具 schema 的 `approved` 节点. */
export const APPROVED_PARAMETER = {
    type: 'boolean',
    description: APPROVED_PARAMETER_DESCRIPTION,
};
/**
 * 在一份 JSON Schema 对象根上补 `properties.approved`.
 * @param parameters - 工具的 parameters, 期望是 `{ type: 'object', properties: ... }`.
 * @returns 是否改写了对象.
 */
export function patchApprovedParameter(parameters) {
    if (typeof parameters !== 'object' || parameters === null)
        return false;
    const root = parameters;
    if (root['type'] !== undefined && root['type'] !== 'object')
        return false;
    let properties = root['properties'];
    if (properties === undefined) {
        try {
            properties = {};
            root['properties'] = properties;
        }
        catch {
            return false;
        }
    }
    if (typeof properties !== 'object' || properties === null || Array.isArray(properties))
        return false;
    const map = properties;
    const existing = map['approved'];
    if (existing !== undefined) {
        if (typeof existing !== 'object' || existing === null || Array.isArray(existing))
            return false;
        const node = existing;
        if (node['type'] !== undefined && node['type'] !== 'boolean')
            return false;
        if (node['type'] === 'boolean' && node['description'] === APPROVED_PARAMETER_DESCRIPTION)
            return false;
    }
    try {
        map['approved'] = { type: 'boolean', description: APPROVED_PARAMETER_DESCRIPTION };
        return true;
    }
    catch {
        return false;
    }
}
/**
 * 给一组工具 schema 里名字命中的那些补 `approved`.
 *
 * `tools` 收 `unknown`: dsh 0.2.2-rc.1 起装配对象没有 `tools` 字段, 拿到的是
 * undefined. 这里必须按空集合处理, 不能抛错.
 *
 * @param tools - 注册表定义或组装结果里的工具; 非数组一律忽略.
 * @param names - 要补字段的工具名, 通常是 config.tools.
 */
export function patchApprovedTools(tools, names) {
    if (!Array.isArray(tools))
        return;
    const allow = new Set(names);
    for (const tool of tools) {
        if (typeof tool !== 'object' || tool === null)
            continue;
        if (typeof tool.name !== 'string' || !allow.has(tool.name))
            continue;
        patchApprovedParameter(tool.parameters);
    }
}
/**
 * 给当前全局可见的配置工具打补丁, 并在工具集变化时再打.
 *
 * 这只能打到全局层. bash / pwsh 在 agent preset 上注册时 `tools.get(name)` 是 undefined,
 * agent 平面那份要靠 {@link installApprovedDefinitionPatch} 或 assemble 副本路径.
 * @param ctx - 用于监听 tools/change.
 * @param tools - 工具注册表.
 * @param names - 要补字段的工具名, 通常是 config.tools.
 */
export function installApprovedSchemaPatch(ctx, tools, names) {
    const patchAll = () => {
        for (const name of names) {
            const tool = tools.get(name);
            if (tool === undefined)
                continue;
            patchApprovedParameter(tool.parameters);
        }
    };
    patchAll();
    ctx.on('tools/change', patchAll);
}
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
export function installApprovedAssemblyPatch(ctx, names, scopes) {
    ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
        if (scopes !== undefined && context !== undefined && context !== null) {
            scopes.remember(context.scope ?? context.agent);
        }
        const result = await next();
        patchApprovedTools(result === undefined || result === null ? undefined : result.tools, names);
        return result;
    });
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
export function installApprovedDefinitionPatch(ctx, names) {
    const scopes = new Set();
    const patchScope = (scope) => {
        const tools = ctx.get('tools');
        if (tools === undefined || typeof tools.get !== 'function')
            return;
        for (const name of names) {
            const tool = tools.get(name, scope);
            if (tool === undefined)
                continue;
            patchApprovedParameter(tool.parameters);
        }
    };
    const remember = (scope) => {
        if (typeof scope !== 'object' || scope === null)
            return;
        if (scopes.has(scope))
            return;
        scopes.add(scope);
        patchScope(scope);
    };
    const patchAll = () => {
        for (const scope of scopes)
            patchScope(scope);
    };
    // tools 可能晚于 apply 就绪; 就绪后把已经见过的 scope 再补一次.
    ctx.inject(['tools'], patchAll);
    ctx.on('tools/change', patchAll);
    ctx.on('agent/created', ({ agent }) => { remember(agent); });
    return { remember };
}
//# sourceMappingURL=approved-schema.js.map
