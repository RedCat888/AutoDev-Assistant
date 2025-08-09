const axios = require('axios');

function createOllamaClient({ baseUrl, model }) {
  return {
    async generate(prompt) {
      const url = `${baseUrl.replace(/\/$/, '')}/api/generate`;
      const res = await axios.post(url, { model, prompt, stream: false });
      return res.data?.response ?? '';
    },
  };
}

function createOpenAiClient({ model }) {
  const key = process.env.OPENAI_API_KEY;
  return {
    async generate(prompt) {
      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
        },
        { headers: { Authorization: `Bearer ${key}` } }
      );
      return res.data?.choices?.[0]?.message?.content ?? '';
    },
  };
}

function buildPrompt({ prompt, filePath, lineNumber, rawLine }) {
  // Check if this is a conversational query vs code request
  const isConversational = !filePath && !lineNumber && !rawLine;
  
  if (isConversational) {
    return `You are AutoDev, an AI assistant helping a developer. 
The user said: "${prompt}"

Respond naturally and helpfully. If they're asking about code, provide clear explanations or solutions.
If they're asking what you can do, explain your capabilities (screen analysis, code generation, automation).
Do NOT respond with random code examples unless specifically asked for code.
Be conversational and helpful.`;
  }
  
  return [
    'You are AutoDev, an expert software engineer.',
    'Respond with a concise, high-quality code suggestion suitable for direct insertion.',
    'Include only the essential code. No explanations unless needed as minimal inline comments.',
    filePath ? `File: ${filePath}` : '',
    lineNumber ? `Line: ${lineNumber}` : '',
    rawLine ? `LineText: ${rawLine}` : '',
    '',
    `Task: ${prompt}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function createLlmRouter(config) {
  const useLocal = !!config.useLocalLLM;
  const ollama = createOllamaClient({
    baseUrl: config.ollama?.baseUrl || 'http://localhost:11434',
    model: config.ollama?.model || 'llama3.1:8b-instruct',
  });
  const openai = createOpenAiClient({ model: config.openai?.model || 'gpt-4o-mini' });

  return {
    async generateSuggestion(task) {
      const p = buildPrompt(task);
      try {
        if (useLocal) return await ollama.generate(p);
        return await openai.generate(p);
      } catch (err) {
        const language = 'TypeScript';
        const fnName = 'autoDevSuggestion';
        const args = '...args';
        const fallback = `// Fallback suggestion (LLM unavailable)\n// Task: ${task.prompt}\nfunction ${fnName}(${args}) {\n  // TODO: implement\n  return null;\n}`;
        return fallback;
      }
    },
  };
}

module.exports = { createLlmRouter };


