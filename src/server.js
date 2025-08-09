require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

// Core modules
const { createLlmRouter } = require('./llm');
const { createWatcher } = require('./watcher');
const { MemoryStore } = require('./agent/memory');
const { Orchestrator } = require('./agent/orchestrator');
const { VectorStore } = require('./memory/vector');
const { TaskHistoryManager } = require('./agent/taskHistoryManager');
const { ModelRouter } = require('./agent/modelRouter');
const { DocumentationReader } = require('./agent/documentationReader');
const screenTools = require('./tools/screen');
const fsio = require('./tools/fsio');
const shell = require('./tools/shell');
const browser = require('./tools/browser');
const editor = require('./tools/editor');
const { createTerminalWatcher } = require('./watchers/terminal');
const { computeDiff } = require('./diff');
const { ensureRepo, createBranch, commitAll } = require('./git');
const { isPathAllowed } = require('./safety');
const { loadPlugins } = require('./plugins/loader');
const { captureScreen, analyzeScreen, identifyUIElements } = require('./tools/vision');
const { PCControl } = require('./tools/pc-control');
const { CursorAutopilot } = require('./agent/autopilot');
const { AutomationController } = require('./agent/automationController');
const { AutonomousLoop } = require('./agent/autonomousLoop');
const { createPythonBridge } = require('./agent/pythonBridge');

const configPath = path.resolve(process.cwd(), '.autodevrc.json');
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  : {
      server: { port: 5178, wsPath: '/ws' },
      ui: { theme: 'glassmorphic-blue', position: 'bottom-right' },
      openai: { model: 'gpt-4o' },
      safety: { dryRun: false, confirmActions: false }
    };

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: config.server.wsPath || '/ws' });

const llm = createLlmRouter(config);

// Enhanced modules
const taskHistory = new TaskHistoryManager();
const modelRouter = new ModelRouter(config);
const docReader = new DocumentationReader(config);

// Python AI Bridge (optional advanced AI features)
let pythonBridge = null;
if (config.pythonAI && config.pythonAI.enabled) {
  pythonBridge = createPythonBridge(config.pythonAI);
  pythonBridge.initialize().catch(err => {
    console.error('Failed to initialize Python AI bridge:', err);
  });
}

// Agent orchestrator
const memory = new MemoryStore();
const vstore = new VectorStore();
const orchestrator = new Orchestrator({
  memory,
  llm,
  tools: { screen: screenTools, fs: fsio, shell, browser, editor },
});

// Unified automation controller with chat history
const automationController = new AutomationController({
  llm,
  memory,
  config
});

// Listen for automation events
automationController.on('status', (msg) => broadcast({ type: 'status', message: msg }));
automationController.on('automation:start', (task) => broadcast({ type: 'automation:start', task }));
automationController.on('automation:step', (step) => broadcast({ type: 'automation:step', step }));
automationController.on('automation:complete', (steps) => broadcast({ type: 'automation:complete', steps }));
automationController.on('automation:error', (error) => broadcast({ type: 'automation:error', error: error.message }));

// Autonomous loop
const autonomousLoop = new AutonomousLoop({
  llm,
  memory,
  orchestrator,
  config
});

// Listen for loop events
autonomousLoop.on('loop:start', () => broadcast({ type: 'loop:status', status: 'started' }));
autonomousLoop.on('loop:stop', () => broadcast({ type: 'loop:status', status: 'stopped' }));
autonomousLoop.on('observe:complete', (data) => broadcast({ type: 'observe', ...data }));
autonomousLoop.on('plan:complete', (plan) => broadcast({ type: 'plan', plan }));
autonomousLoop.on('act:step', (step) => broadcast({ type: 'action', step }));
autonomousLoop.on('task:complete', (task) => broadcast({ type: 'task:complete', task }));

function broadcast(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, version: '2.0.0' }));

// Main suggestion endpoint - SIMPLIFIED FOR BASIC FUNCTIONALITY
app.post('/api/suggest', async (req, res) => {
  try {
    const { prompt, filePath, lineNumber } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    
    console.log('Received prompt:', prompt);
    
    // Simple direct call to LLM without all the complexity
    const response = await llm.generateSuggestion({ 
      prompt, 
      filePath, 
      lineNumber 
    });
    
    const payload = { 
      type: 'suggestion', 
      suggestion: response, 
      filePath, 
      lineNumber, 
      ts: Date.now()
    };
    
    broadcast(payload);
    res.json(payload);
    console.log('Sent response');
  } catch (e) { 
    console.error('Suggest error:', e);
    res.status(500).json({ error: e.message || 'failed to generate suggestion' }); 
  }
});

// Chat history endpoints
app.get('/api/chat/history', (_req, res) => {
  res.json({ history: automationController.getChatHistory() });
});

app.delete('/api/chat/history', (_req, res) => {
  automationController.clearHistory();
  res.json({ ok: true });
});

// Vector memory
app.post('/api/memory/add', async (req, res) => {
  const { text, meta } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  const id = await vstore.add(text, meta);
  res.json({ id });
});

app.post('/api/memory/search', async (req, res) => {
  const { query, limit = 5 } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query required' });
  const results = await vstore.search(query, limit);
  res.json({ results });
});

// Plan generation
app.post('/api/plan', async (req, res) => {
  try {
    const { goal } = req.body || {};
    const plan = await orchestrator.generatePlan(goal || 'Analyze current development state');
    broadcast({ type: 'plan:generated', plan });
    res.json({ plan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Execute plan
app.post('/api/execute', async (req, res) => {
  try {
    const { plan } = req.body || {};
    if (!plan) return res.status(400).json({ error: 'plan required' });
    orchestrator.executePlan(plan);
    res.json({ ok: true, message: 'Plan execution started' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Vision endpoints
app.post('/api/vision/capture', async (_req, res) => {
  try {
    const imagePath = await captureScreen();
    res.json({ ok: true, imagePath });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/vision/analyze', async (req, res) => {
  try {
    const { imagePath, prompt } = req.body || {};
    const result = await analyzeScreen({ imagePath, prompt });
    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/vision/identify', async (req, res) => {
  try {
    const { imagePath } = req.body || {};
    const result = await identifyUIElements({ imagePath });
    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// PC Control endpoints
const pcControl = new PCControl({ dryRun: false, confirmActions: false });

app.post('/api/control/mouse/click', async (req, res) => {
  try {
    const { button, x, y } = req.body || {};
    const result = await pcControl.mouseClick(button, x, y);
    broadcast({ type: 'control:mouse', action: 'click', button, x, y });
    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/control/mouse/move', async (req, res) => {
  try {
    const { x, y } = req.body || {};
    const result = await pcControl.mouseMove(x, y);
    broadcast({ type: 'control:mouse', action: 'move', x, y });
    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/control/keyboard/type', async (req, res) => {
  try {
    const { text } = req.body || {};
    const result = await pcControl.keyboardType(text);
    broadcast({ type: 'control:keyboard', action: 'type', text });
    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/control/keyboard/hotkey', async (req, res) => {
  try {
    const { keys } = req.body || {};
    const result = await pcControl.keyboardHotkey(keys);
    broadcast({ type: 'control:keyboard', action: 'hotkey', keys });
    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/control/app/open', async (req, res) => {
  try {
    const { appName } = req.body || {};
    const result = await pcControl.openApplication(appName);
    broadcast({ type: 'control:app', action: 'open', appName });
    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Autonomous loop control
app.post('/api/loop/start', (_req, res) => {
  autonomousLoop.start();
  res.json({ ok: true, status: 'started' });
});

app.post('/api/loop/stop', (_req, res) => {
  autonomousLoop.stop();
  res.json({ ok: true, status: 'stopped' });
});

app.post('/api/loop/pause', (_req, res) => {
  autonomousLoop.pause();
  res.json({ ok: true, status: 'paused' });
});

app.post('/api/loop/resume', (_req, res) => {
  autonomousLoop.resume();
  res.json({ ok: true, status: 'resumed' });
});

app.get('/api/loop/status', (_req, res) => {
  res.json(autonomousLoop.getState());
});

app.post('/api/loop/queue', (req, res) => {
  const { task } = req.body || {};
  if (!task) return res.status(400).json({ error: 'task required' });
  const taskId = autonomousLoop.queueTask(task);
  res.json({ ok: true, taskId });
});

// Cursor Autopilot
const autopilot = new CursorAutopilot({ config, memory, dryRun: false });

app.post('/api/autopilot/execute', async (req, res) => {
  try {
    const { task } = req.body || {};
    if (!task) return res.status(400).json({ error: 'task required' });
    
    broadcast({ type: 'autopilot:start', task });
    
    // Execute task
    await autopilot.executeTask(task);
    
    broadcast({ type: 'autopilot:complete', task });
    res.json({ ok: true, message: 'Task executed' });
  } catch (e) { 
    broadcast({ type: 'autopilot:error', error: e.message });
    res.status(500).json({ ok: false, error: e.message }); 
  }
});

// Git operations
app.post('/api/git/init', async (_req, res) => {
  try {
    await ensureRepo();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/git/branch', async (req, res) => {
  try {
    const { name } = req.body || {};
    await createBranch(name || `autodev-${Date.now()}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/git/commit', async (req, res) => {
  try {
    const { message } = req.body || {};
    await commitAll(message || 'AutoDev changes');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Diff operations
app.post('/api/diff', (req, res) => {
  const { oldText, newText } = req.body || {};
  const diff = computeDiff(oldText || '', newText || '');
  res.json({ diff });
});

// Plugin loading
app.post('/api/plugins/load', async (_req, res) => {
  try {
    const plugins = await loadPlugins();
    res.json({ ok: true, plugins: plugins.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// WebSocket connection
wss.on('connection', (ws) => {
  console.log('Client connected');
  ws.send(JSON.stringify({ type: 'connected', config }));
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'suggest') {
        const response = await automationController.processUserMessage(data.prompt);
        ws.send(JSON.stringify({ 
          type: 'suggestion', 
          suggestion: response,
          history: automationController.getChatHistory()
        }));
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });
  
  ws.on('close', () => console.log('Client disconnected'));
});

// File watchers
if (config.watchers?.enabled !== false) {
  try {
    const watcher = createWatcher({
      paths: config.watchers?.paths || [process.cwd()],
      patterns: config.watchers?.patterns || { todo: /TODO:|FIXME:/gi },
      onTrigger: async ({ filePath, lineNumber, rawLine, pattern }) => {
        const suggestion = await llm.generateSuggestion({
          prompt: `Found ${pattern}: ${rawLine}`,
          filePath,
          lineNumber,
        });
        broadcast({ type: 'suggestion', suggestion, filePath, lineNumber });
      },
    });
    watcher.start();
  } catch (e) {
    console.log('Watcher initialization skipped:', e.message);
  }
}

// Terminal watcher
if (config.terminal?.watch) {
  const termWatcher = createTerminalWatcher({
    onError: async (error) => {
      const suggestion = await llm.generateSuggestion({
        prompt: `Fix this error: ${error}`,
      });
      broadcast({ type: 'terminal:error', error, suggestion });
    },
  });
  termWatcher.start();
}

// Start server
const PORT = process.env.PORT || config.server?.port || 5178;

// Kill any existing process on the port
const { exec } = require('child_process');
if (process.platform === 'win32') {
  exec(`netstat -ano | findstr :${PORT}`, (err, stdout) => {
    if (!err && stdout) {
      const lines = stdout.trim().split('\n');
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          exec(`taskkill /F /PID ${pid}`, () => {});
        }
      });
    }
    
    // Start server after cleanup
    setTimeout(() => {
      server.listen(PORT, () => {
        console.log(`🚀 AutoDev Assistant running on http://localhost:${PORT}`);
        console.log(`🔌 WebSocket: ws://localhost:${PORT}${config.server.wsPath || '/ws'}`);
        
        // Write port to file for desktop app
        const portFile = path.join(process.cwd(), 'data', 'port');
        fs.mkdirSync(path.dirname(portFile), { recursive: true });
        fs.writeFileSync(portFile, PORT.toString());
        
        // Start autonomous loop if configured
        if (config.autonomous?.autoStart) {
          autonomousLoop.start();
        }
      });
    }, 1000);
  });
} else {
  server.listen(PORT, () => {
    console.log(`🚀 AutoDev Assistant running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}${config.server.wsPath || '/ws'}`);
    
    // Write port to file
    const portFile = path.join(process.cwd(), 'data', 'port');
    fs.mkdirSync(path.dirname(portFile), { recursive: true });
    fs.writeFileSync(portFile, PORT.toString());
  });
}

// Task management endpoints
app.get('/api/tasks', (_req, res) => {
  res.json({ tasks: taskHistory.getActiveTasks() });
});

app.post('/api/tasks/:taskId/complete', (req, res) => {
  const { taskId } = req.params;
  const { summary } = req.body || {};
  taskHistory.completeTask(taskId, summary);
  res.json({ ok: true });
});

app.get('/api/tasks/:taskId/context', (req, res) => {
  const { taskId } = req.params;
  const context = taskHistory.getTaskContext(taskId);
  res.json({ context });
});

// Documentation endpoints
app.post('/api/docs/read', async (req, res) => {
  const { filePath, taskType, query } = req.body || {};
  const docs = await docReader.readDocumentationForTask({ filePath, taskType, query });
  res.json({ docs });
});

// Model routing endpoints
app.post('/api/models/route', async (req, res) => {
  const { task } = req.body || {};
  const selection = await modelRouter.routeTask(task);
  res.json({ selection });
});

app.get('/api/models/stats', (_req, res) => {
  res.json({ stats: modelRouter.getStatistics() });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  autonomousLoop.stop();
  
  // Clean up old tasks
  taskHistory.cleanupOldTasks(7);
  
  // Clear documentation cache
  docReader.clearCache();
  
  server.close(() => process.exit(0));
});