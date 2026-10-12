/**
 * 会话级管理面 (临时前缀表与 night 开关) 的认证 HTTP 路由.
 *
 * 路径挂在 `/api/plugins/dsh-approve-prefix/sessions/...`, 会抢在 connection 的 `/api`
 * 前缀之前命中, 所以认证由 handler 自己向 connection 要一次 `requestRejection`.
 * 认证服务缺席 fail-closed, 503, 不裸放行.
 *
 * @module dsh-approve-prefix/session-api/routes
 */
import type { WebServerLike } from '../host-types.js';
import type { PrefixEntry, PrefixWriteError } from '../prefix/entry.js';
/** GET / PUT 共用的临时前缀响应体. */
export interface SessionPrefixesPayload {
    readonly entries: readonly PrefixEntry[];
    readonly defaultTool: string;
    readonly limit: number;
}
/** GET / PUT 共用的 night 响应体. */
export interface SessionNightPayload {
    readonly night: boolean;
    /** night 期间会被拒的工具名, 已去掉免拦的那些. */
    readonly blockedTools: readonly string[];
    /** 出现在被拦名单里但实际放行的工具名. */
    readonly exemptTools: readonly string[];
}
/** 联合读取响应, 使用同一时刻的前缀与 night 状态. */
export interface SessionApprovalPayload extends SessionPrefixesPayload, SessionNightPayload {
}
/** 只提交有变化的字段, 避免覆盖其它入口刚写入的状态. */
export interface SessionApprovalUpdate {
    readonly entries?: readonly PrefixEntry[];
    readonly night?: boolean;
}
/** 路由要读的会话级表面. */
export interface SessionPrefixRouteHost {
    list(sessionKey: string): readonly PrefixEntry[];
    /** 校验通过后同步提交全部字段, 最后才发布完整快照. */
    update(sessionKey: string, state: SessionApprovalUpdate): PrefixWriteError | undefined;
    /** 新增一行时的工具名. 可以是字符串, 或每次请求现算 (注册表里谁在, 就用谁). */
    readonly defaultTool: string | (() => string);
    readonly limit: number;
    /** 读某个会话的 night 状态. */
    night(sessionKey: string): boolean;
    /** night 期间的被拦名单. */
    readonly blockedTools: readonly string[];
    /** night 期间的免拦名单. */
    readonly exemptTools: readonly string[];
}
/** 挂路由时需要的 Context 面. */
export interface SessionPrefixRouteContext {
    effect<T>(callback: () => T): T;
    webServer: WebServerLike;
    get(name: string): unknown;
}
/**
 * 注册会话级管理面路由.
 * @param ctx - 已经拿到 webServer 的宿主上下文.
 * @param host - 临时前缀表与 night 开关入口.
 */
export declare function mountSessionPrefixRoutes(ctx: SessionPrefixRouteContext, host: SessionPrefixRouteHost): void;
