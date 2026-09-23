[private]
default:
    @just --list

# just install
# 安装构建期依赖.
install:
    pnpm install

# just typecheck
# 只做类型检查, 不产出文件 (Host 与 Client 两边).
typecheck:
    pnpm run typecheck

# just test
# 运行命令判定, 前缀表与插件接线测试.
test:
    bun test tests

# just build-host
# 编译 Host 半边到 lib/.
build-host:
    pnpm run build:host

# just build-client
# 编译 Client 半边到 lib/client/.
build-client:
    pnpm run build:client

# just build
# 编译 Host 与 Client 两边.
build:
    pnpm run build

# just pack-preview
# 预览将被打包进 tarball 的文件.
pack-preview:
    pnpm pack --dry-run

# just verify
# 类型检查, 测试, 构建和打包预览.
verify: typecheck test build
    pnpm pack --dry-run
