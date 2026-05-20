FROM node:20-bookworm
WORKDIR /app

# Install native build deps for sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
RUN npm install --include=dev

# Copy source and build frontend
COPY . .
RUN npm run build

# Runtime
ENV NODE_ENV=production
# PORT is injected by Render (default 3001 for local dev)
EXPOSE 3001
CMD ["node", "server/index.cjs"]
