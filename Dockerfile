# Use the official Rust image as base
FROM rust:latest as builder

# Set working directory
WORKDIR /app

# Copy Cargo files
COPY Cargo.toml Cargo.lock ./

# Copy source code
COPY src/ ./src/
COPY templates/ ./templates/
COPY static/ ./static/
COPY config.json ./config.json

# Build the application
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install necessary runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd -m -u 1001 appuser

# Set working directory
WORKDIR /app

# Copy the binary from builder stage
COPY --from=builder /app/target/release/rusty_exchange_dashboard /app/rusty_exchange_dashboard

# Copy templates, static files, and config
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/static ./static
COPY --from=builder /app/config.json ./config.json

# Change ownership to app user
RUN chown -R appuser:appuser /app

# Switch to app user
USER appuser

# Expose the port
EXPOSE 8082

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8082/ || exit 1

# Set environment variables
ENV RUST_LOG=info

# Run the application
CMD ["./rusty_exchange_dashboard"]