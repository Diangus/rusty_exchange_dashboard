# 🦀 Rusty Exchange Dashboard

A live dashboard application built with Rust and Actix-Web that displays real-time data from Redis through Server-Sent Events (SSE).

## Features

- **Actix-Web Server**: High-performance web server with async support
- **Server-Sent Events (SSE)**: Real-time data streaming to the browser
- **Redis Integration**: Ready for Redis data sources
- **Responsive UI**: Clean, modern dashboard interface
- **Static File Serving**: Serves HTML, CSS, and JavaScript assets

## Quick Start

1. **Install Dependencies**
   ```bash
   cargo build
   ```

2. **Run the Server**
   ```bash
   cargo run
   ```

3. **Open Dashboard**
   - Main dashboard: http://127.0.0.1:8080
   - Alternative dashboard: http://127.0.0.1:8080/static/dashboard.html

## API Endpoints

### GET `/`
Serves the main dashboard page with embedded HTML and JavaScript.

### GET `/sse`
Server-Sent Events endpoint that streams live data every 2 seconds.

**Response Format:**
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "counter": 1,
  "status": "live",
  "mock_data": {
    "price": 100.50,
    "volume": 1010,
    "trades": 5
  }
}
```

### GET `/static/*`
Serves static files from the `static/` directory.

## Project Structure

```
rusty_exchange_dashboard/
├── src/
│   ├── main.rs          # Main server setup and routes
│   └── sse.rs           # SSE handler implementation
├── static/
│   └── dashboard.html   # Alternative dashboard view
├── Cargo.toml           # Dependencies
└── README.md           # This file
```

## Dependencies

- `actix-web`: Web framework
- `actix-files`: Static file serving
- `redis`: Redis client (for future data integration)
- `serde_json`: JSON serialization
- `chrono`: Date/time handling
- `tokio`: Async runtime
- `futures`: Stream utilities

## Future Enhancements

- [ ] Redis data integration
- [ ] Authentication and authorization
- [ ] Multiple data streams
- [ ] Historical data charts
- [ ] WebSocket support
- [ ] Configuration file support

## Development

The application currently uses mock data for demonstration. To integrate with real Redis data:

1. Update the `SSEStream` implementation in `src/sse.rs`
2. Connect to your Redis instance
3. Replace mock data with actual Redis data

## License

This project is open source and available under the MIT License.