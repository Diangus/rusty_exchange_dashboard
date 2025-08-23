# Redis Keys and Channels Specification

## Overview

This document specifies all Redis keys and channels used by the WebSocket Capture application. The application uses Redis for both persistent key-value storage and real-time pub/sub messaging.

## Redis Keys (Key-Value Storage)

### Orderbook Data
- **Key Pattern**: `orderbook:{instrument}`
- **Type**: String (JSON)
- **Content**: Complete orderbook snapshot
- **Example**: `orderbook:AAPL`
- **Data Structure**: `OrderbookUpdate` serialized as JSON

### Best Bid/Offer (BBO) Data
- **Key Pattern**: `bbo:{instrument}`
- **Type**: String (JSON)
- **Content**: Current best bid and offer
- **Example**: `bbo:AAPL`
- **Data Structure**: `BestBidOffer` serialized as JSON

### Last Trade Price
- **Key Pattern**: `last_trade:{instrument}`
- **Type**: String (Float)
- **Content**: Last traded price for the instrument
- **Example**: `last_trade:AAPL`
- **Data Structure**: Float value as string (e.g., "150.25")

### Theoretical Prices
- **Key Pattern**: `theo:{underlying}`
- **Type**: String (Float)
- **Content**: Current theoretical price for each underlying
- **Example**: `theo:AAPL_STOCK`
- **Data Structure**: Float value as string (e.g., "50.25")
- **Update Frequency**: Random intervals (0-4 seconds) using random walk simulation

### Static Configuration Data
- **Key**: `static_data:instruments`
- **Type**: String (JSON)
- **Content**: Array of all available instruments
- **Data Structure**: Array of `Instrument` objects serialized as JSON
- **Example**:
```json
[
  {
    "name": "AAPL",
    "underlying": "AAPL_STOCK",
    "tick_size": 0.01
  },
  {
    "name": "GOOGL",
    "underlying": "GOOGL_STOCK",
    "tick_size": 0.01
  }
]
```

- **Key**: `static_data:underlyings`
- **Type**: String (JSON)
- **Content**: Array of all available underlyings with delta limits
- **Data Structure**: Array of `Underlying` objects serialized as JSON
- **Example**:
```json
[
  {
    "name": "AAPL_STOCK",
    "delta_limit": 20
  },
  {
    "name": "GOOGL_STOCK", 
    "delta_limit": 20
  }
]
```

- **Key Pattern**: `static_data:{instrument}_absolute_limit`
- **Type**: String (Integer)
- **Content**: Absolute position limit for specific instrument
- **Example**: `static_data:AAPL_absolute_limit`
- **Data Structure**: Integer value as string (e.g., "100")

- **Key Pattern**: `static_data:{underlying}_limit`
- **Type**: String (Integer)
- **Content**: Delta limit for specific underlying
- **Example**: `static_data:AAPL_STOCK_limit`
- **Data Structure**: Integer value as string (e.g., "20")

## Redis Pub/Sub Channel

### Market Data Channel
- **Channel Name**: `market_data`
- **Purpose**: Single channel for all real-time market data updates
- **Message Format**: JSON with consistent structure

### Message Types

All messages published to the `market_data` channel follow this structure:
```json
{
  "type": "message_type",
  "data": { ... },
  "timestamp": "ISO8601_timestamp",
  "instrument": "instrument_name",  // for instrument-specific messages
  "client": "client_name"           // for client-specific messages
}
```

#### 1. Orderbook Update
- **Type**: `"orderbook_update"`
- **Instrument**: Required
- **Client**: Not applicable
- **Data**: Complete `OrderbookUpdate` object
- **Example**:
```json
{
  "type": "orderbook_update",
  "data": {
    "message_type": "OrderbookUpdate",
    "instrument": "AAPL",
    "timestamp": "2024-01-15T10:30:00Z",
    "asks": [...],
    "bids": [...]
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "instrument": "AAPL"
}
```

#### 2. BBO Update
- **Type**: `"bbo_update"`
- **Instrument**: Required
- **Client**: Not applicable
- **Data**: `BestBidOffer` object
- **Example**:
```json
{
  "type": "bbo_update",
  "data": {
    "instrument": "AAPL",
    "timestamp": "2024-01-15T10:30:00Z",
    "best_bid": 149.50,
    "best_ask": 150.00,
    "best_bid_qty": 100,
    "best_ask_qty": 200
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "instrument": "AAPL"
}
```

#### 3. Trade
- **Type**: `"trade"`
- **Instrument**: Required
- **Client**: Not applicable
- **Data**: `Trade` object
- **Example**:
```json
{
  "type": "trade",
  "data": {
    "buyer": "client1",
    "buyer_order_id": "order123",
    "instrument": "AAPL",
    "price": 149.75,
    "seller": "client2",
    "seller_order_id": "order456",
    "timestamp": "2024-01-15T10:30:00Z",
    "volume": 50
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "instrument": "AAPL"
}
```

#### 4. Position Update
- **Type**: `"position_update"`
- **Instrument**: Not applicable
- **Client**: Required
- **Data**: HashMap of instrument positions
- **Example**:
```json
{
  "type": "position_update",
  "data": {
    "AAPL": 100,
    "GOOGL": -50
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "client": "client1"
}
```

#### 5. PnL Update
- **Type**: `"pnl_update"`
- **Instrument**: Not applicable
- **Client**: Required
- **Data**: Object with PnL value
- **Example**:
```json
{
  "type": "pnl_update",
  "data": {
    "pnl": 1234.56
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "client": "client1"
}
```

## Client Subscription Strategy

Clients should subscribe to the `market_data` channel and filter messages based on their requirements:

### Filtering by Message Type
```rust
match message["type"].as_str() {
    "orderbook_update" => { /* Handle orderbook updates */ },
    "bbo_update" => { /* Handle BBO updates */ },
    "trade" => { /* Handle trades */ },
    "position_update" => { /* Handle position updates */ },
    "pnl_update" => { /* Handle PnL updates */ },
    _ => { /* Ignore unknown types */ }
}
```

### Filtering by Instrument
```rust
if let Some(instrument) = message["instrument"].as_str() {
    if instrument == "AAPL" {
        // Handle AAPL-specific messages
    }
}
```

### Filtering by Client
```rust
if let Some(client) = message["client"].as_str() {
    if client == "client1" {
        // Handle client1-specific messages
    }
}
```

## Data Lifecycle

### Key-Value Data
- **Orderbooks**: Updated on each orderbook message
- **BBO**: Updated on each orderbook message (calculated from orderbook)
- **Last Trade**: Updated on each trade message
- **Theoretical Prices**: Updated randomly every 0-4 seconds using random walk simulation
- **Static Data**: Populated once on application startup

### Pub/Sub Messages
- **Delivery**: Fire-and-forget, no persistence
- **Ordering**: Messages include timestamps for client-side ordering
- **Fanout**: All subscribers receive all messages (client-side filtering required)

## Performance Considerations

### Key-Value Operations
- Use Redis pipelines for batch operations
- Monitor memory usage for large orderbooks
- Theoretical price updates use random intervals

### Pub/Sub Operations
- Single channel reduces Redis overhead
- Message size optimization important for high-frequency updates
- Client-side filtering reduces network traffic
- Monitor subscriber count and message rates

## Monitoring

### Key Metrics
- Redis operation latencies
- Connection pool utilization
- Pub/sub message rates
- Memory usage for key-value data
- Subscriber count for market_data channel
- Theoretical price update frequency

### Alerts
- Redis connection failures
- High operation latencies
- Memory usage thresholds
- Pub/sub message rate anomalies
- Theoretical price generation failures
