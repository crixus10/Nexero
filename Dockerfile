# Imagine de producție — vezi docs/deploy.md.
# Deliberat FĂRĂ optimizare agresivă de dimensiune (node_modules complet,
# inclusiv devDependencies, în ambele stage-uri) — MVP, cost mic,
# simplitate peste kilobytes economisiți. Motiv concret: `prisma migrate
# deploy` (rulat la pornire, vezi docker-entrypoint.sh) are nevoie de
# pachetul `prisma` (CLI), care e devDependency — a-l muta în producție
# doar pentru asta ar complica package.json fără beneficiu real la scara
# unui MVP. De revizuit dacă imaginea devine un bottleneck real.

FROM node:24-alpine AS build
WORKDIR /app

# Copiem doar ce ține de instalare + schema Prisma înainte de `npm ci`,
# ca layer-ul de dependențe să rămână cache-uit când se schimbă doar codul
# sursă. Schema trebuie prezentă ÎNAINTE de `npm ci` — scriptul
# `postinstall` rulează `prisma generate`, care citește prisma/schema.prisma.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma7.config.ts ./prisma7.config.ts
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
