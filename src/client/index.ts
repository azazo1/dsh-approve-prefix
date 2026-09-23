/**
 * dsh-approve-prefix 的 client 半边: 在 Settings 里注册一个配置页, 用来编辑持久放行前缀.
 *
 * 本文件不能出现 import/export, 编译产物必须是可以直接加载的普通脚本; 因为 client bundle
 * 自包含, 这里的命名空间与字段名与 `src/prefix/settings.ts` 是同一份契约, 改动时两边要一起改.
 *
 * 文案走 client locale 注册, 跟随界面语言; locale 服务缺席时回退到中文.
 *
 * @module dsh-approve-prefix/client
 */

/** 插件包名, 必须与 package.json 的 name 以及 loader row 一致. */
const PLUGIN_ID = 'dsh-approve-prefix'
/** locale 命名空间. */
const LOCALE_NAMESPACE = 'dsh-approve-prefix'
/** settings 字段名, 与 `src/prefix/settings.ts` 的 PERSISTENT_PREFIXES_FIELD 一致. */
const PERSISTENT_PREFIXES_FIELD = 'persistentPrefixes'
/** 注入样式时用的标记, 避免重复插入. */
const CSS_ID = 'dsh-approve-prefix-settings'

/** 简体中文词典, 也是键集合的来源. */
const zh = {
  'nav.label': '放行前缀',
  'title': 'dsh-approve-prefix',
  'intro': '持久放行前缀: 命中的沙箱提权请求会被自动放行, 对所有会话生效并跨重启保留. '
    + '只放行单条命令, 含管道, 分号, &&, 重定向或命令替换的命令一律转人工. '
    + '只想在当前会话里临时放行, 用 /approve-prefix-add.',
  'column.tool': '工具名',
  'column.prefix': '前缀 (命令词序列)',
  'placeholder.tool': 'bash',
  'placeholder.prefix': '例如 gh api 或 gh api graphql',
  'empty': '还没有持久放行前缀',
  'action.add': '新增一行',
  'action.save': '保存',
  'action.reload': '重新载入',
  'action.remove': '删除',
  'status.saved': '已保存: 对所有会话生效, 并跨重启保留',
  'status.reloaded': '已从配置重新载入',
  'error.toolEmpty': '工具名不能为空',
  'error.prefixEmpty': '前缀不能为空',
  'error.operator': '前缀不能包含 shell 运算符',
}

/** English dictionary. */
const en = {
  'nav.label': 'Approve Prefix',
  'title': 'dsh-approve-prefix',
  'intro': 'Persistent allow prefixes: a matching sandbox escalation is approved automatically, '
    + 'in every session and across restarts. Only a single command qualifies; pipelines, semicolons, '
    + '&&, redirection and command substitution always go to a human. '
    + 'For a prefix that lives only in the current session, use /approve-prefix-add.',
  'column.tool': 'Tool',
  'column.prefix': 'Prefix (command words)',
  'placeholder.tool': 'bash',
  'placeholder.prefix': 'for example gh api or gh api graphql',
  'empty': 'no persistent prefix yet',
  'action.add': 'add row',
  'action.save': 'save',
  'action.reload': 'reload',
  'action.remove': 'remove',
  'status.saved': 'saved: it applies to every session and survives a restart',
  'status.reloaded': 'reloaded from settings',
  'error.toolEmpty': 'tool must not be empty',
  'error.prefixEmpty': 'prefix must not be empty',
  'error.operator': 'a prefix must not contain shell operators',
}

/** 一条持久前缀. */
interface PersistentPrefixEntry {
  tool: string
  prefix: string
}

/** settings 段落. */
interface ApprovePrefixSettings {
  persistentPrefixes: PersistentPrefixEntry[]
}

/** React 里本插件用到的最小 API. */
interface ReactLike {
  createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown
  useState<T>(initial: T): [T, (next: T) => void]
  useState<T>(initial: () => T): [T, (next: T) => void]
  useEffect(effect: () => (() => void) | undefined, dependencies: readonly unknown[]): void
}

/** settings scope 里本插件用到的最小 API. */
interface SettingsScopeLike {
  getSnapshot(): { value?: unknown }
  subscribe(onChange: () => void): () => void
  set(field: string, value: unknown): unknown
}

/** ConfigForms 服务里本插件用到的最小 API. */
interface ConfigFormsLike {
  get<T>(namespace: string): SettingsScopeLike
}

/** slots 服务里本插件用到的最小 API. */
interface SlotsLike {
  inject(name: string, register: () => void): void
  register(options: Record<string, unknown>, component: unknown): void
}

/** locale 服务里本插件用到的最小 API. */
interface LocaleLike {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): unknown
  bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
}

/** client 半边拿到的 Context. */
interface ClientContext {
  configForms: ConfigFormsLike
  slots: SlotsLike
  /** 读取未声明 inject 的可选服务, locale 缺席时回退到中文. */
  get?<T>(name: string): T | undefined
  effect?(callback: () => void): void
}

/** module loader 接口. */
interface ModuleLoaderLike {
  load(entry: { id: string; factory: (require: (name: string) => unknown) => unknown }): void
}

declare const __ModuleLoader__: ModuleLoaderLike

/** 样式: 跟随 DSH 的主题 token, 不引入与主题无关的固定颜色. */
const CSS_TEXT = `
[data-dsh-approve-prefix] { display: flex; flex-direction: column; gap: 12px; max-width: 760px; }
[data-dsh-approve-prefix] h2 { font-size: 18px; font-weight: 600; margin: 0; color: var(--dsw-alias-label-primary); }
[data-dsh-approve-prefix] p.intro { font-size: 13px; line-height: 1.6; margin: 0; color: var(--dsw-alias-label-tertiary); }
[data-dsh-approve-prefix] .card { background: var(--dsw-alias-bg-layer-3); border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; }
[data-dsh-approve-prefix] .head { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
[data-dsh-approve-prefix] .head span { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
[data-dsh-approve-prefix] .head .tool { flex: 0 0 110px; }
[data-dsh-approve-prefix] .head .prefix { flex: 1 1 220px; }
[data-dsh-approve-prefix] .head .tail { flex: 0 0 84px; }
[data-dsh-approve-prefix] .field { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px; border-top: 1px solid var(--dsw-alias-border-l2); }
[data-dsh-approve-prefix] .field:first-of-type { border-top: none; }
[data-dsh-approve-prefix] input { height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); font-size: 13px; }
[data-dsh-approve-prefix] input.tool { flex: 0 0 110px; }
[data-dsh-approve-prefix] input.prefix { flex: 1 1 220px; min-width: 160px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
[data-dsh-approve-prefix] input:focus-visible { outline: none; border-color: var(--dsw-alias-brand-primary); }
[data-dsh-approve-prefix] button { height: 34px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font-size: 13px; cursor: pointer; }
[data-dsh-approve-prefix] button:hover { background: var(--dsw-alias-bg-layer-2); }
[data-dsh-approve-prefix] button.primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); font-weight: 600; }
[data-dsh-approve-prefix] button.primary:hover { background: var(--dsw-alias-bg-layer-2); }
[data-dsh-approve-prefix] .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; border-top: 1px solid var(--dsw-alias-border-l2); padding: 12px 12px 14px; }
[data-dsh-approve-prefix] .status { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
[data-dsh-approve-prefix] .status.error { color: var(--dsw-alias-label-error); }
[data-dsh-approve-prefix] .empty { padding: 12px; font-size: 13px; color: var(--dsw-alias-label-tertiary); }
`

/** 注入一次样式. */
function injectStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css="${CSS_ID}"]`) !== null) return
  const style = document.createElement('style')
  style.dataset['pluginCss'] = CSS_ID
  style.textContent = CSS_TEXT
  document.head.appendChild(style)
}

/**
 * 把 settings 段落解析成配置, 结构不对时回退成空表.
 * @param section - settings 快照里的原始值.
 * @returns 解析后的配置.
 */
function decodeSettings(section: unknown): ApprovePrefixSettings | undefined {
  if (typeof section !== 'object' || section === null) return { persistentPrefixes: [] }
  const raw = (section as Record<string, unknown>)[PERSISTENT_PREFIXES_FIELD]
  if (!Array.isArray(raw)) return { persistentPrefixes: [] }
  const persistentPrefixes = raw.flatMap((entry): PersistentPrefixEntry[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const record = entry as Record<string, unknown>
    const tool = record['tool']
    const prefix = record['prefix']
    if (typeof tool !== 'string' || typeof prefix !== 'string') return []
    return [{ tool, prefix }]
  })
  return { persistentPrefixes }
}

/**
 * 校验一行编辑内容.
 * @param entry - 待写入的一行.
 * @param translate - 文案函数.
 * @returns 错误说明, 通过校验时返回 undefined.
 */
function validateEntry(
  entry: PersistentPrefixEntry,
  translate: (key: string) => string,
): string | undefined {
  if (entry.tool.trim() === '') return translate('error.toolEmpty')
  if (entry.prefix.trim() === '') return translate('error.prefixEmpty')
  for (const character of ['|', ';', '&', '`', '$']) {
    if (entry.prefix.includes(character)) return `${translate('error.operator')}: "${character}"`
  }
  return undefined
}

/** 组装 client 半边. */
function createFactory(require: (name: string) => unknown): unknown {
  return {
    inject: ['configForms', 'slots'],
    apply(ctx: ClientContext): void {
      injectStyles()
      const React = require('react') as ReactLike
      /*
       * cordis 不允许读取没有写进 inject 的服务属性, 所以这里用 get 取可选服务;
       * locale 缺席时文案回退到中文词典.
       */
      const locale = ctx.get?.<LocaleLike>('locale')
      if (locale !== undefined) locale.register(LOCALE_NAMESPACE, { zh, en })
      const translate = locale === undefined
        ? (key: string): string => zh[key as keyof typeof zh] ?? key
        : locale.bind(LOCALE_NAMESPACE)

      const scope = ctx.configForms.get<ApprovePrefixSettings>(PLUGIN_ID)

      const readStored = (): PersistentPrefixEntry[] => {
        const value = decodeSettings(scope.getSnapshot().value)
        return (value?.persistentPrefixes ?? []).map(entry => ({ tool: entry.tool, prefix: entry.prefix }))
      }

      const Page = (): unknown => {
        const [stored, setStored] = React.useState<PersistentPrefixEntry[]>(readStored)
        const [draft, setDraft] = React.useState<PersistentPrefixEntry[]>(readStored)
        const [status, setStatus] = React.useState<{ text: string; error: boolean }>({ text: '', error: false })

        React.useEffect(() => scope.subscribe(() => setStored(readStored())), [])

        const update = (index: number, patch: Partial<PersistentPrefixEntry>): void => {
          setDraft(draft.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)))
        }

        const save = (): void => {
          const cleaned = draft.map(entry => ({ tool: entry.tool.trim(), prefix: entry.prefix.trim() }))
          for (const entry of cleaned) {
            const error = validateEntry(entry, translate)
            if (error !== undefined) {
              setStatus({ text: error, error: true })
              return
            }
          }
          void Promise.resolve(scope.set(PERSISTENT_PREFIXES_FIELD, cleaned))
            .then(() => {
              setStored(cleaned)
              setDraft(cleaned)
              setStatus({ text: translate('status.saved'), error: false })
            })
            .catch((error: unknown) => {
              setStatus({ text: error instanceof Error ? error.message : String(error), error: true })
            })
        }

        const rows: unknown[] = draft.map((entry, index) => React.createElement(
          'div',
          { className: 'field', key: `row-${String(index)}` },
          React.createElement('input', {
            className: 'tool',
            value: entry.tool,
            placeholder: translate('placeholder.tool'),
            'aria-label': translate('column.tool'),
            onChange: (event: { currentTarget: { value: string } }) => update(index, { tool: event.currentTarget.value }),
          }),
          React.createElement('input', {
            className: 'prefix',
            value: entry.prefix,
            placeholder: translate('placeholder.prefix'),
            'aria-label': translate('column.prefix'),
            onChange: (event: { currentTarget: { value: string } }) => update(index, { prefix: event.currentTarget.value }),
          }),
          React.createElement(
            'button',
            { onClick: () => setDraft(draft.filter((_entry, position) => position !== index)) },
            translate('action.remove'),
          ),
        ))

        const cardChildren: unknown[] = [
          React.createElement(
            'div',
            { className: 'head', key: 'head' },
            React.createElement('span', { className: 'tool' }, translate('column.tool')),
            React.createElement('span', { className: 'prefix' }, translate('column.prefix')),
            React.createElement('span', { className: 'tail' }, ''),
          ),
        ]
        if (rows.length === 0) cardChildren.push(React.createElement('div', { className: 'empty', key: 'empty' }, translate('empty')))
        else cardChildren.push(...rows)
        cardChildren.push(React.createElement(
          'div',
          { className: 'actions', key: 'actions' },
          React.createElement('button', { onClick: () => setDraft([...draft, { tool: 'bash', prefix: '' }]) }, translate('action.add')),
          React.createElement('button', { className: 'primary', onClick: save }, translate('action.save')),
          React.createElement('button', {
            onClick: () => {
              setDraft(stored.map(entry => ({ ...entry })))
              setStatus({ text: translate('status.reloaded'), error: false })
            },
          }, translate('action.reload')),
          React.createElement(
            'span',
            { className: status.error ? 'status error' : 'status' },
            status.text,
          ),
        ))

        return React.createElement(
          'section',
          { 'data-dsh-approve-prefix': '' },
          React.createElement('h2', null, translate('title')),
          React.createElement('p', { className: 'intro' }, translate('intro')),
          React.createElement('div', { className: 'card' }, ...cardChildren),
        )
      }

      ctx.slots.inject('settings.section', () => ctx.slots.register(
        {
          name: 'settings.section',
          id: PLUGIN_ID,
          order: 100,
          label: () => translate('nav.label'),
        },
        Page,
      ))
    },
  }
}

__ModuleLoader__.load({
  id: 'dsh-approve-prefix',
  factory: createFactory,
})
