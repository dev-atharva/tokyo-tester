# Build
FROM golang:1.25.4-alpine AS builder

RUN apk add --no-cache git

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o cots ./cmd/main.go
RUN CGO_ENABLED=0 GOOS=linux go build -o tokyo-mcp ./cmd/mcp

# Development
FROM golang:1.25.4-alpine AS dev

RUN apk add --no-cache git docker-cli wget
RUN go install github.com/air-verse/air@latest

WORKDIR /app

# Shared runtime
FROM alpine:latest AS runtime-base

RUN apk --no-cache add ca-certificates wget

WORKDIR /app

ENV PORT=8080
ENV DB_TYPE=mysql

EXPOSE 8080

FROM runtime-base AS mcp
COPY --from=builder /build/tokyo-mcp .
ENV PORT=8090
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:8090/health || exit 1
ENTRYPOINT [ "/app/tokyo-mcp" ]

FROM runtime-base AS runner
RUN apk --no-cache add docker-cli
COPY --from=builder /build/cots .

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

ENTRYPOINT [ "/app/cots" ]
