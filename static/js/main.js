/**
 * Main Entry Point for Market Data Application
 * This file serves as the entry point for the ES6 module system
 */

// Import the main application class
import MarketDataApp from './modules/marketDataApp.js';

// Module loading error handler
window.addEventListener('error', (event) => {
    if (event.filename && event.filename.includes('modules/')) {
        console.error('Failed to load module:', event.filename, event.message);
        document.body.innerHTML += `
            <div style="position: fixed; top: 0; left: 0; right: 0; background: #ef4444; color: white; padding: 10px; z-index: 9999;">
                <strong>Module Loading Error:</strong> Failed to load ${event.filename}. Check console for details.
            </div>
        `;
    }
});

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Check if we're on the dashboard page with instrument selection
    const instrumentSelect = document.getElementById('instrument-select');
    const goButton = document.getElementById('go-button');
    const pageTitle = document.getElementById('page-title');
    const marketDataContainer = document.getElementById('market-data-container');

    if (instrumentSelect && goButton) {
        // We're on the dashboard page with instrument selection
        console.log('🚀 Starting Instrument Selection Dashboard...');

        let currentEventSource = null;

        // Populate instrument dropdown from available instruments
        try {
            const response = await fetch('/api/instruments');
            if (response.ok) {
                const instruments = await response.json();
                instruments.forEach(instrument => {
                    const option = document.createElement('option');
                    option.value = instrument.name;
                    option.textContent = `${instrument.name} (${instrument.underlying})`;
                    instrumentSelect.appendChild(option);
                });
                console.log(`✅ Loaded ${instruments.length} instruments`);
            } else {
                console.error('Failed to load instruments:', response.status);
                instrumentSelect.innerHTML = '<option value="">Failed to load instruments</option>';
            }
        } catch (error) {
            console.error('Failed to load instruments:', error);
            instrumentSelect.innerHTML = '<option value="">Error loading instruments</option>';
        }

        // Enable/disable Go button based on selection
        instrumentSelect.addEventListener('change', function() {
            goButton.disabled = !this.value;
        });

        // Handle Go button click
        goButton.addEventListener('click', function() {
            const selectedInstrument = instrumentSelect.value;
            if (!selectedInstrument) return;

            // Update button text to show current action
            const buttonText = document.getElementById('go-button-text');
            if (buttonText) {
                buttonText.textContent = 'Connecting...';
            }
            goButton.classList.add('connecting');

            // Disconnect existing SSE connection
            if (currentEventSource) {
                console.log(`🔌 Disconnecting from previous instrument...`);
                currentEventSource.close();
                currentEventSource = null;
            }

            // Clear existing market data app
            if (window.marketDataApp) {
                console.log(`🧹 Clearing existing market data...`);
                // Reset the app state if it has a reset method
                if (typeof window.marketDataApp.reset === 'function') {
                    window.marketDataApp.reset();
                }
            }

            // Update page title
            if (pageTitle) {
                pageTitle.textContent = `Rusty Exchange Dashboard - ${selectedInstrument}`;
            }

            // Show page title and market data container
            const pageTitleDiv = document.querySelector('.page-title');
            if (pageTitleDiv) {
                pageTitleDiv.style.display = 'block';
            }
            if (marketDataContainer) {
                marketDataContainer.style.display = 'block';
            }

            // Connect to instrument-specific SSE endpoint
            connectToSSE(selectedInstrument);

            // Reset button text after a short delay
            setTimeout(() => {
                const buttonText = document.getElementById('go-button-text');
                if (buttonText) {
                    buttonText.textContent = 'Go';
                }
                goButton.classList.remove('connecting');
            }, 1000);
        });

        function connectToSSE(instrument) {
            console.log(`🔌 Connecting to SSE endpoint for instrument: ${instrument}`);
            currentEventSource = new EventSource(`/sse/${instrument}`);

            currentEventSource.onopen = function(event) {
                console.log(`✅ SSE connection established for ${instrument}`);
            };

            currentEventSource.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    console.log('📡 Received SSE data:', data);

                    // Initialize or reinitialize the market data app with the new data
                    if (!window.marketDataApp) {
                        console.log('🚀 Initializing market data app...');
                        window.marketDataApp = new MarketDataApp();
                        window.marketDataApp.initialize().then(() => {
                            window.marketDataApp.handleMarketData(data);
                        });
                    } else {
                        // Reinitialize the app for new instrument
                        console.log('🔄 Reinitializing market data app for new instrument...');
                        window.marketDataApp.initialize().then(() => {
                            window.marketDataApp.handleMarketData(data);
                        });
                    }
                } catch (error) {
                    console.error('Failed to parse SSE data:', error);
                }
            };

            currentEventSource.onerror = function(error) {
                console.error('SSE connection error:', error);
                // Optionally reconnect after delay
                setTimeout(() => {
                    if (currentEventSource.readyState === EventSource.CLOSED) {
                        console.log('🔄 Attempting to reconnect SSE...');
                        connectToSSE(instrument);
                    }
                }, 5000);
            };
        }

        // Also export the class for external use (for debugging/console access)
        window.MarketDataApp = MarketDataApp;

        console.log('✅ Instrument Selection Dashboard successfully loaded and initialized');

    } else {
        // Original functionality for other pages
        try {
            console.log('🚀 Starting Market Data Application with ES6 modules...');

            // Create global app instance for external access if needed
            window.marketDataApp = new MarketDataApp();
            await window.marketDataApp.initialize();

            // Also export the class for external use (for debugging/console access)
            window.MarketDataApp = MarketDataApp;

            console.log('✅ Market Data Application successfully loaded and initialized');

            // Development helper: Show module information
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('📦 Loaded modules:', {
                    DataManager: 'Market data storage and processing',
                    ChartManager: 'D3.js chart functionality',
                    TableManager: 'Table updates and rendering',
                    UIManager: 'UI controls and statistics',
                    MarketDataApp: 'Main application coordinator'
                });
            }

        } catch (error) {
            console.error('❌ Failed to initialize Market Data Application:', error);

            // Show user-friendly error message
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = `
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: #1e293b; border: 2px solid #ef4444; border-radius: 8px;
                padding: 20px; color: #e2e8f0; z-index: 9999; max-width: 400px;
            `;
            errorDiv.innerHTML = `
                <h3 style="color: #ef4444; margin: 0 0 10px 0;">Application Error</h3>
                <p>Failed to start the Market Data Application. Please check the console for details.</p>
                <button onclick="location.reload()" style="background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 10px;">
                    Reload Page
                </button>
            `;
            document.body.appendChild(errorDiv);
        }
    }
});