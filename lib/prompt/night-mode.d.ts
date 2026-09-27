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
/** 系统提示词段名. */
export declare const NIGHT_SECTION_NAME = "approve-prefix:night";
/** 段顺序: 排在放行前缀段之后, 保持这两段的稳定次序. */
export declare const NIGHT_SECTION_ORDER = 10310;
/** 渲染 night 段所需的输入. */
export interface NightPromptInput {
    /** 这个会话此刻是否处于 night. */
    readonly on: boolean;
    /** 会被宿主直接拒掉的工具名. */
    readonly blockedTools: readonly string[];
    /** 从被拦名单里豁免的工具名. */
    readonly exemptTools: readonly string[];
    /** 允许自动放行的提权目标档位. */
    readonly allowedEscalationModes: readonly string[];
}
/**
 * 渲染 night 段.
 *
 * 文案用英文, 与宿主系统提示词的语言一致.
 * @param input - 当前 night 状态.
 * @returns 段文本; 未处于 night 时为空串.
 */
export declare function renderNightSection(input: NightPromptInput): string;
