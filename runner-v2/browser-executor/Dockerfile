FROM mcr.microsoft.com/playwright:v1.61.0-noble@sha256:57b65fdc9ceabe0ef613124c7bbe2babcf9362c4d85e382fe3b03604e84b428a

WORKDIR /executor
COPY browser-executor/package.json browser-executor/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY pkg/browserjourney/executor.mjs ./executor.mjs

USER pwuser
ENTRYPOINT ["node", "/executor/executor.mjs"]
