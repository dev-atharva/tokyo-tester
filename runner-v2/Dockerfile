# Build
FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git gcc musl-dev

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -ldflags '-extldflags "-static"' -o cots ./cmd/main.go

# Runtime
FROM alpine:latest

RUN apk --no-cache add ca-certificates docker-cli wget

WORKDIR /app

COPY --from=builder /build/cots .

RUN mkdir -p /app/data

ENV PORT=8080
ENV DB_TYPE=sqlite
ENV DB_PATH=/app/data/cots.db

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

ENTRYPOINT [ "/app/cots" ]
