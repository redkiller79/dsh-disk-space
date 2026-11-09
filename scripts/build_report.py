#!/usr/bin/env python3
"""Inject an analysis JSON into the HTML template -> a standalone report.

Usage:
    build_report.py <analysis.json> [output.html]

The analysis JSON is produced by Claude after interpreting scan.py output.
Schema (all sections optional except system):

{
  "generated_at": "2026-05-28 12:00:00",
  "scan_seconds": 42.1,
  "system": {os, build, arch, user, home, filesystem,
             disk_total, disk_used, disk_free, purgeable},
  "top5": [{rank, tier(green|yellow|red), size, type, name, path, note}],
  "green":  [{name, path, size_estimate, kill_processes:[], trash_paths:[...], commands:[{label,cmd}]}],
  "yellow": [{name, path, size, content_profile, why_manual, disposal, risk, trash_paths:[...]?, open_note?,
              migrate:[{label,cmd}]?}],   # migrate=迁移到其他盘的命令（挪走+软链，数据不删）
  "red":    [{name, path, size, why_keep, indirect_release, auto_reclaim, app_paths:[...]?}],
  "denied": ["/path/one", ...],
  "summary": {overview, tier_stats:{green,yellow,red}, priority:[...], long_term:[...]}
}

Scan output groups include "ai_caches" (Agent sessions / model caches / worktrees /
generated media) — classify those in analysis with extra care: session dirs and
worktrees may contain uncommitted work (usually yellow), model caches are
re-downloadable (usually green with a note on re-download cost).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "..", "assets", "report_template.html")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser(
        "~/Desktop/storage-report.html")

    with open(src, "r", encoding="utf-8") as f:
        data = json.load(f)
    with open(TEMPLATE, "r", encoding="utf-8") as f:
        tpl = f.read()

    blob = json.dumps(data, ensure_ascii=False)
    # 静态报告不带删除能力（DELETE=null），删除按钮只在 server.py 服务时出现
    html = tpl.replace("__REPORT_DATA__", blob).replace("__DELETE_CONFIG__", "null")

    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"报告已生成: {out}")

    # 交付约定：服务版（带删除按钮）是产品本体，静态 HTML 只是只读快照。
    # 在报告旁边生成一键启动器，双击即起服务版，避免用户双击静态文件掉回"只有命令"的模式。
    launcher = _write_launcher(out, src)
    print(f"服务版启动器（带删除按钮）: {launcher}")
    print(f"静态版仅只读快照，无删除按钮；想要按钮请双击启动器或运行:")
    print(f'  python "{os.path.join(HERE, "server.py")}" "{src}"')


def _write_launcher(out_html, src_json):
    """在报告旁生成平台对应的一键启动器（Windows .bat / macOS .command）。"""
    here = os.path.dirname(os.path.abspath(__file__))
    server = os.path.join(here, "server.py")
    out_dir = os.path.dirname(os.path.abspath(out_html)) or "."
    if sys.platform == "win32":
        path = os.path.join(out_dir, "启动清理服务.bat")
        # /sk 表示窗口执行完即关；chcp 65001 让中文路径不乱码
        content = ('@echo off\r\nchcp 65001 >nul\r\n'
                   f'python "{server}" "{src_json}"\r\n')
    else:
        path = os.path.join(out_dir, "启动清理服务.command")
        content = (f'#!/bin/sh\npython3 "{server}" "{src_json}"\n')
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    if sys.platform != "win32":
        os.chmod(path, 0o755)
    return path


if __name__ == "__main__":
    main()
