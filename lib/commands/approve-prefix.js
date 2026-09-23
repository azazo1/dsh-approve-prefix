/**
 * 四条斜杠命令: `/approve-prefix-add`, `-rm`, `-list`, `-clear`.
 *
 * 它们只作用于**当前会话**的临时前缀 (进程内存, 重启即清空):
 * 临时表按 session.id 分组, 命令用调用方的 agent 定位会话, 审批请求用请求自带的 agent 定位,
 * 取不到会话身份时宁可报错也不退化成全局放行.
 *
 * 持久前缀不在命令里改, 由 Settings > 放行前缀 配置页写入 settings (Host 半边只读).
 *
 * 输出排版: 中文分节, 每节一个标题加编号条目, 空节写 `(无)`, 命令末尾回显受影响的会话块.
 *
 * @module dsh-approve-prefix/commands/approve-prefix
 */
import { sessionKeyOf } from '../prefix/session-key.js';
/** 静态前缀段的标题. */
const STATIC_SECTION = '静态前缀 (profile 配置, 本机所有会话生效, 改后重启 dsh web)';
/** 持久前缀段的标题. */
const PERSISTENT_SECTION = '持久前缀 (在 Settings > 放行前缀 里编辑, 跨重启保留)';
/** 会话临时前缀段的标题, 三种输出共用, 让作用域只说明一次. */
const SESSION_SECTION = '本次会话临时前缀 (只对当前会话生效, 重启或 /approve-prefix-clear 清空)';
/** 空节占位. */
const EMPTY_SECTION = '  (无)';
/** 前缀里出现这些字符时永远不会被判为单命令, 直接拒绝登记. */
const PREFIX_OPERATORS = ['|', ';', '&', '`', '$'];
/** 构造成功结果. */
function success(text) {
    return { kind: 'success', text };
}
/** 构造失败结果. */
function failure(text) {
    return { kind: 'error', text };
}
/** 把条目渲染成带序号的缩进行, 空表给出占位. */
function renderEntries(entries) {
    if (entries.length === 0)
        return [EMPTY_SECTION];
    return entries.map((entry, index) => `  ${String(index + 1)}. ${entry}`);
}
/** 渲染 "工具: 前缀" 形式的条目. */
function renderToolEntries(entries) {
    return entries.map(entry => `${entry.tool}: ${entry.prefix}`);
}
/**
 * 渲染当前会话的临时前缀段.
 * @param context - 命令渲染需要的宿主状态.
 * @param sessionKey - 当前会话 id, 取不到时为 undefined.
 * @returns 该段的所有行.
 */
function renderSessionSection(context, sessionKey) {
    if (sessionKey === undefined) {
        return [SESSION_SECTION, '  (这次调用没有带会话身份, 看不到本会话的临时前缀)'];
    }
    return [SESSION_SECTION, ...renderEntries(renderToolEntries(context.temporary.list(sessionKey)))];
}
/**
 * 渲染完整状态: 静态, 持久与当前会话三段.
 * @param context - 命令渲染需要的宿主状态.
 * @param sessionKey - 当前会话 id, 取不到时为 undefined.
 * @returns 直接展示给用户的文本.
 */
function renderStatus(context, sessionKey) {
    return [
        '放行前缀',
        '',
        STATIC_SECTION,
        ...renderEntries([...context.staticPrefixes]),
        '',
        PERSISTENT_SECTION,
        ...renderEntries(renderToolEntries(context.persistent.list())),
        '',
        ...renderSessionSection(context, sessionKey),
        '',
        `判定工具: ${context.tools.join(', ')}`,
    ].join('\n');
}
/** 结果行加当前会话段. */
function withSessionSection(head, context, sessionKey) {
    return [head, '', ...renderSessionSection(context, sessionKey)].join('\n');
}
/** 参数缺失时的两行提示. */
function argumentHint(command) {
    return [
        `/${command} 需要一个前缀, 例如: /${command} gh api`,
        `要指定工具就写成: /${command} pwsh: gh api`,
    ].join('\n');
}
/** 解析 `[tool: ]prefix` 形式的参数, 未给出工具名时使用第一个配置的工具. */
function parsePrefixArgument(rest, defaultTool) {
    if (rest === '' || defaultTool === undefined)
        return undefined;
    const match = /^([a-z0-9_-]+):\s*([\s\S]+)$/u.exec(rest);
    if (match !== null && match[1] !== undefined && match[2] !== undefined) {
        const prefix = match[2].trim();
        return prefix === '' ? undefined : { tool: match[1], prefix };
    }
    return { tool: defaultTool, prefix: rest };
}
/** 判断一次读取结果是不是错误结果 (成功结果都是普通数据对象, 没有 kind 字段). */
function isFailure(value) {
    return typeof value === 'object' && value !== null && 'kind' in value;
}
/** 检查前缀里的 shell 运算符. */
function prefixRejection(prefix) {
    for (const character of PREFIX_OPERATORS) {
        if (prefix.includes(character))
            return `前缀里不能出现 shell 运算符 "${character}"`;
    }
    return undefined;
}
/**
 * 创建这个插件注册的全部命令.
 * @param context - 命令渲染需要的宿主状态.
 * @returns 可直接注册的命令定义列表.
 */
export function createApprovePrefixCommands(context) {
    /** 读取前缀参数并做公共校验; 出错时返回错误结果. */
    const readPrefixArgument = (invocation, command) => {
        const parsed = parsePrefixArgument(invocation.rawInput.trim(), context.tools[0]);
        if (parsed === undefined)
            return failure(argumentHint(command));
        const rejection = prefixRejection(parsed.prefix);
        if (rejection !== undefined)
            return failure(rejection);
        return parsed;
    };
    /** 不接受参数的命令共用的守卫. */
    const noArgument = (invocation, command) => {
        return invocation.rawInput.trim() === '' ? undefined : failure(`/${command} 不接受参数`);
    };
    /** 需要会话身份的命令共用的守卫. */
    const sessionOrError = (invocation, command) => {
        const sessionKey = sessionKeyOf(invocation.agent);
        if (sessionKey === undefined)
            return failure(`/${command} 需要会话身份, 但这次调用没有带 agent`);
        return { sessionKey };
    };
    return [
        {
            name: 'approve-prefix-add',
            description: '把一条命令前缀加入当前会话的临时放行表',
            input: { hint: 'gh api' },
            handler: (invocation) => {
                const session = sessionOrError(invocation, 'approve-prefix-add');
                if (isFailure(session))
                    return session;
                const parsed = readPrefixArgument(invocation, 'approve-prefix-add');
                if (isFailure(parsed))
                    return parsed;
                context.temporary.learn(session.sessionKey, parsed.tool, parsed.prefix);
                return success(withSessionSection(`已加入本次会话: ${parsed.tool}: ${parsed.prefix}`, context, session.sessionKey));
            },
        },
        {
            name: 'approve-prefix-rm',
            description: '从当前会话的临时放行表移除一条命令前缀',
            input: { hint: 'gh api' },
            handler: (invocation) => {
                const session = sessionOrError(invocation, 'approve-prefix-rm');
                if (isFailure(session))
                    return session;
                const parsed = readPrefixArgument(invocation, 'approve-prefix-rm');
                if (isFailure(parsed))
                    return parsed;
                if (!context.temporary.forget(session.sessionKey, parsed.tool, parsed.prefix)) {
                    return failure(`本次会话里没有 "${parsed.prefix}" (${parsed.tool}) 这条临时前缀`);
                }
                return success(withSessionSection(`已从本次会话移除: ${parsed.tool}: ${parsed.prefix}`, context, session.sessionKey));
            },
        },
        {
            name: 'approve-prefix-list',
            description: '查看 dsh-approve-prefix 当前生效的全部放行前缀',
            handler: (invocation) => {
                const guard = noArgument(invocation, 'approve-prefix-list');
                if (guard !== undefined)
                    return guard;
                return success(renderStatus(context, sessionKeyOf(invocation.agent)));
            },
        },
        {
            name: 'approve-prefix-clear',
            description: '清空当前会话的临时放行表',
            handler: (invocation) => {
                const guard = noArgument(invocation, 'approve-prefix-clear');
                if (guard !== undefined)
                    return guard;
                const session = sessionOrError(invocation, 'approve-prefix-clear');
                if (isFailure(session))
                    return session;
                const count = context.temporary.list(session.sessionKey).length;
                context.temporary.clear(session.sessionKey);
                return success(`已清空本次会话的临时前缀 (共 ${String(count)} 条)`);
            },
        },
    ];
}
//# sourceMappingURL=approve-prefix.js.map