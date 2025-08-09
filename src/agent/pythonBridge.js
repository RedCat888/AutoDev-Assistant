/**
 * Python AI Bridge - Interface to Python AI capabilities
 * 
 * This module provides a bridge to call Python AI functions from JavaScript,
 * enabling advanced AI model routing and specialized processing.
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');

class PythonAIBridge extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.pythonProcess = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
    this.isInitialized = false;
  }

  /**
   * Initialize the Python bridge
   */
  async initialize() {
    if (this.isInitialized) return;

    const pythonScript = path.join(__dirname, '../../python_ai/bridge.py');
    const pythonPath = this.config.pythonPath || 'python3';
    
    // Spawn Python process
    this.pythonProcess = spawn(pythonPath, [pythonScript, '--mode', 'stdio'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Handle stdout (responses)
    this.pythonProcess.stdout.on('data', (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    // Handle stderr (logging)
    this.pythonProcess.stderr.on('data', (data) => {
      console.error('[Python AI]', data.toString());
    });

    // Handle process exit
    this.pythonProcess.on('exit', (code) => {
      console.log(`Python AI process exited with code ${code}`);
      this.isInitialized = false;
      this.emit('exit', code);
    });

    // Handle errors
    this.pythonProcess.on('error', (error) => {
      console.error('Failed to start Python AI process:', error);
      this.emit('error', error);
    });

    this.isInitialized = true;
    this.emit('initialized');
  }

  /**
   * Process buffered output from Python
   */
  processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const response = JSON.parse(line);
        const requestId = response.id;
        
        if (this.pendingRequests.has(requestId)) {
          const { resolve, reject } = this.pendingRequests.get(requestId);
          this.pendingRequests.delete(requestId);
          
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        }
      } catch (e) {
        console.error('Failed to parse Python response:', e, 'Line:', line);
      }
    }
  }

  /**
   * Send a request to Python
   */
  async request(method, params = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;
      
      const request = {
        jsonrpc: '2.0',
        method,
        params,
        id: requestId
      };

      this.pendingRequests.set(requestId, { resolve, reject });
      
      // Send request to Python
      this.pythonProcess.stdin.write(JSON.stringify(request) + '\n');
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Generate AI response using Python models
   */
  async generate(messages, options = {}) {
    return this.request('generate', {
      messages,
      task_type: options.taskType || 'general',
      model: options.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: options.stream || false
    });
  }

  /**
   * Analyze an image using vision models
   */
  async analyzeImage(imagePath, prompt) {
    return this.request('analyze_image', {
      image_path: imagePath,
      prompt
    });
  }

  /**
   * Get available models
   */
  async getModels() {
    return this.request('get_models');
  }

  /**
   * Get usage statistics
   */
  async getStats() {
    return this.request('get_stats');
  }

  /**
   * Shutdown the Python process
   */
  async shutdown() {
    if (this.pythonProcess) {
      this.pythonProcess.kill();
      this.pythonProcess = null;
      this.isInitialized = false;
    }
  }
}

// Factory function for creating bridge instance
function createPythonBridge(config) {
  return new PythonAIBridge(config);
}

module.exports = {
  PythonAIBridge,
  createPythonBridge
};