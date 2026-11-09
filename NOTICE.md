# NOTICE

## 本包构成

- **新增部分**：`lib/index.js`（DSH 宿主插件、`defineTool` 工具注册）、`cordis.patch.yml`、`package.json`、`README.md`、测试。由本仓库作者编写。
- **复用部分**：`scripts/scan.py`、`scripts/build_report.py`、`assets/report_template.html`、`LICENSE`，来自开源技能 `c-drive-slimmer`（磁盘空间分析助手），MIT 许可证，Copyright (c) 2026 飞哥。原许可证全文保留在 `LICENSE`，未删改版权行。

## 改动说明

1. 把原技能「由 Agent 手动执行 Python 脚本」的流程，封装为 DSH 原生 `ctx.tools.register` 工具，使模型可直接调用。
2. 扫描完整结果落到临时 JSON，只把有界摘要（Top 20、分类总量、磁盘容量）交给模型，避免整盘树占满上下文。
3. 报告默认输出到系统临时目录，避免原脚本默认写桌面的行为在插件场景下造成意外写入。
4. 支持 `exec.signal` 取消正在运行的子进程；子进程使用参数数组调用，不经过 shell。
5. 明确声明权限边界：只读扫描、命令只展示不执行、不联网、不读凭据。

## 第三方依赖

| 包 | 许可证 | 用途 |
| --- | --- | --- |
| `@deepseek-ai/cordis` | MIT | DSH 插件上下文（peer） |
| `@deepseek-ai/dsh-tools` | MIT | `defineTool` 工具定义（peer） |
| Python 3 | PSF License | 运行包内扫描 / 报告脚本（外部运行时，非 npm 依赖） |

本包 `dependencies` 为空，无安装期生命周期脚本，无原生构建产物。

## 权属

未抹除上游版权声明。上游 MIT 许可允许复制、修改、发布、分发与商用；本文件用于保留来源与举证链。
