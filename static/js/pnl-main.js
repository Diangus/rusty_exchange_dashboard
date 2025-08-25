/**
 * Main Entry Point for PNL Dashboard Application
 * This file serves as the entry point for the ES6 module system
 */

// Import the PNL-specific modules
import PnlDataManager from './modules/pnlDataManager.js';
import PnlChartManager from './modules/pnlChartManager.js';

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
    console.log('🚀 Starting PNL Dashboard...');

    // Initialize the PNL application
    try {
        const pnlApp = new PnlDashboardApp();
        await pnlApp.initialize();
        console.log('✅ PNL Dashboard initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize PNL Dashboard:', error);
    }
});

class PnlDashboardApp {
    constructor() {
        this.dataManager = new PnlDataManager();
        this.chartManager = new PnlChartManager('pnl-chart');
        this.eventSource = null;
        this.isConnected = false;
        this.updateInterval = null;
        this.chartUpdateInterval = null;

        // DOM elements
        this.statsElements = {
            totalClients: document.getElementById('totalClients'),
            activePositions: document.getElementById('activePositions'),
            totalPnl: document.getElementById('totalPnl'),
            pnlUpdates: document.getElementById('pnlUpdates')
        };

        this.positionsTable = document.getElementById('positions-tbody');
        this.positionFilter = document.getElementById('position-filter');
        this.positionSort = document.getElementById('position-sort');
        this.chartDuration = document.getElementById('chart-duration');

        // Current filter/sort state
        this.currentFilter = '';
        this.currentSortBy = 'trader';
    }

    async initialize() {
        console.log('🔧 Initializing PNL Dashboard components...');

        // Initialize chart
        this.chartManager.initializeChart();

        // Set up event listeners
        this._setupEventListeners();

        // Connect to PNL SSE endpoint
        this._connectToSSE();

        // Start periodic updates
        this._startPeriodicUpdates();

        console.log('✅ PNL Dashboard components initialized');
    }

    _setupEventListeners() {
        // Position filter input
        if (this.positionFilter) {
            this.positionFilter.addEventListener('input', (e) => {
                this.currentFilter = e.target.value;
                this._updatePositionsTable();
            });
        }

        // Position sort select
        if (this.positionSort) {
            this.positionSort.addEventListener('change', (e) => {
                this.currentSortBy = e.target.value;
                this._updatePositionsTable();
            });
        }

        // Chart duration select
        if (this.chartDuration) {
            this.chartDuration.addEventListener('change', (e) => {
                const minutes = parseInt(e.target.value);
                this.dataManager.setChartDuration(minutes);
                this.chartManager.setChartDuration(minutes);
                this._updateChart();
            });
        }

        // Handle table header clicks for sorting
        const headers = document.querySelectorAll('th[data-sort]');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const sortBy = header.dataset.sort;
                this.currentSortBy = sortBy;
                if (this.positionSort) {
                    this.positionSort.value = sortBy;
                }
                this._updatePositionsTable();
            });
        });
    }

    _connectToSSE() {
        console.log('🔌 Connecting to PNL SSE endpoint...');

        if (this.eventSource) {
            this.eventSource.close();
        }

        this.eventSource = new EventSource('/sse/pnl');

        this.eventSource.onopen = (event) => {
            console.log('✅ Connected to PNL SSE endpoint');
            this.isConnected = true;
        };

        this.eventSource.onmessage = (event) => {
            console.log('Raw SSE event data:', event.data);
            try {
                const message = JSON.parse(event.data);
                console.log('Parsed SSE message:', message);
                this._handleMessage(message);
            } catch (error) {
                console.error('Error parsing SSE message:', error, event.data);
            }
        };

        this.eventSource.onerror = (error) => {
            console.error('❌ SSE connection error:', error);
            this.isConnected = false;
        };
    }

    _handleMessage(message) {
        console.log('Handling message in main:', message);
        const messageType = this.dataManager.processMessage(message);
        console.log('Message type returned:', messageType);

        if (messageType === 'position') {
            this._updatePositionsTable();
            this._updateStatistics();
        } else if (messageType === 'pnl') {
            this._updateStatistics();
            this._updateChart();
        }
    }

    _startPeriodicUpdates() {
        // Update positions table every second
        this.updateInterval = setInterval(() => {
            this._updatePositionsTable();
            this._updateStatistics();
        }, 1000);

        // Update chart every 2 seconds
        this.chartUpdateInterval = setInterval(() => {
            this._updateChart();
        }, 2000);
    }

    _updatePositionsTable() {
        if (!this.positionsTable) return;

        let positions = this.dataManager.getCurrentPositions();

        // Apply filter
        if (this.currentFilter) {
            positions = this.dataManager.filterPositions(this.currentFilter);
        }

        // Apply sort
        positions = this.dataManager.sortPositions(positions, this.currentSortBy);

        // Update table
        this.positionsTable.innerHTML = '';

        positions.forEach(position => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-4 py-3 text-sm text-slate-300">${position.trader}</td>
                <td class="px-4 py-3 text-sm text-slate-300">${position.instrument || 'UNKNOWN'}</td>
                <td class="px-4 py-3 text-sm text-right ${position.position >= 0 ? 'text-emerald-400' : 'text-red-400'}">${position.position}</td>
            `;
            this.positionsTable.appendChild(row);
        });
    }

    _updateStatistics() {
        const stats = this.dataManager.getStatistics();

        if (this.statsElements.totalClients) {
            this.statsElements.totalClients.textContent = stats.totalClients;
        }
        if (this.statsElements.activePositions) {
            this.statsElements.activePositions.textContent = stats.activePositions;
        }
        if (this.statsElements.totalPnl) {
            this.statsElements.totalPnl.textContent = stats.totalPnl;
        }
        if (this.statsElements.pnlUpdates) {
            this.statsElements.pnlUpdates.textContent = stats.pnlUpdates;
        }
    }

    _updateChart() {
        const pnlHistory = this.dataManager.getPnlHistory();
        const traders = this.dataManager.getUniqueTraders();
        const duration = this.chartDuration ? parseInt(this.chartDuration.value) * 60 * 1000 : null;

        this.chartManager.updateChart(pnlHistory, traders, duration);
    }

    // Clean up resources
    destroy() {
        if (this.eventSource) {
            this.eventSource.close();
        }
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        if (this.chartUpdateInterval) {
            clearInterval(this.chartUpdateInterval);
        }
        if (this.chartManager) {
            this.chartManager.destroy();
        }
    }
}

// Export for external access
window.PnlDashboardApp = PnlDashboardApp;