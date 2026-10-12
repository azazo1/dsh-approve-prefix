/**
 * 构建产物必须在脚本顶层保持自隔离.
 *
 * dsh 的 combo 路由把同一个批次里多个插件的 bundle 源码首尾拼接进同一个 classic script,
 * 而 classic script 顶层的 const/let/function 会进入共享的全局词法环境: 两个插件各写一个
 * `zh` 就是 `SyntaxError: Identifier 'zh' has already been declared`, 整批插件一个都注册不上.
 * 所以整个 bundle 必须包在一个 IIFE 里, 顶层只留下那个立即执行调用.
 */

import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const bundlePath = fileURLToPath(new URL('../lib/client/index.js', import.meta.url))

test('client bundle 的顶层只留注册调用, 不留任何声明', () => {
  const source = ts.createSourceFile(
    bundlePath,
    readFileSync(bundlePath, 'utf8'),
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS,
  )
  const leaking = source.statements
    .filter(statement => !ts.isExpressionStatement(statement))
    .map(statement => statement.getText(source).split('\n')[0]!.slice(0, 80))
  expect(leaking).toEqual([])
})

test('client bundle 注册的 id 与包名一致', () => {
  const source = readFileSync(bundlePath, 'utf8')
  const packageName = JSON.parse(
    readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  ).name as string
  expect(source).toContain(`id: '${packageName}'`)
})
