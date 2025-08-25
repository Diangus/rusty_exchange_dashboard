/**
 * PNL Data Manager Module
 * Handles position and P&L data storage, processing, and cleanup
 */

class PnlDataManager {
    constructor() {
        this.messageCount = 0;
        this.positionUpdateCount = 0;
        this.pnlUpdateCount = 0;

        // Current positions: Map<trader_instrument, position_data>
        this.currentPositions = new Map();

        // PNL history for chart (last N minutes) Map<Trader, Array<timestamp, pnl_value>>
        this.pnlHistory = new Map();

        this.CHART_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
        this.last_n_positions_to_show = 50;

        // Statistics cache
        this.cachedStatistics = null;
        this.statisticsLastUpdated = 0;
    }

    // Clean old PNL data (keep only last N minutes)
    cleanOldData() {
        const cutoff = Date.now() - this.CHART_DURATION;

        for (const [trader, pnl] of this.pnlHistory.entries()) {
            const filteredPnl = pnl.filter(d => {
                const entryTime = Date.parse(d.timestamp);
                return entryTime > cutoff;
            });
            this.pnlHistory.set(trader, filteredPnl);
        }
    }

    // Process position update
    processPositionUpdate(message) {
        try {
            if (!message || typeof message !== 'object') {
                console.warn('processPositionUpdate: Invalid message');
                return;
            }

            this.positionUpdateCount++;

            // The message structure is: { type: "position_update", client: "TRADER", data: {"AAPL": -19}, timestamp: "..." }
            // According to redis_keys_and_channels.md
            const trader = message.client;
            const positionData = message.data;

            if (!trader || !positionData) {
                console.warn('processPositionUpdate: Missing trader or position data', message);
                return;
            }

            // Handle the position data structure: { "AAPL": -19, "GOOGL": 100 }
            for (const [instrument, position] of Object.entries(positionData)) {
                let positionsForTrader = this.currentPositions.get(trader);
                if (!positionsForTrader) {
                    positionsForTrader = new Map();
                    this.currentPositions.set(trader, positionsForTrader);
                }
                positionsForTrader.set(instrument, position);
            }

        } catch (error) {
            console.error('Error in processPositionUpdate:', error, message);
        }
    }

    // Process PNL update
    processPnlUpdate(message) {
        try {
            if (!message || typeof message !== 'object') {
                console.warn('processPnlUpdate: Invalid message');
                return;
            }

            this.pnlUpdateCount++;

            // The message structure is: { type: "pnl_update", client: "TRADER", data: {"pnl": 82.20}, timestamp: "..." }
            // According to redis_keys_and_channels.md
            const trader = message.client;
            const pnlValue = message.data && message.data.pnl;
            const timestamp = message.timestamp;

            if (!trader || typeof pnlValue !== 'number') {
                console.warn('processPnlUpdate: Missing trader or invalid pnl value', message);
                return;
            }

            let pnlForTrader = this.pnlHistory.get(trader);
            if (!pnlForTrader) {
                pnlForTrader = [];
                this.pnlHistory.set(trader, pnlForTrader);
            }

            const pnlEntry = {timestamp: timestamp, pnl_value: pnlValue};
            pnlForTrader.push(pnlEntry);

            this.cleanOldData();

        } catch (error) {
            console.error('Error in processPnlUpdate:', error, message);
        }
    }

    // Process message from SSE
    processMessage(message) {
        this.messageCount++;

        try {
            if (!message || typeof message !== 'object') {
                console.warn('processMessage: Invalid message format');
                return null;
            }

            if (message.type === 'position_update') {
                this.processPositionUpdate(message);
                return 'position';
            } else if (message.type === 'pnl_update') {
                this.processPnlUpdate(message);
                return 'pnl';
            }
        } catch (error) {
            console.error('Error in processMessage:', error, message);
            return null;
        }

        return null;
    }

    // Get statistics (cached to avoid creating new objects)
    getStatistics() {
        // Only update cached statistics if data changed
        if (this.cachedStatistics === null || this.statisticsLastUpdated !== this.messageCount) {
            const uniqueClients = new Set();
            let totalPositions = 0;
            let totalPnl = 0;

            // Calculate statistics from current positions
            for (const [trader, positionsMap] of this.currentPositions.entries()) {
                uniqueClients.add(trader);
                for (const position of positionsMap.values()) {
                    totalPositions += Math.abs(position);
                }
            }

            // Calculate total PNL from recent history (last entry per trader)
            const latestPnlByTrader = new Map();
            for (const [trader, pnlData] of this.pnlHistory.entries()) {
                if (pnlData.length > 0) {
                    // Get the most recent PNL value for this trader
                    const latestPnl = pnlData[pnlData.length - 1];
                    latestPnlByTrader.set(trader, latestPnl.pnl_value);
                }
            }
            totalPnl = Array.from(latestPnlByTrader.values()).reduce((sum, pnl) => sum + pnl, 0);

            this.cachedStatistics = {
                messageCount: this.messageCount,
                positionUpdateCount: this.positionUpdateCount,
                pnlUpdateCount: this.pnlUpdateCount,
                totalClients: uniqueClients.size,
                activePositions: this.currentPositions.size,
                totalPnl: totalPnl.toFixed(2),
                pnlUpdates: this.pnlUpdateCount
            };
            this.statisticsLastUpdated = this.messageCount;
        }
        return this.cachedStatistics;
    }

    // Get current positions for table display
    getCurrentPositions() {
        const positions = [];
        for (const [trader, positionsMap] of this.currentPositions.entries()) {
            for (const [instrument, position] of positionsMap.entries()) {
                positions.push({
                    trader: trader,
                    instrument: instrument,
                    position: position
                });
            }
        }
        return positions
            .sort((a, b) => {
                // Default sort by trader, then instrument
                if (a.trader !== b.trader) {
                    return a.trader.localeCompare(b.trader);
                }
                return a.instrument.localeCompare(b.instrument);
            })
            .slice(0, this.last_n_positions_to_show);
    }

    // Get PNL history for chart
    getPnlHistory() {
        const pnlHistory = [];
        for (const [trader, pnlData] of this.pnlHistory.entries()) {
            pnlData.forEach(pnlEntry => {
                pnlHistory.push({
                    trader: trader,
                    pnl_value: pnlEntry.pnl_value,
                    timestamp: pnlEntry.timestamp
                });
            });
        }
        return pnlHistory;
    }

    // Get unique traders for chart legend
    getUniqueTraders() {
        const traders = new Set();
        for (const [trader, pnlData] of this.pnlHistory.entries()) {
            traders.add(trader);
        }
        return Array.from(traders);
    }

    // Filter positions by search term
    filterPositions(searchTerm) {
        if (!searchTerm) return this.getCurrentPositions();

        const term = searchTerm.toLowerCase();
        const positions = [];
        for (const [trader, positionsMap] of this.currentPositions.entries()) {
            for (const [instrument, position] of positionsMap.entries()) {
                positions.push({
                    trader: trader,
                    instrument: instrument,
                    position: position
                });
            }
        }
        return positions
            .filter(position =>
                position.trader.toLowerCase().includes(term) ||
                position.instrument.toLowerCase().includes(term)
            )
            .slice(0, this.last_n_positions_to_show);
    }

    // Sort positions by field
    sortPositions(positions, sortBy) {
        return positions.sort((a, b) => {
            let aVal, bVal;

            switch (sortBy) {
                case 'trader':
                    aVal = a.trader;
                    bVal = b.trader;
                    break;
                case 'instrument':
                    aVal = a.instrument;
                    bVal = b.instrument;
                    break;
                case 'position':
                    aVal = Math.abs(a.position);
                    bVal = Math.abs(b.position);
                    break;
                default:
                    aVal = a.trader;
                    bVal = b.trader;
            }

            if (typeof aVal === 'string') {
                return aVal.localeCompare(bVal);
            } else {
                return bVal - aVal; // Descending for numeric values
            }
        });
    }

    // Get recent PNL updates for the table
    getRecentPnls(limit = 20) {
        const recentPnls = [];
        for (const [trader, pnlData] of this.pnlHistory.entries()) {
            if (pnlData.length > 0) {
                // Get the most recent PNL value for this trader
                const latestPnl = pnlData[pnlData.length - 1];
                recentPnls.push({
                    trader: trader,
                    pnl: latestPnl.pnl_value
                });
            }
        }
        return recentPnls.slice(0, limit);
    }
}

// Export as ES6 module
export default PnlDataManager;