/**
 * `/night` 斜杠命令: 会话级 night 开关的第二个入口.
 *
 * 命令与对话视图里的 tab 写的是同一份状态, 所以两边效果一致: 命令改完,
 * tab 下次读取就看到新值; tab 应用后, 命令读到的也是同一个值.
 *
 * 裸调用取反, 也可以写成 `/night on` / `/night off`. 命令走 dsh 的命令生命周期,
 * `command/run` 与 `command/done` 会留下记录, 便于事后核查谁在什么时候开了 night.
 *
 * 打开时另外给这个 agent 一条上下文, 让它在本轮里就知道用户已经离开;
 * 系统提示词段负责后续每一轮的持续生效.
 *
 * @module dsh-approve-prefix/command/night
 */
import { sessionKeyOf } from '../prefix/session-key.js';
/** 命令名, 与 client 端贡献的名字必须一致. */
export const NIGHT_COMMAND_NAME = 'night';
/** 写一条命令结果. */
function result(kind, text) {
    return kind === 'success' ? { kind: 'success', text } : { kind: 'error', text };
}
/**
 * 铸一个 RFC 9562 v4 UUID, 用作消息 id.
 *
 * 用 `crypto.getRandomValues` 而不是 `crypto.randomUUID`: 后者是 secure-context 才有的
 * Web API, 前者在各处都在.
 * @returns UUID 字符串.
 */
function mintMessageId() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const hex = Array.from(bytes, (byte, index) => {
        const pinned = index === 6 ? (byte & 0x0f) | 0x40 : index === 8 ? (byte & 0x3f) | 0x80 : byte;
        return pinned.toString(16).padStart(2, '0');
    }).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/**
 * 把 night 已打开这件事交回 agent 上下文.
 *
 * 用 `agent.followup` 而不是 `inject`: 开关是用户刚做的动作, 值一条普通的后续输入,
 * 让它成为一个待处理的提醒, 而不是悄悄塞进下一次请求的上下文里.
 * @param agent - 命令调用携带的 agent.
 * @param text - 交给模型的上下文文本.
 */
function notifyAgent(agent, text) {
    if (typeof agent !== 'object' || agent === null)
        return;
    const followup = agent['followup'];
    if (typeof followup !== 'function')
        return;
    try {
        followup.call(agent, {
            id: mintMessageId(),
            role: 'user',
            content: [{ type: 'text', text }],
            source: { kind: 'dsh-approve-prefix' },
        });
    }
    catch {
        // 上下文注入失败不影响开关本身: 状态已写入, 系统提示词段照样会出现.
    }
}
/**
 * 注册 `/night` 命令.
 * @param ctx - dsh 的 Cordis Context.
 * @param deps - 命令需要的宿主状态.
 * @returns 注册是否成功; commands 服务还没就绪时返回 false, 由调用方用 inject 稍后重试.
 */
export function installNightCommand(ctx, deps) {
    const commands = ctx.get('commands');
    if (typeof commands !== 'object' || commands === null || !('register' in commands))
        return false;
    const register = commands.register;
    if (typeof register !== 'function')
        return false;
    const definition = {
        name: NIGHT_COMMAND_NAME,
        description: 'Turn night mode on or off for this session',
        input: { hint: '[on|off]' },
        handler: (invocation) => {
            const argument = invocation.rawInput.trim().toLowerCase();
            if (argument !== '' && argument !== 'on' && argument !== 'off') {
                return result('error', `unknown argument "${argument}"; use /night, /night on or /night off`);
            }
            const sessionKey = sessionKeyOf(invocation.agent);
            if (sessionKey === undefined) {
                return result('error', 'night mode needs a live session; this invocation carries no session identity');
            }
            if (argument === '') {
                const on = deps.states.toggle(sessionKey);
                if (on === undefined) {
                    return result('error', 'night mode needs a live session; this invocation carries no session identity');
                }
                return reportSwitch(ctx, deps, sessionKey, on, invocation.agent);
            }
            const target = argument === 'on';
            const changed = deps.states.set(sessionKey, target);
            if (changed === 'unchanged') {
                return result('success', target
                    ? 'Night mode is already on for this session.'
                    : 'Night mode is already off for this session.');
            }
            return reportSwitch(ctx, deps, sessionKey, target, invocation.agent);
        },
    };
    register.call(commands, definition);
    return true;
}
/**
 * 写入之后的统一回执: 打开时再给 agent 一条上下文.
 * @param ctx - 插件 Context, 只为写日志.
 * @param deps - 命令依赖.
 * @param sessionKey - 会话 id.
 * @param on - 写入后的状态.
 * @param agent - 命令调用携带的 agent.
 * @returns 命令结果.
 */
function reportSwitch(ctx, deps, sessionKey, on, agent) {
    if (on) {
        if (deps.contextText !== '')
            notifyAgent(agent, deps.contextText);
        ctx.logger.info(`dsh-approve-prefix: night mode on for session ${sessionKey}`);
        return result('success', 'Night mode on: interactive tools are rejected and only prefix-matched escalations are approved.');
    }
    ctx.logger.info(`dsh-approve-prefix: night mode off for session ${sessionKey}`);
    return result('success', 'Night mode off: approvals go back to the human card.');
}
//# sourceMappingURL=night.js.map