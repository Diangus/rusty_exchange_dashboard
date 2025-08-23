use actix_files as fs;
use actix_web::web::Bytes;
use actix_web::web::Data;
use actix_web::{web, App, HttpResponse, HttpServer, Result};
use redis::Client as RedisClient;
use std::collections::HashMap;
use std::sync::Arc;
use tera::Tera;
use tokio::sync::broadcast;

mod sse;

use sse::sse_handler;

// StaticData structure to hold loaded Redis data
#[derive(Debug, Clone)]
struct StaticData {
    instruments: HashMap<String, String>,    // name -> underlying
    instrument_limits: HashMap<String, f64>, // name -> absolute limit
    delta_limits: HashMap<String, f64>,      // underlying -> delta limit
}

// Load static data from Redis
async fn load_static_data(
    redis_client: &RedisClient,
) -> Result<StaticData, Box<dyn std::error::Error + Send + Sync>> {
    let mut instruments = HashMap::new();
    let mut instrument_limits = HashMap::new();
    let mut delta_limits = HashMap::new();

    let mut conn = redis_client.get_connection()?;

    // Load instruments from Redis
    let instruments_data_str: String = redis::cmd("GET")
        .arg("static_data:instruments")
        .query(&mut conn)?;

    let instruments_data: Vec<serde_json::Value> = serde_json::from_str(&instruments_data_str)
        .unwrap_or_else(|_| vec![]);

    for instrument in instruments_data {
        if let (Some(name), Some(underlying)) = (
            instrument.get("name").and_then(|v| v.as_str()),
            instrument.get("underlying").and_then(|v| v.as_str()),
        ) {
            instruments.insert(name.to_string(), underlying.to_string());

            // Load absolute limit for this instrument
            let limit_key = format!("static_data:{}:absolute_limit", name);
            if let Ok(limit) = redis::cmd("GET")
                .arg(&limit_key)
                .query::<f64>(&mut conn)
            {
                instrument_limits.insert(name.to_string(), limit);
            }
        }
    }

    // Load delta limits from Redis
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

    Ok(StaticData {
        instruments,
        instrument_limits,
        delta_limits,
    })
}

// Create instrument-specific broadcast channels
fn create_instrument_channels(
    static_data: &StaticData,
) -> HashMap<String, broadcast::Sender<Arc<Bytes>>> {
    static_data
        .instruments
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

    // Subscribe to market_data channel
    let mut pubsub = conn.as_pubsub();
    pubsub.subscribe("market_data")?;

    // Optional: heartbeat to keep idle connections alive
    let mut hb = tokio::time::interval(std::time::Duration::from_secs(15));

    loop {
        // Use a simple timeout-based approach for Redis pub/sub
        // This is a simplified version - in production you'd want better async handling
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

        // Send heartbeat every 15 seconds
        let _ = hb.tick().await;
        let bytes = Arc::new(Bytes::from_static(b": keep-alive\n\n"));
        for tx in instrument_tx.values() {
            let _ = tx.send(bytes.clone());
        }
    }
}

// API endpoint to get available instruments
async fn get_instruments(app_state: web::Data<AppState>) -> Result<impl actix_web::Responder> {
    let instruments: Vec<serde_json::Value> = app_state
        .instruments
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

    // Initialize Redis client
    let redis_client =
        RedisClient::open("redis://127.0.0.1/").expect("Failed to create Redis client");

    // Load static data from Redis
    let static_data = load_static_data(&redis_client)
        .await
        .expect("Failed to load static data");

    // Create instrument-specific broadcast channels
    let instrument_tx = create_instrument_channels(&static_data);

    // Initialize Tera template engine
    let tera = match Tera::new("templates/**/*") {
        Ok(t) => t,
        Err(e) => {
            println!("Template parsing error: {}", e);
            std::process::exit(1);
        }
    };

    // Create enhanced AppState
    let app_state = AppState {
        redis_client: Arc::new(redis_client.clone()),
        tera: Arc::new(tera),
        instruments: static_data.instruments,
        instrument_limits: static_data.instrument_limits,
        delta_limits: static_data.delta_limits,
        instrument_tx: instrument_tx.clone(),
    };

    // Spawn Redis pump task
    tokio::spawn(redis_pump(redis_client, instrument_tx));

    println!("Server starting on http://127.0.0.1:8080");
    println!("Loaded {} instruments", app_state.instruments.len());

    HttpServer::new(move || {
        App::new()
            .app_data(Data::new(app_state.clone()))
            // Serve static files from the static directory
            .service(fs::Files::new("/static", "static/").show_files_listing())
            // Main routes
            .route("/", web::get().to(index))
            .route("/dashboard", web::get().to(dashboard))
            .route("/api/instruments", web::get().to(get_instruments))
            .route("/sse/{instrument}", web::get().to(sse_handler))
    })
    .workers(num_cpus::get().max(4))
    .bind("127.0.0.1:8080")?
    .run()
    .await
}

async fn index(app_state: web::Data<AppState>) -> Result<actix_web::HttpResponse> {
    let mut context = tera::Context::new();
    context.insert("instrument", "BTC/USD"); // Example instrument

    match app_state.tera.render("index.html", &context) {
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
    let mut context = tera::Context::new();
    context.insert("instrument", "BTC/USD"); // Example instrument

    match app_state.tera.render("dashboard.html", &context) {
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
    // New fields from Example_preprocess
    pub instruments: HashMap<String, String>, // instrument -> underlying
    pub instrument_limits: HashMap<String, f64>, // instrument -> absolute limit
    pub delta_limits: HashMap<String, f64>,   // underlying -> delta limit
    pub instrument_tx: HashMap<String, broadcast::Sender<Arc<Bytes>>>, // instrument -> SSE channel
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tokio::sync::broadcast;

    #[test]
    fn test_static_data_creation() {
        let mut instruments = HashMap::new();
        instruments.insert("AAPL".to_string(), "EQUITY".to_string());
        instruments.insert("GOOGL".to_string(), "EQUITY".to_string());

        let mut instrument_limits = HashMap::new();
        instrument_limits.insert("AAPL".to_string(), 1000.0);
        instrument_limits.insert("GOOGL".to_string(), 2000.0);

        let mut delta_limits = HashMap::new();
        delta_limits.insert("EQUITY".to_string(), 50000.0);

        let static_data = StaticData {
            instruments,
            instrument_limits,
            delta_limits,
        };

        assert_eq!(static_data.instruments.len(), 2);
        assert_eq!(
            static_data.instruments.get("AAPL"),
            Some(&"EQUITY".to_string())
        );
        assert_eq!(static_data.instrument_limits.get("AAPL"), Some(&1000.0));
        assert_eq!(static_data.delta_limits.get("EQUITY"), Some(&50000.0));
    }

    #[test]
    fn test_create_instrument_channels() {
        let mut instruments = HashMap::new();
        instruments.insert("AAPL".to_string(), "EQUITY".to_string());
        instruments.insert("GOOGL".to_string(), "EQUITY".to_string());

        let static_data = StaticData {
            instruments,
            instrument_limits: HashMap::new(),
            delta_limits: HashMap::new(),
        };

        let channels = create_instrument_channels(&static_data);

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
