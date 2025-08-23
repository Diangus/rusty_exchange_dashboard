/**
 * UI Manager Module
 * Handles user interface controls, statistics display, and pause functionality
 */

class UIManager {
    constructor() {
        this.isPaused = false;
        this.pauseCallbacks = [];
        this.resumeCallbacks = [];
    }

    initialize() {
        this.setupPauseButton();
    }

    setupPauseButton() {
        const pauseButton = document.getElementById('pauseButton');
        if (pauseButton) {
            pauseButton.addEventListener('click', () => this.togglePause());
        }
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        const pauseButton = document.getElementById('pauseButton');
        const pauseIcon = document.getElementById('pauseIcon');
        const playIcon = document.getElementById('playIcon');
        const pauseText = document.getElementById('pauseText');
        
        if (this.isPaused) {
            // Switch to paused state
            pauseIcon.classList.add('hidden');
            playIcon.classList.remove('hidden');
            pauseText.textContent = 'Resume';
            pauseButton.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            pauseButton.classList.add('bg-green-600', 'hover:bg-green-700');
            
            // Trigger pause callbacks
            this.pauseCallbacks.forEach(callback => callback());
        } else {
            // Switch to running state
            pauseIcon.classList.remove('hidden');
            playIcon.classList.add('hidden');
            pauseText.textContent = 'Pause';
            pauseButton.classList.remove('bg-green-600', 'hover:bg-green-700');
            pauseButton.classList.add('bg-blue-600', 'hover:bg-blue-700');
            
            // Trigger resume callbacks
            this.resumeCallbacks.forEach(callback => callback());
        }
    }

    updateStatistics(stats) {
        document.getElementById('msgCount').textContent = stats.messageCount;
        document.getElementById('orderbookCount').textContent = stats.orderbookCount;
        document.getElementById('tradeCount').textContent = stats.tradeCount;
        document.getElementById('lastPrice').textContent = stats.lastPrice || '-';
    }

    // Register callbacks for pause/resume events
    onPause(callback) {
        this.pauseCallbacks.push(callback);
    }

    onResume(callback) {
        this.resumeCallbacks.push(callback);
    }

    // Get current pause state
    getPauseState() {
        return this.isPaused;
    }

    // Force update pause state (useful for initialization)
    setPauseState(paused) {
        if (this.isPaused !== paused) {
            this.togglePause();
        }
    }

    // Show notification (could be expanded for different types)
    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        // Could be extended to show toast notifications
    }

    // Get element by ID with error handling
    getElement(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`Element with ID '${id}' not found`);
        }
        return element;
    }
}

// Export as ES6 module
export default UIManager;