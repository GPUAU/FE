# 1) 새 Vue 앱 빌드 (빌드 결과물은 아키텍처와 무관하므로 runner 플랫폼에서 네이티브로 빌드)
FROM --platform=$BUILDPLATFORM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# 2) nginx: 기존 정적 사이트 + Vue 앱 + /api/v1 프록시 (gzip·캐시)
#    비루트(uid 101) 이미지. 컨테이너 시작 시 templates/*.template을 envsubst로 conf.d에 쓴다.
FROM nginxinc/nginx-unprivileged:1.29-alpine
ENV BACKEND_URL=http://backend.u1-3.svc.cluster.local \
    AGENT_URL=http://cost-agent.u1-3.svc.cluster.local:8000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker_erd_20261117/app/web/static /usr/share/nginx/html/static
COPY --from=web /web/dist /usr/share/nginx/html/app
EXPOSE 8080
