# Exchange Dashboard - Implementation Plan

## Overview

This implementation plan outlines the integration of real-time market data streaming capabilities into the existing `main.rs` file, based on the `Example_preprocess` logic. The goal is to create a system that:

1. Loads static instrument and underlying data from Redis at startup
2. Creates instrument-specific broadcast channels for each instrument
3. Processes incoming `market_data` messages from Redis pub/sub
4. Routes messages to appropriate instrument-specific SSE endpoints

## Current State Analysis

### Existing `main.rs`
- ✅ Basic Actix-web server setup
- ✅ Redis client initialization
- ✅ Template rendering with Tera
- ✅ Static file serving
- ✅ Basic SSE handler (in `src/sse.rs`)
- ❌ No Redis static data loading
- ❌ No instrument-specific channels
- ❌ No Redis pub/sub message processing

### `Example_preprocess` Features to Integrate
- ✅ Complete `AppState` structure with instrument mappings
- ✅ Redis static data loading logic
- ✅ Instrument-specific broadcast channels
- ✅ Redis pub/sub message processing (`redis_pump`)
- ✅ Dynamic SSE endpoints per instrument

## Implementation Steps

### 1. Update AppState Structure ✅

**File:** `src/main.rs`

Replace current `AppState` with enhanced version:
```rust
#[derive(Clone)]
pub struct AppState {
    pub redis_client: Arc<RedisClient>,
    pub tera: Arc<Tera>,
    // New fields from Example_preprocess
    pub instruments: HashMap<String, String>,        // instrument -> underlying
    pub instrument_limits: HashMap<String, f64>,     // instrument -> absolute limit
    pub delta_limits: HashMap<String, f64>,          // underlying -> delta limit
    pub instrument_tx: HashMap<String, broadcast::Sender<Arc<Bytes>>>, // instrument -> SSE channel
}
```

**Key Changes:**
- Add HashMap fields for instrument data
- Add instrument-specific broadcast channels
- Keep existing Redis client and Tera template engine

### 2. Add Redis Static Data Loading Functions ✅

**File:** `src/main.rs`

Add new functions:
```rust
async fn load_static_data(redis_client: &RedisClient) -> Result<StaticData, Box<dyn std::error::Error>>
async fn create_instrument_channels(static_data: &StaticData) -> HashMap<String, broadcast::Sender<Arc<Bytes>>>
```

**StaticData Structure:**
```rust
struct StaticData {
    instruments: HashMap<String, String>,        // name -> underlying
    instrument_limits: HashMap<String, f64>,     // name -> absolute limit
    delta_limits: HashMap<String, f64>,          // underlying -> delta limit
}
```

**Redis Keys to Load:**
- `static_data:instruments` → Array of instrument objects
- `static_data:underlyings` → Array of underlying objects with delta limits
- `static_data:{instrument}_absolute_limit` → Per-instrument limits
- `static_data:{underlying}_limit` → Per-underlying delta limits

### 3. Implement Redis Pump Function ✅

**File:** `src/main.rs`

Port `redis_pump` function from `Example_preprocess`:
```rust
async fn redis_pump(
    redis_client: RedisClient,
    instrument_tx: HashMap<String, broadcast::Sender<Arc<Bytes>>>
) -> Result<(), Box<dyn std::error::Error>>
```

**Functionality:**
- Connect to Redis pub/sub
- Subscribe to `market_data` channel
- Process incoming messages
- Route messages to appropriate instrument channels based on message `instrument` field
- Handle heartbeat for connection keepalive

**Message Processing:**
- Parse JSON messages from `market_data` channel
- Extract `instrument` field from message
- Route to corresponding `instrument_tx` channel
- Format as SSE: `data: {...}\n\n`

### 4. Update SSE Handler for Instrument-Specific Endpoints ✅

**File:** `src/sse.rs`

Modify existing SSE handler to support `/sse/{instrument}` endpoints:
```rust
pub async fn sse_handler(
    path: web::Path<String>,
    data: web::Data<AppState>
) -> impl Responder
```

**Key Changes:**
- Accept `instrument` parameter from URL path
- Look up appropriate broadcast channel from `instrument_tx`
- Subscribe to instrument-specific channel
- Stream messages for that specific instrument

**URL Structure:**
- `/sse/AAPL` → Stream AAPL-specific messages
- `/sse/GOOGL` → Stream GOOGL-specific messages
- `/sse/{any_instrument}` → Dynamic routing

### 5. Integrate Everything into Main.rs Startup Flow ✅

**File:** `src/main.rs`

Modify `main()` function startup sequence:

```rust
#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Starting Rusty Exchange Dashboard...");

    // Initialize Redis client
    let redis_client = RedisClient::open("redis://127.0.0.1/")
        .expect("Failed to create Redis client");

    // Load static data from Redis
    let static_data = load_static_data(&redis_client).await
        .expect("Failed to load static data");

    // Create instrument-specific broadcast channels
    let instrument_tx = create_instrument_channels(&static_data);

    // Initialize Tera template engine
    let tera = Tera::new("templates/**/*")
        .expect("Failed to initialize templates");

    // Create enhanced AppState
    let app_state = AppState {
        redis_client: Arc::new(redis_client.clone()),
        tera: Arc::new(tera),
        instruments: static_data.instruments,
        instrument_limits: static_data.instrument_limits,
        delta_limits: static_data.delta_limits,
        instrument_tx,
    };

    // Spawn Redis pump task
    tokio::spawn(redis_pump(redis_client, app_state.instrument_tx.clone()));

    // Start HTTP server with updated routes
    HttpServer::new(move || {
        App::new()
            .app_data(Data::new(app_state.clone()))
            .service(fs::Files::new("/static", "static/").show_files_listing())
            .route("/", web::get().to(index))
            .route("/dashboard", web::get().to(dashboard))
            .route("/sse/{instrument}", web::get().to(sse_handler)) // Updated
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
```

### 6. Add Instrument Selection Frontend ✅

**Files:** `templates/index.html`, `templates/dashboard.html`, `static/js/main.js`

Add dynamic instrument selection with dropdown and "Go" button:

**HTML Template Changes:**
```html
<!-- Add to dashboard.html template -->
<div class="instrument-selector">
    <label for="instrument-select">Select Instrument:</label>
    <select id="instrument-select">
        <option value="">Choose an instrument...</option>
        <!-- Dynamically populated from AppState.instruments -->
    </select>
    <button id="go-button" disabled>Go</button>
</div>

<div class="page-title">
    <h1 id="page-title">Rusty Exchange Dashboard</h1>
</div>

<div class="market-data" id="market-data-container" style="display: none;">
    <!-- Market data display area -->
    <div class="data-section">
        <h2>Order Book</h2>
        <div id="order-book"></div>
    </div>
    <div class="data-section">
        <h2>Best Bid/Offer</h2>
        <div id="bbo-data"></div>
    </div>
    <div class="data-section">
        <h2>Recent Trades</h2>
        <div id="trades-data"></div>
    </div>
</div>
```

**JavaScript Updates (`static/js/main.js`):**
```javascript
document.addEventListener('DOMContentLoaded', function() {
    const instrumentSelect = document.getElementById('instrument-select');
    const goButton = document.getElementById('go-button');
    const pageTitle = document.getElementById('page-title');
    const marketDataContainer = document.getElementById('market-data-container');
    
    let currentEventSource = null;
    
    // Populate instrument dropdown from available instruments
    fetch('/api/instruments')
        .then(response => response.json())
        .then(instruments => {
            instruments.forEach(instrument => {
                const option = document.createElement('option');
                option.value = instrument.name;
                option.textContent = `${instrument.name} (${instrument.underlying})`;
                instrumentSelect.appendChild(option);
            });
        })
        .catch(error => console.error('Failed to load instruments:', error));
    
    // Enable/disable Go button based on selection
    instrumentSelect.addEventListener('change', function() {
        goButton.disabled = !this.value;
    });
    
    // Handle Go button click
    goButton.addEventListener('click', function() {
        const selectedInstrument = instrumentSelect.value;
        if (!selectedInstrument) return;
        
        // Disconnect existing SSE connection
        if (currentEventSource) {
            currentEventSource.close();
        }
        
        // Update page title
        pageTitle.textContent = `Exchange Dashboard - ${selectedInstrument}`;
        
        // Show market data container
        marketDataContainer.style.display = 'block';
        
        // Connect to instrument-specific SSE endpoint
        connectToSSE(selectedInstrument);
    });
    
    function connectToSSE(instrument) {
        currentEventSource = new EventSource(`/sse/${instrument}`);
        
        currentEventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                updateMarketData(data);
            } catch (error) {
                console.error('Failed to parse SSE data:', error);
            }
        };
        
        currentEventSource.onerror = function(error) {
            console.error('SSE connection error:', error);
            // Optionally reconnect after delay
        };
    }
    
    function updateMarketData(data) {
        // Update order book
        const orderBookElement = document.getElementById('order-book');
        // ... update order book display logic
        
        // Update BBO data
        const bboElement = document.getElementById('bbo-data');
        // ... update BBO display logic
        
        // Update trades
        const tradesElement = document.getElementById('trades-data');
        // ... update trades display logic
    }
});
```

**Backend API Endpoint (add to `src/main.rs`):**
```rust
async fn get_instruments(app_state: web::Data<AppState>) -> Result<impl Responder> {
    let instruments: Vec<serde_json::Value> = app_state.instruments
        .iter()
        .map(|(name, underlying)| {
            serde_json::json!({
                "name": name,
                "underlying": underlying
            })
        })
        .collect();
    
    Ok(HttpResponse::Ok()
        .json(instruments))
}

// Add to routes:
.route("/api/instruments", web::get().to(get_instruments))
```

**Key Features:**
- **Dynamic Dropdown**: Populated from `AppState.instruments`
- **Instrument-specific SSE**: Connects to `/sse/{instrument}` endpoint
- **Page Title Update**: Shows selected instrument name
- **Real-time Data Display**: Updates order book, BBO, and trade data
- **Connection Management**: Properly handles SSE connection lifecycle
- **Error Handling**: Graceful handling of connection errors and data parsing

### 7. Update Route Configuration ✅

**File:** `src/main.rs`

Update route to support dynamic instrument parameter:
```rust
// Change from:
.route("/sse", web::get().to(sse_handler))

// To:
.route("/sse/{instrument}", web::get().to(sse_handler))
```

## Data Flow Architecture

```
Redis Pub/Sub (market_data channel)
        ↓
    redis_pump()
        ↓
Instrument-specific broadcast channels
        ↓
/ sse/{instrument} endpoints
        ↓
Client SSE connections
```

## Error Handling Strategy

- **Redis Connection Failures:** Log errors and retry with backoff
- **Invalid Messages:** Log warnings and continue processing
- **Missing Instruments:** Log warnings for unknown instruments
- **Channel Send Failures:** Handle when no subscribers are active
- **Static Data Loading:** Fail fast if static data cannot be loaded

## Performance Considerations

- **Memory Usage:** Each instrument gets its own broadcast channel
- **Connection Limits:** Redis pub/sub connection is shared
- **Message Routing:** Efficient HashMap lookup for instrument routing
- **Broadcast Buffer:** Size channels appropriately (512 buffer size)
- **Worker Count:** Use `num_cpus::get().max(4)` for optimal performance

## Testing Strategy

1. **Unit Tests:**
   - Static data loading functions
   - Message parsing and routing logic
   - Channel creation and management

2. **Integration Tests:**
   - Full Redis connection and pub/sub flow
   - SSE endpoint functionality
   - Template rendering with instrument data

3. **Load Testing:**
   - Multiple concurrent SSE connections
   - High-frequency message processing
   - Memory usage under load

## Migration Path

1. **Phase 1:** Update dependencies and basic structure
2. **Phase 2:** Implement static data loading
3. **Phase 3:** Add Redis pump and message routing
4. **Phase 4:** Update SSE endpoints
5. **Phase 5:** Add instrument selection frontend
6. **Phase 6:** Full integration and testing

## Dependencies Added

Updated `Cargo.toml` with:
```toml
async-stream = "0.3"  # For async stream macro
num_cpus = "1.16"     # For determining worker count
```

## Next Steps

1. Begin implementation by updating `AppState` structure
2. Implement static data loading functions
3. Create instrument channel management
4. Implement Redis pump function
5. Update SSE handler for dynamic routing
6. Integrate all components in main.rs
7. Add instrument selection frontend with dropdown and Go button
8. Test the complete system

---

**Note:** This plan assumes Redis is running and populated with static data according to the specification in `redis_keys_and_channels.md`.