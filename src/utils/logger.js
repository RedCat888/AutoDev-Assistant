const fs = require('fs');
const path = require('path');
const util = require('util');

/**
 * Enhanced Logger with file rotation and structured logging
 * Supports multiple log levels and performance monitoring
 */
class Logger {
  constructor(config = {}) {
    this.config = {
      logDir: config.logDir || path.join(process.cwd(), 'logs'),
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
      maxFiles: config.maxFiles || 5,
      logLevel: config.logLevel || 'info',
      consoleOutput: config.consoleOutput !== false,
      fileOutput: config.fileOutput !== false,
      ...config
    };
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };
    
    this.currentLevel = this.levels[this.config.logLevel] || 2;
    this.logBuffer = [];
    this.performanceMetrics = new Map();
    
    // Ensure log directory exists
    if (this.config.fileOutput) {
      fs.mkdirSync(this.config.logDir, { recursive: true });
      this.currentLogFile = this.getLogFilePath();
      this.setupRotation();
    }
  }

  /**
   * Log a message at specified level
   * @param {string} level - Log level
   * @param {string} message - Message to log
   * @param {Object} metadata - Additional metadata
   */
  log(level, message, metadata = {}) {
    if (this.levels[level] === undefined || this.levels[level] > this.currentLevel) {
      return;
    }
    
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
      pid: process.pid,
      memory: process.memoryUsage()
    };
    
    // Format for console
    if (this.config.consoleOutput) {
      this.consoleLog(entry);
    }
    
    // Write to file
    if (this.config.fileOutput) {
      this.fileLog(entry);
    }
    
    // Buffer for analysis
    this.logBuffer.push(entry);
    if (this.logBuffer.length > 1000) {
      this.logBuffer.shift();
    }
  }

  /**
   * Console logging with colors
   */
  consoleLog(entry) {
    const colors = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m',  // Yellow
      info: '\x1b[36m',  // Cyan
      debug: '\x1b[90m', // Gray
      trace: '\x1b[37m', // White
      reset: '\x1b[0m'
    };
    
    const color = colors[entry.level] || colors.reset;
    const prefix = `${color}[${entry.timestamp}] [${entry.level.toUpperCase()}]${colors.reset}`;
    
    console.log(`${prefix} ${entry.message}`);
    
    if (Object.keys(entry.metadata).length > 0) {
      console.log(`${color}  Metadata:${colors.reset}`, util.inspect(entry.metadata, { depth: 3, colors: true }));
    }
  }

  /**
   * File logging with rotation
   */
  fileLog(entry) {
    try {
      const line = JSON.stringify(entry) + '\n';
      
      // Check if rotation needed
      if (this.shouldRotate()) {
        this.rotateLog();
      }
      
      fs.appendFileSync(this.currentLogFile, line);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Check if log rotation is needed
   */
  shouldRotate() {
    try {
      const stats = fs.statSync(this.currentLogFile);
      return stats.size >= this.config.maxFileSize;
    } catch {
      return false;
    }
  }

  /**
   * Rotate log files
   */
  rotateLog() {
    // Rename current log to timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedPath = path.join(
      this.config.logDir,
      `app-${timestamp}.log`
    );
    
    try {
      fs.renameSync(this.currentLogFile, rotatedPath);
      this.currentLogFile = this.getLogFilePath();
      
      // Clean up old logs
      this.cleanupOldLogs();
    } catch (error) {
      console.error('Log rotation failed:', error);
    }
  }

  /**
   * Clean up old log files
   */
  cleanupOldLogs() {
    try {
      const files = fs.readdirSync(this.config.logDir)
        .filter(f => f.startsWith('app-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.config.logDir, f),
          time: fs.statSync(path.join(this.config.logDir, f)).mtime
        }))
        .sort((a, b) => b.time - a.time);
      
      // Keep only maxFiles
      if (files.length > this.config.maxFiles) {
        files.slice(this.config.maxFiles).forEach(file => {
          fs.unlinkSync(file.path);
          this.debug(`Deleted old log file: ${file.name}`);
        });
      }
    } catch (error) {
      console.error('Log cleanup failed:', error);
    }
  }

  /**
   * Get current log file path
   */
  getLogFilePath() {
    return path.join(this.config.logDir, 'app.log');
  }

  /**
   * Setup periodic rotation check
   */
  setupRotation() {
    setInterval(() => {
      if (this.shouldRotate()) {
        this.rotateLog();
      }
    }, 60000); // Check every minute
  }

  // Convenience methods
  error(message, metadata) {
    this.log('error', message, metadata);
  }

  warn(message, metadata) {
    this.log('warn', message, metadata);
  }

  info(message, metadata) {
    this.log('info', message, metadata);
  }

  debug(message, metadata) {
    this.log('debug', message, metadata);
  }

  trace(message, metadata) {
    this.log('trace', message, metadata);
  }

  /**
   * Start performance measurement
   * @param {string} label - Performance label
   */
  startTimer(label) {
    this.performanceMetrics.set(label, {
      start: process.hrtime.bigint(),
      memory: process.memoryUsage()
    });
  }

  /**
   * End performance measurement
   * @param {string} label - Performance label
   */
  endTimer(label) {
    const metric = this.performanceMetrics.get(label);
    if (!metric) return;
    
    const end = process.hrtime.bigint();
    const duration = Number(end - metric.start) / 1e6; // Convert to ms
    const memoryDiff = process.memoryUsage().heapUsed - metric.memory.heapUsed;
    
    this.debug(`Performance: ${label}`, {
      duration: `${duration.toFixed(2)}ms`,
      memoryDelta: `${(memoryDiff / 1024).toFixed(2)}KB`
    });
    
    this.performanceMetrics.delete(label);
    
    return { duration, memoryDiff };
  }

  /**
   * Log an error with stack trace
   * @param {Error} error - Error object
   * @param {string} context - Error context
   */
  logError(error, context = '') {
    this.error(`${context}: ${error.message}`, {
      stack: error.stack,
      code: error.code,
      context
    });
  }

  /**
   * Get recent errors from buffer
   * @param {number} count - Number of errors to retrieve
   */
  getRecentErrors(count = 10) {
    return this.logBuffer
      .filter(entry => entry.level === 'error')
      .slice(-count);
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats() {
    const usage = process.memoryUsage();
    return {
      rss: `${(usage.rss / 1024 / 1024).toFixed(2)}MB`,
      heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
      heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      external: `${(usage.external / 1024 / 1024).toFixed(2)}MB`
    };
  }

  /**
   * Monitor memory usage
   */
  startMemoryMonitoring(interval = 60000) {
    setInterval(() => {
      const stats = this.getMemoryStats();
      this.debug('Memory usage', stats);
      
      // Warn if memory usage is high
      const heapUsed = process.memoryUsage().heapUsed / 1024 / 1024;
      if (heapUsed > 500) {
        this.warn(`High memory usage detected: ${heapUsed.toFixed(2)}MB`);
      }
    }, interval);
  }

  /**
   * Export logs for analysis
   * @param {string} outputPath - Export file path
   */
  exportLogs(outputPath) {
    try {
      const logs = this.logBuffer.map(entry => ({
        ...entry,
        memory: `${(entry.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`
      }));
      
      fs.writeFileSync(outputPath, JSON.stringify(logs, null, 2));
      this.info(`Logs exported to ${outputPath}`);
    } catch (error) {
      this.error('Failed to export logs', { error: error.message });
    }
  }

  /**
   * Analyze log patterns
   */
  analyzePatterns() {
    const analysis = {
      totalLogs: this.logBuffer.length,
      byLevel: {},
      errorPatterns: {},
      performanceIssues: []
    };
    
    // Count by level
    this.logBuffer.forEach(entry => {
      analysis.byLevel[entry.level] = (analysis.byLevel[entry.level] || 0) + 1;
      
      // Analyze error patterns
      if (entry.level === 'error') {
        const pattern = entry.message.split(':')[0];
        analysis.errorPatterns[pattern] = (analysis.errorPatterns[pattern] || 0) + 1;
      }
    });
    
    // Find performance issues
    const slowOperations = this.logBuffer.filter(entry => 
      entry.metadata.duration && parseFloat(entry.metadata.duration) > 1000
    );
    
    if (slowOperations.length > 0) {
      analysis.performanceIssues = slowOperations.map(op => ({
        message: op.message,
        duration: op.metadata.duration
      }));
    }
    
    return analysis;
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create logger instance
 * @param {Object} config - Logger configuration
 * @returns {Logger} Logger instance
 */
function getLogger(config) {
  if (!instance) {
    instance = new Logger(config);
  }
  return instance;
}

module.exports = { Logger, getLogger };
