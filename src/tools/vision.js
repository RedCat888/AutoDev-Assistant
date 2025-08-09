const path = require('path');
const fs = require('fs');
const screenshot = require('screenshot-desktop');
const axios = require('axios');

/**
 * Vision module for screen understanding via GPT-4o
 * Captures screenshots and analyzes them with vision-capable models
 */

async function captureScreen() {
  try {
    const dir = path.join(process.cwd(), 'data', 'screens');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `screen_${Date.now()}.png`);
    const img = await screenshot({ filename: file });
    // Verify file was created
    if (!fs.existsSync(file)) {
      throw new Error('Screenshot file was not created');
    }
    return file;
  } catch (error) {
    console.error('Screenshot error:', error);
    // Return a placeholder or throw
    throw new Error(`Failed to capture screen: ${error.message}`);
  }
}

async function analyzeScreen({ imagePath, prompt = 'Describe what you see on the screen, focusing on any development tools, code, or UI elements.', apiKey = process.env.OPENAI_API_KEY }) {
  if (!apiKey) {
    return { error: 'OpenAI API key not found', analysis: null };
  }

  try {
    // Read image and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Call GPT-4o with vision
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
            ]
          }
        ],
        max_tokens: 1000
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      analysis: response.data.choices[0].message.content,
      imagePath,
      timestamp: Date.now()
    };
  } catch (error) {
    return {
      error: error.message,
      analysis: null,
      imagePath
    };
  }
}

async function identifyUIElements({ imagePath, apiKey = process.env.OPENAI_API_KEY }) {
  const prompt = `Analyze this screen and return a JSON array of interactive UI elements you can see.
For each element include:
- type: button/link/input/code/terminal/menu
- label: visible text or description
- location: approximate position (top-left, center, bottom-right, etc)
- action: what clicking/interacting would do
- state: if relevant (active, disabled, selected, etc)

Focus on development tools, code editors, terminals, and browsers.
Return ONLY valid JSON array.`;

  const result = await analyzeScreen({ imagePath, prompt, apiKey });
  
  if (result.error) return result;
  
  try {
    // Extract JSON from response
    const jsonMatch = result.analysis.match(/\[[\s\S]*\]/);
    const elements = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    return { elements, imagePath };
  } catch {
    return { elements: [], imagePath, raw: result.analysis };
  }
}

module.exports = {
  captureScreen,
  analyzeScreen,
  identifyUIElements
};
