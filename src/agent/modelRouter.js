const axios = require('axios');

/**
 * Multi-Model Router
 * Intelligently routes tasks to the most appropriate AI model
 * Supports OpenAI, Anthropic, and local models with fallback logic
 */
class ModelRouter {
  constructor(config = {}) {
    this.config = config;
    this.modelStats = new Map(); // Track performance per model
    this.activeRequests = new Map(); // Track ongoing requests
    
    // Model configurations with capabilities and costs
    this.models = {
      // Vision-capable models
      'gpt-4o': {
        provider: 'openai',
        capabilities: ['vision', 'code', 'reasoning', 'fast'],
        maxTokens: 4096,
        costPer1k: 0.01,
        timeout: 30000,
        description: 'Best for vision and general tasks'
      },
      'gpt-4-vision-preview': {
        provider: 'openai',
        capabilities: ['vision', 'code', 'reasoning'],
        maxTokens: 4096,
        costPer1k: 0.03,
        timeout: 45000,
        description: 'Alternative vision model'
      },
      
      // High-reasoning models
      'gpt-4-turbo-preview': {
        provider: 'openai',
        capabilities: ['code', 'reasoning', 'complex'],
        maxTokens: 4096,
        costPer1k: 0.03,
        timeout: 45000,
        description: 'Best for complex coding and reasoning'
      },
      'claude-3-opus': {
        provider: 'anthropic',
        capabilities: ['code', 'reasoning', 'complex', 'creative'],
        maxTokens: 4096,
        costPer1k: 0.075,
        timeout: 60000,
        description: 'Excellent for complex analysis'
      },
      
      // Fast/efficient models
      'gpt-4o-mini': {
        provider: 'openai',
        capabilities: ['code', 'fast', 'simple'],
        maxTokens: 4096,
        costPer1k: 0.0015,
        timeout: 15000,
        description: 'Fast and cheap for simple tasks'
      },
      'gpt-3.5-turbo': {
        provider: 'openai',
        capabilities: ['code', 'fast', 'simple'],
        maxTokens: 4096,
        costPer1k: 0.002,
        timeout: 15000,
        description: 'Backup fast model'
      },
      
      // Local models
      'llama3.1:8b': {
        provider: 'ollama',
        capabilities: ['code', 'local', 'private'],
        maxTokens: 4096,
        costPer1k: 0,
        timeout: 30000,
        description: 'Local privacy-focused model'
      },
      'codellama:13b': {
        provider: 'ollama',
        capabilities: ['code', 'local', 'specialized'],
        maxTokens: 4096,
        costPer1k: 0,
        timeout: 45000,
        description: 'Local code-specialized model'
      }
    };
    
    // Task type to capability mapping
    this.taskCapabilityMap = {
      'vision_analysis': ['vision'],
      'screen_reading': ['vision', 'fast'],
      'code_generation': ['code', 'reasoning'],
      'code_review': ['code', 'reasoning', 'complex'],
      'debugging': ['code', 'reasoning', 'complex'],
      'documentation': ['code', 'simple', 'fast'],
      'planning': ['reasoning', 'complex'],
      'control_flow': ['simple', 'fast'],
      'creative_writing': ['creative', 'reasoning'],
      'data_analysis': ['reasoning', 'code'],
      'error_analysis': ['code', 'reasoning']
    };
  }

  /**
   * Route a task to the best available model
   * @param {Object} task - Task to route
   * @returns {Object} Selected model and reasoning
   */
  async routeTask(task) {
    const { type, content, requirements = {}, context = {} } = task;
    
    // Determine required capabilities
    const requiredCapabilities = this.getRequiredCapabilities(type, requirements);
    
    // Filter compatible models
    const compatibleModels = this.filterCompatibleModels(requiredCapabilities);
    
    // Score and rank models
    const rankedModels = await this.rankModels(compatibleModels, task);
    
    // Select best model with fallback
    const selection = await this.selectWithFallback(rankedModels, task);
    
    // Track the decision
    this.trackRouting(task, selection);
    
    return selection;
  }

  /**
   * Get required capabilities for a task
   * @param {string} type - Task type
   * @param {Object} requirements - Additional requirements
   * @returns {Array} Required capabilities
   */
  getRequiredCapabilities(type, requirements) {
    let capabilities = this.taskCapabilityMap[type] || ['code'];
    
    // Add explicit requirements
    if (requirements.needsVision) capabilities.push('vision');
    if (requirements.needsSpeed) capabilities.push('fast');
    if (requirements.complex) capabilities.push('complex');
    if (requirements.creative) capabilities.push('creative');
    if (requirements.local) capabilities = ['local', ...capabilities];
    
    return [...new Set(capabilities)];
  }

  /**
   * Filter models that have required capabilities
   * @param {Array} requiredCapabilities - Required capabilities
   * @returns {Array} Compatible model names
   */
  filterCompatibleModels(requiredCapabilities) {
    const compatible = [];
    
    for (const [modelName, modelConfig] of Object.entries(this.models)) {
      const hasAllRequired = requiredCapabilities.every(cap => 
        modelConfig.capabilities.includes(cap)
      );
      
      if (hasAllRequired) {
        // Check if model is available
        if (this.isModelAvailable(modelName)) {
          compatible.push(modelName);
        }
      }
    }
    
    return compatible;
  }

  /**
   * Check if a model is available
   * @param {string} modelName - Model to check
   * @returns {boolean} Availability status
   */
  isModelAvailable(modelName) {
    const model = this.models[modelName];
    
    // Check provider availability
    switch (model.provider) {
      case 'openai':
        return !!process.env.OPENAI_API_KEY;
      case 'anthropic':
        return !!process.env.ANTHROPIC_API_KEY;
      case 'ollama':
        // Could ping ollama to check, for now assume available if configured
        return this.config.useLocalLLM || false;
      default:
        return false;
    }
  }

  /**
   * Rank models based on various factors
   * @param {Array} modelNames - Models to rank
   * @param {Object} task - Task context
   * @returns {Array} Ranked models with scores
   */
  async rankModels(modelNames, task) {
    const ranked = [];
    
    for (const modelName of modelNames) {
      const model = this.models[modelName];
      const stats = this.modelStats.get(modelName) || {};
      
      let score = 100;
      
      // Cost factor (prefer cheaper models for simple tasks)
      if (!task.requirements?.quality_over_cost) {
        score -= model.costPer1k * 10;
      }
      
      // Speed factor
      if (task.requirements?.needsSpeed) {
        score += model.capabilities.includes('fast') ? 20 : -10;
        score -= (model.timeout / 1000); // Penalty for slow timeout
      }
      
      // Success rate from historical data
      if (stats.totalRequests > 0) {
        const successRate = stats.successCount / stats.totalRequests;
        score += successRate * 30;
      }
      
      // Average response time from history
      if (stats.avgResponseTime) {
        score -= (stats.avgResponseTime / 1000);
      }
      
      // Capability match bonus
      const capabilityMatchCount = task.requirements?.capabilities?.filter(cap =>
        model.capabilities.includes(cap)
      ).length || 0;
      score += capabilityMatchCount * 5;
      
      // Current load (penalize if model is overloaded)
      const activeCount = this.getActiveRequestCount(modelName);
      score -= activeCount * 5;
      
      // Specialized model bonus
      if (task.type === 'code_generation' && modelName.includes('code')) {
        score += 15;
      }
      if (task.type === 'vision_analysis' && model.capabilities.includes('vision')) {
        score += 20;
      }
      
      ranked.push({
        model: modelName,
        score,
        config: model,
        reasoning: this.explainScore(modelName, score, task)
      });
    }
    
    // Sort by score descending
    return ranked.sort((a, b) => b.score - a.score);
  }

  /**
   * Select best model with fallback options
   * @param {Array} rankedModels - Ranked model list
   * @param {Object} task - Task context
   * @returns {Object} Selection result
   */
  async selectWithFallback(rankedModels, task) {
    if (rankedModels.length === 0) {
      // No compatible models, use default fallback
      return {
        primary: 'gpt-4o-mini',
        fallbacks: ['gpt-3.5-turbo'],
        reasoning: 'No compatible models found, using default fallback',
        config: this.models['gpt-4o-mini']
      };
    }
    
    const primary = rankedModels[0];
    const fallbacks = rankedModels.slice(1, 3).map(m => m.model);
    
    return {
      primary: primary.model,
      fallbacks,
      reasoning: primary.reasoning,
      config: primary.config,
      score: primary.score
    };
  }

  /**
   * Execute request with selected model and fallbacks
   * @param {Object} selection - Model selection
   * @param {Object} request - Request details
   * @returns {Object} Response
   */
  async executeWithFallback(selection, request) {
    const { primary, fallbacks } = selection;
    const models = [primary, ...fallbacks];
    
    for (const modelName of models) {
      try {
        console.log(`Attempting with model: ${modelName}`);
        
        const startTime = Date.now();
        const response = await this.executeRequest(modelName, request);
        const duration = Date.now() - startTime;
        
        // Track success
        this.trackSuccess(modelName, duration);
        
        return {
          success: true,
          model: modelName,
          response,
          duration
        };
      } catch (error) {
        console.error(`Model ${modelName} failed:`, error.message);
        this.trackFailure(modelName, error);
        
        // Continue to fallback
        if (modelName !== models[models.length - 1]) {
          console.log(`Falling back to next model...`);
          continue;
        }
        
        // All models failed
        throw new Error(`All models failed. Last error: ${error.message}`);
      }
    }
  }

  /**
   * Execute request with specific model
   * @param {string} modelName - Model to use
   * @param {Object} request - Request details
   * @returns {Object} Model response
   */
  async executeRequest(modelName, request) {
    const model = this.models[modelName];
    if (!model) throw new Error(`Unknown model: ${modelName}`);
    
    // Track active request
    const requestId = `${modelName}_${Date.now()}`;
    this.activeRequests.set(requestId, { modelName, startTime: Date.now() });
    
    try {
      let response;
      
      switch (model.provider) {
        case 'openai':
          response = await this.executeOpenAI(modelName, request, model);
          break;
        case 'anthropic':
          response = await this.executeAnthropic(modelName, request, model);
          break;
        case 'ollama':
          response = await this.executeOllama(modelName, request, model);
          break;
        default:
          throw new Error(`Unknown provider: ${model.provider}`);
      }
      
      return response;
    } finally {
      // Clean up active request
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Execute OpenAI request
   */
  async executeOpenAI(modelName, request, modelConfig) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key not configured');
    
    const messages = request.messages || [
      { role: 'user', content: request.prompt }
    ];
    
    // Add vision content if needed
    if (request.images && modelConfig.capabilities.includes('vision')) {
      messages[messages.length - 1].content = [
        { type: 'text', text: request.prompt },
        ...request.images.map(img => ({
          type: 'image_url',
          image_url: { url: img }
        }))
      ];
    }
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: modelName,
        messages,
        max_tokens: request.maxTokens || modelConfig.maxTokens,
        temperature: request.temperature || 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: modelConfig.timeout
      }
    );
    
    return response.data.choices[0].message.content;
  }

  /**
   * Execute Anthropic request
   */
  async executeAnthropic(modelName, request, modelConfig) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Anthropic API key not configured');
    
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: modelName,
        messages: request.messages || [
          { role: 'user', content: request.prompt }
        ],
        max_tokens: request.maxTokens || modelConfig.maxTokens
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        timeout: modelConfig.timeout
      }
    );
    
    return response.data.content[0].text;
  }

  /**
   * Execute Ollama request
   */
  async executeOllama(modelName, request, modelConfig) {
    const baseUrl = this.config.ollama?.baseUrl || 'http://localhost:11434';
    
    const response = await axios.post(
      `${baseUrl}/api/generate`,
      {
        model: modelName,
        prompt: request.prompt,
        stream: false
      },
      {
        timeout: modelConfig.timeout
      }
    );
    
    return response.data.response;
  }

  /**
   * Track routing decision
   */
  trackRouting(task, selection) {
    const entry = {
      timestamp: Date.now(),
      taskType: task.type,
      selectedModel: selection.primary,
      fallbacks: selection.fallbacks,
      reasoning: selection.reasoning
    };
    
    // Could save to a log file or database
    console.log('Model routing:', entry);
  }

  /**
   * Track successful request
   */
  trackSuccess(modelName, duration) {
    const stats = this.modelStats.get(modelName) || {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      totalDuration: 0
    };
    
    stats.totalRequests++;
    stats.successCount++;
    stats.totalDuration += duration;
    stats.avgResponseTime = stats.totalDuration / stats.successCount;
    stats.lastSuccess = Date.now();
    
    this.modelStats.set(modelName, stats);
  }

  /**
   * Track failed request
   */
  trackFailure(modelName, error) {
    const stats = this.modelStats.get(modelName) || {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      totalDuration: 0
    };
    
    stats.totalRequests++;
    stats.failureCount++;
    stats.lastFailure = Date.now();
    stats.lastError = error.message;
    
    this.modelStats.set(modelName, stats);
  }

  /**
   * Get active request count for a model
   */
  getActiveRequestCount(modelName) {
    let count = 0;
    for (const [_, request] of this.activeRequests) {
      if (request.modelName === modelName) count++;
    }
    return count;
  }

  /**
   * Explain score calculation
   */
  explainScore(modelName, score, task) {
    const model = this.models[modelName];
    const factors = [];
    
    if (model.capabilities.includes('vision') && task.type?.includes('vision')) {
      factors.push('Vision capability match');
    }
    if (model.capabilities.includes('fast') && task.requirements?.needsSpeed) {
      factors.push('Speed requirement match');
    }
    if (model.costPer1k === 0) {
      factors.push('Free local model');
    } else if (model.costPer1k < 0.01) {
      factors.push('Cost-effective');
    }
    
    const stats = this.modelStats.get(modelName);
    if (stats?.successCount > 10) {
      const successRate = stats.successCount / stats.totalRequests;
      factors.push(`${(successRate * 100).toFixed(1)}% success rate`);
    }
    
    return factors.join(', ') || 'Default selection';
  }

  /**
   * Get model statistics
   */
  getStatistics() {
    const stats = {};
    for (const [modelName, modelStats] of this.modelStats) {
      stats[modelName] = {
        ...modelStats,
        successRate: modelStats.successCount / modelStats.totalRequests
      };
    }
    return stats;
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.modelStats.clear();
    console.log('Model statistics reset');
  }
}

module.exports = { ModelRouter };

