FROM node:22-slim

# Install OpenSSL for Prisma query engine
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install ONLY production dependencies (lightweight, minimal RAM)
RUN npm ci --omit=dev

# Generate Prisma Client
RUN npx prisma generate

# Copy prebuilt distribution bundle and deploy scripts
COPY dist ./dist/
COPY scripts ./scripts/

# Default environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["npm", "start"]
