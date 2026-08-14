FROM node:22-slim

WORKDIR /usr/src/app

ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=256 --expose-gc"

# Install dependencies first for fast caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY . .

EXPOSE 10000
CMD [ "node", "server.js" ]
