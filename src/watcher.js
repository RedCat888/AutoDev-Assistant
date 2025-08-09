const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');

function shouldWatchFile(filePath, extensions) {
  if (!extensions || extensions.length === 0) return true;
  const ext = path.extname(filePath).toLowerCase();
  return extensions.includes(ext);
}

function extractTodosFromText(text, triggerPattern, prefixes) {
  const lines = text.split(/\r?\n/);
  const todos = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const hasPrefix = prefixes?.some((p) => line.trim().startsWith(p + triggerPattern))
      || line.includes(triggerPattern);
    if (hasPrefix) {
      const idx = line.indexOf(triggerPattern);
      const prompt = line.slice(idx + triggerPattern.length).trim();
      if (prompt.length > 0) {
        todos.push({ lineNumber: i + 1, prompt, rawLine: line });
      }
    }
  }
  return todos;
}

function createWatcher({ config = {}, onTodo, paths, patterns, onTrigger }) {
  // Support both old and new API
  const watchPaths = paths || (config.watch?.paths || []).map((p) => path.resolve(process.cwd(), p));
  if (!watchPaths || watchPaths.length === 0) return { start: () => {}, stop: () => {} };

  const ignored = config.watch?.ignore || [];
  const watcher = chokidar.watch(watchPaths, {
    ignored: (p) => ignored.some((ig) => p.includes(ig)),
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });

  watcher.on('change', (filePath) => {
    if (!shouldWatchFile(filePath, config.watch?.extensions)) return;
    try {
      const text = fs.readFileSync(filePath, 'utf-8');
      
      if (onTrigger && patterns) {
        // New API - support custom patterns
        const lines = text.split('\n');
        lines.forEach((line, idx) => {
          Object.entries(patterns).forEach(([patternName, regex]) => {
            if (regex.test(line)) {
              onTrigger({ 
                filePath, 
                lineNumber: idx + 1, 
                rawLine: line.trim(), 
                pattern: patternName 
              });
            }
          });
        });
      } else if (onTodo) {
        // Old API - extract TODOs
        const items = extractTodosFromText(
          text,
          config.trigger?.pattern || 'TODO:',
          config.trigger?.prefixes || ['// ', '# ']
        );
        items.forEach((t) => onTodo({ filePath, ...t }));
      }
    } catch (e) {
      console.error('Watcher error:', e.message);
    }
  });

  // Initial scan (optional)
  watcher.on('add', (filePath) => {
    if (!shouldWatchFile(filePath, config.watch?.extensions)) return;
  });

  // Return object with start/stop methods
  return {
    start: () => console.log('Watcher started'),
    stop: () => watcher.close()
  };
}

module.exports = { createWatcher };


