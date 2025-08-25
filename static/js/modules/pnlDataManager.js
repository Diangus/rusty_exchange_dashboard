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
        console.log('🧹 cleanOldData: Called, cutoff timestamp:', cutoff, 'Date:', new Date(cutoff));

        for (const [trader, pnl] of this.pnlHistory.entries()) {
            console.log('🧹 cleanOldData: Processing trader:', trader, 'data length before:', pnl.length);
            if (pnl.length > 0) {
                console.log('🧹 cleanOldData: First entry timestamp:', pnl[0].timestamp, 'type:', typeof pnl[0].timestamp);
                console.log('🧹 cleanOldData: First entry parsed as Date:', new Date(pnl[0].timestamp));
                console.log('🧹 cleanOldData: First entry as milliseconds:', Date.parse(pnl[0].timestamp));
            }

            const filteredPnl = pnl.filter(d => {
                const entryTime = Date.parse(d.timestamp);
                const shouldKeep = entryTime > cutoff;
                console.log('🧹 cleanOldData: Entry timestamp:', d.timestamp, 'parsed:', entryTime, 'cutoff:', cutoff, 'keep:', shouldKeep);
                return shouldKeep;
            });

            console.log('🧹 cleanOldData: Filtered data length after:', filteredPnl.length);
            this.pnlHistory.set(trader, filteredPnl);
        }
        console.log('🧹 cleanOldData: Complete');
    }

    // Process position update
    processPositionUpdate(message) {
        try {
            console.log('🎯 processPositionUpdate: Received message:', message);

            if (!message || typeof message !== 'object') {
                console.warn('processPositionUpdate: Invalid message');
                return;
            }

            this.positionUpdateCount++;

            // The message structure is: { type: "position_update", client: "TRADER", data: {"AAPL": -19}, timestamp: "..." }
            // According to redis_keys_and_channels.md
            const trader = message.client;
            const positionData = message.data;

            console.log('🎯 processPositionUpdate: trader:', trader, 'positionData:', positionData);

            if (!trader || !positionData) {
                console.warn('processPositionUpdate: Missing trader or position data', message);
                return;
            }

            // Handle the position data structure: { "AAPL": -19, "GOOGL": 100 }
            for (const [instrument, position] of Object.entries(positionData)) {
                console.log('🎯 processPositionUpdate: Processing instrument:', instrument, 'position:', position);

                let positionsForTrader = this.currentPositions.get(trader);
                if (!positionsForTrader) {
                    positionsForTrader = new Map();
                    this.currentPositions.set(trader, positionsForTrader);
                }
                positionsForTrader.set(instrument, position);
            }

            console.log('🎯 processPositionUpdate: Current positions after update:', this.currentPositions);

        } catch (error) {
            console.error('Error in processPositionUpdate:', error, message);
        }
    }

    // Process PNL update
    processPnlUpdate(message) {
        try {
            console.log('💰 processPnlUpdate: Received message:', message);

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

            console.log('💰 processPnlUpdate: Extracted - trader:', trader, 'pnlValue:', pnlValue, 'timestamp:', timestamp);

            if (!trader || typeof pnlValue !== 'number') {
                console.warn('processPnlUpdate: Missing trader or invalid pnl value', message);
                console.log('💰 processPnlUpdate: Validation failed - trader:', trader, 'pnlValue type:', typeof pnlValue, 'pnlValue:', pnlValue);
                return;
            }

            console.log('💰 processPnlUpdate: Validation passed, adding to pnlHistory');

            let pnlForTrader = this.pnlHistory.get(trader);
            if (!pnlForTrader) {
                console.log('💰 processPnlUpdate: Creating new array for trader:', trader);
                pnlForTrader = [];
                this.pnlHistory.set(trader, pnlForTrader);
            }

            const pnlEntry = {timestamp: timestamp, pnl_value: pnlValue};
            console.log('💰 processPnlUpdate: Adding entry:', pnlEntry);
            pnlForTrader.push(pnlEntry);

            console.log('💰 processPnlUpdate: pnlHistory after update:', this.pnlHistory);
            console.log('💰 processPnlUpdate: Array for trader', trader, 'now has', pnlForTrader.length, 'entries');

            this.cleanOldData();

        } catch (error) {
            console.error('Error in processPnlUpdate:', error, message);
        }
    }

    // Process message from SSE
    processMessage(message) {
        console.log('🔄 processMessage: Processing message:', message);
        this.messageCount++;

        try {
            if (!message || typeof message !== 'object') {
                console.warn('processMessage: Invalid message format');
                return null;
            }

            console.log('🔄 processMessage: Message type:', message.type);

            if (message.type === 'position_update') {
                console.log('🔄 processMessage: Detected position_update, calling processPositionUpdate');
                this.processPositionUpdate(message);
                return 'position';
            } else if (message.type === 'pnl_update') {
                console.log('🔄 processMessage: Detected pnl_update, calling processPnlUpdate');
                this.processPnlUpdate(message);
                return 'pnl';
            } else {
                console.log('🔄 processMessage: Unknown message type:', message.type);
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
        console.log('📊 getPnlHistory: Called, pnlHistory Map:', this.pnlHistory);

        const pnlHistory = [];
        for (const [trader, pnlData] of this.pnlHistory.entries()) {
            console.log('📊 getPnlHistory: Processing trader:', trader, 'data:', pnlData);

            pnlData.forEach(pnlEntry => {
                pnlHistory.push({
                    trader: trader,
                    pnl_value: pnlEntry.pnl_value,
                    timestamp: pnlEntry.timestamp
                });
            });
        }

        console.log('📊 getPnlHistory: Returning flattened history:', pnlHistory);
        return pnlHistory;
    }

    // Get unique traders for chart legend
    getUniqueTraders() {
        console.log('👥 getUniqueTraders: Called, pnlHistory Map:', this.pnlHistory);

        const traders = new Set();
        for (const [trader, pnlData] of this.pnlHistory.entries()) {
            console.log('👥 getUniqueTraders: Adding trader:', trader);
            traders.add(trader);
        }

        const traderArray = Array.from(traders);
        console.log('👥 getUniqueTraders: Returning traders:', traderArray);
        return traderArray;
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
        console.log('📈 getRecentPnls: Called, pnlHistory Map:', this.pnlHistory);

        const recentPnls = [];
        for (const [trader, pnlData] of this.pnlHistory.entries()) {
            console.log('📈 getRecentPnls: Processing trader:', trader, 'data length:', pnlData.length);

            if (pnlData.length > 0) {
                // Get the most recent PNL value for this trader
                const latestPnl = pnlData[pnlData.length - 1];
                console.log('📈 getRecentPnls: Latest PNL for', trader, ':', latestPnl);

                recentPnls.push({
                    trader: trader,
                    pnl: latestPnl.pnl_value
                });
            }
        }

        console.log('📈 getRecentPnls: Returning recent PNLs:', recentPnls);
        return recentPnls.slice(0, limit);
    }
}

// Export as ES6 module
export default PnlDataManager;