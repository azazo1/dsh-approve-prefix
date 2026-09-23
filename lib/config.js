/**
 * 插件配置的默认值与校验.
 *
 * 非法配置在这里直接抛错, 让插件加载失败, 而不是静默降级成放行.
 *
 * @module dsh-approve-prefix/config
 */
/** 默认允许自动放行的命令前缀. */
export const DEFAULT_PREFIXES = ['gh api'];
/** 默认纳入记录与判定的工具名. */
export const DEFAULT_TOOLS = ['bash'];
/** 默认允许自动放行的提权目标档位. */
export const DEFAULT_ESCALATION_MODES = ['danger-full-access'];
/** dsh 的沙箱档位词表. */
export const SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access'];
/** 默认的命令记录表容量. */
export const DEFAULT_PENDING_CAPACITY = 128;
/** 默认的会话级临时前缀条数上限. */
export const DEFAULT_TEMPORARY_PREFIX_LIMIT = 32;
/** 已被识别的配置键, 其余键视为配置错误. */
const KNOWN_KEYS = [
    'prefixes',
    'tools',
    'allowedEscalationModes',
    'extraDeniedCharacters',
    'onlyEscalations',
    'temporaryPrefixLimit',
    'debug',
    'pendingCapacity',
];
/** 判断一个值是否是普通对象. */
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** 读取一个字符串数组字段. */
function readStringArray(raw, key, fallback) {
    const value = raw[key];
    if (value === undefined)
        return [...fallback];
    if (!Array.isArray(value))
        throw new Error(`dsh-approve-prefix: "${key}" must be an array of strings`);
    const items = [];
    for (const item of value) {
        if (typeof item !== 'string' || item.trim() === '') {
            throw new Error(`dsh-approve-prefix: "${key}" must contain non-empty strings`);
        }
        items.push(item.trim());
    }
    return items;
}
/** 读取一个布尔字段. */
function readBoolean(raw, key, fallback) {
    const value = raw[key];
    if (value === undefined)
        return fallback;
    if (typeof value !== 'boolean')
        throw new Error(`dsh-approve-prefix: "${key}" must be a boolean`);
    return value;
}
/** 读取一个有界整数字段. */
function readInteger(raw, key, fallback, min, max) {
    const value = raw[key];
    if (value === undefined)
        return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        throw new Error(`dsh-approve-prefix: "${key}" must be an integer between ${min} and ${max}`);
    }
    return value;
}
/**
 * 校验并补齐配置.
 * @param raw - profile 装配层传入的原始 config, 可能为 undefined.
 * @returns 补齐默认值后的配置.
 */
export function normalizeConfig(raw) {
    if (raw === undefined || raw === null)
        raw = {};
    if (!isRecord(raw))
        throw new Error('dsh-approve-prefix: config must be a mapping');
    const unknown = Object.keys(raw).filter(key => !KNOWN_KEYS.includes(key));
    if (unknown.length > 0) {
        throw new Error(`dsh-approve-prefix: unknown config key(s): ${unknown.join(', ')}; known keys: ${KNOWN_KEYS.join(', ')}`);
    }
    const allowedEscalationModes = readStringArray(raw, 'allowedEscalationModes', DEFAULT_ESCALATION_MODES);
    if (allowedEscalationModes.length === 0) {
        throw new Error('dsh-approve-prefix: "allowedEscalationModes" must not be empty');
    }
    for (const mode of allowedEscalationModes) {
        if (!SANDBOX_MODES.includes(mode)) {
            throw new Error(`dsh-approve-prefix: "allowedEscalationModes" contains unknown mode "${mode}"; expected one of ${SANDBOX_MODES.join(', ')}`);
        }
    }
    const tools = readStringArray(raw, 'tools', DEFAULT_TOOLS);
    if (tools.length === 0)
        throw new Error('dsh-approve-prefix: "tools" must not be empty');
    const extraDeniedCharacters = readStringArray(raw, 'extraDeniedCharacters', []);
    for (const character of extraDeniedCharacters) {
        if ([...character].length !== 1) {
            throw new Error(`dsh-approve-prefix: "extraDeniedCharacters" accepts single characters, got "${character}"`);
        }
    }
    return {
        prefixes: readStringArray(raw, 'prefixes', DEFAULT_PREFIXES),
        tools,
        allowedEscalationModes,
        extraDeniedCharacters,
        onlyEscalations: readBoolean(raw, 'onlyEscalations', true),
        temporaryPrefixLimit: readInteger(raw, 'temporaryPrefixLimit', DEFAULT_TEMPORARY_PREFIX_LIMIT, 1, 1024),
        debug: readBoolean(raw, 'debug', false),
        pendingCapacity: readInteger(raw, 'pendingCapacity', DEFAULT_PENDING_CAPACITY, 1, 4096),
    };
}
//# sourceMappingURL=config.js.map