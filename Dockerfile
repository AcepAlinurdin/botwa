FROM node:22-bullseye-slim

# Install ffmpeg & ffprobe
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY . .

# Run the WhatsApp bot
CMD ["node", "index.js"]
