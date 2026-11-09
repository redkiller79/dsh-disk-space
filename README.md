# dsh-disk-space

DeepSeek Harness（DSH）插件：把「C 盘瘦身 / 磁盘空间分析」技能封装成模型可调用的工具。只读扫描本机磁盘占用，找出占空间大户，生成带三级清理建议和一键复制命令的交互式 HTML 报告。

> **只读保证**：扫描阶段只做统计与列目录；清理命令只写进报告供人审阅，插件从不执行 `rm` / `mv` / 删除 / 改权限，也不清空回收站。

## 能力

| 工具名 | 作用 |
| --- | --- |
| `diskspace_scan` | 只读扫描 Windows / macOS 磁盘，返回各盘容量、分类总量、Top 20 占空间大户；完整结果写入临时 JSON 并返回路径 |
| `diskspace_inspect` | 读取已有扫描 JSON，按分类查看明细或列出全部分类；不重新扫描 |
| `diskspace_report` | 由扫描 JSON 生成自包含交互式 HTML 报告（含 🟢可清理 / 🟡需判断 / 🔴谨慎 三级建议） |

示例对话：

```
帮我看看 C 盘为什么满了，出一份带图表的报告，标清哪些能删、哪些碰不得
```

## 安装

需要 Node.js >= 22、Python 3、DeepSeek Harness 0.2.x。

```sh
dsh plugin --profile web add dsh-disk-space
# 或者从源码安装
dsh plugin --profile web add github:redkiller79/dsh-disk-space
```

安装后重启 `dsh web`（或桌面端），插件会以 `dsh-disk-space` 这个入口 ID 挂载。可用 `dsh --profile web --dump-config` 确认已加载。

卸载：

```sh
dsh plugin --profile web remove dsh-disk-space
```

Python 可执行文件默认在 Windows 用 `python`、macOS 用 `python3`；需要指定时设置环境变量 `DSH_DISK_SPACE_PYTHON`。

## 外部依赖

- **Python 3**（运行时外部依赖）：扫描与报告生成复用包内自带的 `scripts/scan.py`、`scripts/build_report.py`，通过子进程调用，不联网。
- `@deepseek-ai/cordis` ^4.1.0、`@deepseek-ai/dsh-tools` >=0.0.1-rc.1：均为 **peerDependencies**，由 DSH 宿主提供；本包无 `dependencies`、无 `preinstall` / `install` / `postinstall` / `prepare` 生命周期脚本。
- 无网络请求、无 API Key、无遥测、无凭据读取。

## 权限范围（如实声明）

| 类别 | 范围 |
| --- | --- |
| 文件读取 | 扫描阶段遍历常见占用目录（用户目录、AppData / Library、下载、程序目录、开发缓存等）并读取文件元信息；`diskspace_inspect` 读取调用方给出的扫描 JSON |
| 文件写入 | 仅写入系统临时目录 `os.tmpdir()/dsh-disk-space/` 下的扫描 JSON 与 HTML 报告；调用方显式传 `outputPath` 时写到该路径 |
| 命令执行 | 仅以子进程方式执行包内自带的两个 Python 脚本，参数只有脚本路径与输出路径，不拼接 shell、不执行用户提供的命令文本 |
| 网络 | 无 |
| 凭据 | 无 |

**主要风险**：全盘扫描在目录很多时可能耗时数十秒到数分钟；报告中的清理命令是文本建议，误执行仍可能删掉用户数据，务必人工逐条确认。插件本身不提供自动删除能力。

## 兼容性

| 项 | 声明 |
| --- | --- |
| DSH | `>=0.2.1-rc.1 <0.3.0`（声明范围，未逐版本实机验收） |
| Profile | `web` / `desktop` |
| 系统 | Windows、macOS（Linux 上扫描脚本会返回 `unsupported_platform`） |
| Node.js | >= 22 |
| Python | 3.x |

上述为作者声明，非第三方市场对全部版本的端到端验收结论。

## 上架状态

DeepSeek 官方插件市场截至 2026-11-09 仍处「宣布将建设」阶段，尚未开放上传。本插件目前通过以下渠道分发：

1. npm 包 `dsh-disk-space`（`dsh plugin add` 可直接按包名安装）；
2. GitHub 仓库带 `dsh-plugin` topic，由 DSH Index / 社区插件目录自动收录；
3. 可另行向第三方 DSH Store 提交收录申请。

## 来源与许可

扫描与报告脚本来自开源技能 `c-drive-slimmer`（MIT，Copyright (c) 2026 飞哥），本包新增 DSH 宿主插件封装层。详见 [NOTICE.md](./NOTICE.md) 与 [LICENSE](./LICENSE)。
