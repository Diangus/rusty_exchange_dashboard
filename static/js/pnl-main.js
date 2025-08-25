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
        this.pnlUpdatesTable = document.getElementById('pnl-updates-tbody');
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
            // Only log occasionally to avoid spam
            if (Math.random() < 0.01) { // Log ~1% of messages
                console.log('Raw SSE event data:', event.data);
            }
            try {
                const message = JSON.parse(event.data);
                if (Math.random() < 0.01) { // Log ~1% of messages
                    console.log('Parsed SSE message:', message);
                }
                this._handleMessage(message);
            } catch (error) {
                console.error('Error parsing SSE message:', error, event.data);
            }
        };

        this.eventSource.onerror = (error) => {
            console.error('❌ SSE connection error:', error);
            this.isConnected = false;

            // Attempt to reconnect after a delay
            setTimeout(() => {
                console.log('🔄 Attempting to reconnect to SSE...');
                this._connectToSSE();
            }, 2000);
        };
    }

    _handleMessage(message) {
        console.log('📨 _handleMessage: Processing message:', message);

        const messageType = this.dataManager.processMessage(message);
        console.log('📨 _handleMessage: Message type returned:', messageType);

        if (messageType === 'position') {
            console.log('📨 _handleMessage: Processing position update - calling _updatePositionsTable');
            this._updatePositionsTable();
            this._updateStatistics();
        } else if (messageType === 'pnl') {
            console.log('📨 _handleMessage: Processing pnl update - calling _updateStatistics, _updateChart, _updatePnlUpdatesTable');
            this._updateStatistics();
            this._updateChart();
            this._updatePnlUpdatesTable();
        } else {
            console.log('📨 _handleMessage: Unknown message type:', messageType);
        }
    }

    _startPeriodicUpdates() {
        // Update positions table every second
        this.updateInterval = setInterval(() => {
            this._updatePositionsTable();
            this._updateStatistics();
            this._updatePnlUpdatesTable();
        }, 1000);

        // Update chart every 2 seconds
        this.chartUpdateInterval = setInterval(() => {
            this._updateChart();
        }, 2000);
    }

    _updatePositionsTable() {
        console.log('📊 _updatePositionsTable: Called');

        if (!this.positionsTable) {
            console.log('📊 _updatePositionsTable: No positionsTable element found');
            return;
        }

        let positions = this.dataManager.getCurrentPositions();
        console.log('📊 _updatePositionsTable: Raw positions from dataManager:', positions);

        // Apply filter
        if (this.currentFilter) {
            positions = this.dataManager.filterPositions(this.currentFilter);
            console.log('📊 _updatePositionsTable: Filtered positions:', positions);
        }

        // Apply sort
        positions = this.dataManager.sortPositions(positions, this.currentSortBy);
        console.log('📊 _updatePositionsTable: Sorted positions:', positions);

        // Update table
        this.positionsTable.innerHTML = '';

        if (positions.length === 0) {
            console.log('📊 _updatePositionsTable: No positions to display');
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `
                <td colspan="3" class="px-4 py-3 text-sm text-slate-500 text-center">
                    No positions available
                </td>
            `;
            this.positionsTable.appendChild(emptyRow);
        } else {
            positions.forEach(position => {
                console.log('📊 _updatePositionsTable: Adding row for position:', position);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="px-4 py-3 text-sm text-slate-300">${position.trader}</td>
                    <td class="px-4 py-3 text-sm text-slate-300">${position.instrument || 'UNKNOWN'}</td>
                    <td class="px-4 py-3 text-sm text-right ${position.position >= 0 ? 'text-emerald-400' : 'text-red-400'}">${position.position}</td>
                `;
                this.positionsTable.appendChild(row);
            });
        }

        console.log('📊 _updatePositionsTable: Table updated with', positions.length, 'rows');
    }

    _updateStatistics() {
        const stats = this.dataManager.getStatistics();

        if (this.statsElements.totalClients) {
            this.statsElements.totalClients.textContent = stats.totalClients;
        }
        if (this.statsElements.pnlUpdates) {
            this.statsElements.pnlUpdates.textContent = stats.pnlUpdates;
        }
    }

    _updateChart() {
        console.log('📈 _updateChart: Called');

        const pnlHistory = this.dataManager.getPnlHistory();
        const traders = this.dataManager.getUniqueTraders();
        const duration = this.chartDuration ? parseInt(this.chartDuration.value) * 60 * 1000 : null;

        console.log('📈 _updateChart: PNL history:', pnlHistory);
        console.log('📈 _updateChart: Traders:', traders);
        console.log('📈 _updateChart: Duration:', duration);

        if (pnlHistory.length === 0) {
            console.log('📈 _updateChart: No PNL history data available');
        }

        if (traders.length === 0) {
            console.log('📈 _updateChart: No traders available');
        }

        this.chartManager.updateChart(pnlHistory, traders, duration);
        console.log('📈 _updateChart: Chart update complete');
    }

    _updatePnlUpdatesTable() {
        console.log('📋 _updatePnlUpdatesTable: Called');

        if (!this.pnlUpdatesTable) {
            console.log('📋 _updatePnlUpdatesTable: No pnlUpdatesTable element found');
            return;
        }

        const recentPnls = this.dataManager.getRecentPnls();
        console.log('📋 _updatePnlUpdatesTable: Recent PNLs:', recentPnls);

        // Update table
        this.pnlUpdatesTable.innerHTML = '';

        if (recentPnls.length === 0) {
            console.log('📋 _updatePnlUpdatesTable: No recent PNLs to display');
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `
                <td colspan="2" class="px-4 py-3 text-sm text-slate-500 text-center">
                    No recent P&L updates available
                </td>
            `;
            this.pnlUpdatesTable.appendChild(emptyRow);
        } else {
            recentPnls.forEach(pnlData => {
                console.log('📋 _updatePnlUpdatesTable: Adding row for PNL:', pnlData);
                const row = document.createElement('tr');
                const pnlClass = pnlData.pnl >= 0 ? 'text-emerald-400' : 'text-red-400';
                const pnlSign = pnlData.pnl >= 0 ? '+' : '';

                row.innerHTML = `
                    <td class="px-4 py-3 text-sm text-slate-300">${pnlData.trader}</td>
                    <td class="px-4 py-3 text-sm text-right ${pnlClass}">${pnlSign}${pnlData.pnl.toFixed(2)}</td>
                `;
                this.pnlUpdatesTable.appendChild(row);
            });
        }

        console.log('📋 _updatePnlUpdatesTable: Table updated with', recentPnls.length, 'rows');
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