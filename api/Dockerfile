FROM node:20-bookworm-slim

WORKDIR /workspace

COPY api/package*.json ./api/
RUN cd api && npm ci --omit=dev && npm cache clean --force

COPY api ./api
COPY database ./database
COPY app ./app

RUN mkdir -p /workspace/listings /workspace/uploads /workspace/reports /workspace/data /workspace/admin

ENV NODE_ENV=production \
	PORT=3000

EXPOSE 3000

WORKDIR /workspace/api
CMD ["node", "server.js"]
