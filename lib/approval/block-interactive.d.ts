/**
 * night 期间硬拦下交互类工具.
 *
 * 拦在 `tools/pre-execute` 最外层: 本插件的监听器注册得早, 在不调用 `next()` 时
 * 直接结束整条瀑布, 命令记录与其它 pre-execute 监听器都不会再跑, 工具体也不会执行.
 *
 * 拦截是确定性的, 不依赖模型是否读懂了提示词; 取不到会话时一律不拦 (fail-open 到
 * 普通行为), 免得把别的会话或没有 agent 的调用一起挡掉.
 *
 * @module dsh-approve-prefix/approval/block-interactive
 */
import type { PluginContext } from '../host-types.js';
import type { NightStates } from '../night/state.js';
/** 拦截器需要的宿主状态. */
export interface InteractiveToolGuardDeps {
    /** 会话级 night 开关表. */
    readonly states: NightStates;
    /** 被拦名单. */
    readonly blocked: readonly string[];
    /** 免拦名单. */
    readonly exempt: readonly string[];
}
/**
 * 把 night 的交互工具拦截接到 `tools/pre-execute` 上.
 *
 * 命中时不调 `next()`, 整条瀑布就此结束, 命令记录之类的下游监听器不会跑, 工具体也不会执行.
 * 优先级由注册顺序保证: 本插件先注册命令记录, 再注册这个拦截器, 所以拦截先跑.
 * @param ctx - dsh 的 Cordis Context.
 * @param deps - 拦截器需要的宿主状态.
 * @returns 取消拦截的函数.
 */
export declare function installInteractiveToolGuard(ctx: PluginContext, deps: InteractiveToolGuardDeps): () => void;
