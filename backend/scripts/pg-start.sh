#!/usr/bin/env bash
# 启动本项目的本地 PostgreSQL（默认端口 5433，数据目录 backend/.pgdata）。
# 幂等：数据目录不存在时才 initdb；服务已在运行则跳过启动；数据库已存在则跳过创建。
# 注意：只操作本项目的数据目录，绝不触碰 5432（Hindsight）或其它实例。
set -euo pipefail

# 路径都基于脚本自身位置推导 backend 根目录，避免依赖调用者的当前目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# PostgreSQL 二进制目录，可通过 PG_BIN 覆盖
PG_BIN="${PG_BIN:-${HOME}/.pg0/installation/18.1.0/bin}"

# 数据目录、端口、监听地址；PGDATA/PGPORT 可覆盖（便于测试）
PGDATA="${PGDATA:-${BACKEND_DIR}/.pgdata}"
PGPORT="${PGPORT:-5433}"
PGHOST="${PGHOST:-127.0.0.1}"
PGUSER_APP="timesheet"
PGDB_APP="timesheet"
PG_LOG="${PG_LOG:-${BACKEND_DIR}/.pg.log}"

if [[ ! -x "${PG_BIN}/pg_ctl" ]]; then
  echo "错误：找不到 PostgreSQL 二进制目录 ${PG_BIN}，请设置 PG_BIN 环境变量" >&2
  exit 1
fi

# 1) 初始化数据目录（仅当不存在时）
if [[ ! -f "${PGDATA}/PG_VERSION" ]]; then
  echo "==> 初始化数据目录 ${PGDATA}"
  mkdir -p "${PGDATA}"
  "${PG_BIN}/initdb" -D "${PGDATA}" -U "${PGUSER_APP}" --auth=trust --encoding=UTF8
else
  echo "==> 数据目录已存在，跳过 initdb"
fi

# 2) 启动服务（已在运行则跳过）
if "${PG_BIN}/pg_ctl" -D "${PGDATA}" status >/dev/null 2>&1; then
  echo "==> PostgreSQL 已在运行，跳过启动"
else
  echo "==> 启动 PostgreSQL（端口 ${PGPORT}，日志 ${PG_LOG}）"
  "${PG_BIN}/pg_ctl" -D "${PGDATA}" \
    -o "-p ${PGPORT} -h ${PGHOST}" \
    -l "${PG_LOG}" \
    -w start
fi

# 3) 幂等创建应用数据库
if "${PG_BIN}/psql" -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER_APP}" -d postgres \
     -tAc "SELECT 1 FROM pg_database WHERE datname = '${PGDB_APP}'" | grep -qx 1; then
  echo "==> 数据库 ${PGDB_APP} 已存在，跳过创建"
else
  echo "==> 创建数据库 ${PGDB_APP}"
  # 并发场景下可能被其它进程抢先创建，失败后再确认一次
  if ! "${PG_BIN}/createdb" -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER_APP}" "${PGDB_APP}"; then
    if "${PG_BIN}/psql" -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER_APP}" -d postgres \
         -tAc "SELECT 1 FROM pg_database WHERE datname = '${PGDB_APP}'" | grep -qx 1; then
      echo "==> 数据库 ${PGDB_APP} 已由其它进程创建，忽略"
    else
      echo "错误：创建数据库 ${PGDB_APP} 失败" >&2
      exit 1
    fi
  fi
fi

echo "==> 就绪：postgres://${PGUSER_APP}@${PGHOST}:${PGPORT}/${PGDB_APP}"
