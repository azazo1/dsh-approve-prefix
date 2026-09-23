/**
 * 单命令前缀判定的单元测试.
 */

import { describe, expect, test } from 'bun:test'

import { judgeSingleCommandPrefix, tokenizeCommand } from '../src/prefix/judge.ts'

const PREFIXES = ['gh api']

/** 判定并只返回是否允许. */
function allowed(command: string): boolean {
  return judgeSingleCommandPrefix(command, PREFIXES).allowed
}

describe('judgeSingleCommandPrefix', () => {
  test('放行单条 gh api 命令', () => {
    expect(allowed('gh api user --jq .login')).toBe(true)
    expect(allowed('gh api repos/{owner}/{repo}/issues -f title=hello')).toBe(true)
    expect(allowed('gh   api   user')).toBe(true)
    expect(allowed('/usr/local/bin/gh api user')).toBe(true)
    expect(allowed("gh api user --jq '.login'")).toBe(true)
  })

  test('放行带环境变量前缀的 gh api 命令', () => {
    expect(allowed('ENVA=aaa gh api user')).toBe(true)
    expect(allowed('ENVA=aaa OTHER=bbb gh api user --jq .login')).toBe(true)
    expect(allowed('env ENVA=aaa gh api user')).toBe(true)
    expect(allowed('ENVA=aaa env OTHER=bbb gh api user')).toBe(true)
  })

  test('拒绝只有赋值或 env 带选项的命令', () => {
    expect(allowed('ENVA=aaa')).toBe(false)
    expect(allowed('ENVA=aaa OTHER=bbb')).toBe(false)
    expect(allowed('env -i gh api user')).toBe(false)
    expect(allowed('env ENVA=aaa')).toBe(false)
  })

  test('环境变量前缀不能改变被放行的命令', () => {
    expect(allowed('ENVA=aaa gh auth status')).toBe(false)
    expect(allowed('ENVA=aaa gh api user | jq .login')).toBe(false)
    expect(allowed('ENVA=aaa gh api user; rm -rf /tmp/x')).toBe(false)
  })

  test('拒绝管道, 链式与后台执行', () => {
    expect(allowed('gh api user | jq .login')).toBe(false)
    expect(allowed('gh api user; rm -rf /tmp/x')).toBe(false)
    expect(allowed('gh api user && gh api repos')).toBe(false)
    expect(allowed('gh api user || true')).toBe(false)
    expect(allowed('gh api user &')).toBe(false)
  })

  test('拒绝重定向与命令替换', () => {
    expect(allowed('gh api user > /tmp/out.json')).toBe(false)
    expect(allowed('gh api user >> /tmp/out.json')).toBe(false)
    expect(allowed('gh api user < /tmp/in.json')).toBe(false)
    expect(allowed('gh api $(echo user)')).toBe(false)
    expect(allowed('gh api `echo user`')).toBe(false)
    expect(allowed('gh api user\nrm -rf /tmp/x')).toBe(false)
  })

  test('拒绝前缀不匹配的命令', () => {
    expect(allowed('gh auth status')).toBe(false)
    expect(allowed('gh')).toBe(false)
    expect(allowed('ghx api user')).toBe(false)
    expect(allowed('api user')).toBe(false)
    expect(allowed('')).toBe(false)
    expect(allowed('   ')).toBe(false)
  })

  test('拒绝引号不闭合的命令', () => {
    expect(allowed("gh api user --jq '.login")).toBe(false)
  })

  test('额外拒绝字符参与扫描', () => {
    expect(judgeSingleCommandPrefix('gh api user', PREFIXES, ['a']).allowed).toBe(false)
    expect(judgeSingleCommandPrefix('gh api user', PREFIXES, []).allowed).toBe(true)
  })

  test('没有配置前缀时一律不放行', () => {
    expect(judgeSingleCommandPrefix('gh api user', []).allowed).toBe(false)
  })

  test('判定说明包含可排查的信息', () => {
    expect(judgeSingleCommandPrefix('gh api user | jq .', PREFIXES).detail).toContain('"|"')
    expect(judgeSingleCommandPrefix('gh api user', PREFIXES).detail).toContain('gh api')
    expect(judgeSingleCommandPrefix('ENVA=aaa gh api user', PREFIXES).detail).toContain('environment assignments')
  })
})

describe('tokenizeCommand', () => {
  test('去掉引号并保留引号内的空格', () => {
    expect(tokenizeCommand(`gh api -f 'body=a b'`)).toEqual(['gh', 'api', '-f', 'body=a b'])
  })

  test('未闭合引号返回 undefined', () => {
    expect(tokenizeCommand(`gh api -f 'body`)).toBeUndefined()
  })
})
