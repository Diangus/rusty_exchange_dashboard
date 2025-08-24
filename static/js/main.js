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

        // We're on the dashboard page with instrument selection
        console.log('🚀 Starting Instrument Selection Dashboard...');

        // Initialize the market data app instance for this page
        try {
            window.marketDataApp = new MarketDataApp();
            await window.marketDataApp.initialize();
            console.log('✅ Market Data Application initialized for instrument selection');
        } catch (error) {
            console.error('❌ Failed to initialize Market Data Application:', error);
            return; // Don't continue if initialization fails
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

            console.log(`🔄 Switching to instrument: ${selectedInstrument}`);

            // Reset the market data app to clear all previous data
            if (window.marketDataApp) {
                console.log(`🔄 Resetting market data application...`);
                window.marketDataApp.reset();
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
            window.marketDataApp.initializeEventSource(instrument);
        }

        // export the class for external use (for debugging/console access)
        window.MarketDataApp = MarketDataApp;

        console.log('✅ Instrument Selection Dashboard successfully loaded and initialized');
});