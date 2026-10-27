# Reel's computer: a real, light Linux desktop (Xvfb + Openbox + tint2 + PCManFM + xterm + Chromium) ~350-700 MB RAM in use.
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb openbox tint2 pcmanfm xterm xdotool x11-utils ffmpeg chromium fonts-dejavu-core fonts-noto-core ca-certificates procps \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -m -u 1001 reel && mkdir -p /home/reel/home && chown -R reel:reel /home/reel
WORKDIR /desk
COPY . .
USER reel
ENV DESK_HOST=0.0.0.0 DESK_HOME=/home/reel/home DESK_CHROME=/usr/bin/chromium DESK_IDLE_MIN=10
VOLUME ["/home/reel/home"]
EXPOSE 7900
CMD ["node", "server.mjs"]
