"use strict";
/**
 * dsh-approve-prefix 的 client 半边: 插件页卡片编辑持久放行前缀, 会话视图 tab 管理当前会话临时前缀.
 *
 * 本文件不能出现 import/export, 编译产物必须是可以直接加载的普通脚本; 平台模块 (React 与
 * 官方控件) 一律经 client factory 的 require 从 module loader 的表里取. 因此本文件自包含:
 * 命名空间与字段名与 `src/prefix/settings.ts` 是同一份契约, 改动时两边要一起改.
 *
 * 表单骨架用官方 SettingsFormModel + SettingsForm (草稿, 已覆盖标记, 保存语义都与其它插件一致),
 * 行编辑器 (工具名 + 前缀两列, 可增删) 自绘并嵌在官方表单里. 会话 tab 的编辑停在草稿, 点应用才 PUT.
 *
 * 文案走 client locale 注册, 跟随界面语言; locale 服务缺席时回退到中文.
 *
 * @module dsh-approve-prefix/client
 */
/** 插件包名, 必须与 package.json 的 name 以及 loader row 一致. */
const PLUGIN_ID = 'dsh-approve-prefix';
/** locale 命名空间. */
const LOCALE_NAMESPACE = 'dsh-approve-prefix';
/** settings 字段名, 与 `src/prefix/settings.ts` 的 PERSISTENT_PREFIXES_FIELD 一致. */
const PERSISTENT_PREFIXES_FIELD = 'persistentPrefixes';
/** 注入样式时用的标记, 避免重复插入. */
const CSS_ID = 'dsh-approve-prefix-settings';
/** 前缀里不允许出现的 shell 运算符. */
const DENIED_OPERATORS = ['|', ';', '&', '`', '$'];
/** 简体中文词典, 也是键集合的来源. */
const zh = {
    'description': '持久放行前缀: 命中的沙箱提权请求会被自动放行, 对所有会话生效并跨重启保留.',
    'label': '持久放行前缀',
    'intro': '只放行单条命令, 含管道, 分号, &&, 重定向或命令替换的命令一律转人工. '
        + '只想在当前会话里临时放行, 打开会话视图里的「放行前缀」.',
    'tab.label': '放行前缀',
    'tab.intro': '只对当前会话生效, 进程重启即清空. 改完后点应用才会写入当前会话, 未点之前审批仍用上一份已应用的表.',
    'tab.empty': '还没有本次会话的临时前缀',
    'tab.clear': '清空草稿',
    'tab.apply': '应用',
    'tab.applying': '应用中...',
    'tab.discard': '放弃更改',
    'tab.limit': '已达到本会话上限',
    'tab.loadFailed': '读不到当前会话的临时前缀',
    'tab.saveFailed': '没能写入当前会话的临时前缀',
    'tab.loading': '读取中...',
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
};
/** English dictionary. */
const en = {
    'description': 'Persistent allow prefixes: a matching sandbox escalation is approved automatically, in every session and across restarts.',
    'label': 'Persistent allow prefixes',
    'intro': 'Only a single command qualifies; pipelines, semicolons, &&, redirection and command substitution always go to a human. '
        + 'For a prefix that lives only in the current session, open Allow prefixes in the session view.',
    'tab.label': 'Allow prefixes',
    'tab.intro': 'Applies to this session only and is cleared when the process restarts. Click Apply to write the list; until then approvals still use the last applied table.',
    'tab.empty': 'no temporary prefix in this session yet',
    'tab.clear': 'clear draft',
    'tab.apply': 'Apply',
    'tab.applying': 'Applying...',
    'tab.discard': 'Discard',
    'tab.limit': 'this session has reached its limit',
    'tab.loadFailed': 'could not read this session\'s temporary prefixes',
    'tab.saveFailed': 'could not write this session\'s temporary prefixes',
    'tab.loading': 'loading...',
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
};
/**
 * 把行编辑器的条目编成官方字段的暂存文本: 每行 `工具名 前缀`.
 * @param entries - 已校验的条目.
 * @returns 每行一条的文本.
 */
function serializeEntries(entries) {
    return entries.map(entry => `${entry.tool} ${entry.prefix}`.trimEnd()).join('\n');
}
/**
 * 解析暂存文本: 每行按第一个空白切成工具名与前缀.
 * @param text - 暂存文本.
 * @returns 行数组; 空行忽略.
 */
function parseLines(text) {
    const entries = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '')
            continue;
        const boundary = trimmed.search(/\s/);
        entries.push(boundary < 0
            ? { tool: trimmed, prefix: '' }
            : { tool: trimmed.slice(0, boundary), prefix: trimmed.slice(boundary + 1).trim() });
    }
    return entries;
}
/**
 * 校验一条前缀.
 * @param entry - 待校验条目.
 * @returns 通过时为 undefined, 否则是失败原因的文案键.
 */
function validateEntry(entry) {
    if (entry.tool.trim() === '')
        return 'error.toolEmpty';
    if (entry.prefix.trim() === '')
        return 'error.prefixEmpty';
    for (const character of DENIED_OPERATORS) {
        if (entry.prefix.includes(character))
            return 'error.operator';
    }
    return undefined;
}
/** 会话临时前缀 HTTP 根路径, 与 Host 路由一致. */
const SESSION_PREFIX_ROOT = '/api/plugins/dsh-approve-prefix/sessions';
/**
 * 拼一条会话的前缀表路径.
 * @param sessionId - 会话 id.
 * @returns 绝对路径.
 */
function prefixesUrl(sessionId) {
    return `${SESSION_PREFIX_ROOT}/${encodeURIComponent(sessionId)}/prefixes`;
}
/**
 * 把 Host 返回的 JSON 解成 payload.
 * @param parsed - JSON.parse 的结果.
 * @returns 合法 payload, 对不上时为 undefined.
 */
function decodeSessionPayload(parsed) {
    if (typeof parsed !== 'object' || parsed === null)
        return undefined;
    const record = parsed;
    if (!Array.isArray(record['entries']))
        return undefined;
    const entries = [];
    for (const entry of record['entries']) {
        if (typeof entry !== 'object' || entry === null)
            return undefined;
        const tool = entry['tool'];
        const prefix = entry['prefix'];
        if (typeof tool !== 'string' || typeof prefix !== 'string')
            return undefined;
        entries.push({ tool, prefix });
    }
    const defaultTool = record['defaultTool'];
    const limit = record['limit'];
    if (typeof defaultTool !== 'string' || typeof limit !== 'number')
        return undefined;
    return { entries, defaultTool, limit };
}
/**
 * 读或写当前会话的临时前缀表.
 * @param sessionId - 会话 id.
 * @param method - GET 或 PUT.
 * @param entries - PUT 时的整表.
 * @returns Host 返回的 payload.
 */
async function requestPrefixes(sessionId, method, entries) {
    const response = await fetch(prefixesUrl(sessionId), {
        method,
        headers: method === 'PUT'
            ? { accept: 'application/json', 'content-type': 'application/json' }
            : { accept: 'application/json' },
        credentials: 'same-origin',
        body: method === 'PUT' ? JSON.stringify({ entries }) : undefined,
    });
    const parsed = await response.json();
    const payload = decodeSessionPayload(parsed);
    if (!response.ok || payload === undefined)
        throw new Error(String(response.status));
    return payload;
}
/**
 * 持久前缀字段的转换描述: 文本按行解析, 任一行不合法就整字段判为非法, 保存被拦下.
 * @returns 字段转换描述.
 */
function persistentPrefixesField() {
    return {
        field: PERSISTENT_PREFIXES_FIELD,
        format: (value) => Array.isArray(value) ? serializeEntries(value) : '',
        parse: (text) => {
            const trimmed = text.trim();
            if (trimmed === '')
                return { kind: 'clear' };
            const entries = parseLines(text);
            for (const entry of entries) {
                if (validateEntry(entry) !== undefined)
                    return undefined;
            }
            return { kind: 'set', value: entries };
        },
    };
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
.dsh-ap-tab {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
  min-height: 0;
  overflow: auto;
}
.dsh-ap-tab-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.dsh-ap-tab-title {
  flex: 1;
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
}
`;
/** 注入一次样式. */
function injectStyles() {
    if (typeof document === 'undefined')
        return;
    if (document.querySelector(`style[data-plugin-css="${CSS_ID}"]`) !== null)
        return;
    const style = document.createElement('style');
    style.dataset['pluginCss'] = CSS_ID;
    style.textContent = CSS_TEXT;
    document.head.appendChild(style);
}
/**
 * 造出卡片组件.
 * @param React - module loader 提供的 react.
 * @param primitives - 官方 SettingsForm 与 SettingsFormModel.
 * @returns 卡片组件.
 */
function createCard(React, primitives) {
    const { SettingsForm, Tag, Input, Button } = primitives;
    const el = (type, props, ...children) => React.createElement(type, props, ...children);
    /**
     * 行编辑器: 工具名 + 前缀两列, 可增删; 每次编辑把整表重新编成字段暂存文本.
     * @param props - 字段文案, 暂存文本与动作.
     * @returns 该字段行.
     */
    function PrefixRowsField(props) {
        const { t, state, disabled } = props;
        const entries = parseLines(state.text);
        const invalidLine = entries.find(entry => validateEntry(entry) !== undefined);
        const errorKey = invalidLine === undefined ? undefined : validateEntry(invalidLine);
        const write = (next) => { props.onEdit(serializeEntries(next)); };
        const update = (index, patch) => {
            write(entries.map((entry, position) => position === index ? { ...entry, ...patch } : entry));
        };
        const rows = entries.map((entry, index) => el('div', { className: 'row', key: `row-${String(index)}` }, el(Input, {
            className: 'tool',
            value: entry.tool,
            placeholder: t('placeholder.tool'),
            'aria-label': t('column.tool'),
            spellCheck: false,
            disabled,
            onChange: (event) => { update(index, { tool: event.currentTarget.value }); },
        }), el(Input, {
            className: 'prefix',
            value: entry.prefix,
            placeholder: t('placeholder.prefix'),
            'aria-label': t('column.prefix'),
            spellCheck: false,
            disabled,
            onChange: (event) => { update(index, { prefix: event.currentTarget.value }); },
        }), el(Button, {
            variant: 'ghost',
            size: 'sm',
            disabled,
            onClick: () => { write(entries.filter((_entry, position) => position !== index)); },
        }, t('action.remove'))));
        const badges = state.overridden
            ? el('span', { className: 'badges' }, el(Tag, { tone: 'neutral' }, t('overridden')), el('button', { type: 'button', className: 'reset', disabled, onClick: props.onReset }, t('reset')))
            : null;
        return el('div', { className: 'field' }, el('div', { className: 'head' }, el('span', { className: 'label' }, t('label')), badges), el('p', { className: 'hint' }, t('intro')), ...(rows.length === 0 ? [el('p', { className: 'empty' }, t('empty'))] : rows), el('div', { className: 'actions' }, el(Button, {
            variant: 'outline',
            size: 'sm',
            disabled,
            onClick: () => { write([...entries, { tool: 'bash', prefix: '' }]); },
        }, t('action.add'))), errorKey === undefined
            ? null
            : el('p', { className: 'invalid' }, `${t(errorKey)}: "${(invalidLine ?? { prefix: '' }).prefix}"`));
    }
    return function ApprovePrefixCard(props) {
        const { t } = props;
        const state = props.useApprovePrefixCard(snapshot => snapshot);
        if (props.view === 'summary')
            return t('description');
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
            onEdit: (text) => { props.edit(PERSISTENT_PREFIXES_FIELD, text); },
            onReset: () => { props.resetField(PERSISTENT_PREFIXES_FIELD); },
        }));
    };
}
/**
 * 造出会话视图 tab: 管理当前会话的临时前缀, 编辑只改草稿, 点应用才 PUT.
 * @param React - module loader 提供的 react.
 * @param primitives - 官方 Input 与 Button.
 * @returns tab 组件.
 */
function createSessionTab(React, primitives) {
    const { Input, Button } = primitives;
    const el = (type, props, ...children) => React.createElement(type, props, ...children);
    return function SessionTab(props) {
        const { sessionId, t } = props;
        const [entries, setEntries] = React.useState([]);
        const [applied, setApplied] = React.useState([]);
        const [limit, setLimit] = React.useState(32);
        const [defaultTool, setDefaultTool] = React.useState('bash');
        const [loading, setLoading] = React.useState(true);
        const [applying, setApplying] = React.useState(false);
        const [error, setError] = React.useState('');
        const [bag] = React.useState({ write: 0 });
        const adopt = (list) => list.map(entry => ({ tool: entry.tool, prefix: entry.prefix }));
        const applyDraft = () => {
            if (entries.some(entry => validateEntry(entry) !== undefined))
                return;
            if (serializeEntries(entries) === serializeEntries(applied))
                return;
            const mine = ++bag.write;
            setApplying(true);
            void requestPrefixes(sessionId, 'PUT', entries).then((payload) => {
                if (mine !== bag.write)
                    return;
                const next = adopt(payload.entries);
                setEntries(next);
                setApplied(next);
                setError('');
                setApplying(false);
            }).catch(() => {
                if (mine !== bag.write)
                    return;
                setError(t('tab.saveFailed'));
                setApplying(false);
            });
        };
        React.useEffect(() => {
            let cancelled = false;
            setLoading(true);
            setApplying(false);
            setError('');
            void requestPrefixes(sessionId, 'GET').then((payload) => {
                if (cancelled)
                    return;
                const next = adopt(payload.entries);
                setEntries(next);
                setApplied(next);
                setLimit(payload.limit);
                setDefaultTool(payload.defaultTool);
                setLoading(false);
            }).catch(() => {
                if (cancelled)
                    return;
                setError(t('tab.loadFailed'));
                setLoading(false);
            });
            return () => {
                cancelled = true;
                bag.write += 1;
            };
        }, [sessionId]);
        const invalidLine = entries.find(entry => validateEntry(entry) !== undefined);
        const errorKey = invalidLine === undefined ? undefined : validateEntry(invalidLine);
        const atLimit = entries.length >= limit;
        const dirty = serializeEntries(entries) !== serializeEntries(applied);
        const applyDisabled = loading || applying || !dirty || errorKey !== undefined;
        const editingDisabled = loading || applying;
        const update = (index, patch) => {
            setEntries(entries.map((entry, position) => position === index ? { ...entry, ...patch } : entry));
        };
        const rows = entries.map((entry, index) => el('div', { className: 'row', key: `row-${String(index)}` }, el(Input, {
            className: 'tool',
            value: entry.tool,
            placeholder: t('placeholder.tool'),
            'aria-label': t('column.tool'),
            spellCheck: false,
            disabled: editingDisabled,
            onChange: (event) => { update(index, { tool: event.currentTarget.value }); },
        }), el(Input, {
            className: 'prefix',
            value: entry.prefix,
            placeholder: t('placeholder.prefix'),
            'aria-label': t('column.prefix'),
            spellCheck: false,
            disabled: editingDisabled,
            onChange: (event) => { update(index, { prefix: event.currentTarget.value }); },
        }), el(Button, {
            variant: 'ghost',
            size: 'sm',
            disabled: editingDisabled,
            onClick: () => { setEntries(entries.filter((_entry, position) => position !== index)); },
        }, t('action.remove'))));
        return el('div', { className: 'dsh-ap-tab' }, el('div', { className: 'dsh-ap-tab-head' }, el('span', { className: 'dsh-ap-tab-title' }, t('tab.label')), el(Button, {
            variant: 'ghost',
            size: 'sm',
            disabled: editingDisabled || !dirty,
            onClick: () => {
                setEntries(adopt(applied));
                setError('');
            },
        }, t('tab.discard')), el(Button, {
            variant: 'outline',
            size: 'sm',
            disabled: applyDisabled,
            onClick: applyDraft,
        }, applying ? t('tab.applying') : t('tab.apply')), el(Button, {
            variant: 'ghost',
            size: 'sm',
            disabled: editingDisabled || entries.length === 0,
            onClick: () => { setEntries([]); },
        }, t('tab.clear'))), el('p', { className: 'hint' }, t('tab.intro')), loading ? el('p', { className: 'empty' }, t('tab.loading')) : null, !loading && rows.length === 0 ? el('p', { className: 'empty' }, t('tab.empty')) : null, ...(loading ? [] : rows), el('div', { className: 'actions' }, el(Button, {
            variant: 'outline',
            size: 'sm',
            disabled: editingDisabled || atLimit,
            onClick: () => {
                if (editingDisabled || atLimit)
                    return;
                setEntries([...entries, { tool: defaultTool, prefix: '' }]);
            },
        }, t('action.add'))), atLimit ? el('p', { className: 'hint' }, t('tab.limit')) : null, errorKey === undefined
            ? null
            : el('p', { className: 'invalid' }, `${t(errorKey)}: "${(invalidLine ?? { prefix: '' }).prefix}"`), error === '' ? null : el('p', { className: 'invalid' }, error));
    };
}
/**
 * 把字段暂存态桥接成卡片的快照 store, 并给出注册时注入的面.
 * @param form - 官方表单模型实例.
 * @returns 注入给卡片组件的面.
 */
function cardFace(form) {
    const store = form.bind(() => ({
        ...form.shell(),
        persistentPrefixes: form.field(PERSISTENT_PREFIXES_FIELD),
    }));
    return { hooks: { approvePrefixCard: store }, ...form.actions() };
}
/** 组装 client 半边. */
function createFactory(require) {
    return {
        inject: ['configForms', 'slots', 'locale'],
        apply(ctx) {
            injectStyles();
            const React = require('react');
            const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
            // 字典注册给官方表单框架的 t 用; 卡片的文案键都在 zh / en 里.
            ctx.locale.register(LOCALE_NAMESPACE, { zh, en });
            const scope = ctx.configForms.get(PLUGIN_ID);
            const form = new primitives.SettingsFormModel(scope, [persistentPrefixesField()]);
            const Card = createCard(React, primitives);
            const SessionTab = createSessionTab(React, primitives);
            const face = cardFace(form);
            const t = ctx.locale.bind(LOCALE_NAMESPACE);
            ctx.effect?.(() => () => { form.dispose(); }, `${PLUGIN_ID}: settings form`);
            ctx.effect?.(() => ctx.configForms.whileServed([PLUGIN_ID], () => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
                name: 'plugins.bundle.config',
                key: PLUGIN_ID,
                locale: LOCALE_NAMESPACE,
                inject: () => face,
            }, Card))), `${PLUGIN_ID}: plugins page card`);
            ctx.effect?.(() => ctx.slots.inject('conversation.view', () => ctx.slots.register({
                name: 'conversation.view',
                id: 'approve-prefix',
                order: 20,
                label: () => t('tab.label'),
                locale: LOCALE_NAMESPACE,
                inject: (sessionId) => ({ sessionId, t }),
            }, SessionTab)), `${PLUGIN_ID}: session tab`);
        },
    };
}
__ModuleLoader__.load({
    id: 'dsh-approve-prefix',
    factory: createFactory,
});
