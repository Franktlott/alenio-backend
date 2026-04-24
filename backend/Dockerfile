FROM oven/bun:latest

# Install OpenSSL 3.0 — required by Prisma's query engine at runtime
RUN apt-get update -y && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package.json bun.lock ./

RUN bun install

# Copy the rest of the source
COPY . .

# Generate Prisma client
RUN bunx prisma generate

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "src/index.ts"]
