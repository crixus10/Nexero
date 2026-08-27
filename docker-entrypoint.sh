#!/bin/sh
# Vezi docs/deploy.md. Rulează migrațiile Prisma EXISTENTE (nu generează
# migrări noi — asta se face în dev, cu `prisma migrate dev`, și se
# comite în git; aici doar se aplică ce e deja în prisma/migrations/,
# per convenția din CLAUDE.md) înainte de a porni aplicația.
set -e

echo "[entrypoint] Rulez migrațiile Prisma (migrate deploy)..."
npx prisma migrate deploy

echo "[entrypoint] Migrații aplicate. Pornesc aplicația..."
exec "$@"
