const { PCControl } = require('../tools/pc-control');
const { analyzeScreen, identifyUIElements } = require('../tools/vision');
const { createLlmRouter } = require('../llm');
const EventEmitter = require('events');

/**
 * Cursor Autopilot - Autonomous coding assistant that can control Cursor/VSCode
 */
class CursorAutopilot extends EventEmitter {
  constructor({ config, memory, dryRun = false }) {
    super();
    this.config = config;
    this.memory = memory;
    this.pc = new PCControl({ dryRun, confirmActions: config.safety?.confirmActions });
    this.llm = createLlmRouter(config);
    this.running = false;
  }

  async executeTask(task) {
    this.emit('task:start', { task });
    const steps = [];

    try {
      // Step 1: Open Cursor/VSCode
      this.emit('step', { action: 'Opening Cursor' });
      await this.pc.openApplication('cursor');
      await this.pc.wait(3000); // Wait for app to open
      steps.push({ action: 'open_app', success: true });

      // Step 2: Take screenshot and analyze
      this.emit('step', { action: 'Analyzing screen' });
      const screenshot = await this.pc.takeScreenshot();
      const analysis = await analyzeScreen({
        imagePath: screenshot.imagePath,
        prompt: 'Describe the current state of the code editor. Is it ready for input? What file is open?'
      });
      steps.push({ action: 'analyze', result: analysis.analysis });

      // Step 3: Open command palette or new file
      this.emit('step', { action: 'Preparing editor' });
      await this.pc.keyboardHotkey('ctrl+shift+p'); // Command palette
      await this.pc.wait(500);
      await this.pc.keyboardType('new file');
      await this.pc.wait(500);
      await this.pc.keyboardHotkey('enter');
      await this.pc.wait(1000);
      steps.push({ action: 'prepare', success: true });

      // Step 4: Type the prompt/code
      this.emit('step', { action: 'Entering code/prompt', content: task.prompt });
      if (task.prompt) {
        await this.pc.keyboardType(task.prompt);
        steps.push({ action: 'type_prompt', success: true });
      }

      // Step 5: Trigger AI assistant (if using Cursor AI)
      if (task.useCursorAI) {
        this.emit('step', { action: 'Triggering Cursor AI' });
        await this.pc.keyboardHotkey('ctrl+k'); // Cursor AI shortcut
        await this.pc.wait(2000);
        
        // Take screenshot to see response
        const responseScreenshot = await this.pc.takeScreenshot();
        const response = await analyzeScreen({
          imagePath: responseScreenshot.imagePath,
          prompt: 'What is the AI assistant showing? Copy any code or suggestions visible.'
        });
        steps.push({ action: 'ai_response', result: response.analysis });
      }

      // Step 6: Save file if needed
      if (task.saveAs) {
        this.emit('step', { action: 'Saving file', filename: task.saveAs });
        await this.pc.keyboardHotkey('ctrl+s');
        await this.pc.wait(500);
        await this.pc.keyboardType(task.saveAs);
        await this.pc.wait(500);
        await this.pc.keyboardHotkey('enter');
        steps.push({ action: 'save', filename: task.saveAs, success: true });
      }

      // Step 7: Run code if requested
      if (task.runCode) {
        this.emit('step', { action: 'Running code' });
        await this.pc.keyboardHotkey('ctrl+`'); // Open terminal
        await this.pc.wait(1000);
        
        const runCommand = task.runCommand || 'node ' + (task.saveAs || 'index.js');
        await this.pc.keyboardType(runCommand);
        await this.pc.keyboardHotkey('enter');
        await this.pc.wait(3000);

        // Capture output
        const outputScreenshot = await this.pc.takeScreenshot();
        const output = await analyzeScreen({
          imagePath: outputScreenshot.imagePath,
          prompt: 'What is shown in the terminal? Copy any output or errors.'
        });
        steps.push({ action: 'run', command: runCommand, output: output.analysis });
      }

      // Store in memory
      await this.memory.appendEvent({
        type: 'autopilot:complete',
        task,
        steps,
        timestamp: Date.now()
      });

      this.emit('task:complete', { task, steps });
      return { success: true, steps };

    } catch (error) {
      this.emit('task:error', { task, error: error.message });
      return { success: false, error: error.message, steps };
    }
  }

  async planAndExecute(userRequest) {
    // Use LLM to plan the task
    const planPrompt = `Given this user request: "${userRequest}"
    
Create a task plan for automating Cursor/VSCode. Return JSON:
{
  "prompt": "code or prompt to type",
  "useCursorAI": true/false,
  "saveAs": "filename.ext" or null,
  "runCode": true/false,
  "runCommand": "command to run" or null
}`;

    try {
      const planResponse = await this.llm.generateSuggestion({ prompt: planPrompt });
      const plan = JSON.parse(planResponse.match(/\{[\s\S]*\}/)?.[0] || '{}');
      
      this.emit('plan:created', { request: userRequest, plan });
      
      // Execute the plan
      return await this.executeTask(plan);
    } catch (error) {
      this.emit('plan:error', { request: userRequest, error: error.message });
      return { success: false, error: error.message };
    }
  }

  async stop() {
    this.running = false;
    this.emit('autopilot:stopped');
  }
}

module.exports = { CursorAutopilot };
