# Multi-stage Dockerfile for Aroma Listen Together Party Server
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Cache Go modules
COPY go.mod go.sum ./
RUN go mod download

# Copy source code and build statically linked binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o aroma-jam .

# Production runtime container
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata && \
    adduser -D -u 10001 aroma

WORKDIR /app
COPY --from=builder /app/aroma-jam /app/aroma-jam
RUN chmod +x /app/aroma-jam && chown -R aroma:aroma /app

USER aroma

EXPOSE 9000

ENV PORT=9000 \
    JAM_TRUST_PROXY=true

ENTRYPOINT ["/app/aroma-jam"]
