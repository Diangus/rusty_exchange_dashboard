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

        // Statistics cache
        this.cachedStatistics = null;
        this.statisticsLastUpdated = 0;
    }

    // Clean old PNL data (keep only last N minutes)
    cleanOldData() {
        const cutoff = Date.now() - this.CHART_DURATION;
        for (const [trader, pnl] of this.pnlHistory.entries()) {
            const filteredPnl = pnl.filter(d => d.timestamp > cutoff);
            this.pnlHistory.set(trader, filteredPnl);
        }
    }

    // Process position update
    processPositionUpdate(message) {
        try {
            if (!message || typeof message !== 'object') {
                console.warn('processPositionUpdate: Invalid message format');
                return;
            }

            const trader = message.client;
            const positionData = message.data;
            const timestamp = message.timestamp;

            if (!trader) {
                console.warn('processPositionUpdate: Missing client field', message);
                return;
            }

            if (!positionData || typeof positionData !== 'object') {
                console.warn('processPositionUpdate: Missing or invalid data field', message);
                return;
            }

            this.positionUpdateCount++;

            // For position updates, the data field contains instrument:position pairs
            // We'll store each instrument position separately for now
            // Since we need a table format, let's pick the first instrument or show summary
            const instruments = Object.keys(positionData);
            if (instruments.length > 0) {
                const firstInstrument = instruments[0];
                const firstPosition = positionData[firstInstrument];

                this.currentPositions.set(trader, {
                    trader: trader,
                    instrument: firstInstrument,
                    position: typeof firstPosition === 'number' ? firstPosition : 0,
                    timestamp: timestamp ? new Date(timestamp).getTime() : Date.now()
                });
            } else {
                // If no instruments, create a placeholder entry
                this.currentPositions.set(trader, {
                    trader: trader,
                    instrument: 'UNKNOWN',
                    position: 0,
                    timestamp: timestamp ? new Date(timestamp).getTime() : Date.now()
                });
            }

        } catch (error) {
            console.error('Error in processPositionUpdate:', error, message);
        }
    }

    // Process PNL update
    processPnlUpdate(message) {
        try {
            console.log('processPnlUpdate received:', message);

            if (!message || typeof message !== 'object') {
                console.warn('processPnlUpdate: Invalid message format');
                return;
            }

            const trader = message.client;
            const pnlData = message.data;
            const timestamp = message.timestamp;

            console.log('Extracted values:', { trader, pnlData, timestamp });

            if (!trader) {
                console.warn('processPnlUpdate: Missing client field', message);
                return;
            }

            if (!pnlData || typeof pnlData !== 'object') {
                console.warn('processPnlUpdate: Missing or invalid data field', message);
                return;
            }

            const pnlValue = pnlData.pnl;

            console.log('PNL value:', pnlValue, typeof pnlValue);

            if (typeof pnlValue !== 'number' || isNaN(pnlValue)) {
                console.warn('processPnlUpdate: Missing or invalid pnl value', pnlData);
                return;
            }

            this.pnlUpdateCount++;

            // Parse timestamp - handle both string and numeric timestamps
            let parsedTimestamp;
            if (typeof timestamp === 'string') {
                parsedTimestamp = new Date(timestamp).getTime();
            } else if (typeof timestamp === 'number') {
                parsedTimestamp = timestamp;
            } else {
                parsedTimestamp = Date.now();
            }

            let pnlForTrader = this.pnlHistory.get(trader);
            if (!pnlForTrader) {
                pnlForTrader = [];
                this.pnlHistory.set(trader, pnlForTrader);
            }

            pnlForTrader.push({
                timestamp: parsedTimestamp,
                pnl_value: pnlValue
            });

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

            console.log('processMessage received:', message);

            if (message.type === 'position_update') {
                console.log('Processing position_update');
                this.processPositionUpdate(message);
                return 'position';
            } else if (message.type === 'pnl_update') {
                console.log('Processing pnl_update');
                this.processPnlUpdate(message);
                return 'pnl';
            } else {
                console.warn('processMessage: Unknown message type:', message.type);
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
            for (const position of this.currentPositions.values()) {
                uniqueClients.add(position.trader);
                if (typeof position.position === 'number' && !isNaN(position.position)) {
                    totalPositions += Math.abs(position.position);
                }
            }

            // Calculate total PNL from recent history (last entry per trader)
            for (const [trader, pnlHistory] of this.pnlHistory.entries()) {
                if (pnlHistory.length > 0) {
                    // Get the most recent PNL value for this trader
                    const latestPnl = pnlHistory[pnlHistory.length - 1].pnl_value;
                    if (typeof latestPnl === 'number' && !isNaN(latestPnl)) {
                        totalPnl += latestPnl;
                    }
                }
            }

            this.cachedStatistics = {
                messageCount: this.messageCount,
                positionUpdateCount: this.positionUpdateCount,
                pnlUpdateCount: this.pnlUpdateCount,
                totalClients: uniqueClients.size,
                activePositions: totalPositions,
                totalPnl: totalPnl.toFixed(2),
                pnlUpdates: this.pnlUpdateCount
            };
            this.statisticsLastUpdated = this.messageCount;
        }
        return this.cachedStatistics;
    }

    // Get current positions for table display
    getCurrentPositions() {
        return Array.from(this.currentPositions.values())
            .sort((a, b) => {
                // Default sort by trader, then instrument
                if (a.trader !== b.trader) {
                    return a.trader.localeCompare(b.trader);
                }
                return (a.instrument || 'UNKNOWN').localeCompare(b.instrument || 'UNKNOWN');
            })
            .slice(0, this.last_n_positions_to_show);
    }

    // Get PNL history for chart
    getPnlHistory() {
        const allPnlData = [];
        for (const [trader, pnlHistory] of this.pnlHistory.entries()) {
            for (const pnlPoint of pnlHistory) {
                allPnlData.push({
                    trader: trader,
                    timestamp: pnlPoint.timestamp,
                    pnl_value: pnlPoint.pnl_value
                });
            }
        }
        return allPnlData.sort((a, b) => a.timestamp - b.timestamp);
    }

    // Get unique traders for chart legend
    getUniqueTraders() {
        return Array.from(this.pnlHistory.keys());
    }

    // Filter positions by search term
    filterPositions(searchTerm) {
        if (!searchTerm) return this.getCurrentPositions();

        const term = searchTerm.toLowerCase();
        return Array.from(this.currentPositions.values())
            .filter(position =>
                position.trader.toLowerCase().includes(term) ||
                (position.instrument || 'UNKNOWN').toLowerCase().includes(term)
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

    // Set chart duration
    setChartDuration(minutes) {
        this.CHART_DURATION = minutes * 60 * 1000;
        this.cleanOldData();
    }
}

// Export as ES6 module
export default PnlDataManager;