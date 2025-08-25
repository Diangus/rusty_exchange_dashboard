use crate::AppState;
use actix_web::web::Bytes;
use actix_web::{web, Error, HttpResponse};
use async_stream::stream;
use tokio::sync::broadcast;

pub async fn sse_handler(
    path: web::Path<String>,
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, Error> {
    let instrument = path.as_ref();
    println!("SSE connection established for instrument: {}", instrument);

    // Look up the instrument-specific broadcast channel
    let tx = match app_state.instrument_tx.get(instrument) {
        Some(tx) => tx.clone(),
        None => {
            println!("Warning: Unknown instrument requested: {}", instrument);
            // Return a 404-like response for unknown instruments
            return Ok(HttpResponse::NotFound()
                .content_type("text/plain")
                .body(format!("Instrument '{}' not found", instrument)));
        }
    };

    // Subscribe to the instrument-specific channel
    let mut rx = tx.subscribe();

    // Stream the instrument-specific messages
    let stream = stream! {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    // Clone is cheap: Arc<Bytes>
                    yield Ok::<Bytes, Error>((*msg).clone());
                }
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    // Tell the client it fell behind; you can also `break` to drop
                    let warn = format!("event: warn\ndata: {{\"lagged\": {}}}\n\n", skipped);
                    yield Ok(Bytes::from(warn));
                }
                Err(_) => break, // channel closed
            }
        }
    };

    Ok(HttpResponse::Ok()
        .insert_header(("Content-Type", "text/event-stream"))
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .streaming(stream))
}

pub async fn pnl_sse_handler(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, Error> {
    println!("SSE connection established for position/PnL updates");

    // Subscribe to the single position/PnL channel
    let mut rx = app_state.pnl_tx.subscribe();

    // Stream all position and PnL update messages
    let stream = stream! {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    // Clone is cheap: Arc<Bytes>
                    yield Ok::<Bytes, Error>((*msg).clone());
                }
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    // Tell the client it fell behind; you can also `break` to drop
                    let warn = format!("event: warn\ndata: {{\"lagged\": {}}}\n\n", skipped);
                    yield Ok(Bytes::from(warn));
                }
                Err(_) => break, // channel closed
            }
        }
    };

    Ok(HttpResponse::Ok()
        .insert_header(("Content-Type", "text/event-stream"))
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .streaming(stream))
}
