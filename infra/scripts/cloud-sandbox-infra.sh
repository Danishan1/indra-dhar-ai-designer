#!/bin/bash
# ONLY for sandboxed Claude cloud workspaces where Docker Hub is blocked (see docs/plan/08-session-playbook.md
# "Remote sessions"). On a normal machine use `pnpm infra:up` / `pnpm infra:test:up` instead.
# Starts the same services on the same ports as infra/compose/docker-compose.dev.yml using locally
# installed PostgreSQL 16 + redis-server and the moto S3 emulator (pip install "moto[server]").
set -u
PGBIN=/usr/lib/postgresql/16/bin
start_pg() { # dir port db password
  if [ ! -d "$1" ]; then mkdir -p "$1"; chown postgres "$1"; su postgres -c "$PGBIN/initdb -D $1 -U postgres -A trust" >/dev/null; fi
  su postgres -c "$PGBIN/pg_ctl -D $1 -o '-p $2 -k /tmp' -l $1.log start" >/dev/null 2>&1
  sleep 2
  psql -h 127.0.0.1 -p $2 -U postgres -tc "select 1 from pg_roles where rolname='aid'" | grep -q 1 || psql -h 127.0.0.1 -p $2 -U postgres -c "create role aid login superuser password '$4'" >/dev/null
  psql -h 127.0.0.1 -p $2 -U postgres -tc "select 1 from pg_database where datname='$3'" | grep -q 1 || psql -h 127.0.0.1 -p $2 -U postgres -c "create database $3 owner aid" >/dev/null
}
start_pg /var/tmp/pgdev 5432 ai_designer aid_dev_password
start_pg /var/tmp/pgtest 55432 ai_designer_test aid_test_password
redis-server --port 6379 --daemonize yes --save '' >/dev/null
redis-server --port 56379 --daemonize yes --save '' >/dev/null
curl -s -o /dev/null localhost:8333 || (nohup moto_server -H 127.0.0.1 -p 8333 >/tmp/moto-dev.log 2>&1 &)
curl -s -o /dev/null localhost:58333 || (nohup moto_server -H 127.0.0.1 -p 58333 >/tmp/moto-test.log 2>&1 &)
# Mailpit (dev 1025/8025, test 51025/58025) — binary from GitHub releases (Docker Hub is blocked).
if ! command -v mailpit >/dev/null; then
  curl -sSL https://github.com/axllent/mailpit/releases/download/v1.27.10/mailpit-linux-amd64.tar.gz | tar xz -C /usr/local/bin mailpit
fi
curl -s -o /dev/null localhost:8025 || (nohup mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 >/tmp/mailpit-dev.log 2>&1 &)
curl -s -o /dev/null localhost:58025 || (nohup mailpit --smtp 127.0.0.1:51025 --listen 127.0.0.1:58025 >/tmp/mailpit-test.log 2>&1 &)
sleep 2
psql -h 127.0.0.1 -p 5432 -U postgres -tc "select 1 from pg_database where datname='aid_shadow'" | grep -q 1 || psql -h 127.0.0.1 -p 5432 -U postgres -c "create database aid_shadow owner aid" >/dev/null
echo "sandbox infra up (dev: 5432/6379/8333/1025+8025, test: 55432/56379/58333/51025+58025)"
