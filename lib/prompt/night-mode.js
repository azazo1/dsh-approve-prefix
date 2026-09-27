/**
 * night 期间注入的系统提示词段.
 *
 * 段只在 night 打开时非空: 关掉时返回空串, 组装出的提示词和没装这个功能时一致.
 * 文案说明三件事: 为什么这次没有人工在旁, 哪些工具会被宿主直接拒掉,
 * 以及提权请求在 night 期间的处置方式. 前缀表本身由 allow-prefixes 段负责列出,
 * 这里只说清 "命中前缀的可以放行, 其余直接拒绝" 这条规则.
 *
 * @module dsh-approve-prefix/prompt/night-mode
 */
import { effectiveBlockedTools } from '../night/blocked.js';
/** 系统提示词段名. */
export const NIGHT_SECTION_NAME = 'approve-prefix:night';
/** 段顺序: 排在放行前缀段之后, 保持这两段的稳定次序. */
export const NIGHT_SECTION_ORDER = 10310;
/**
 * 渲染 night 段.
 *
 * 文案用英文, 与宿主系统提示词的语言一致.
 * @param input - 当前 night 状态.
 * @returns 段文本; 未处于 night 时为空串.
 */
export function renderNightSection(input) {
    if (!input.on)
        return '';
    const blocked = effectiveBlockedTools(input.blockedTools, input.exemptTools);
    // 免拦名单是叠加在被拦名单上的例外: 只有确实被拦下又被豁免的工具值得写进提示词.
    const exempt = input.exemptTools.filter(name => input.blockedTools.includes(name));
    const modes = input.allowedEscalationModes.length === 0
        ? 'none'
        : input.allowedEscalationModes.join(', ');
    const lines = [
        'Night mode',
        '',
        'Night mode is on for this session: the user is away and will not answer. Do not wait on them.',
        '',
        '- Decide every remaining question yourself. Pick the reasonable option, note the assumption in your output, and carry on.',
        '- If a decision genuinely cannot be made without the user, say so in your reply and finish that piece of work instead of blocking.',
        '- Prefer showing the result in your reply over asking for confirmation.',
    ];
    if (blocked.length === 0) {
        lines.push('- No tool is blocked by night mode right now.');
    }
    else {
        lines.push(`- These tools are rejected by the harness while night mode is on and will never reach the user: ${blocked.join(', ')}. Calling one only produces an error result.`);
    }
    if (exempt.length > 0) {
        lines.push(`- ${exempt.join(', ')} stays available, so a blocking state entered earlier can still be left.`);
    }
    lines.push('- A sandbox escalation is approved without asking only when the command matches an allow prefix. Any other escalation is rejected immediately with no prompt; look for another approach, or say what is blocked and move on.', `- Escalation modes that can be auto-approved: ${modes}.`, '- Night mode is session state held in memory: it disappears when the harness restarts, and a later request without this section means it is no longer in force.');
    return lines.join('\n');
}
//# sourceMappingURL=night-mode.js.map