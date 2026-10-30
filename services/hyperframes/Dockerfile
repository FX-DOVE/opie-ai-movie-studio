# HyperFrames (Apache-2.0) shot animator: HTML+GSAP compositions → MP4 in headless Chrome.
# Local only: no HeyGen cloud, no publish, no transcribe (non-Meta Whisper), no telemetry.
FROM node:22-bookworm-slim
ENV HYPERFRAMES_SKIP_SKILLS=1 DO_NOT_TRACK=1 PRODUCER_LOW_MEMORY_MODE=true NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates fonts-dejavu-core fonts-liberation \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 libx11-xcb1 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
RUN npm init -y >/dev/null && npm i --no-audit --no-fund hyperframes@0.8.221
COPY gsap.min.js server.mjs ./
COPY warm ./warm
# warm-up render at build time downloads the pinned headless Chrome into the image
RUN cp gsap.min.js warm/ && cd warm && npx hyperframes render --low-memory-mode -o /tmp/warm.mp4 && rm -f /tmp/warm.mp4
EXPOSE 8100
CMD ["node", "server.mjs"]
