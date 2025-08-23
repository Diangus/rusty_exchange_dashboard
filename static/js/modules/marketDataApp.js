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
            
            // Initialize SSE connection
            this.initializeEventSource();
            
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

    initializeEventSource() {
        try {
            this.eventSource = new EventSource('/stream');
            
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
                this.uiManager.showNotification('Connected to market data stream', 'success');
            };
            
        } catch (error) {
            console.error('Failed to initialize EventSource:', error);
            this.uiManager.showNotification('Failed to connect to market data stream', 'error');
        }
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