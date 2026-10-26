FROM node:22-slim

# Install OpenSSL for Prisma query engine
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies including devDependencies needed for build
RUN npm ci --include=dev

# Copy application source
COPY . .

# Generate Prisma Client and build production bundle
RUN npx prisma generate
RUN npm run build

# Default environment
ENV NODE_ENV=production
ENV PORT=7860
ENV HOST=0.0.0.0

EXPOSE 7860

# Ensure non-root user (Hugging Face default user UID 1000)
RUN useradd -m -u 1000 user || true
RUN chown -R 1000:1000 /app
USER 1000

CMD ["npm", "start"]
