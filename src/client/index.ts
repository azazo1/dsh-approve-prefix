/**
 * dsh-approve-prefix 的 client 半边: 在插件页的卡片上编辑持久放行前缀.
 *
 * 本文件不能出现 import/export, 编译产物必须是可以直接加载的普通脚本; 平台模块 (React 与
 * 官方控件) 一律经 client factory 的 require 从 module loader 的表里取. 因此本文件自包含:
 * 命名空间与字段名与 `src/prefix/settings.ts` 是同一份契约, 改动时两边要一起改.
 *
 * 表单骨架用官方 SettingsFormModel + SettingsForm (草稿, 已覆盖标记, 保存语义都与其它插件一致),
 * 行编辑器 (工具名 + 前缀两列, 可增删) 自绘并嵌在官方表单里.
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
/** 前缀里不允许出现的 shell 运算符. */
const DENIED_OPERATORS = ['|', ';', '&', '`', '$'] as const

/** 简体中文词典, 也是键集合的来源. */
const zh = {
  'description': '持久放行前缀: 命中的沙箱提权请求会被自动放行, 对所有会话生效并跨重启保留.',
  'label': '持久放行前缀',
  'intro': '只放行单条命令, 含管道, 分号, &&, 重定向或命令替换的命令一律转人工. '
    + '只想在当前会话里临时放行, 用 /approve-prefix-add.',
  'column.tool': '工具名',
  'column.prefix': '前缀 (命令词序列)',
  'placeholder.tool': 'bash',
  'placeholder.prefix': '例如 gh api 或 gh api graphql',
  'empty': '还没有持久放行前缀',
  'action.add': '新增一行',
  'action.remove': '删除',
  'error.toolEmpty': '工具名不能为空',
  'error.prefixEmpty': '前缀不能为空',
  'error.operator': '前缀不能包含 shell 运算符',
  'overridden': '已覆盖',
  'reset': '恢复默认',
  'readOnly': '本部署的设置为只读.',
  'unavailable': '该插件当前未加载, 暂时无法配置.',
  'save': '保存',
  'saving': '保存中...',
  'saveFailed': '本部署没有接受这些值, 已保留供你修改.',
}

/** English dictionary. */
const en: Record<string, string> = {
  'description': 'Persistent allow prefixes: a matching sandbox escalation is approved automatically, in every session and across restarts.',
  'label': 'Persistent allow prefixes',
  'intro': 'Only a single command qualifies; pipelines, semicolons, &&, redirection and command substitution always go to a human. '
    + 'For a prefix that lives only in the current session, use /approve-prefix-add.',
  'column.tool': 'Tool',
  'column.prefix': 'Prefix (command words)',
  'placeholder.tool': 'bash',
  'placeholder.prefix': 'for example gh api or gh api graphql',
  'empty': 'no persistent prefix yet',
  'action.add': 'add row',
  'action.remove': 'remove',
  'error.toolEmpty': 'tool must not be empty',
  'error.prefixEmpty': 'prefix must not be empty',
  'error.operator': 'a prefix must not contain shell operators',
  'overridden': 'Overridden',
  'reset': 'Reset to default',
  'readOnly': 'This deployment stores settings read-only.',
  'unavailable': 'This plugin is not loaded, so it cannot be configured right now.',
  'save': 'Save',
  'saving': 'Saving...',
  'saveFailed': 'The deployment did not accept these values; they were left for you to correct.',
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

/** 官方字段控件的暂存态. */
interface FieldStateLike {
  text: string
  overridden: boolean
  invalid: boolean
}

/** 官方表单的 shell 态. */
interface FormShellLike {
  available: boolean
  writable: boolean
  dirty: boolean
  invalid: boolean
  saving: boolean
  failed: boolean
}

/** 官方字段的转换描述. */
interface FieldSpecLike {
  field: string
  format: (value: unknown) => string
  parse: (text: string) => { kind: 'set', value: unknown } | { kind: 'clear' } | undefined
}

/** 官方表单模型的最小形状. */
interface SettingsFormModelLike {
  new (scope: SettingsScopeLike, specs: readonly FieldSpecLike[]): {
    bind<S>(project: () => S): unknown
    shell(): FormShellLike
    field(name: string): FieldStateLike
    actions(): {
      edit: (field: string, text: string) => void
      resetField: (field: string) => void
      save: () => void
      discard: () => void
    }
    dispose: () => void
  }
}

/** 官方控件里本插件用到的两个. */
interface PrimitivesLike {
  SettingsForm: (props: Record<string, unknown>) => unknown
  SettingsFormModel: SettingsFormModelLike
  /** 官方标签控件, 用作 "已覆盖" 标记. */
  Tag: (props: Record<string, unknown>) => unknown
  /** 官方单行输入框 (自带边框, 圆角与聚焦态). */
  Input: (props: Record<string, unknown>) => unknown
  /** 官方按钮. */
  Button: (props: Record<string, unknown>) => unknown
}

/** settings scope 里本插件用到的最小 API. */
interface SettingsScopeLike {
  getSnapshot(): { value?: unknown }
  subscribe(onChange: () => void): () => void
  mutate(ops: readonly { op: 'set' | 'unset', path: readonly string[], value?: unknown }[], expectedRevision?: number): Promise<boolean>
}

/** ConfigForms 服务里本插件用到的最小 API. */
interface ConfigFormsLike {
  get<T>(namespace: string): SettingsScopeLike
  whileServed(namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void): () => void
}

/** slots 服务里本插件用到的最小 API. */
interface SlotsLike {
  inject(name: string, register: () => () => void): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
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
  locale: LocaleLike
  effect?(callback: () => (() => void) | void, name?: string): void
}

/** 表单要渲染的卡片 props (由 slot 的 inject 面与页面 props 组成). */
interface CardProps {
  view: 'summary' | 'page'
  t: (key: string) => string
  useApprovePrefixCard: <S>(selector: (state: CardState) => S) => S
  edit: (field: string, text: string) => void
  resetField: (field: string) => void
  save: () => void
  discard: () => void
}

/** 卡片读到的状态. */
interface CardState extends FormShellLike {
  persistentPrefixes: FieldStateLike
}

/**
 * 把行编辑器的条目编成官方字段的暂存文本: 每行 `工具名 前缀`.
 * @param entries - 已校验的条目.
 * @returns 每行一条的文本.
 */
function serializeEntries(entries: readonly PersistentPrefixEntry[]): string {
  return entries.map(entry => `${entry.tool} ${entry.prefix}`.trimEnd()).join('\n')
}

/**
 * 解析暂存文本: 每行按第一个空白切成工具名与前缀.
 * @param text - 暂存文本.
 * @returns 行数组; 空行忽略.
 */
function parseLines(text: string): PersistentPrefixEntry[] {
  const entries: PersistentPrefixEntry[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const boundary = trimmed.search(/\s/)
    entries.push(boundary < 0
      ? { tool: trimmed, prefix: '' }
      : { tool: trimmed.slice(0, boundary), prefix: trimmed.slice(boundary + 1).trim() })
  }
  return entries
}

/**
 * 校验一条前缀.
 * @param entry - 待校验条目.
 * @returns 通过时为 undefined, 否则是失败原因的文案键.
 */
function validateEntry(entry: PersistentPrefixEntry): 'error.toolEmpty' | 'error.prefixEmpty' | 'error.operator' | undefined {
  if (entry.tool.trim() === '') return 'error.toolEmpty'
  if (entry.prefix.trim() === '') return 'error.prefixEmpty'
  for (const character of DENIED_OPERATORS) {
    if (entry.prefix.includes(character)) return 'error.operator'
  }
  return undefined
}

/**
 * 持久前缀字段的转换描述: 文本按行解析, 任一行不合法就整字段判为非法, 保存被拦下.
 * @returns 字段转换描述.
 */
function persistentPrefixesField(): FieldSpecLike {
  return {
    field: PERSISTENT_PREFIXES_FIELD,
    format: (value) => Array.isArray(value) ? serializeEntries(value as PersistentPrefixEntry[]) : '',
    parse: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return { kind: 'clear' }
      const entries = parseLines(text)
      for (const entry of entries) {
        if (validateEntry(entry) !== undefined) return undefined
      }
      return { kind: 'set', value: entries }
    },
  }
}

/** 卡片字段与行编辑器的样式, 尺寸对齐官方 fields.module.css. */
const CSS_TEXT = `
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.label {
  flex: 1;
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
}
.badges {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.reset {
  padding: 0;
  border: none;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
}
.reset:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.hint {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.5;
}
.invalid {
  margin: 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 1.5;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.row .tool { width: 160px; flex: none; }
.row .prefix { flex: 1; min-width: 0; }
.actions {
  display: flex;
  gap: 8px;
  padding-top: 2px;
}
.empty {
  margin: 0;
  padding: 2px 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.5;
}
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
 * 造出卡片组件.
 * @param React - module loader 提供的 react.
 * @param primitives - 官方 SettingsForm 与 SettingsFormModel.
 * @returns 卡片组件.
 */
function createCard(React: ReactLike, primitives: PrimitivesLike): (props: CardProps) => unknown {
  const { SettingsForm, Tag, Input, Button } = primitives
  const el = (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown =>
    React.createElement(type, props, ...children)

  /**
   * 行编辑器: 工具名 + 前缀两列, 可增删; 每次编辑把整表重新编成字段暂存文本.
   * @param props - 字段文案, 暂存文本与动作.
   * @returns 该字段行.
   */
  function PrefixRowsField(props: {
    t: (key: string) => string
    state: FieldStateLike
    disabled: boolean
    onEdit: (text: string) => void
    onReset: () => void
  }): unknown {
    const { t, state, disabled } = props
    const entries = parseLines(state.text)
    const invalidLine = entries.find(entry => validateEntry(entry) !== undefined)
    const errorKey = invalidLine === undefined ? undefined : validateEntry(invalidLine)

    const write = (next: readonly PersistentPrefixEntry[]): void => { props.onEdit(serializeEntries(next)) }
    const update = (index: number, patch: Partial<PersistentPrefixEntry>): void => {
      write(entries.map((entry, position) => position === index ? { ...entry, ...patch } : entry))
    }

    const rows = entries.map((entry, index) => el('div', { className: 'row', key: `row-${String(index)}` },
      el(Input, {
        className: 'tool',
        value: entry.tool,
        placeholder: t('placeholder.tool'),
        'aria-label': t('column.tool'),
        spellCheck: false,
        disabled,
        onChange: (event: { currentTarget: { value: string } }) => { update(index, { tool: event.currentTarget.value }) },
      }),
      el(Input, {
        className: 'prefix',
        value: entry.prefix,
        placeholder: t('placeholder.prefix'),
        'aria-label': t('column.prefix'),
        spellCheck: false,
        disabled,
        onChange: (event: { currentTarget: { value: string } }) => { update(index, { prefix: event.currentTarget.value }) },
      }),
      el(Button, {
        variant: 'ghost',
        size: 'sm',
        disabled,
        onClick: () => { write(entries.filter((_entry, position) => position !== index)) },
      }, t('action.remove'))))

    const badges = state.overridden
      ? el('span', { className: 'badges' },
        el(Tag, { tone: 'neutral' }, t('overridden')),
        el('button', { type: 'button', className: 'reset', disabled, onClick: props.onReset }, t('reset')))
      : null

    return el('div', { className: 'field' },
      el('div', { className: 'head' },
        el('span', { className: 'label' }, t('label')),
        badges),
      el('p', { className: 'hint' }, t('intro')),
      ...(rows.length === 0 ? [el('p', { className: 'empty' }, t('empty'))] : rows),
      el('div', { className: 'actions' },
        el(Button, {
          variant: 'outline',
          size: 'sm',
          disabled,
          onClick: () => { write([...entries, { tool: 'bash', prefix: '' }]) },
        }, t('action.add'))),
      errorKey === undefined
        ? null
        : el('p', { className: 'invalid' }, `${t(errorKey)}: "${(invalidLine ?? { prefix: '' }).prefix}"`))
  }

  return function ApprovePrefixCard(props: CardProps): unknown {
    const { t } = props
    const state = props.useApprovePrefixCard(snapshot => snapshot)
    if (props.view === 'summary') return t('description')

    return el(SettingsForm, {
      labels: {
        unavailable: t('unavailable'),
        readOnly: t('readOnly'),
        saveFailed: t('saveFailed'),
        save: t('save'),
        saving: t('saving'),
      },
      state,
      onSave: props.save,
      onDiscard: props.discard,
    }, el(PrefixRowsField, {
      t,
      state: state.persistentPrefixes,
      disabled: !state.writable,
      onEdit: (text: string) => { props.edit(PERSISTENT_PREFIXES_FIELD, text) },
      onReset: () => { props.resetField(PERSISTENT_PREFIXES_FIELD) },
    }))
  }
}

/**
 * 把字段暂存态桥接成卡片的快照 store, 并给出注册时注入的面.
 * @param form - 官方表单模型实例.
 * @returns 注入给卡片组件的面.
 */
function cardFace(form: InstanceType<SettingsFormModelLike>): {
  hooks: { approvePrefixCard: unknown }
  edit: (field: string, text: string) => void
  resetField: (field: string) => void
  save: () => void
  discard: () => void
} {
  const store = form.bind((): CardState => ({
    ...form.shell(),
    persistentPrefixes: form.field(PERSISTENT_PREFIXES_FIELD),
  }))
  return { hooks: { approvePrefixCard: store }, ...form.actions() }
}

/** 组装 client 半边. */
function createFactory(require: (name: string) => unknown): unknown {
  return {
    inject: ['configForms', 'slots', 'locale'],
    apply(ctx: ClientContext): void {
      injectStyles()
      const React = require('react') as ReactLike
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives') as PrimitivesLike
      // 字典注册给官方表单框架的 t 用; 卡片的文案键都在 zh / en 里.
      ctx.locale.register(LOCALE_NAMESPACE, { zh, en })

      const scope = ctx.configForms.get<ApprovePrefixSettings>(PLUGIN_ID)
      const form = new primitives.SettingsFormModel(scope, [persistentPrefixesField()])
      const Card = createCard(React, primitives)
      const face = cardFace(form)

      ctx.effect?.(() => () => { form.dispose() }, `${PLUGIN_ID}: settings form`)
      ctx.effect?.(() => ctx.configForms.whileServed([PLUGIN_ID], () => ctx.slots.inject(
        'plugins.bundle.config',
        () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: PLUGIN_ID,
          locale: LOCALE_NAMESPACE,
          inject: () => face,
        }, Card),
      )), `${PLUGIN_ID}: plugins page card`)
    },
  }
}

declare const __ModuleLoader__: { load(registration: { id: string, factory: (require: (name: string) => unknown) => unknown }): void }

__ModuleLoader__.load({
  id: 'dsh-approve-prefix',
  factory: createFactory,
})
