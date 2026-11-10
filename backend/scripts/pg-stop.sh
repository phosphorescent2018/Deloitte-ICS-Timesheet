#!/usr/bin/env bash
# 停止本项目的本地 PostgreSQL（数据目录 backend/.pgdata）。
# 幂等：未初始化或未运行时直接成功返回；不会删除数据目录。
set -euo pipefail

# 路径基于脚本自身位置定位 backend 根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

PG_BIN="${PG_BIN:-${HOME}/.pg0/installation/18.1.0/bin}"
PGDATA="${PGDATA:-${BACKEND_DIR}/.pgdata}"

if [[ ! -x "${PG_BIN}/pg_ctl" ]]; then
  echo "错误：找不到 PostgreSQL 二进制目录 ${PG_BIN}，请设置 PG_BIN 环境变量" >&2
  exit 1
fi

if [[ ! -f "${PGDATA}/PG_VERSION" ]]; then
  echo "==> 数据目录未初始化，无需停止"
  exit 0
fi

if ! "${PG_BIN}/pg_ctl" -D "${PGDATA}" status >/dev/null 2>&1; then
  echo "==> PostgreSQL 未在运行，无需停止"
  exit 0
fi

echo "==> 停止 PostgreSQL（${PGDATA}）"
if ! "${PG_BIN}/pg_ctl" -D "${PGDATA}" -m fast -w stop; then
  echo "错误：停止失败，请检查 ${BACKEND_DIR}/.pg.log" >&2
  exit 1
fi

echo "==> 已停止"
