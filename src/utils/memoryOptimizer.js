const v8 = require('v8');
const { getLogger } = require('./logger');

/**
 * Memory Optimizer
 * Monitors and optimizes memory usage for long-running operations
 * Prevents memory leaks and manages garbage collection
 */
class MemoryOptimizer {
  constructor(config = {}) {
    this.config = {
      maxHeapUsed: config.maxHeapUsed || 1024 * 1024 * 1024, // 1GB default
      gcInterval: config.gcInterval || 300000, // 5 minutes
      warningThreshold: config.warningThreshold || 0.8, // 80% of max
      criticalThreshold: config.criticalThreshold || 0.9, // 90% of max
      autoGC: config.autoGC !== false,
      ...config
    };
    
    this.logger = getLogger();
    this.metrics = {
      gcCount: 0,
      leakDetections: 0,
      optimizations: 0
    };
    
    this.memorySnapshots = [];
    this.objectTracking = new Map();
    this.intervals = [];
    
    this.startMonitoring();
  }

  /**
   * Start memory monitoring
   */
  startMonitoring() {
    // Periodic memory check
    const memoryCheckInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 30000); // Every 30 seconds
    
    this.intervals.push(memoryCheckInterval);
    
    // Periodic GC if enabled
    if (this.config.autoGC) {
      const gcInterval = setInterval(() => {
        this.performGarbageCollection();
      }, this.config.gcInterval);
      
      this.intervals.push(gcInterval);
    }
    
    // Leak detection
    const leakCheckInterval = setInterval(() => {
      this.detectMemoryLeaks();
    }, 60000); // Every minute
    
    this.intervals.push(leakCheckInterval);
    
    this.logger.info('Memory optimizer started', {
      maxHeap: `${(this.config.maxHeapUsed / 1024 / 1024).toFixed(2)}MB`,
      autoGC: this.config.autoGC
    });
  }

  /**
   * Check current memory usage
   */
  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const rssMB = usage.rss / 1024 / 1024;
    
    // Store snapshot
    const snapshot = {
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      rss: usage.rss,
      external: usage.external
    };
    
    this.memorySnapshots.push(snapshot);
    
    // Keep only last 100 snapshots
    if (this.memorySnapshots.length > 100) {
      this.memorySnapshots.shift();
    }
    
    // Check thresholds
    const usageRatio = usage.heapUsed / this.config.maxHeapUsed;
    
    if (usageRatio > this.config.criticalThreshold) {
      this.logger.error('Critical memory usage', {
        heapUsed: `${heapUsedMB.toFixed(2)}MB`,
        threshold: `${(this.config.criticalThreshold * 100).toFixed(0)}%`
      });
      
      // Emergency GC
      this.performGarbageCollection(true);
      
      // Clear caches
      this.clearCaches();
    } else if (usageRatio > this.config.warningThreshold) {
      this.logger.warn('High memory usage', {
        heapUsed: `${heapUsedMB.toFixed(2)}MB`,
        heapTotal: `${heapTotalMB.toFixed(2)}MB`,
        rss: `${rssMB.toFixed(2)}MB`
      });
    }
    
    return snapshot;
  }

  /**
   * Perform garbage collection
   * @param {boolean} force - Force immediate GC
   */
  performGarbageCollection(force = false) {
    if (!global.gc) {
      this.logger.debug('GC not exposed. Run with --expose-gc flag');
      return;
    }
    
    const before = process.memoryUsage();
    
    if (force) {
      global.gc(true); // Force full GC
    } else {
      global.gc(); // Regular GC
    }
    
    const after = process.memoryUsage();
    const freed = (before.heapUsed - after.heapUsed) / 1024 / 1024;
    
    this.metrics.gcCount++;
    
    this.logger.debug('Garbage collection performed', {
      freed: `${freed.toFixed(2)}MB`,
      forced: force,
      totalGCs: this.metrics.gcCount
    });
  }

  /**
   * Detect potential memory leaks
   */
  detectMemoryLeaks() {
    if (this.memorySnapshots.length < 10) return;
    
    // Analyze growth trend
    const recentSnapshots = this.memorySnapshots.slice(-10);
    const growthRate = this.calculateGrowthRate(recentSnapshots);
    
    if (growthRate > 0.1) { // 10% growth consistently
      this.metrics.leakDetections++;
      
      this.logger.warn('Potential memory leak detected', {
        growthRate: `${(growthRate * 100).toFixed(2)}%`,
        detections: this.metrics.leakDetections
      });
      
      // Get heap snapshot for analysis
      this.captureHeapSnapshot();
    }
  }

  /**
   * Calculate memory growth rate
   */
  calculateGrowthRate(snapshots) {
    if (snapshots.length < 2) return 0;
    
    const first = snapshots[0].heapUsed;
    const last = snapshots[snapshots.length - 1].heapUsed;
    
    return (last - first) / first;
  }

  /**
   * Capture heap snapshot for analysis
   */
  captureHeapSnapshot() {
    try {
      const snapshot = v8.getHeapSnapshot();
      const chunks = [];
      
      snapshot.on('data', chunk => chunks.push(chunk));
      snapshot.on('end', () => {
        const heapData = chunks.join('');
        
        // Analyze heap snapshot
        const analysis = this.analyzeHeapSnapshot(heapData);
        
        this.logger.info('Heap snapshot captured', {
          size: `${(heapData.length / 1024).toFixed(2)}KB`,
          ...analysis
        });
      });
    } catch (error) {
      this.logger.error('Failed to capture heap snapshot', { error: error.message });
    }
  }

  /**
   * Analyze heap snapshot data
   */
  analyzeHeapSnapshot(heapData) {
    try {
      const snapshot = JSON.parse(heapData);
      
      // Basic analysis (would need more sophisticated parsing in production)
      const analysis = {
        nodeCount: snapshot.nodes?.length || 0,
        edgeCount: snapshot.edges?.length || 0,
        totalSize: 0
      };
      
      // This is simplified - real analysis would be more complex
      return analysis;
    } catch {
      return { error: 'Failed to parse snapshot' };
    }
  }

  /**
   * Clear various caches to free memory
   */
  clearCaches() {
    this.metrics.optimizations++;
    
    // Clear require cache for non-core modules
    Object.keys(require.cache).forEach(key => {
      if (!key.includes('node_modules') && !key.includes('core')) {
        delete require.cache[key];
      }
    });
    
    // Clear tracked objects
    this.objectTracking.clear();
    
    // Trim memory snapshots
    this.memorySnapshots = this.memorySnapshots.slice(-20);
    
    this.logger.info('Caches cleared', {
      optimizations: this.metrics.optimizations
    });
  }

  /**
   * Track object for memory leak detection
   * @param {string} id - Object identifier
   * @param {Object} obj - Object to track
   */
  trackObject(id, obj) {
    this.objectTracking.set(id, {
      object: new WeakRef(obj),
      created: Date.now(),
      size: this.estimateObjectSize(obj)
    });
  }

  /**
   * Check tracked objects for leaks
   */
  checkTrackedObjects() {
    const now = Date.now();
    const leaked = [];
    
    for (const [id, tracking] of this.objectTracking.entries()) {
      const obj = tracking.object.deref();
      
      if (!obj) {
        // Object was garbage collected - good
        this.objectTracking.delete(id);
      } else if (now - tracking.created > 600000) { // 10 minutes old
        leaked.push({
          id,
          age: now - tracking.created,
          size: tracking.size
        });
      }
    }
    
    if (leaked.length > 0) {
      this.logger.warn('Long-lived objects detected', {
        count: leaked.length,
        objects: leaked.slice(0, 5) // Show first 5
      });
    }
  }

  /**
   * Estimate object size in bytes
   */
  estimateObjectSize(obj) {
    const seen = new WeakSet();
    
    function sizeOf(obj) {
      if (obj === null || obj === undefined) return 0;
      if (typeof obj === 'boolean') return 4;
      if (typeof obj === 'number') return 8;
      if (typeof obj === 'string') return obj.length * 2;
      
      if (seen.has(obj)) return 0;
      seen.add(obj);
      
      if (Array.isArray(obj)) {
        return obj.reduce((acc, item) => acc + sizeOf(item), 0);
      }
      
      if (typeof obj === 'object') {
        return Object.keys(obj).reduce((acc, key) => {
          return acc + sizeOf(key) + sizeOf(obj[key]);
        }, 0);
      }
      
      return 0;
    }
    
    return sizeOf(obj);
  }

  /**
   * Optimize for long-running operation
   */
  optimizeForLongRunning() {
    // Adjust V8 heap settings
    if (v8.setFlagsFromString) {
      v8.setFlagsFromString('--max-old-space-size=2048'); // 2GB max heap
      v8.setFlagsFromString('--optimize-for-size'); // Optimize for memory
    }
    
    // Enable heap profiling
    if (v8.writeHeapSnapshot) {
      const snapshotPath = `heap-${Date.now()}.heapsnapshot`;
      v8.writeHeapSnapshot(snapshotPath);
      this.logger.info(`Heap snapshot written to ${snapshotPath}`);
    }
    
    this.logger.info('Optimized for long-running operation');
  }

  /**
   * Get memory statistics
   */
  getStatistics() {
    const current = process.memoryUsage();
    const stats = {
      current: {
        heapUsed: `${(current.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(current.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        rss: `${(current.rss / 1024 / 1024).toFixed(2)}MB`
      },
      metrics: this.metrics,
      tracking: {
        objects: this.objectTracking.size,
        snapshots: this.memorySnapshots.length
      }
    };
    
    // Calculate average memory over time
    if (this.memorySnapshots.length > 0) {
      const avgHeap = this.memorySnapshots.reduce((acc, s) => acc + s.heapUsed, 0) / 
                      this.memorySnapshots.length;
      stats.average = {
        heapUsed: `${(avgHeap / 1024 / 1024).toFixed(2)}MB`
      };
    }
    
    return stats;
  }

  /**
   * Stop monitoring
   */
  stop() {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    
    this.logger.info('Memory optimizer stopped');
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create memory optimizer instance
 * @param {Object} config - Configuration
 * @returns {MemoryOptimizer} Instance
 */
function getMemoryOptimizer(config) {
  if (!instance) {
    instance = new MemoryOptimizer(config);
  }
  return instance;
}

module.exports = { MemoryOptimizer, getMemoryOptimizer };
