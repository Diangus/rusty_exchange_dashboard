use actix_files as fs;
use actix_web::web::Bytes;
use actix_web::web::Data;
use actix_web::{web, App, HttpResponse, HttpServer, Result};
use redis::Client as RedisClient;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use std::sync::Arc;
use tera::Tera;
use tokio::sync::broadcast;

mod sse;

use sse::sse_handler;

#[derive(Debug, Deserialize, Serialize)]
struct Config {
    redis_url: String,
    server_host: String,
    server_port: u16,
    templates_path: String,
    static_path: String,
}

// Load configuration from JSON file
fn load_config() -> Result<Config, Box<dyn std::error::Error + Send + Sync>> {
    let config_path = "config.json";
    let config_content = std::fs::read_to_string(config_path)
        .map_err(|e| format!("Failed to read config file '{}': {}", config_path, e))?;

    let config: Config = serde_json::from_str(&config_content)
        .map_err(|e| format!("Failed to parse config JSON: {}", e))?;

    Ok(config)
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct InstrumentDetails {
    name: String,
    underlying: String,
    absolute_limit: f64,
    delta_limit: f64,
    tick_size: f64,
    max_order_size: f64,
}

// Load static data from Redis
async fn load_static_data(
    redis_client: &RedisClient,
) -> Result<HashMap<String, InstrumentDetails>, Box<dyn std::error::Error + Send + Sync>> {
    let mut instruments: HashMap<String, InstrumentDetails> = HashMap::new();

    let mut conn = redis_client.get_connection()?;

    // First, load delta limits from underlyings
    let mut delta_limits: HashMap<String, f64> = HashMap::new();
    let underlyings_data_str: String = redis::cmd("GET")
        .arg("static_data:underlyings")
        .query(&mut conn)?;

    let underlyings_data: Vec<serde_json::Value> = serde_json::from_str(&underlyings_data_str)
        .unwrap_or_else(|_| vec![]);

    for underlying in underlyings_data {
        if let (Some(name), Some(delta_limit)) = (
            underlying.get("name").and_then(|v| v.as_str()),
            underlying.get("delta_limit").and_then(|v| v.as_f64()),
        ) {
            delta_limits.insert(name.to_string(), delta_limit);
        }
    }

    // Load instruments from Redis
    let instruments_data_str: String = redis::cmd("GET")
        .arg("static_data:instruments")
        .query(&mut conn)?;

    let instruments_data: Vec<serde_json::Value> = serde_json::from_str(&instruments_data_str)
        .unwrap_or_else(|_| vec![]);

    for instrument in instruments_data {
        if let (Some(name), Some(underlying), Some(tick_size)) = (
            instrument.get("name").and_then(|v| v.as_str()),
            instrument.get("underlying").and_then(|v| v.as_str()),
            instrument.get("tick_size").and_then(|v| v.as_f64()),
        ) {
            // Load absolute limit for this instrument
            let limit_key = format!("static_data:{}:absolute_limit", name);
            let absolute_limit = redis::cmd("GET")
                .arg(&limit_key)
                .query::<f64>(&mut conn)
                .unwrap_or(1000.0); // Default value if not found

            // Get delta limit for the underlying, or use default
            let delta_limit = delta_limits.get(underlying).copied().unwrap_or(20.0);
            let max_order_size = 10000.0; // Default max order size

            let instrument_details = InstrumentDetails {
                name: name.to_string(),
                underlying: underlying.to_string(),
                absolute_limit,
                delta_limit,
                tick_size,
                max_order_size,
            };

            instruments.insert(name.to_string(), instrument_details);
        }
    }

    Ok(instruments)
}

// Create instrument-specific broadcast channels
fn create_instrument_channels(
    instruments: &HashMap<String, InstrumentDetails>,
) -> HashMap<String, broadcast::Sender<Arc<Bytes>>> {
    instruments
        .keys()
        .map(|instrument_name| {
            // Fan-out bus (size tunes how many messages slow clients may miss before 'Lagged')
            let (tx, _rx) = broadcast::channel::<Arc<Bytes>>(512);
            (instrument_name.clone(), tx)
        })
        .collect()
}

// Redis pump function for pub/sub message processing
async fn redis_pump(
    redis_client: RedisClient,
    instrument_tx: HashMap<String, broadcast::Sender<Arc<Bytes>>>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut conn = redis_client.get_connection()?;

    let mut pubsub = conn.as_pubsub();
    pubsub.subscribe("market_data")?;

    loop {
        match pubsub.get_message() {
            Ok(msg) => {
                if let Ok(payload) = msg.get_payload::<String>() {
                    if let Ok(json_data) = serde_json::from_str::<serde_json::Value>(&payload) {
                        // Extract instrument field from message
                        if let Some(instrument_name) = json_data.get("instrument").and_then(|v| v.as_str()) {
                            // Route message to appropriate instrument channel
                            if let Some(tx) = instrument_tx.get(instrument_name) {
                                let json_str = serde_json::to_string(&json_data)?;
                                let sse_message = format!("data: {}\n\n", json_str);
                                let bytes = Arc::new(Bytes::from(sse_message.into_bytes()));
                                let _ = tx.send(bytes); // ignore if no listeners
                            } else {
                                println!("Warning: Received message for unknown instrument: {}", instrument_name);
                            }
                        } else {
                            println!("Warning: Received market_data message without instrument field");
                        }
                    } else {
                        println!("Warning: Failed to parse market_data message as JSON: {}", payload);
                    }
                } else {
                    println!("Warning: Failed to get payload as string from Redis message");
                }
            }
            Err(_) => {
                // Connection issue or timeout - you might want to reconnect here
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
        }
    }
}

// API endpoint to get available instruments
async fn get_instruments(app_state: web::Data<AppState>) -> Result<impl actix_web::Responder> {
    let instruments: Vec<serde_json::Value> = app_state
        .instrument_details
        .iter()
        .map(|(name, underlying)| {
            serde_json::json!({
                "name": name,
                "underlying": underlying
            })
        })
        .collect();

    Ok(HttpResponse::Ok().json(instruments))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Starting Rusty Exchange Dashboard...");

    // Load configuration
    let config = load_config().expect("Failed to load configuration");

    // Initialize Redis client
    let redis_client = RedisClient::open(config.redis_url)
        .expect("Failed to create Redis client");

    // Load static data from Redis
    let instruments = load_static_data(&redis_client)
        .await
        .expect("Failed to load static data");

    // Create instrument-specific broadcast channels
    let instrument_tx = create_instrument_channels(&instruments);

    // Initialize Tera template engine
    let tera = match Tera::new(&format!("{}**/*", config.templates_path)) {
        Ok(t) => t,
        Err(e) => {
            println!("Template parsing error: {}", e);
            std::process::exit(1);
        }
    };

    let app_state = AppState {
        redis_client: Arc::new(redis_client.clone()),
        tera: Arc::new(tera),
        instrument_details: instruments,
        instrument_tx: instrument_tx.clone(),
    };

    // Spawn Redis pump task
    tokio::spawn(redis_pump(redis_client, instrument_tx));

    let server_address = format!("{}:{}", config.server_host, config.server_port);
    println!("Server starting on http://{}", server_address);
    println!("Loaded {} instruments", app_state.instrument_details.len());

    HttpServer::new(move || {
        App::new()
            .app_data(Data::new(app_state.clone()))
            // Serve static files from the static directory
            .service(fs::Files::new("/static", &config.static_path).show_files_listing())
            // Main routes
            .route("/", web::get().to(index))
            .route("/dashboard", web::get().to(dashboard))
            .route("/api/instruments", web::get().to(get_instruments))
            .route("/sse/{instrument}", web::get().to(sse_handler))
    })
    .workers(num_cpus::get().max(4))
    .bind(&server_address)?
    .run()
    .await
}

async fn index(app_state: web::Data<AppState>) -> Result<actix_web::HttpResponse> {
    let ctx = tera::Context::new();
    match app_state.tera.render("index.html", &ctx) {
        Ok(content) => Ok(actix_web::HttpResponse::Ok()
            .content_type("text/html; charset=utf-8")
            .body(content)),
        Err(e) => {
            println!("Template render error: {}", e);
            Ok(actix_web::HttpResponse::InternalServerError().body("Failed to render template"))
        }
    }
}

async fn dashboard(app_state: web::Data<AppState>) -> Result<actix_web::HttpResponse> {
    let ctx = tera::Context::new();
    match app_state.tera.render("dashboard.html", &ctx) {
        Ok(content) => Ok(actix_web::HttpResponse::Ok()
            .content_type("text/html; charset=utf-8")
            .body(content)),
        Err(e) => {
            println!("Template render error: {}", e);
            Ok(actix_web::HttpResponse::InternalServerError().body("Failed to render template"))
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub redis_client: Arc<RedisClient>,
    pub tera: Arc<Tera>,
    pub instrument_details: HashMap<String, InstrumentDetails>, // instrument -> full details
    pub instrument_tx: HashMap<String, broadcast::Sender<Arc<Bytes>>>, // instrument -> SSE channel
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tokio::sync::broadcast;

    #[test]
    fn test_instrument_details_creation() {
        let mut instruments = HashMap::new();

        let aapl_details = InstrumentDetails {
            name: "AAPL".to_string(),
            underlying: "EQUITY".to_string(),
            absolute_limit: 1000.0,
            delta_limit: 50000.0,
            tick_size: 0.01,
            max_order_size: 10000.0,
        };

        let googl_details = InstrumentDetails {
            name: "GOOGL".to_string(),
            underlying: "EQUITY".to_string(),
            absolute_limit: 2000.0,
            delta_limit: 50000.0,
            tick_size: 0.01,
            max_order_size: 10000.0,
        };

        instruments.insert("AAPL".to_string(), aapl_details);
        instruments.insert("GOOGL".to_string(), googl_details);

        assert_eq!(instruments.len(), 2);
        assert_eq!(instruments.get("AAPL").unwrap().name, "AAPL");
        assert_eq!(instruments.get("AAPL").unwrap().underlying, "EQUITY");
        assert_eq!(instruments.get("AAPL").unwrap().absolute_limit, 1000.0);
        assert_eq!(instruments.get("AAPL").unwrap().delta_limit, 50000.0);
    }

    #[test]
    fn test_create_instrument_channels() {
        let mut instruments = HashMap::new();

        let aapl_details = InstrumentDetails {
            name: "AAPL".to_string(),
            underlying: "EQUITY".to_string(),
            absolute_limit: 1000.0,
            delta_limit: 50000.0,
            tick_size: 0.01,
            max_order_size: 10000.0,
        };

        let googl_details = InstrumentDetails {
            name: "GOOGL".to_string(),
            underlying: "EQUITY".to_string(),
            absolute_limit: 2000.0,
            delta_limit: 50000.0,
            tick_size: 0.01,
            max_order_size: 10000.0,
        };

        instruments.insert("AAPL".to_string(), aapl_details);
        instruments.insert("GOOGL".to_string(), googl_details);

        let channels = create_instrument_channels(&instruments);

        assert_eq!(channels.len(), 2);
        assert!(channels.contains_key("AAPL"));
        assert!(channels.contains_key("GOOGL"));
    }

    #[test]
    fn test_message_parsing_and_routing() {
        // Test JSON message parsing logic
        let json_message = r#"{"instrument": "AAPL", "price": 150.25, "volume": 100}"#;
        let parsed: serde_json::Value = serde_json::from_str(json_message).unwrap();

        assert_eq!(parsed["instrument"], "AAPL");
        assert_eq!(parsed["price"], 150.25);
        assert_eq!(parsed["volume"], 100);

        // Test SSE message formatting
        let json_str = serde_json::to_string(&parsed).unwrap();
        let sse_message = format!("data: {}\n\n", json_str);

        assert!(sse_message.starts_with("data: "));
        assert!(sse_message.ends_with("\n\n"));
        assert!(sse_message.contains("AAPL"));
    }

    #[test]
    fn test_broadcast_channel_functionality() {
        let (tx, mut rx) = broadcast::channel::<actix_web::web::Bytes>(10);
        let test_data = actix_web::web::Bytes::from("test message");

        // Send a message
        tx.send(test_data.clone()).unwrap();

        // Receive the message
        let received = rx.try_recv().unwrap();
        assert_eq!(received, test_data);
    }

    #[test]
    fn test_heartbeat_message_format() {
        let heartbeat = actix_web::web::Bytes::from_static(b": keep-alive\n\n");

        // Check heartbeat format
        assert_eq!(heartbeat.as_ref(), b": keep-alive\n\n");
        assert!(heartbeat.as_ref().starts_with(b":"));
        assert!(heartbeat.as_ref().ends_with(b"\n\n"));
    }
}
