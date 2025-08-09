const { randomUUID } = require('crypto');
const EventEmitter = require('events');

class Orchestrator extends EventEmitter {
  constructor({ memory, tools, llm }) {
    super();
    this.memory = memory; // memory interface
    this.tools = tools;   // { screen, terminal, fs, browser, editor, shell }
    this.llm = llm;       // llm router
    this.activeTasks = new Map();
  }

  async proposeActions(context) {
    const prompt = [
      'You are an autonomous junior developer agent. Analyze context and propose next actions.',
      'Respond in JSON with an array of steps: [{ id, title, rationale, tool, input }].',
      'Tools: screen.capture, ocr.extract, fs.read, fs.write, shell.exec, browser.open, editor.applyEdit',
      'Only propose safe and reversible actions for MVP.',
      '',
      'Context:',
      JSON.stringify(context, null, 2),
    ].join('\n');

    const raw = await this.llm.generateSuggestion({ prompt });
    let steps = [];
    try {
      const json = raw.match(/\[([\s\S]*)\]/);
      steps = JSON.parse(json ? json[0] : '[]');
    } catch (_) {
      steps = [];
    }
    return steps.map((s) => ({ id: s.id || randomUUID().slice(0, 8), ...s }));
  }

  async runStep(step) {
    const { tool, input } = step;
    this.emit('log', { level: 'info', message: `Running step: ${step.title}` });
    switch (tool) {
      case 'screen.capture':
        return this.tools.screen.capture();
      case 'ocr.extract':
        return this.tools.screen.ocr(input?.imagePath);
      case 'fs.read':
        return this.tools.fs.read(input?.path);
      case 'fs.write':
        return this.tools.fs.write(input?.path, input?.content);
      case 'shell.exec':
        return this.tools.shell.exec(input?.command, { cwd: input?.cwd });
      case 'browser.open':
        return this.tools.browser.open(input?.url);
      case 'editor.applyEdit':
        return this.tools.editor.applyEdit(input);
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  }

  async cycle(context) {
    const steps = await this.proposeActions(context);
    const results = [];
    for (const step of steps) {
      try {
        const result = await this.runStep(step);
        results.push({ step, ok: true, result });
        await this.memory.appendEvent({ type: 'step', step, result });
        this.emit('step:done', { step, result });
      } catch (e) {
        results.push({ step, ok: false, error: e.message });
        await this.memory.appendEvent({ type: 'error', step, error: e.message });
        this.emit('step:error', { step, error: e.message });
      }
    }
    return results;
  }
}

module.exports = { Orchestrator };


