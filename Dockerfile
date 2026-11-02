# Một container cho Growth Workspace (D-03). Nền tảng host chạy web Hàng chờ làm tiến trình chính
# và gọi các job theo lịch bằng `bun run ...` (không có thư viện cron trong tiến trình).
# Growth DB (SQLite) nằm trên ổ bền gắn vào /data; mã hoá ổ và backup do nền tảng lo (Q-13).
FROM oven/bun:1.4.4-slim
WORKDIR /app
ENV NODE_ENV=production GROWTH_DB_PATH=/data/growth.sqlite PORT=3000
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY scripts ./scripts
COPY evals ./evals
USER bun
EXPOSE 3000
CMD ["bun", "run", "src/queue/server.ts"]
