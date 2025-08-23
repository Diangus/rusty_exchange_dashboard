/**
 * Table Manager Module
 * Handles orderbook and trades table updates and rendering
 */

class TableManager {
    constructor() {
        this.orderbookTableId = 'orderbook-table';
        this.tradesTableId = 'trades-table';
        
        // Cache DOM references for performance
        this.orderbookTable = null;
        this.tradesTable = null;
        this.orderbookTableBody = null;
        this.tradesTableBody = null;
    }

    // Initialize DOM references (called after DOM is ready)
    initialize() {
        this.orderbookTable = document.getElementById(this.orderbookTableId);
        this.tradesTable = document.getElementById(this.tradesTableId);
        this.orderbookTableBody = this.orderbookTable ? this.orderbookTable.querySelector('tbody') : null;
        this.tradesTableBody = this.tradesTable ? this.tradesTable.querySelector('tbody') : null;
        
        if (!this.orderbookTableBody || !this.tradesTableBody) {
            console.warn('TableManager: Could not find required table elements');
        }
    }

    updateTradesTable(trade) {
        if (!this.tradesTableBody) return;
        
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-700 transition-colors duration-150';
        row.innerHTML = `
            <td class="px-4 py-3 text-sm text-slate-200">${new Date(trade.timestamp).toLocaleTimeString('en-US', {hour12: false})}</td>
            <td class="px-4 py-3 text-sm text-slate-200">${trade.instrument}</td>
            <td class="px-4 py-3 text-sm text-slate-200 text-right">${trade.volume}</td>
            <td class="px-4 py-3 text-sm font-medium text-slate-100 text-right">${trade.price}</td>
            <td class="px-4 py-3 text-sm text-emerald-400">${trade.buyer}</td>
            <td class="px-4 py-3 text-sm text-red-400">${trade.seller}</td>
        `;
        this.tradesTableBody.insertBefore(row, this.tradesTableBody.firstChild);
        
        // Keep only the last 10 trades
        if (this.tradesTableBody.children.length > 10) {
            this.tradesTableBody.removeChild(this.tradesTableBody.lastChild);
        }
    }

    updateOrderbookTable(orderbook, cachedBBO = null) {
        if (!this.orderbookTableBody) return;
        
        this.orderbookTableBody.innerHTML = '';
        
        // Convert bids and asks to maps for easier lookup by price
        const bidsMap = new Map();
        const asksMap = new Map();
        
        orderbook.bids.forEach(([price, volume]) => {
            bidsMap.set(price, volume);
        });
        
        orderbook.asks.forEach(([price, volume]) => {
            asksMap.set(price, volume);
        });
        
        const tick_size = 0.1;
        const totalRows = 10;
        
        // Use cached BBO values if provided, otherwise calculate
        let bestBid, bestAsk;
        if (cachedBBO) {
            bestBid = cachedBBO.bestBid;
            bestAsk = cachedBBO.bestAsk;
        } else {
            bestBid = orderbook.bids.length > 0 ? Math.max(...orderbook.bids.map(([price]) => price)) : null;
            bestAsk = orderbook.asks.length > 0 ? Math.min(...orderbook.asks.map(([price]) => price)) : null;
        }
        
        // Calculate the middle price for centering
        let centerPrice;
        if (bestBid && bestAsk) {
            centerPrice = (bestBid + bestAsk) / 2;
        } else if (bestBid) {
            centerPrice = bestBid;
        } else if (bestAsk) {
            centerPrice = bestAsk;
        } else {
            // No orders, use a default center price
            centerPrice = 150.0;
        }
        
        // Round center price to nearest tick
        centerPrice = Math.round(centerPrice / tick_size) * tick_size;
        
        // Generate exactly 10 price levels centered around the middle
        const displayPrices = [];
        const halfRows = Math.floor(totalRows / 2);
        
        for (let i = halfRows; i >= -halfRows + (totalRows % 2); i--) {
            const price = Math.round((centerPrice + (i * tick_size)) * 10) / 10;
            displayPrices.push(price);
        }
        
        // Sort prices in descending order (highest first)
        displayPrices.sort((a, b) => b - a);
        
        // Create rows for each price level
        displayPrices.forEach(price => {
            const row = document.createElement('tr');
            const bidVolume = bidsMap.get(price) || '';
            const askVolume = asksMap.get(price) || '';
            const isEmpty = !bidVolume && !askVolume;
            
            // Highlight the BBO levels
            const isBestBid = price === bestBid;
            const isBestAsk = price === bestAsk;
            const isBBO = isBestBid || isBestAsk;
            
            let rowClass = 'hover:bg-slate-700 transition-colors duration-150';
            if (isEmpty) {
                rowClass += ' opacity-50';
            }
            if (isBBO) {
                rowClass += ' bg-blue-900 border-l-4 border-blue-400';
            }
            
            row.className = rowClass;
            
            row.innerHTML = `
                <td class="px-4 py-2 text-sm font-medium ${isBestBid ? 'text-emerald-300 font-bold' : 'text-emerald-400'} text-left">${bidVolume}</td>
                <td class="px-4 py-2 text-sm font-bold ${isEmpty ? 'text-slate-500' : isBBO ? 'text-blue-200' : 'text-slate-200'} text-center">${price.toFixed(1)}</td>
                <td class="px-4 py-2 text-sm font-medium ${isBestAsk ? 'text-red-300 font-bold' : 'text-red-400'} text-right">${askVolume}</td>
            `;
            
            this.orderbookTableBody.appendChild(row);
        });
    }

    refreshTradesTable(recentTrades) {
        if (!this.tradesTableBody) return;
        
        this.tradesTableBody.innerHTML = '';
        
        recentTrades.forEach(trade => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-700 transition-colors duration-150';
            row.innerHTML = `
                <td class="px-4 py-3 text-sm text-slate-200">${new Date(trade.timestamp).toLocaleTimeString('en-US', {hour12: false})}</td>
                <td class="px-4 py-3 text-sm text-slate-200">AAPL</td>
                <td class="px-4 py-3 text-sm text-slate-200 text-right">${trade.volume}</td>
                <td class="px-4 py-3 text-sm font-medium text-slate-100 text-right">${trade.price}</td>
                <td class="px-4 py-3 text-sm text-emerald-400">${trade.buyer}</td>
                <td class="px-4 py-3 text-sm text-red-400">${trade.seller}</td>
            `;
            this.tradesTableBody.appendChild(row);
        });
    }

    clearTables() {
        if (this.orderbookTableBody) this.orderbookTableBody.innerHTML = '';
        if (this.tradesTableBody) this.tradesTableBody.innerHTML = '';
    }
}

// Export as ES6 module
export default TableManager;