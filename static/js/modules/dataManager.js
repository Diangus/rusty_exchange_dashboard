/**
 * Data Manager Module
 * Handles market data storage, processing, and cleanup
 */

class DataManager {
    constructor() {
        this.messageCount = 0;
        this.orderbookCount = 0;
        this.tradeCount = 0;
        this.lastPrice = null;
        this.lastOrderbookData = null;
        
        // Cache BBO calculations to avoid duplicates
        this.cachedBBO = {
            bestBid: null,
            bestAsk: null,
            orderbook: null  // Reference to track if orderbook changed
        };
        
        // Cache statistics object to avoid creating new objects
        this.cachedStatistics = null;
        this.statisticsLastUpdated = 0;
        
        // Track price ranges for chart optimization
        this.priceRange = {
            min: null,
            max: null,
            lastUpdated: 0
        };
        
        // Data storage for chart (last 5 minutes)
        this.chartData = {
            bbo: [], // [{timestamp, bestBid, bestAsk}]
            trades: [] // [{timestamp, price, volume, buyer, seller, buyerOrderId, sellerOrderId}]
        };
        
        this.CHART_DURATION = 1 * 60 * 1000; // 1 minute in milliseconds
        this.last_n_trades_to_show = 10;
    }

    // Clean old data (keep only last 5 minutes)
    cleanOldData() {
        const cutoff = Date.now() - this.CHART_DURATION;
        this.chartData.bbo = this.chartData.bbo.filter(d => d.timestamp > cutoff);
        this.chartData.trades = this.chartData.trades.filter(d => d.timestamp > cutoff);
        
        // Reset price range cache when data is cleaned
        this.priceRange.lastUpdated = 0;
    }

    // Calculate and cache BBO values
    calculateBBO(orderbook) {
        // Only recalculate if orderbook reference changed
        if (this.cachedBBO.orderbook !== orderbook) {
            // Handle the case where orderbook might be null/undefined
            if (!orderbook) {
                this.cachedBBO.bestBid = null;
                this.cachedBBO.bestAsk = null;
            } else {
                // bids and asks are arrays of Order objects with price property
                // Handle each side independently - one side can be empty while the other has data
                this.cachedBBO.bestBid = null;
                if (orderbook.bids && Array.isArray(orderbook.bids) && orderbook.bids.length > 0) {
                    const bidPrices = orderbook.bids.map(order => order.price).filter(price => typeof price === 'number' && !isNaN(price));
                    if (bidPrices.length > 0) {
                        this.cachedBBO.bestBid = Math.max(...bidPrices);
                    }
                }

                this.cachedBBO.bestAsk = null;
                if (orderbook.asks && Array.isArray(orderbook.asks) && orderbook.asks.length > 0) {
                    const askPrices = orderbook.asks.map(order => order.price).filter(price => typeof price === 'number' && !isNaN(price));
                    if (askPrices.length > 0) {
                        this.cachedBBO.bestAsk = Math.min(...askPrices);
                    }
                }
            }
            this.cachedBBO.orderbook = orderbook;
        }

        return {
            bestBid: this.cachedBBO.bestBid,
            bestAsk: this.cachedBBO.bestAsk
        };
    }

    // Add BBO data point
    addBBOData(orderbook) {
        try {
            const timestamp = Date.now();
            const bbo = this.calculateBBO(orderbook);

            this.chartData.bbo.push({
                timestamp,
                bestBid: bbo.bestBid,
                bestAsk: bbo.bestAsk,
                real: true,
            });

            // Update price range incrementally
            this._updatePriceRange(bbo.bestBid, bbo.bestAsk);

            this.cleanOldData();
        } catch (error) {
            console.error('Error in addBBOData:', error, orderbook);
        }
    }

    // Add trade data point
    addTradeData(trade) {
        try {
            const timestamp = Date.now();
            this.chartData.trades.push({
                timestamp,
                price: trade.price,
                volume: trade.volume,
                buyer: trade.buyer,
                seller: trade.seller,
                buyerOrderId: trade.buyer_order_id,
                sellerOrderId: trade.seller_order_id
            });

            // Update price range incrementally
            this._updatePriceRange(trade.price);

            this.cleanOldData();
        } catch (error) {
            console.error('Error in addTradeData:', error, trade);
        }
    }

    // Process orderbook update
    processOrderbookUpdate(data) {
        try {
            if (!data || typeof data !== 'object') {
                console.warn('processOrderbookUpdate: Invalid orderbook data');
                return;
            }
            this.orderbookCount++;
            this.lastOrderbookData = data;
            this.addBBOData(data);
        } catch (error) {
            console.error('Error in processOrderbookUpdate:', error, data);
        }
    }

    // Process trade update
    processTradeUpdate(data) {
        try {
            if (!data || typeof data !== 'object') {
                console.warn('processTradeUpdate: Invalid trade data');
                return;
            }
            this.tradeCount++;
            this.lastPrice = data.price;
            this.addTradeData(data);
        } catch (error) {
            console.error('Error in processTradeUpdate:', error, data);
        }
    }

    // Process message
    processMessage(message) {
        this.messageCount++;

        try {
            if (!message || typeof message !== 'object') {
                console.warn('processMessage: Invalid message format');
                return null;
            }

            if (message.type === 'orderbook_update') {
                this.processOrderbookUpdate(message.data);
                return 'orderbook';
            } else if (message.type === 'trade') {
                this.processTradeUpdate(message.data);
                return 'trade';
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
            this.cachedStatistics = {
                messageCount: this.messageCount,
                orderbookCount: this.orderbookCount,
                tradeCount: this.tradeCount,
                lastPrice: this.lastPrice
            };
            this.statisticsLastUpdated = this.messageCount;
        }
        return this.cachedStatistics;
    }

    getChartData() {
        if (this.chartData.bbo.length === 0) {
            return this.chartData;
        }
        let lastBBO = this.chartData.bbo[this.chartData.bbo.length - 1];
        if (!lastBBO.real) {
            // Don't want to generate lots of copy of data in the chart data, so just update the timestamp
            this.chartData.bbo[this.chartData.bbo.length - 1].timestamp = Date.now();
            return this.chartData;
        }
        // Add a copy of the last BBO with the timestamp of now
        this.chartData.bbo.push({
            timestamp: Date.now(),
            bestBid: lastBBO.bestBid,
            bestAsk: lastBBO.bestAsk,
            real: false
        });
        return this.chartData;
    }

    // Get latest orderbook data
    getLatestOrderbookData() {
        return this.lastOrderbookData;
    }

    // Get recent trades for table
    getRecentTrades() {
        return this.chartData.trades.slice(-this.last_n_trades_to_show).reverse();
    }

    // Get cached BBO values for current orderbook
    getCachedBBO() {
        return {
            bestBid: this.cachedBBO.bestBid,
            bestAsk: this.cachedBBO.bestAsk
        };
    }

    // Update price range incrementally (private method)
    _updatePriceRange(...prices) {
        if (!Array.isArray(prices)) {
            console.warn('_updatePriceRange: prices argument is not an array');
            return;
        }

        for (const price of prices) {
            if (price !== null && price !== undefined && typeof price === 'number' && !isNaN(price)) {
                if (this.priceRange.min === null || price < this.priceRange.min) {
                    this.priceRange.min = price;
                }
                if (this.priceRange.max === null || price > this.priceRange.max) {
                    this.priceRange.max = price;
                }
            }
        }
        this.priceRange.lastUpdated = this.messageCount;
    }

    // Get cached price range for chart (avoids expensive iteration)
    getCachedPriceRange() {
        // If no data or cache is stale, recalculate
        if (this.priceRange.min === null || this.priceRange.lastUpdated === 0) {
            this._recalculatePriceRange();
        }
        
        return {
            min: this.priceRange.min,
            max: this.priceRange.max
        };
    }

    // Recalculate price range from scratch (fallback when needed)
    _recalculatePriceRange() {
        this.priceRange.min = null;
        this.priceRange.max = null;

        // Calculate from current data
        const allPrices = [];
        this.chartData.bbo.forEach(d => {
            if (d.bestBid && typeof d.bestBid === 'number' && !isNaN(d.bestBid)) allPrices.push(d.bestBid);
            if (d.bestAsk && typeof d.bestAsk === 'number' && !isNaN(d.bestAsk)) allPrices.push(d.bestAsk);
        });
        this.chartData.trades.forEach(d => {
            if (d.price && typeof d.price === 'number' && !isNaN(d.price)) allPrices.push(d.price);
        });

        if (allPrices.length > 0) {
            this.priceRange.min = Math.min(...allPrices);
            this.priceRange.max = Math.max(...allPrices);
        }

        this.priceRange.lastUpdated = this.messageCount;
    }
}

// Export as ES6 module
export default DataManager;