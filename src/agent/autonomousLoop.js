const EventEmitter = require('events');
const { captureScreen, analyzeScreen } = require('../tools/vision');
const { PCControl } = require('../tools/pc-control');
const fs = require('fs');
const path = require('path');

/**
 * Autonomous Agent Loop
 * Implements Observe → Plan → Act → Learn cycle
 */
class AutonomousLoop extends EventEmitter {
  constructor({ llm, memory, orchestrator, config }) {
    super();
    this.llm = llm;
    this.memory = memory;
    this.orchestrator = orchestrator;
    this.config = config;
    this.pcControl = new PCControl({ dryRun: false });
    
    this.isRunning = false;
    this.isPaused = false;
    this.taskQueue = [];
    this.currentTask = null;
    this.observationInterval = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    
    // State tracking
    this.state = {
      lastScreenshot: null,
      lastAnalysis: null,
      recentActions: [],
      failedActions: [],
      completedTasks: [],
      context: {}
    };
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.emit('loop:start');
    console.log('🤖 Autonomous loop started');
    
    // Start observation cycle
    this.observationInterval = setInterval(() => {
      if (!this.isPaused) {
        this.observe();
      }
    }, 5000); // Observe every 5 seconds
    
    // Start task processing
    this.processNextTask();
  }

  stop() {
    this.isRunning = false;
    if (this.observationInterval) {
      clearInterval(this.observationInterval);
      this.observationInterval = null;
    }
    this.emit('loop:stop');
    console.log('🛑 Autonomous loop stopped');
  }

  pause() {
    this.isPaused = true;
    this.emit('loop:pause');
  }

  resume() {
    this.isPaused = false;
    this.emit('loop:resume');
    this.processNextTask();
  }

  async observe() {
    try {
      this.emit('observe:start');
      
      // Capture current screen state
      const screenshotPath = await captureScreen();
      this.state.lastScreenshot = screenshotPath;
      
      // Analyze what's happening
      const analysis = await analyzeScreen({
        imagePath: screenshotPath,
        prompt: `Analyze the screen and identify:
1. What application/window is active
2. Any errors or issues visible
3. Development tools or code visible
4. Potential actions that could be taken
5. User's likely intent based on screen content`
      });
      
      this.state.lastAnalysis = analysis.analysis;
      
      // Check for patterns that need action
      await this.detectPatterns(analysis.analysis);
      
      // Store observation
      await this.memory.appendEvent({
        type: 'observation',
        screenshot: screenshotPath,
        analysis: analysis.analysis,
        timestamp: Date.now()
      });
      
      this.emit('observe:complete', { screenshot: screenshotPath, analysis: analysis.analysis });
    } catch (error) {
      console.error('Observation error:', error);
      this.emit('observe:error', error);
    }
  }

  async detectPatterns(analysis) {
    // Look for actionable patterns
    const patterns = [
      { regex: /error|exception|failed/i, action: 'debug_error' },
      { regex: /TODO|FIXME/i, action: 'complete_todo' },
      { regex: /cursor.*composer/i, action: 'assist_coding' },
      { regex: /terminal.*command/i, action: 'suggest_command' },
      { regex: /waiting|loading/i, action: 'wait' }
    ];
    
    for (const pattern of patterns) {
      if (pattern.regex.test(analysis)) {
        this.emit('pattern:detected', { pattern: pattern.action, analysis });
        
        // Auto-queue task if configured
        if (this.config.autoQueue) {
          this.queueTask({
            type: pattern.action,
            context: analysis,
            priority: 'low'
          });
        }
      }
    }
  }

  async plan(task) {
    this.emit('plan:start', task);
    
    try {
      // Generate action plan based on task and current state
      const prompt = `Create a detailed action plan for: ${JSON.stringify(task)}
Current screen analysis: ${this.state.lastAnalysis}
Recent actions: ${JSON.stringify(this.state.recentActions.slice(-5))}

Generate a JSON plan with specific steps:
{
  "goal": "what we're trying to achieve",
  "steps": [
    {
      "action": "screenshot/click/type/hotkey/wait/open_app",
      "parameters": {},
      "expectedResult": "what should happen",
      "fallback": "what to do if it fails"
    }
  ],
  "successCriteria": "how to know if successful"
}`;

      const response = await this.llm.generateSuggestion({ prompt });
      
      // Parse plan from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const plan = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      
      if (!plan) {
        throw new Error('Failed to generate valid plan');
      }
      
      this.emit('plan:complete', plan);
      return plan;
    } catch (error) {
      console.error('Planning error:', error);
      this.emit('plan:error', error);
      return null;
    }
  }

  async act(plan) {
    this.emit('act:start', plan);
    const results = [];
    
    try {
      for (const step of plan.steps) {
        this.emit('act:step', step);
        
        let result;
        switch (step.action) {
          case 'screenshot':
            result = await captureScreen();
            break;
            
          case 'click':
            result = await this.pcControl.mouseClick(
              step.parameters.button,
              step.parameters.x,
              step.parameters.y
            );
            break;
            
          case 'type':
            result = await this.pcControl.keyboardType(step.parameters.text);
            break;
            
          case 'hotkey':
            result = await this.pcControl.keyboardHotkey(step.parameters.keys);
            break;
            
          case 'wait':
            result = await this.pcControl.wait(step.parameters.ms || 1000);
            break;
            
          case 'open_app':
            result = await this.pcControl.openApplication(step.parameters.app);
            break;
            
          default:
            result = { error: 'Unknown action type' };
        }
        
        results.push({ step, result });
        this.state.recentActions.push({ action: step.action, timestamp: Date.now() });
        
        // Check if step succeeded
        if (result.error || result.success === false) {
          // Try fallback if available
          if (step.fallback) {
            this.emit('act:fallback', step.fallback);
            // Queue fallback as new task
            this.queueTask({ type: 'fallback', action: step.fallback });
          } else {
            throw new Error(`Step failed: ${step.action}`);
          }
        }
        
        // Small delay between actions
        await this.pcControl.wait(500);
      }
      
      this.emit('act:complete', results);
      return { success: true, results };
    } catch (error) {
      console.error('Action error:', error);
      this.emit('act:error', error);
      this.state.failedActions.push({ plan, error: error.message, timestamp: Date.now() });
      return { success: false, error: error.message };
    }
  }

  async learn(task, plan, result) {
    this.emit('learn:start');
    
    try {
      // Store experience in memory
      const experience = {
        task,
        plan,
        result,
        success: result.success,
        timestamp: Date.now(),
        context: this.state.context
      };
      
      await this.memory.appendEvent({
        type: 'experience',
        ...experience
      });
      
      // Update success/failure patterns
      if (result.success) {
        this.state.completedTasks.push(task);
        this.retryCount = 0;
      } else {
        // Analyze failure and adjust
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          // Re-queue with adjusted parameters
          this.queueTask({
            ...task,
            retry: this.retryCount,
            previousError: result.error
          });
        }
      }
      
      // Extract learnings
      const learnings = await this.extractLearnings(experience);
      if (learnings) {
        await this.memory.appendEvent({
          type: 'learning',
          insights: learnings,
          timestamp: Date.now()
        });
      }
      
      this.emit('learn:complete', learnings);
    } catch (error) {
      console.error('Learning error:', error);
      this.emit('learn:error', error);
    }
  }

  async extractLearnings(experience) {
    const prompt = `Analyze this automation experience and extract key learnings:
${JSON.stringify(experience, null, 2)}

What patterns, improvements, or insights can we derive?
Return JSON: { "insights": [], "improvements": [] }`;

    try {
      const response = await this.llm.generateSuggestion({ prompt });
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      return null;
    }
  }

  queueTask(task) {
    const taskWithId = {
      id: Date.now().toString(),
      ...task,
      status: 'queued',
      queuedAt: Date.now()
    };
    
    if (task.priority === 'high') {
      this.taskQueue.unshift(taskWithId);
    } else {
      this.taskQueue.push(taskWithId);
    }
    
    this.emit('task:queued', taskWithId);
    
    // Process immediately if not busy
    if (!this.currentTask && this.isRunning && !this.isPaused) {
      this.processNextTask();
    }
    
    return taskWithId.id;
  }

  async processNextTask() {
    if (!this.isRunning || this.isPaused || this.currentTask || this.taskQueue.length === 0) {
      return;
    }
    
    this.currentTask = this.taskQueue.shift();
    this.currentTask.status = 'processing';
    this.emit('task:start', this.currentTask);
    
    try {
      // Execute OPAL cycle
      await this.observe();
      const plan = await this.plan(this.currentTask);
      
      if (plan) {
        const result = await this.act(plan);
        await this.learn(this.currentTask, plan, result);
        
        this.currentTask.status = result.success ? 'completed' : 'failed';
      } else {
        this.currentTask.status = 'failed';
      }
    } catch (error) {
      console.error('Task processing error:', error);
      this.currentTask.status = 'error';
      this.currentTask.error = error.message;
    }
    
    this.emit('task:complete', this.currentTask);
    this.currentTask = null;
    
    // Process next task
    setTimeout(() => this.processNextTask(), 1000);
  }

  getState() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentTask: this.currentTask,
      queueLength: this.taskQueue.length,
      completedTasks: this.state.completedTasks.length,
      failedActions: this.state.failedActions.length,
      lastObservation: this.state.lastAnalysis
    };
  }

  clearQueue() {
    this.taskQueue = [];
    this.emit('queue:cleared');
  }

  /**
   * Safe execution wrapper with error handling
   */
  async safeExecute(fn) {
    try {
      return await fn();
    } catch (error) {
      this.logger.error('Safe execution failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Recover from errors
   */
  async recoverFromError(error) {
    this.logger.info('Attempting error recovery', { error: error.message });
    
    // Clear any stuck state
    this.retryCount = 0;
    
    // Force garbage collection if memory error
    if (error.message.includes('memory') || error.message.includes('heap')) {
      this.memoryOptimizer.performGarbageCollection(true);
    }
    
    // Wait before continuing
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  /**
   * Calculate dynamic delay for next task
   */
  calculateNextTaskDelay() {
    // Increase delay if many failures
    const failureRate = this.state.failedActions.length / 
                       (this.state.completedTasks.length + this.state.failedActions.length || 1);
    
    if (failureRate > 0.5) {
      return 5000; // 5 seconds if high failure rate
    } else if (this.taskQueue.length > 10) {
      return 100; // Fast processing if many tasks
    } else {
      return 1000; // Normal delay
    }
  }

  /**
   * Clean up old screenshots
   */
  cleanupOldScreenshots() {
    const screensDir = path.join(process.cwd(), 'data', 'screens');
    
    try {
      const files = fs.readdirSync(screensDir);
      const now = Date.now();
      const maxAge = 3600000; // 1 hour
      
      files.forEach(file => {
        const filePath = path.join(screensDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          this.logger.debug(`Deleted old screenshot: ${file}`);
        }
      });
    } catch (error) {
      this.logger.error('Screenshot cleanup failed', { error: error.message });
    }
  }

  /**
   * Clean up resources on stop
   */
  cleanupResources() {
    // Clear state to free memory
    this.state.recentActions = this.state.recentActions.slice(-10);
    this.state.failedActions = this.state.failedActions.slice(-10);
    this.state.completedTasks = this.state.completedTasks.slice(-10);
    
    // Clear task queue if too large
    if (this.taskQueue.length > 100) {
      this.taskQueue = this.taskQueue.slice(0, 50);
      this.logger.warn('Trimmed task queue to 50 items');
    }
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
  }
}

module.exports = { AutonomousLoop };
