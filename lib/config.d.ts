/**
 * 插件配置的默认值与校验.
 *
 * 非法配置在这里直接抛错, 让插件加载失败, 而不是静默降级成放行.
 *
 * @module dsh-approve-prefix/config
 */
/** 默认允许自动放行的命令前缀. */
export declare const DEFAULT_PREFIXES: readonly string[];
/** 默认纳入记录与判定的工具名. */
export declare const DEFAULT_TOOLS: readonly string[];
/** 默认允许自动放行的提权目标档位. */
export declare const DEFAULT_ESCALATION_MODES: readonly string[];
/** dsh 的沙箱档位词表. */
export declare const SANDBOX_MODES: readonly string[];
/** 默认的命令记录表容量. */
export declare const DEFAULT_PENDING_CAPACITY = 128;
/** 默认的会话级临时前缀条数上限. */
export declare const DEFAULT_TEMPORARY_PREFIX_LIMIT = 32;
/** 校验后的插件配置. */
export interface PluginConfig {
    /** 配置文件里的静态前缀表, 每项为空格分隔的命令词序列. */
    readonly prefixes: readonly string[];
    /** 参与记录与判定的工具名. */
    readonly tools: readonly string[];
    /** 允许自动放行的提权目标档位. */
    readonly allowedEscalationModes: readonly string[];
    /** 在结构元字符之外额外拒绝的单字符. */
    readonly extraDeniedCharacters: readonly string[];
    /** 为 false 时, 非提权来源的审批请求也按同一套命令规则应答. */
    readonly onlyEscalations: boolean;
    /** `/approve-prefix-add` 加入的会话级临时前缀, 每个会话最多保留多少条. */
    readonly temporaryPrefixLimit: number;
    /** 为 true 时输出判定细节日志. */
    readonly debug: boolean;
    /** 命令记录表的容量上限. */
    readonly pendingCapacity: number;
}
/**
 * 校验并补齐配置.
 * @param raw - profile 装配层传入的原始 config, 可能为 undefined.
 * @returns 补齐默认值后的配置.
 */
export declare function normalizeConfig(raw: unknown): PluginConfig;
