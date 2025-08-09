const { PCControl } = require('../tools/pc-control');
const { captureScreen, analyzeScreen } = require('../tools/vision');
const { ChatHistory } = require('./chatHistory');
const EventEmitter = require('events');

/**
 * Unified Automation Controller
 * Integrates vision, control, and AI for full automation
 */
class AutomationController extends EventEmitter {
  constructor({ llm, memory, config }) {
    super();
    this.llm = llm;
    this.memory = memory;
    this.config = config;
    this.chatHistory = new ChatHistory();
    this.pcControl = new PCControl({ dryRun: false });
    this.isAutomating = false;
    this.currentContext = {};
  }

  async processUserMessage(message) {
    // Add to history
    this.chatHistory.addMessage('user', message);
    
    // Get conversation context
    const context = this.chatHistory.getFormattedContext();
    
    // Analyze intent
    const intent = await this.analyzeIntent(message, context);
    
    // Execute based on intent
    let response;
    if (intent.requiresVision) {
      response = await this.handleVisionRequest(message, context);
    } else if (intent.requiresControl) {
      response = await this.handleControlRequest(message, context, intent);
    } else {
      response = await this.handleConversation(message, context);
    }
    
    // Add response to history
    this.chatHistory.addMessage('assistant', response);
    
    // Store in memory
    await this.memory.appendEvent({
      type: 'conversation',
      user: message,
      assistant: response,
      timestamp: Date.now()
    });
    
    return response;
  }

  async analyzeIntent(message, context) {
    const prompt = `Analyze this user message and determine what they want:
Message: "${message}"
${context}

Return JSON with:
{
  "requiresVision": true/false (needs to see screen),
  "requiresControl": true/false (needs to control mouse/keyboard),
  "action": "type of action",
  "parameters": {}
}`;

    try {
      const response = await this.llm.generateSuggestion({ prompt });
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : { requiresVision: false, requiresControl: false };
    } catch {
      return { requiresVision: false, requiresControl: false };
    }
  }

  async handleVisionRequest(message, context) {
    this.emit('status', 'Capturing screen...');
    
    try {
      // Capture screen
      const imagePath = await captureScreen();
      
      // Analyze with context
      const analysis = await analyzeScreen({
        imagePath,
        prompt: `User asked: "${message}"\n${context}\nAnalyze the screen and respond helpfully.`
      });
      
      if (analysis.error) {
        return `I couldn't analyze the screen: ${analysis.error}`;
      }
      
      return analysis.analysis;
    } catch (error) {
      console.error('Vision error:', error);
      return `I couldn't capture the screen. Error: ${error.message}`;
    }
  }

  async handleControlRequest(message, context, intent) {
    this.emit('status', 'Executing control action...');
    
    try {
      // Parse control parameters
      const params = intent.parameters || {};
      
      if (intent.action === 'click') {
        await this.pcControl.mouseClick(params.button || 'left');
        return 'Clicked successfully';
      } else if (intent.action === 'type') {
        await this.pcControl.keyboardType(params.text || message);
        return `Typed: ${params.text || message}`;
      } else if (intent.action === 'open_app') {
        await this.pcControl.openApplication(params.app || 'cursor');
        return `Opened ${params.app || 'application'}`;
      }
      
      // Complex automation
      return await this.executeAutomation(message, context);
    } catch (error) {
      return `Control action failed: ${error.message}`;
    }
  }

  async handleConversation(message, context) {
    // Regular conversation with context
    const prompt = `${context}User: ${message}\n\nAssistant: Respond naturally and helpfully. If they ask about capabilities, explain you can see their screen, control mouse/keyboard, write code, and automate tasks.`;
    
    const response = await this.llm.generateSuggestion({ prompt });
    return response;
  }

  async executeAutomation(task, context) {
    this.isAutomating = true;
    this.emit('automation:start', task);
    
    const steps = [];
    
    try {
      // Take initial screenshot
      const screenshotPath = await captureScreen();
      steps.push({ action: 'screenshot', result: screenshotPath });
      
      // Analyze current state
      const analysis = await analyzeScreen({
        imagePath: screenshotPath,
        prompt: `Task: ${task}\nWhat's currently on screen and what steps should I take?`
      });
      
      steps.push({ action: 'analysis', result: analysis.analysis });
      
      // Plan actions
      const plan = await this.createActionPlan(task, analysis.analysis);
      
      // Execute plan
      for (const action of plan) {
        const result = await this.executeAction(action);
        steps.push({ action: action.type, result });
        this.emit('automation:step', action);
      }
      
      this.emit('automation:complete', steps);
      return `Automation complete. Executed ${steps.length} steps.`;
    } catch (error) {
      this.emit('automation:error', error);
      return `Automation failed: ${error.message}`;
    } finally {
      this.isAutomating = false;
    }
  }

  async createActionPlan(task, screenAnalysis) {
    const prompt = `Create a step-by-step plan to: ${task}
Current screen: ${screenAnalysis}

Return JSON array of actions:
[{
  "type": "click/type/wait/open_app",
  "parameters": {},
  "description": "what this does"
}]`;

    try {
      const response = await this.llm.generateSuggestion({ prompt });
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      return [];
    }
  }

  async executeAction(action) {
    switch (action.type) {
      case 'click':
        return await this.pcControl.mouseClick(action.parameters?.button);
      case 'type':
        return await this.pcControl.keyboardType(action.parameters?.text);
      case 'wait':
        return await this.pcControl.wait(action.parameters?.ms || 1000);
      case 'open_app':
        return await this.pcControl.openApplication(action.parameters?.app);
      default:
        return 'Unknown action';
    }
  }

  getChatHistory() {
    return this.chatHistory.getFullHistory();
  }

  clearHistory() {
    this.chatHistory.clear();
  }
}

module.exports = { AutomationController };
