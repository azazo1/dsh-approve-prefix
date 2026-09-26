/**
 * 本插件消费的 dsh 宿主接缝的最小结构类型.
 *
 * 插件对宿主包零运行时依赖, 所以这里用结构类型描述 Context, 事件载荷与服务视图,
 * 每个字段只取本插件真正读取的部分. 结构对应的宿主定义写在注释里, 升级 dsh 时按这些
 * 出处核对, 不一致会表现为判定失效 (fail-closed, 转人工) 而不是误放行.
 *
 * HTTP 形状故意不引用 `node:http`: 本包 `tsconfig.json` 的 `types` 为空.
 *
 * @module dsh-approve-prefix/host-types
 */
/**
 * 审批应答结果词表, 与 dsh-user-approval 的 `ApprovalOutcome` 一致.
 *
 * 注意这里没有 "始终允许" 一类的词: 放行只有 `allowed-once` 一个结果,
 * 所以插件无法区分某次放行是 "允许一次" 还是更长期的授权.
 */
export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';
/**
 * `approval/request` 的事件载荷, 对应 dsh-user-approval 的 `ApprovalRequestEvent`.
 *
 * 载荷里没有命令原文: 提权请求只带工具名与理由, 命令要在 `tools/pre-execute` 阶段另记.
 */
export interface ApprovalRequestLike {
    /** 发起审批的工具名. */
    readonly toolName: string;
    /** 该次工具调用 id, 用于取回命令原文. */
    readonly callId?: string;
    /** 审批方给出的可读理由, 提权请求里形如 `escalate sandbox to <mode>: <理由>`. */
    readonly reason?: string;
    /** 发起审批的 agent, 用于定位这次请求属于哪个会话. */
    readonly agent?: unknown;
}
/** `tools/pre-execute` 的第一个参数, 只取本插件需要的字段. */
export interface ToolExecutionLike {
    /** 工具名. */
    readonly name: string;
    /** 工具调用 id. */
    readonly callId: string;
    /** 工具调用参数对象. */
    readonly arguments: unknown;
}
/** 日志接口. */
export interface PluginLogger {
    info(message: string): void;
    warn(message: string): void;
    debug?(message: string): void;
}
/** settings scope 中本插件用到的方法 (Host 半边只读). */
export interface SettingsScopeLike {
    /** 读取当前生效的段落值. */
    get(): unknown;
}
/** settings 服务中本插件用到的方法. */
export interface SettingsServiceLike {
    /** 注册命名空间, 拿到 owner scope. */
    register(namespace: string, schema: unknown, options?: object): SettingsScopeLike;
}
/**
 * webServer 收到的请求面.
 *
 * IncomingMessage 结构上满足本接口; 本插件不读取 body 以外的 Node 特有字段.
 */
export interface HttpRequestLike {
    readonly method?: string;
    readonly url?: string;
    readonly headers: unknown;
    [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
}
/** webServer 交给 handler 的响应面. */
export interface HttpResponseLike {
    writeHead(status: number, headers?: Record<string, string>): unknown;
    end(chunk?: string): unknown;
}
/** 一条 webServer 路由. */
export interface WebServerRouteLike {
    readonly kind: 'exact' | 'prefix';
    readonly path: string;
    handler(req: HttpRequestLike, res: HttpResponseLike): void | Promise<void>;
}
/** webServer 服务中本插件用到的方法. */
export interface WebServerLike {
    register(route: WebServerRouteLike): unknown;
}
/**
 * connection 服务中本插件用到的方法.
 *
 * `requestRejection` 走同一套 cookie 与 Host/Origin 栅栏; 返回 401 / 403 表示拒绝,
 * undefined 表示过关.
 */
export interface ConnectionServiceLike {
    requestRejection(request: {
        headers: unknown;
    }): 401 | 403 | undefined;
}
/** 工具注册表里本插件要改的那一小段: 活的 parameters JSON Schema. */
export interface ToolDefinitionLike {
    /** 模型可见的参数 schema, 就地补 `approved` 字段. */
    readonly parameters: unknown;
}
/** tools 服务中本插件用到的方法. */
export interface ToolsServiceLike {
    /** 按名取当前可见的工具定义. */
    get(name: string): ToolDefinitionLike | undefined;
}
/** 本插件消费的最小 Context 形状. */
export interface PluginContext {
    /** 注册 `tools/pre-execute` 监听器, 用于记下每次工具调用的命令原文. */
    on(event: 'tools/pre-execute', listener: (execution: ToolExecutionLike, next: () => Promise<unknown>) => Promise<unknown>): unknown;
    /** 注册审批瀑布监听器; `prepend` 为 true 时插在人工卡片之前. */
    on(event: 'approval/request', listener: (request: ApprovalRequestLike, next: () => Promise<ApprovalOutcome>) => Promise<ApprovalOutcome>, options: {
        prepend: boolean;
    }): unknown;
    /** 工具注册或卸载时再给 bash / pwsh 补 `approved` 字段. */
    on(event: 'tools/change', listener: () => void): unknown;
    /** 等可选服务就绪后再执行回调, 不把该服务变成插件的硬依赖. */
    inject(dependencies: readonly string[], callback: (context: InjectedContext) => void): unknown;
    /** 把注册动作登记为 effect, 插件卸载时自动清理. */
    effect<T>(callback: () => T): T;
    /** 按名取可选服务, 未就绪时为 undefined. */
    get(name: string): unknown;
    logger: PluginLogger;
}
/** inject 回调里可见的服务: 只有写进 dependencies 的服务才会就绪. */
export interface InjectedContext extends PluginContext {
    readonly settings?: SettingsServiceLike;
    readonly webServer?: WebServerLike;
    readonly connection?: ConnectionServiceLike;
    readonly tools?: ToolsServiceLike;
}
