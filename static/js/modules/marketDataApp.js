/**
 * Market Data Application Main Module
 * Coordinates all components and handles the main application logic
 */

// Import required modules
import DataManager from './dataManager.js';
import ChartManager from './chartManager.js';
import TableManager from './tableManager.js';
import UIManager from './uiManager.js';

class MarketDataApp {
    constructor() {
        this.dataManager = new DataManager();
        this.chartManager = new ChartManager('market-chart');
        this.tableManager = new TableManager();
        this.uiManager = new UIManager();
        this.eventSource = null;
        
        this.isInitialized = false;
    }

    async initialize() {
        try {
            // Initialize UI components
            this.uiManager.initialize();
            
            // Initialize table manager
            this.tableManager.initialize();
            
            // Initialize chart
            this.chartManager.initializeChart();

            // Setup event listeners
            this.setupEventListeners();
            
            // Setup pause/resume callbacks
            this.setupPauseResumeCallbacks();
            
            this.isInitialized = true;
            this.uiManager.showNotification('Market Data Application initialized successfully', 'success');
            
        } catch (error) {
            console.error('Failed to initialize Market Data Application:', error);
            this.uiManager.showNotification('Failed to initialize application', 'error');
        }
    }

    setupEventListeners() {
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('Page hidden - continuing data collection');
            } else {
                console.log('Page visible - refreshing displays');
                this.refreshAllDisplays();
            }
        });

        // Handle beforeunload for cleanup
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    setupPauseResumeCallbacks() {
        // Register callbacks for pause functionality
        this.uiManager.onResume(() => {
            this.refreshAllDisplays();
        });
    }

    initializeEventSource(instrument) {
        this.initialize().then(() => {
            console.log(`Initializing EventSource for instrument ${instrument}`);
            try {
                this.eventSource = new EventSource(`/sse/${instrument}`);
            
                this.eventSource.onmessage = (event) => {
                    this.handleMessage(event);
                };
            
                this.eventSource.onerror = (event) => {
                    console.error('EventSource failed:', event);
                    this.uiManager.showNotification('Connection error - attempting to reconnect', 'warning');
                    // Could implement reconnection logic here
                };
            
                this.eventSource.onopen = () => {
                    console.log('EventSource connection established');
                    this.uiManager.showNotification(`Connected to market data stream for instrument ${instrument}`, 'success');
                };
            
            } catch (error) {
                console.error('Failed to initialize EventSource:', error);
                this.uiManager.showNotification('Failed to connect to market data stream', 'error');
            }
        });
    }

    handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            const messageType = this.dataManager.processMessage(message);
            
            // Only update visual displays if not paused
            if (!this.uiManager.getPauseState()) {
                this.updateDisplays(messageType, message);
            }
            
        } catch (error) {
            console.error('Error processing message:', error);
        }
    }

    updateDisplays(messageType, message) {
        // Update statistics
        this.uiManager.updateStatistics(this.dataManager.getStatistics());

        // Update specific displays based on message type
        if (messageType === 'orderbook') {
            const cachedBBO = this.dataManager.getCachedBBO();
            this.tableManager.updateOrderbookTable(message.data, cachedBBO);
        } else if (messageType === 'trade') {
            this.tableManager.updateTradesTable(message.data);
        }
        // Update chart with cached price range for better performance
        const chartData = this.dataManager.getChartData();
        const cachedPriceRange = this.dataManager.getCachedPriceRange();
        this.chartManager.updateChart(chartData, cachedPriceRange);
    }

    refreshAllDisplays() {
        if (!this.isInitialized) return;
        
        // Update orderbook table with latest data
        const latestOrderbook = this.dataManager.getLatestOrderbookData();
        if (latestOrderbook) {
            const cachedBBO = this.dataManager.getCachedBBO();
            this.tableManager.updateOrderbookTable(latestOrderbook, cachedBBO);
        }
        
        // Refresh trade table with recent trades
        const recentTrades = this.dataManager.getRecentTrades();
        this.tableManager.refreshTradesTable(recentTrades);
        
        // Update chart with all accumulated data and cached price range
        const chartData = this.dataManager.getChartData();
        const cachedPriceRange = this.dataManager.getCachedPriceRange();
        this.chartManager.updateChart(chartData, cachedPriceRange);
        
        // Update statistics display
        this.uiManager.updateStatistics(this.dataManager.getStatistics());
    }

    // Public API methods
    pause() {
        this.uiManager.setPauseState(true);
    }

    resume() {
        this.uiManager.setPauseState(false);
    }

    getStatistics() {
        return this.dataManager.getStatistics();
    }

    exportData() {
        return {
            statistics: this.dataManager.getStatistics(),
            chartData: this.dataManager.getChartData(),
            timestamp: new Date().toISOString()
        };
    }

    reset() {
        console.log('🔄 Resetting Market Data Application for new instrument...');

        // Close existing EventSource connection
        if (this.eventSource) {
            console.log('🔌 Closing existing EventSource connection');
            this.eventSource.close();
            this.eventSource = null;
        }

        // Reset data manager (clear all accumulated data)
        if (this.dataManager) {
            console.log('🧹 Clearing data manager state');
            // Reset dataManager state
            this.dataManager.messageCount = 0;
            this.dataManager.orderbookCount = 0;
            this.dataManager.tradeCount = 0;
            this.dataManager.lastPrice = null;
            this.dataManager.lastOrderbookData = null;
            this.dataManager.cachedBBO = {
                bestBid: null,
                bestAsk: null,
                orderbook: null
            };
            this.dataManager.cachedStatistics = null;
            this.dataManager.statisticsLastUpdated = 0;
            this.dataManager.priceRange = {
                min: null,
                max: null,
                lastUpdated: 0
            };
            this.dataManager.chartData = {
                bbo: [],
                trades: []
            };
        }

        // Clear table displays
        if (this.tableManager) {
            console.log('📊 Clearing table displays');
            this.tableManager.clearTables();
        }

        // Reset chart (but don't destroy it completely)
        if (this.chartManager) {
            console.log('📈 Resetting chart');
            // The chart manager doesn't have a reset method, but we can call updateChart with empty data
            const emptyChartData = { bbo: [], trades: [] };
            this.chartManager.updateChart(emptyChartData, null);
        }

        // Reset statistics display
        if (this.uiManager) {
            console.log('📊 Resetting statistics display');
            this.uiManager.updateStatistics({
                messageCount: 0,
                orderbookCount: 0,
                tradeCount: 0,
                lastPrice: null
            });
        }

        console.log('✅ Market Data Application reset complete');
    }

    cleanup() {
        if (this.eventSource) {
            this.eventSource.close();
        }

        if (this.chartManager) {
            this.chartManager.destroy();
        }

        console.log('Market Data Application cleaned up');
    }


}

// Export as ES6 module
export default MarketDataApp;