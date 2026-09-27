# 设计取舍

## 为什么必须挂在审批瀑布上

提权审批发生在工具体内部: agent 首次调用被沙箱拦下后, 带 `sandbox_permissions` 与 `justification` 重试, 由 bash 工具体内部的 `approveEscalation` 发起 `ctx.approval.request`. 这件事晚于 `tools/pre-execute`, 所以:

- 规则类插件 (在 `tools/pre-execute` 上给 allow/deny/ask) 管不到提权: 对工具调用放行, 并不等于同意提权.
- 审批请求本身不带命令原文, 只有 `toolName` 与 `reason` (形如 `escalate sandbox to <mode>: <理由>`).

于是本插件用两个接缝配合: 在 `tools/pre-execute` 按 `callId` 记下命令原文, 再以 `{ prepend: true }` 插到 `approval/request` 瀑布最前面, 抢在人工卡片之前按 `callId` 取回命令判定. `reason` 里的档位由 `approval/escalation.ts` 解析, 用来判断提权目标是否在放行范围里.

## 为什么判定依赖命令文本, 而不是审批理由

审批理由由模型自由生成, 只能当作展示信息. 命令原文虽然也来自模型, 但它是真正会被执行的那一串, 判定它的结构 (是否单条命令, argv 前缀) 才是确定性的. 因此放行只看命令, 理由只用于识别这是不是提权请求.

## 为什么用 AST 而不是字符扫描

手写引号扫描会把 `\"` 当成引号开始, 于是把后面的换行当成参数, 而 bash 把 `\"` 当字面 `"`, 换行仍分隔命令. 管道, 续行, 单引号里的 `$` 也不是整串搜字符能分清的. 判定因此改为 unbash 解析, 再白名单检查: 必须恰好一条简单 `Command`, 没有重定向 / 后台 / 子 shell, 词里也不能有参数展开或命令替换. 配置只能追加 `extraDeniedCharacters` (对原文整串扫描), 不能关掉这些结构检查.

## 为什么不从审批结果学前缀

dsh 的审批接缝只有四个结果词: `allowed-once`, `rejected`, `cancelled`, `unavailable`. 放行只有一个 `allowed-once`, 也就是 "允许一次" 与任何更长期的授权在插件眼里完全一样. 从结果里归纳前缀, 必然让一次 "允许一次" 变成自动放行; 阈值 ("确认 N 次后自动") 只是把这件事推迟到第 N 次点击, 并没有区分意图.

所以放行前缀只有三条显式来源: 装配层静态配置, 配置页写入的持久前缀, 以及当前会话的临时前缀. 插件不写 settings, 也不记录任何审批结果. 临时前缀只通过会话视图 tab 写入, 没有斜杠命令.

## 三层前缀的作用域

| 层 | 存储 | 生效范围 | 谁能改 |
|---|---|---|---|
| 静态 | profile 的 `cordis.patch.yml` | 本机所有会话 | 用户改配置后重启 |
| 持久 | `settings.yaml` 的 `approve-prefix` 段 | 本机所有会话, 跨重启 | Settings 配置页 (client 半边) |
| 临时 | 进程内存, 按 session id 分组 | 只有当前会话 | 会话视图 tab (认证 HTTP) |

临时层按会话分组而不是按进程: 同一个 dsh 进程里可能开着多个会话, 在 A 会话里放宽前缀不应该影响 B 会话. 取不到会话身份时按空表处理, 宁可转人工也不退化成全局放行.

## 模块结构

```text
src/
├── index.ts                 入口: 读配置, 挂 pre-execute 记录器, 应答器与 HTTP
├── host-types.ts            dsh 接缝的最小结构类型 (无宿主运行时依赖)
├── config.ts                装配层 config 的默认值与校验, 非法配置直接抛错
├── approval/
│   ├── answerer.ts          判定条件表 (纯函数) 与审批瀑布监听器
│   ├── approved-schema.ts   给 bash / pwsh 参数 schema 补 approved
│   ├── escalation.ts        提权理由里的目标档位解析
│   └── pending-commands.ts  callId 到命令原文的有界一次性记录表
├── prompt/
│   └── allow-prefixes.ts    系统提示词段: 当前前缀, approved 与匹配条件
├── prefix/
│   ├── judge.ts             单命令判定与 argv 前缀匹配
│   ├── pwsh-judge.ts        pwsh ParseInput 摘要的白名单
│   ├── pwsh-inspect.ps1     只解析不执行, 打印 AST 摘要 JSON
│   ├── session-key.ts       从 agent 视图取会话 id
│   ├── entry.ts             前缀条目校验 (空, 运算符, 重复, 上限)
│   ├── temporary.ts         会话级临时前缀表
│   ├── persistent.ts        持久前缀读取 (Host 半边只读)
│   └── settings.ts          settings 命名空间, 字段名与 schema
├── session-api/
│   ├── paths.ts             会话前缀 HTTP 路径
│   └── routes.ts            认证 GET / PUT
└── client/
    └── index.ts             client 半边: Settings 配置页与会话 tab
```

判定条件集中在 `approval/answerer.ts` 的 `decideApproval`, 顺序即文档顺序; 监听器只负责取命令, 记日志, 返回 `allowed-once` / `rejected` / `next()`. 前缀未命中且参数 `approved === true` 时返回 `rejected`; 其余失败仍 `next()`. 临时表由会话 tab 经认证 HTTP 整表替换, 但 tab 里的编辑先停在草稿, 点应用才 PUT; TUI / headless 没有这条管理面.

插件对宿主包零运行时依赖: `host-types.ts` 用结构类型描述 Context, 事件载荷与服务视图. 外部依赖只有 settings schema 需要的 `@deepseek-ai/schemastery`, 以及判定用的 `unbash` (0 传递依赖的 bash AST). settings 服务在注册时直接调用 schema, 不做跨副本的类型判断, 所以插件自带一份不影响正确性.

## Client 半边的约束

client bundle 必须是自包含的普通脚本, 不能出现 `import`/`export`, 由 module loader 的 `__ModuleLoader__.load({ id, factory })` 注册. 因此:

- React 通过 loader 提供的 `require('react')` 获取, 不打包进来.
- settings 命名空间与字段名在 client 里内联了一份, 与 `src/prefix/settings.ts` 是同一份契约, 改动必须两边一起改 (文件顶部有同步注释).
- 持久前缀注册在 `plugins.bundle.config` 槽上; 临时前缀注册在 `conversation.view` 槽上. 标题与文案走 client locale (zh / en), locale 服务缺席时回退中文.
- 读取未写进 `inject` 的可选服务要用 `ctx.get(...)`: cordis 不允许直接读未声明 inject 的服务属性.

## 模型自报 `approved: true`

模型只填 schema 里出现的字段. 发给模型的 schema 来自 `system-prompt/assemble`, 那一步会 structuredClone parameters, 且 bash / pwsh 注册在 agent preset 平面, 宿主插件的 `tools.get('bash')` 看不到. 因此本插件在 assemble 瀑布里给这一次下发的副本补上可选布尔 `approved`; 全局层若碰巧有同名工具, 仍顺手改活定义并听 `tools/change`. 官方工具包本身不改.

它不能用来骗放行: 前缀命中时本来就会 `allowed-once`, 与有没有这个字段无关. 它只改变 "前缀未命中" 的失败路径: 写了严格布尔 `true` 就 `rejected` (模型已经自称批准, 不再打扰人), 没写或值不对仍弹人工. 档位不在白名单, 不是提权, 或命令没记下, 即使带了这个字段也还是转人工.

模型要知道此刻有哪些前缀, 才能决定写不写这个字段. `systemPrompt` 就绪后注册 `approve-prefix:allow-prefixes` (order `10300`, 在第一方 persona 后缀之后), 文本每次组装现算, 并关闭变量插值. 静态前缀列在每个配置工具下, 持久前缀按工具过滤, 临时前缀只取组装上下文里那个会话; 没有 agent 时临时表按空处理. 同一前缀只保留更宽的来源. 段里同时用几句话说明单命令匹配和 `approved` 的失败路径, 避免只在参数 schema 里留一句而模型看不到当前表.

## 已知边界

- 默认覆盖 `bash` 和 `pwsh`. 注册表里没有的名字不补 `approved`, 也不写进系统提示词. `pwsh` / `powershell` 走本机 `[Parser]::ParseInput` 的摘要白名单, 与 unbash 路径分开; 宿主没有 pwsh 时 fail-closed.
- 命令原文依赖 `tools/pre-execute` 记录, 记录表有容量上限 (`pendingCapacity`), 长会话中极早的记录会被淘汰, 淘汰后转人工.
- 不做命令语义分析: 只判断 "是不是命名单命令", 不判断副作用.
- 审批卡片上的按钮无法被插件区分, 所以 "点某个按钮才记住前缀" 需要自己实现审批卡片的 client 应答器; 当前用会话 tab 与配置页代替.
- TUI / 无 GUI 不能改临时表.
