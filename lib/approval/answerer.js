/**
 * 审批应答: 决定要不要替人工放行这次沙箱提权请求.
 *
 * 判定条件按固定顺序排在一处, 便于逐条核对 (全部满足才放行):
 * 1. 请求来自 `tools` 里配置的工具;
 * 2. 要么请求确实是沙箱提权且目标档位在 `allowedEscalationModes` 内, 要么 `onlyEscalations` 为 false;
 * 3. 命令能按 callId 取回 (记录只消费一次);
 * 4. 命令是单条简单命令, 且 argv 前缀命中静态, 持久或本会话临时前缀之一.
 *
 * 前缀未命中且模型在参数里写了 `approved: true` 时返回 `rejected`, 不再弹人工.
 * 其余不满足的情况仍 `next()`, 把请求交给下游的人工审批.
 *
 * night 打开时这里额外接管一件事: 凡是不属于 `tools` 的审批请求 (别的插件用工具运行时的
 * `ask` 决策, 或直接调 `ctx.approval.request` 发起的询问) 也一律 `rejected`. 这些请求不参与
 * 前缀判定, 若不在这里拦下就会原样弹成人工卡片, 让夜里停在 "等人批准" 上 — 那正是 night
 * 要消除的状态 (例如 dsh-plugin-chrome 首次开窗的同意, 提权来源的 ptc / 插件管理器工具).
 * 判定依然 fail-closed: night 下能放行的只有命中放行前缀的那条窄路.
 *
 * 插件不读审批结果: 放行只有 `allowed-once` 一个词, 从结果里归纳前缀等于让 "允许一次"
 * 变成自动放行.
 *
 * @module dsh-approve-prefix/approval/answerer
 */
import { judgeSingleCommandPrefix } from '../prefix/judge.js';
import { sessionKeyOf } from '../prefix/session-key.js';
import { parseEscalationMode } from './escalation.js';
/** 日志里命令文本的最大长度. */
const COMMAND_LOG_LIMIT = 200;
/** 截断过长的命令文本, 避免日志被超长参数灌满. */
function shortenCommand(command) {
    return command.length <= COMMAND_LOG_LIMIT ? command : `${command.slice(0, COMMAND_LOG_LIMIT)}...`;
}
/**
 * 判定一次审批请求是否自动放行.
 * @param input - 判定输入.
 * @returns 判定结果, `autoApprove` 为 false 时应把请求交给下游.
 */
export function decideApproval(input) {
    const { escalationMode, command, config } = input;
    if (escalationMode === undefined && config.onlyEscalations) {
        return { autoApprove: false, skip: 'not-escalation', detail: 'not a sandbox escalation' };
    }
    if (escalationMode !== undefined && !config.allowedEscalationModes.includes(escalationMode)) {
        return {
            autoApprove: false,
            skip: 'mode',
            detail: `escalation to "${escalationMode}" is not configured as auto-approvable`,
        };
    }
    if (command === undefined) {
        return { autoApprove: false, skip: 'no-command', detail: 'no remembered command for this call' };
    }
    const dialect = input.toolName === 'pwsh' || input.toolName === 'powershell' ? 'pwsh' : 'bash';
    const verdict = judgeSingleCommandPrefix(command, input.prefixes, config.extraDeniedCharacters, dialect);
    if (verdict.allowed)
        return { autoApprove: true, detail: verdict.detail };
    return { autoApprove: false, skip: 'prefix', detail: verdict.detail };
}
/**
 * 取这个会话此刻的 night 状态.
 * @param states - 会话级 night 开关表.
 * @param agent - 审批请求携带的 agent.
 * @returns 这个会话此刻是否处于 night; 取不到会话时为 false.
 */
function nightOn(states, agent) {
    return states.isOn(sessionKeyOf(agent));
}
/**
 * 把应答器以 `prepend` 方式插到审批瀑布最前面, 抢在人工卡片之前应答.
 * @param ctx - dsh 的 Cordis Context.
 * @param deps - 应答器需要的宿主状态.
 */
export function installApprovalAnswerer(ctx, deps) {
    const { config } = deps;
    /** 只在 debug 打开时输出转人工的细节. */
    const debug = (message) => {
        if (!config.debug)
            return;
        if (ctx.logger.debug !== undefined)
            ctx.logger.debug(message);
        else
            ctx.logger.info(message);
    };
    ctx.on('approval/request', async (request, next) => {
        const night = nightOn(deps.night, request.agent);
        /*
         * 不在 tools 里的工具: 插件不认它的命令, 也无从判定前缀. 夜里人工不在,
         * 这类询问 (chrome 首次开窗的同意, ptc / 插件管理器的提权等) 直接拒绝,
         * 否则它会弹成人工卡片, agent 就停在那里等人. 白天照旧交给下游审批.
         */
        if (!config.tools.includes(request.toolName)) {
            if (night) {
                ctx.logger.info(`dsh-approve-prefix: rejected by night mode an approval from "${request.toolName}", which is not in the configured tools`);
                return 'rejected';
            }
            return next();
        }
        const escalationMode = parseEscalationMode(request.reason);
        const pending = request.callId === undefined ? undefined : deps.pending.consume(String(request.callId));
        const command = pending?.command;
        const prefixes = [
            ...config.prefixes,
            ...(deps.persistent()?.forTool(request.toolName) ?? []),
            ...deps.temporary.forTool(sessionKeyOf(request.agent), request.toolName),
        ];
        const decision = decideApproval({
            escalationMode,
            command,
            prefixes,
            config,
            toolName: request.toolName,
        });
        const subject = command === undefined ? '(no remembered command)' : shortenCommand(command);
        if (!decision.autoApprove) {
            // 前缀未命中且模型自称命中: 直接拒绝, 不走人工.
            if (pending?.selfApproved === true && decision.skip === 'prefix') {
                ctx.logger.info(`dsh-approve-prefix: rejected a self-approved ${request.toolName} call: ${decision.detail}; command: ${subject}`);
                return 'rejected';
            }
            // night 期间人工不在: 只有命中放行前缀的提权才放行, 其余一律立刻拒绝, 不弹卡片.
            if (night) {
                ctx.logger.info(`dsh-approve-prefix: rejected by night mode a ${request.toolName} approval: ${decision.detail}; command: ${subject}`);
                return 'rejected';
            }
            debug(`dsh-approve-prefix: delegating a ${request.toolName} approval: ${decision.detail}; command: ${subject}`);
            return next();
        }
        const described = escalationMode === undefined ? 'an approval ask' : `a sandbox escalation to ${escalationMode}`;
        ctx.logger.info(`dsh-approve-prefix: auto-approved ${described}: ${decision.detail}; command: ${shortenCommand(command ?? '')}`);
        return 'allowed-once';
    }, { prepend: true });
}
//# sourceMappingURL=answerer.js.map