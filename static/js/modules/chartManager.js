/**
 * Chart Manager Module
 * Handles D3.js chart creation, updates, and responsive behavior
 */

class ChartManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.chart = null;
        this.isInitialized = false;
    }

    initializeChart() {
        const container = d3.select(`#${this.containerId}`);
        container.selectAll('*').remove(); // Clear any existing content

        const margin = {top: 20, right: 50, bottom: 40, left: 50};
        const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
        const height = 400 - margin.top - margin.bottom;

        const svg = container.append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Create tooltip
        const tooltip = d3.select('body').append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0)
            .style('position', 'absolute')
            .style('background', 'rgba(30, 41, 59, 0.95)')
            .style('color', '#e2e8f0')
            .style('padding', '8px')
            .style('border-radius', '6px')
            .style('border', '1px solid #475569')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('z-index', '1000')
            .style('box-shadow', '0 4px 12px rgba(0, 0, 0, 0.3)');

        this.chart = {
            svg, g, width, height, margin, tooltip,
            xScale: d3.scaleTime().range([0, width]),
            yScale: d3.scaleLinear().range([height, 0]),
            line: d3.line()
                .x(d => this.chart.xScale(d.timestamp))
                .y(d => this.chart.yScale(d.price))
                .defined(d => d.price !== null && d.price !== undefined)
                .curve(d3.curveStepAfter)
        };

        this._createAxes(g, width, height);
        this._createAxisLabels(g, width, height, margin);
        this._createLines(g);
        this._createTradesContainer(g);

        this.isInitialized = true;
    }

    _createAxes(g, width, height) {
        // Add axes
        this.chart.xAxis = g.append('g')
            .attr('transform', `translate(0,${height})`)
            .attr('class', 'x-axis');
        
        this.chart.yAxis = g.append('g')
            .attr('class', 'y-axis');
    }

    _createAxisLabels(g, width, height, margin) {
        // Add axis labels
        g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', 0 - margin.left)
            .attr('x', 0 - (height / 2))
            .attr('dy', '1em')
            .style('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#94a3b8')
            .text('Price');
        
        g.append('text')
            .attr('transform', `translate(${width / 2}, ${height + margin.bottom - 5})`)
            .style('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#94a3b8')
            .text('Time');
    }

    _createLines(g) {
        // Create line containers
        this.chart.bidLine = g.append('path')
            .attr('class', 'bid-line')
            .style('fill', 'none')
            .style('stroke', '#34d399')
            .style('stroke-width', 2);

        this.chart.askLine = g.append('path')
            .attr('class', 'ask-line')
            .style('fill', 'none')
            .style('stroke', '#f87171')
            .style('stroke-width', 2);
    }

    _createTradesContainer(g) {
        // Create trade dots container
        this.chart.tradesContainer = g.append('g')
            .attr('class', 'trades');
    }

    updateChart(chartData, cachedPriceRange = null) {
        if (!this.chart || !this.isInitialized || chartData.bbo.length === 0) return;

        const now = Date.now();
        const fiveMinutesAgo = now - (5 * 60 * 1000);

        // Update scales
        this.chart.xScale.domain([fiveMinutesAgo, now]);

        // Handle price range - if no data, use a default range
        let hasValidPriceRange = false;
        if (cachedPriceRange && cachedPriceRange.min !== null && cachedPriceRange.max !== null) {
            const padding = (cachedPriceRange.max - cachedPriceRange.min) * 0.1 || 1;
            this.chart.yScale.domain([cachedPriceRange.min - padding, cachedPriceRange.max + padding]);
            hasValidPriceRange = true;
        } else {
            // Fallback to calculating price range (expensive)
            const allPrices = [];
            chartData.bbo.forEach(d => {
                if (d.bestBid && typeof d.bestBid === 'number' && !isNaN(d.bestBid)) allPrices.push(d.bestBid);
                if (d.bestAsk && typeof d.bestAsk === 'number' && !isNaN(d.bestAsk)) allPrices.push(d.bestAsk);
            });
            chartData.trades.forEach(d => allPrices.push(d.price));

            if (allPrices.length > 0) {
                const priceExtent = d3.extent(allPrices);
                const padding = (priceExtent[1] - priceExtent[0]) * 0.1 || 1;
                this.chart.yScale.domain([priceExtent[0] - padding, priceExtent[1] + padding]);
                hasValidPriceRange = true;
            }
        }

        // If no valid price range and no data, set a default range
        if (!hasValidPriceRange && chartData.bbo.length === 0 && chartData.trades.length === 0) {
            // Set a default price range when there's no data (after reset)
            this.chart.yScale.domain([100, 200]); // Default range
            console.log('📊 Using default price range for empty chart');
        }

        this._updateAxes();
        this._updateBBOLines(chartData);
        this._updateTradeDots(chartData);
    }

    _updateAxes() {
        // Update axes
        this.chart.xAxis.call(d3.axisBottom(this.chart.xScale)
            .tickFormat(d3.timeFormat('%H:%M:%S')))
            .selectAll('text')
            .style('fill', '#94a3b8');
        this.chart.xAxis.selectAll('path, line')
            .style('stroke', '#475569');
            
        this.chart.yAxis.call(d3.axisLeft(this.chart.yScale)
            .tickFormat(d => d.toFixed(1)))
            .selectAll('text')
            .style('fill', '#94a3b8');
        this.chart.yAxis.selectAll('path, line')
            .style('stroke', '#475569');
    }

    _updateBBOLines(chartData) {
        // Update BBO lines with proper handling of empty sides
        const bidSegments = this._processBBOData(chartData.bbo, 'bestBid');
        const askSegments = this._processBBOData(chartData.bbo, 'bestAsk');
        
        // Update bid line segments
        this._updateLineSegments(bidSegments, 'bid-line-segment', this.chart.g, '#34d399');

        // Update ask line segments
        this._updateLineSegments(askSegments, 'ask-line-segment', this.chart.g, '#f87171');
        
        // Hide the original single lines since we're now using segments
        this.chart.bidLine.style('opacity', 0);
        this.chart.askLine.style('opacity', 0);
    }

    _updateLineSegments(dataSegments, className, container, color) {
        // Update line segments for non-continuous data
        const segments = container.selectAll(`.${className}`)
            .data(dataSegments, (d, i) => i);

        segments.exit().remove();

        segments.enter().append('path')
            .attr('class', className)
            .style('fill', 'none')
            .style('stroke', color)
            .style('stroke-width', 2)
            .merge(segments)
            .attr('d', d => {
                if (d.length === 0) return null;
                return this.chart.line(d);
            });
    }

    _processBBOData(bboData, priceField) {
        const dataSegments = [];
        let currentSegment = [];
        let inGap = false;
        
        bboData.forEach((d, index) => {
            const currentPrice = d[priceField];
            
            if (currentPrice !== null) {
                // Valid price point
                const dataPoint = {
                    timestamp: d.timestamp,
                    price: currentPrice,
                    isValid: true
                };
                
                // If we were in a gap, start a new segment
                if (inGap && currentSegment.length > 0) {
                    dataSegments.push([...currentSegment]);
                    currentSegment = [];
                    inGap = false;
                }
                
                currentSegment.push(dataPoint);
                
            } else {
                // Missing price - this is a gap
                // If we have data in current segment, save it and mark gap
                if (currentSegment.length > 0) {
                    dataSegments.push([...currentSegment]);
                    currentSegment = [];
                }
                inGap = true;
            }
        });
        
        // Add final segment if it has data
        if (currentSegment.length > 0) {
            dataSegments.push(currentSegment);
        }
        
        return dataSegments;
    }

    _updateTradeDots(chartData) {
        // Update trade dots
        const trades = this.chart.tradesContainer.selectAll('.trade-dot')
            .data(chartData.trades, d => d.timestamp);
        
        trades.exit().remove();
        
        trades.enter().append('circle')
            .attr('class', 'trade-dot')
            .attr('r', 4)
            .style('fill', '#fbbf24')
            .style('stroke', '#f59e0b')
            .style('stroke-width', 2)
            .style('cursor', 'pointer')
            .on('mouseover', (event, d) => this._showTooltip(event, d))
            .on('mouseout', () => this._hideTooltip())
            .merge(trades)
            .attr('cx', d => this.chart.xScale(d.timestamp))
            .attr('cy', d => this.chart.yScale(d.price));
    }

    _showTooltip(event, d) {
        this.chart.tooltip.transition()
            .duration(200)
            .style('opacity', .9);
        this.chart.tooltip.html(`
            <div><strong>Trade Details</strong></div>
            <div>Price: $${d.price.toFixed(2)}</div>
            <div>Volume: ${d.volume}</div>
            <div>Buyer: ${d.buyer}</div>
            <div>Seller: ${d.seller}</div>
            <div>Buyer Order: ${d.buyerOrderId}</div>
            <div>Seller Order: ${d.sellerOrderId}</div>
            <div>Time: ${new Date(d.timestamp).toLocaleTimeString()}</div>
        `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
    }

    _hideTooltip() {
        this.chart.tooltip.transition()
            .duration(500)
            .style('opacity', 0);
    }

    // Clean up resources
    destroy() {
        if (this.chart && this.chart.tooltip) {
            this.chart.tooltip.remove();
        }

        // Clean up line segments
        if (this.chart && this.chart.g) {
            this.chart.g.selectAll('.bid-line-segment').remove();
            this.chart.g.selectAll('.ask-line-segment').remove();
        }

        this.isInitialized = false;
    }
}

// Export as ES6 module
export default ChartManager;