/**
 * PNL Chart Manager Module
 * Handles D3.js chart creation, updates, and responsive behavior for PNL data
 */

class PnlChartManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.chart = null;
        this.isInitialized = false;
        this.colorScale = d3.scaleOrdinal(d3.schemeCategory10); // For different traders

        // Chart duration in milliseconds (can be changed dynamically)
        this.chartDuration = 5 * 60 * 1000; // 5 minutes
    }

    initializeChart() {
        const container = d3.select(`#${this.containerId}`);
        container.selectAll('*').remove(); // Clear any existing content

        const margin = {top: 20, right: 80, bottom: 40, left: 60};
        const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
        const height = 400 - margin.top - margin.bottom;

        const svg = container.append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Create tooltip
        const tooltip = d3.select('body').append('div')
            .attr('class', 'pnl-tooltip')
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

        // Get external legend container
        const legend = d3.select('#pnl-legend');

        this.chart = {
            svg, g, width, height, margin, tooltip, legend,
            xScale: d3.scaleTime().range([0, width]),
            yScale: d3.scaleLinear().range([height, 0]),
            line: d3.line()
                .x(d => this.chart.xScale(d.timestamp))
                .y(d => this.chart.yScale(d.pnl_value))
                .defined(d => d.pnl_value !== null && d.pnl_value !== undefined)
                .curve(d3.curveLinear)
        };

        this._createAxes(g, width, height);
        this._createAxisLabels(g, width, height, margin);
        this._createLines(g);

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
            .text('P&L Value');

        g.append('text')
            .attr('transform', `translate(${width / 2}, ${height + margin.bottom - 5})`)
            .style('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#94a3b8')
            .text('Time');
    }

    _createLines(g) {
        // Create line container
        this.chart.linesContainer = g.append('g')
            .attr('class', 'pnl-lines');
    }

    updateChart(pnlData, traders, chartDuration = null) {
        if (!this.chart || !this.isInitialized || pnlData.length === 0) return;

        if (chartDuration) {
            this.chartDuration = chartDuration;
        }

        const now = Date.now();
        const chartStartTime = now - this.chartDuration;

        // Update scales
        this.chart.xScale.domain([chartStartTime, now]);

        // Calculate P&L range for Y axis
        const allPnlValues = pnlData.map(d => d.pnl_value).filter(v => v !== null && v !== undefined);
        if (allPnlValues.length > 0) {
            const pnlExtent = d3.extent(allPnlValues);
            const padding = (pnlExtent[1] - pnlExtent[0]) * 0.1 || Math.abs(pnlExtent[0]) * 0.1 || 100;
            this.chart.yScale.domain([pnlExtent[0] - padding, pnlExtent[1] + padding]);
        } else {
            // Default range when no data
            this.chart.yScale.domain([-1000, 1000]);
        }

        this._updateAxes();
        this._updatePnlLines(pnlData, traders);
        this._updateLegend(traders);
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
            .tickFormat(d => d.toFixed(2)))
            .selectAll('text')
            .style('fill', '#94a3b8');
        this.chart.yAxis.selectAll('path, line')
            .style('stroke', '#475569');
    }

    _updatePnlLines(pnlData, traders) {
        // Group data by trader
        const traderData = {};
        traders.forEach(trader => {
            traderData[trader] = pnlData
                .filter(d => d.trader === trader)
                .sort((a, b) => a.timestamp - b.timestamp);
        });

        // Update lines for each trader
        const lines = this.chart.linesContainer.selectAll('.pnl-line')
            .data(traders, d => d);

        lines.exit().remove();

        lines.enter().append('path')
            .attr('class', 'pnl-line')
            .style('fill', 'none')
            .style('stroke-width', 2)
            .style('cursor', 'pointer')
            .on('mouseover', (event, trader) => this._showTooltip(event, trader, traderData[trader]))
            .on('mouseout', () => this._hideTooltip())
            .merge(lines)
            .style('stroke', d => this.colorScale(d))
            .attr('d', d => {
                const data = traderData[d];
                if (!data || data.length === 0) return null;
                return this.chart.line(data);
            });
    }

    _updateLegend(traders) {
        // Clear existing legend items
        this.chart.legend.selectAll('.legend-item').remove();

        // Create new legend items
        const legendItems = this.chart.legend.selectAll('.legend-item')
            .data(traders, d => d)
            .enter().append('div')
            .attr('class', 'legend-item')
            .style('display', 'inline-flex')
            .style('align-items', 'center')
            .style('background', 'rgba(51, 65, 85, 0.8)')
            .style('padding', '8px 12px')
            .style('border-radius', '6px')
            .style('border', '1px solid #475569')
            .style('font-size', '14px')
            .style('cursor', 'pointer')
            .style('transition', 'all 0.2s ease')
            .on('mouseover', function() {
                d3.select(this)
                    .style('background', 'rgba(71, 85, 105, 0.9)')
                    .style('border-color', '#64748b');
            })
            .on('mouseout', function() {
                d3.select(this)
                    .style('background', 'rgba(51, 65, 85, 0.8)')
                    .style('border-color', '#475569');
            });

        // Add color indicator
        legendItems.append('div')
            .style('width', '12px')
            .style('height', '12px')
            .style('border-radius', '50%')
            .style('margin-right', '8px')
            .style('border', '2px solid rgba(255, 255, 255, 0.3)')
            .style('background-color', d => this.colorScale(d));

        // Add trader name
        legendItems.append('span')
            .style('color', '#e2e8f0')
            .style('font-weight', '500')
            .text(d => d);
    }

    _showTooltip(event, trader, data) {
        if (!data || data.length === 0) return;

        const latestData = data[data.length - 1];
        this.chart.tooltip.transition()
            .duration(200)
            .style('opacity', .9);
        this.chart.tooltip.html(`
            <div><strong>${trader}</strong></div>
            <div>Latest P&L: $${latestData.pnl_value.toFixed(2)}</div>
            <div>Time: ${new Date(latestData.timestamp).toLocaleTimeString()}</div>
            <div>Data points: ${data.length}</div>
        `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
    }

    _hideTooltip() {
        this.chart.tooltip.transition()
            .duration(500)
            .style('opacity', 0);
    }

    // Set chart duration
    setChartDuration(minutes) {
        this.chartDuration = minutes * 60 * 1000;
    }

    // Clean up resources
    destroy() {
        if (this.chart && this.chart.tooltip) {
            this.chart.tooltip.remove();
        }
        // Clear legend content but don't remove the container
        if (this.chart && this.chart.legend) {
            this.chart.legend.selectAll('.legend-item').remove();
        }
        this.isInitialized = false;
    }
}

// Export as ES6 module
export default PnlChartManager;