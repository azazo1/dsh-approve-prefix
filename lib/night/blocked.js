/**
 * night 期间要拦下的交互工具名单.
 *
 * 名单只在配置里给出, 插件不按前缀猜: 拦错工具会让 agent 夜里瘫掉,
 * 所以默认值只放用户交互类工具, 并且给一组显式免拦名单,
 * 免得把离开计划模式这类出口一并堵死.
 *
 * 只有像工具名的条目才参与判定, 含空白或为空的条目直接忽略: 名单是从配置里读来的
 * 自由文本, 写错一条不应该变成 "什么都拦" 或者 "什么都没拦".
 *
 * @module dsh-approve-prefix/night/blocked
 */
/** 默认被 night 拦下的工具: 需要用户在场回答的那类. */
export const DEFAULT_NIGHT_BLOCKED_TOOLS = ['ask_user_question'];
/**
 * 默认免拦名单.
 *
 * `exit_plan_mode` 走的是用户提问通道, 一并拦掉会让 agent 无法退出计划模式,
 * 而且 dsh-reject-message 挂在计划审查卡上的拒绝入口也就永远见不到了.
 */
export const DEFAULT_NIGHT_EXEMPT_TOOLS = ['exit_plan_mode'];
/** 工具名的形状: 只有这样的名字才可能匹配到一次真实调用. */
const TOOL_NAME = /^[A-Za-z0-9_.:-]+$/u;
/**
 * 判断一次工具调用是否要在 night 期间被拦下.
 * @param toolName - 工具名.
 * @param blocked - 配置里的被拦名单.
 * @param exempt - 配置里的免拦名单.
 * @returns true 表示这次调用直接拒绝, 不执行.
 */
export function isNightBlocked(toolName, blocked, exempt) {
    for (const name of blocked) {
        if (name !== toolName)
            continue;
        if (!TOOL_NAME.test(name))
            continue;
        if (exempt.includes(name))
            continue;
        return true;
    }
    return false;
}
/**
 * 取真正会被拦下的工具名, 供界面与提示词展示.
 * @param blocked - 配置里的被拦名单.
 * @param exempt - 配置里的免拦名单.
 * @returns 去掉免拦与非法条目之后的名单, 保持配置顺序.
 */
export function effectiveBlockedTools(blocked, exempt) {
    const effective = [];
    for (const name of blocked) {
        if (!TOOL_NAME.test(name))
            continue;
        if (exempt.includes(name))
            continue;
        if (effective.includes(name))
            continue;
        effective.push(name);
    }
    return effective;
}
//# sourceMappingURL=blocked.js.map