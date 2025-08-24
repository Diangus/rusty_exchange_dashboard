/**
 * Market Data Application Main Module
 * Coordinates all components and handles the main application logic
 */

// Import required modules
import DataManager from './dataManager.js';
import ChartManager from './chartManager.js';
import TableManager from './tableManager.js';

class MarketDataApp {
    constructor() {
        this.dataManager = new DataManager();
        this.chartManager = new ChartManager('market-chart');
        this.tableManager = new TableManager();
        this.eventSource = null;
        this.liveGraphInterval = null;

        this.isInitialized = false;
    }

    async initialize() {
        try {
            // Initialize table manager
            this.tableManager.initialize();

            // Initialize chart
            this.chartManager.initializeChart();

            // Setup live graph timer (4 times per second)
            this.setupLiveGraphTimer();

            // Setup event listeners
            this.setupEventListeners();

            this.isInitialized = true;
            console.log('[SUCCESS] Market Data Application initialized successfully');

        } catch (error) {
            console.error('Failed to initialize Market Data Application:', error);
            console.log('[ERROR] Failed to initialize application');
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



    // Update statistics display
    updateStatistics(stats) {
        document.getElementById('msgCount').textContent = stats.messageCount;
        document.getElementById('orderbookCount').textContent = stats.orderbookCount;
        document.getElementById('tradeCount').textContent = stats.tradeCount;
        document.getElementById('lastPrice').textContent = stats.lastPrice || '-';
    }



    setupLiveGraphTimer() {
        // Clear any existing timer
        if (this.liveGraphInterval) {
            clearInterval(this.liveGraphInterval);
        }

        // Set up timer to update live graph 4 times per second (every 250ms)
        this.liveGraphInterval = setInterval(() => {
            try {
                // Get fresh chart data from dataManager
                this.dataManager.cleanOldData();
                const chartData = this.dataManager.getChartData();
                const cachedPriceRange = this.dataManager.getCachedPriceRange();

                // Update the live graph
                this.chartManager.updateChart(chartData, cachedPriceRange, this.dataManager.CHART_DURATION);
            } catch (error) {
                console.error('Error updating live graph:', error);
            }
        }, 100); // 100ms = 10 times per second

        console.log('📊 Live graph timer started (10 updates per second)');
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
                    console.log('[WARNING] Connection error - attempting to reconnect');
                    // Could implement reconnection logic here
                };

                this.eventSource.onopen = () => {
                    console.log('EventSource connection established');
                    console.log(`[SUCCESS] Connected to market data stream for instrument ${instrument}`);
                };

            } catch (error) {
                console.error('Failed to initialize EventSource:', error);
                console.log('[ERROR] Failed to connect to market data stream');
            }
        });
    }

    handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            const messageType = this.dataManager.processMessage(message);

            this.updateDisplays(messageType, message);

        } catch (error) {
            console.error('Error processing message:', error);
        }
    }

    updateDisplays(messageType, message) {
        // Update statistics
        this.updateStatistics(this.dataManager.getStatistics());

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
        this.chartManager.updateChart(chartData, cachedPriceRange, this.dataManager.CHART_DURATION);
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
        this.chartManager.updateChart(chartData, cachedPriceRange, this.dataManager.CHART_DURATION);
        
        // Update statistics display
        this.updateStatistics(this.dataManager.getStatistics());
    }

    // Public API methods

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
            this.tableManager.clearTables();
        }

        // Reset chart (but don't destroy it completely)
        if (this.chartManager) {
            // The chart manager doesn't have a reset method, but we can call updateChart with empty data
            const emptyChartData = { bbo: [], trades: [] };
            this.chartManager.updateChart(emptyChartData, null, this.dataManager.CHART_DURATION);
        }

        // Reset statistics display
        this.updateStatistics({
            messageCount: 0,
            orderbookCount: 0,
            tradeCount: 0,
            lastPrice: null
        });

        // Restart live graph timer after reset
        if (this.isInitialized) {
            this.setupLiveGraphTimer();
        }

        console.log('✅ Market Data Application reset complete');
    }

    cleanup() {
        // Clear live graph timer
        if (this.liveGraphInterval) {
            clearInterval(this.liveGraphInterval);
            this.liveGraphInterval = null;
            console.log('⏰ Live graph timer cleared');
        }

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