# dsh-approve-prefix

按 "单命令前缀" 自动放行 DeepSeek Harness 沙箱提权请求的插件.

当 agent 因为沙箱拦下某条命令, 改带 `sandbox_permissions` + `justification` 重试时, 本插件只在命令确实是**单条简单命令**且 argv 前缀命中放行前缀时替你点 "允许一次". 前缀不符且模型在 bash / pwsh 参数里写了 `approved: true` 时直接拒绝, 不弹卡片; 其余情况 (管道, 分号, `&&`, 重定向, 命令替换, 前缀不符但没写该字段) 原样弹人工审批.

## 它解决的问题

- dsh 的提权审批请求只带 `toolName` 和 `reason` (形如 `escalate sandbox to danger-full-access: <理由>`), 不带命令原文.
- 写在 `tools/pre-execute` 上的规则插件只能决定工具调用本身的 allow/deny/ask, 而提权审批发生在工具体内部, 规则放行不等于同意提权.
- 挂在 `approval/request` 上的模型审批插件能同意提权, 但靠模型分类, 不是确定性的前缀匹配.

本插件把两件事接起来: 在 `tools/pre-execute` 记下命令原文, 再以 `{ prepend: true }` 插到审批瀑布最前面, 按 `callId` 取回命令做确定性判定.

**它不从审批结果里学任何东西.** dsh 的审批接缝只有 `allowed-once` 一个放行结果, 没有 "允许一次" 与 "始终允许" 的区分, 插件看到的每次人工放行都长一样, 所以从结果里归纳前缀等于让一次 "允许一次" 变成长期自动放行. 放行前缀只来自静态配置, 配置页面与会话视图 tab 这三条显式路径.

## 判定规则

自动放行需要同时满足:

1. 审批请求来自 `tools` 中配置的工具 (默认 `bash`).
2. 请求是沙箱提权, 且目标档位在 `allowedEscalationModes` 内 (默认只允许 `danger-full-access`).
3. 命令由 `tools/pre-execute` 记录过, 并能按 `callId` 取回 (每条记录只消费一次).
4. 命令经 unbash 解析后是恰好一条简单命令: 没有管道, 链式, 子 shell, 后台, 重定向, 也没有参数 / 命令 / 算术 / 进程替换这类词展开. 引号内的换行, `$`, `|` 只是参数内容; 反斜杠续行会拼成同一条命令.
5. 去掉命令行前缀形式的环境变量赋值 (以及 `env` 包装) 后, argv 逐 token 命中某条放行前缀 (默认 `gh api`).

任一条不满足时默认交给下一个应答者 (人工卡片). 例外: 第 4 或第 5 条未通过 (命令不是可放行的单命令前缀), 且工具参数里的 `approved` 严格等于布尔 `true`, 则直接返回 `rejected`, 不再弹卡片. 没写该字段, 写了 `"true"` / `1` 之类, 或失败原因是档位 / 没有记下命令, 仍转人工.

插件会给 `tools` 配置里的工具 (默认 `bash`) 就地补一个可选的布尔参数 `approved`, 这样模型才能在 schema 里看见并填写它. bash 因 jobs 服务就绪而重新注册时, 会再打一次补丁.

| 命令 | 结果 |
|---|---|
| `gh api user --jq .login` | 自动放行 |
| `gh api -f body='hello<换行>world'` | 自动放行 (引号内换行仍是单命令) |
| `gh api user \\<换行> --jq .login` | 自动放行 (反斜杠续行) |
| `gh api -f query='query($x: Int)'` | 自动放行 (单引号内的 `$` 是字面量) |
| `ENVA=aaa gh api user` | 自动放行 (环境变量前缀被忽略) |
| `env ENVA=aaa gh api user` | 自动放行 |
| `/usr/local/bin/gh api repos/{owner}/{repo}` | 自动放行 (命令词取文件名部分) |
| `gh api user \| jq .login` | 人工 |
| `gh api user; rm -rf /tmp/x` | 人工 |
| `gh api user && gh auth status` | 人工 |
| `gh api user > /tmp/out.json` | 人工 |
| `gh api $(echo user)` | 人工 |
| `gh api user \\"<换行>true \\"` | 人工 (bash 会另起命令) |
| `env -i gh api user` | 人工 (`env` 带选项, 不做归约) |
| `ENVA=aaa` | 人工 (只有赋值, 没有命令) |
| `gh auth status` | 人工 |

## 放行前缀

前缀来自三处, 全部由你显式给出:

| 来源 | 存哪 | 生效范围 | 怎么改 |
|---|---|---|---|
| 静态 `prefixes` | profile 的 `cordis.patch.yml` | 本机所有会话, 每次启动 | 改配置后重启 `dsh web` |
| 持久前缀 | `settings.yaml` 的 `approve-prefix` 段 | 本机所有会话, 跨重启保留 | Settings 里的 **放行前缀** 配置页 |
| 临时前缀 | 进程内存 | 仅当前 GUI 会话 | 会话视图里的 **放行前缀** tab |

前缀的 "程度" 由 token 数决定: `gh api` 放行所有以 `gh api` 开头的单命令, 写 `gh api graphql` 就只放行 graphql 子命令.

### 会话 tab

会话视图里的 **放行前缀** tab 只管理当前选中会话的临时前缀: 列出, 新增, 删除, 清空, 原地改工具名 / 前缀. 改完立刻写入 Host 内存, 没有保存按钮; 进程重启即清空.

新增行的默认工具名是配置里 `tools` 的第一项 (现在是 `bash`). 非法行 (空工具名, 空前缀, 含 `| ; & ` $`) 不写 Host, 只在该行下报错. 达到 `temporaryPrefixLimit` 时拒绝新增.

临时表以 session id 分组, 在 A 会话里写入不会让 B 会话放行同一条前缀; 审批请求取不到会话身份时按空表处理, 不会退化成全局放行.

TUI / 无 GUI / headless 没有这条管理面, 也就改不了临时表; 静态与持久前缀, 以及已经写入内存的临时前缀, 审批自动放行照常.

没有斜杠命令.

### 配置页

Settings 里的 **放行前缀** 页用表格编辑持久前缀, 每行是 `工具名 + 前缀`, 可增行, 删行, 保存与重新载入; 保存后写入 settings, 对所有会话立即生效, 不需要重启:

```yaml
approve-prefix:
  persistentPrefixes:
    - tool: bash
      prefix: gh api
```

## 安装

插件同时有 Host 与 Client 半边 (后者提供配置页), 所以装完都要重启宿主进程, 让 client 产物被重新收取.

### Web 端

装进 `web` profile:

```shell
dsh plugin --profile web add azazo1/dsh-approve-prefix
```

本地目录也能装, 把坐标换成目录路径即可 (`dsh plugin --profile web add ./dsh-approve-prefix`); 需要固定版本时写 `azazo1/dsh-approve-prefix#<tag>`.

装完重启 `dsh web`, 浏览器里刷新一次页面.

### 桌面端

桌面端装进 `desktop` profile. 它由 Electron 应用独占管理, `dsh plugin` 会拒绝 `--profile desktop`, 所以要用应用内的插件管理器: 在插件页的安装入口填上面命令里对应的包名或本地目录. 装上后重启应用, 窗口刷新一次.

### 引擎版本线

要求 `@deepseek-ai/dsh-*` 不低于 `0.1.7-rc.2`, 且仍在 `0.1.x` 上 (声明了 dsh 依赖时 peerDependencies 与 devDependencies 都写作 `>=0.1.7-rc.2 <0.2.0`). 更早的引擎线装不上这个版本.

web 与 desktop 两个 profile 跑的是同一套 Web 应用, 桌面端只是多起一个 Host 子进程并给 `<html>` 打上平台标记, 所以同一份包在两边通用, 不需要分别构建.

## 配置

配置写在 profile 的 `cordis.patch.yml` 中该行的 `config` 下, 全部字段都有代码默认值:

```yml
- insert:
    - id: dsh-approve-prefix
      name: dsh-approve-prefix
      config:
        prefixes: ['gh api', 'gh pr view']
        debug: true
```

| 字段 | 默认值 | 说明 |
|---|---|---|
| `prefixes` | `['gh api']` | 静态放行前缀表, 每项是空格分隔的命令词序列; 置空表示什么都不自动放行 |
| `tools` | `['bash']` | 参与记录与判定的工具名 |
| `allowedEscalationModes` | `['danger-full-access']` | 允许自动放行的提权目标档位 |
| `extraDeniedCharacters` | `[]` | 在 AST 判定之外额外拒绝的单字符, 对命令原文整串扫描 |
| `onlyEscalations` | `true` | 为 false 时, 非提权来源的审批请求也按同一套命令规则应答 |
| `temporaryPrefixLimit` | `32` | 每个会话的临时前缀条数上限 |
| `debug` | `false` | 输出每次转人工的判定细节 |
| `pendingCapacity` | `128` | 命令记录表容量, 超限淘汰最旧一条 |

未知键, 类型不符或越界都会在插件加载时抛错, 不会静默降级成放行.

## 安全边界

- fail-closed: 判定器拿不到命令, 配置非法时转人工, 不会变成放行. 前缀不符默认也转人工; 只有模型同时写了布尔 `approved: true` 才改为直接拒绝.
- 一次性: 同一个 `callId` 的记录只消费一次, 重复请求转人工.
- 单命令结构由 AST 白名单固定, 不能通过配置取消管道 / 重定向 / 命令替换等检查, 避免把判定配成可绕过.
- 审批结果不参与学习, 所以一次 "允许一次" 不会改变后续判定.
- Host 半边不写 settings: 持久前缀只在你于配置页保存或手工编辑 settings 时变化.
- 已放行的调用仍受 dsh 自身的文件沙箱与审批审计约束: 会话日志里的 `approval/asked` 与 `approval/decided` 会记录本次询问与结果, 插件另在 info 级别打印判定依据.

## 局限

- 只覆盖 `bash`. `pwsh` 的语法与分词规则不同, 需要单独验证后再加入 `tools`.
- 命令原文依赖 `tools/pre-execute` 记录, 记录缺失时转人工; 记录表有容量上限, 长会话中极早的记录可能被淘汰.
- 不判断命令的实际副作用, 只判断它是不是 "命名单命令".
- 因为审批接缝无法区分按钮, 想做到 "点卡片上的某个按钮才记住前缀" 需要额外实现审批卡片上的按钮; 目前这一步由会话 tab 与配置页代替.
- TUI / 无 GUI 不能改临时表.

## 开发

```sh
just install
just typecheck
just test
just build
just verify
```

`tests/` 覆盖命令判定, 会话级临时前缀表, 认证 HTTP 与插件接线 (假 Context 驱动 pre-execute 与审批瀑布), 含 "点击允许一次不得带来自动放行" 的回归用例.
