# AutoDev Assistant - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Step 1: Prerequisites
- **Node.js 18+** installed
- **OpenAI API Key** (get one at https://platform.openai.com)
- **Windows 10/11** (for full PC control features)

### Step 2: Installation
```bash
# Clone or download the project
cd "AutoDev Assistant"

# Install dependencies
npm install
```

### Step 3: Configuration
Create a `.env` file in the root directory:
```env
OPENAI_API_KEY=sk-your-key-here
```

### Step 4: Launch the System
```bash
# Start the backend server (in one terminal)
npm run backend

# Start the desktop UI (in another terminal)
npm run desktop
```

The glassmorphic UI will appear in the bottom-right corner of your screen!

## 🎮 How to Use

### Basic Commands
Type in the chat box or click quick action buttons:

- **📸 Capture** - Takes a screenshot
- **👁️ Analyze** - Analyzes what's on your screen
- **💻 Code** - Generates code based on your request
- **🔧 Fix** - Attempts to fix visible errors
- **🎯 Cursor** - Opens Cursor editor

### Example Prompts
- "What's on my screen?"
- "Write a Python function to sort a list"
- "Fix the error in the terminal"
- "Open Cursor and create a new file"
- "Explain this code"

### Automation Mode
Click **▶️ Auto** to start the autonomous loop:
- Observes your screen every 5 seconds
- Detects patterns (errors, TODOs, etc.)
- Suggests and executes actions
- Learns from outcomes

## 🔧 Troubleshooting

### "Connection Failed" Error
1. Make sure the backend is running (`npm run backend`)
2. Check that port 5178 is not in use
3. Look for the port number in `data/port` file

### "OpenAI API Error"
1. Verify your API key in `.env`
2. Check your OpenAI account has credits
3. Ensure you're using GPT-4o model access

### UI Not Appearing
1. Press `Ctrl+Shift+A` to toggle visibility
2. Check system tray for the app icon
3. Restart the desktop app

### Automation Not Working
1. Ensure screen capture permissions are granted
2. Check that PowerShell execution is allowed
3. Try running as administrator on Windows

## ⚡ Pro Tips

### Keyboard Shortcuts
- `Ctrl+Shift+A` - Show/hide the assistant
- `Ctrl+Shift+P` - Quick plan generation
- `Enter` in chat - Send message

### Best Practices
1. **Be Specific**: "Fix the TypeError on line 42" works better than "fix error"
2. **Use Context**: Keep relevant windows open when asking for help
3. **Review Actions**: Watch what the automation does to learn patterns
4. **Save Memory**: The system remembers your conversations and preferences

### Advanced Features
- **Vector Search**: System stores and searches semantic memories
- **Pattern Detection**: Automatically identifies TODOs, errors, etc.
- **Multi-Tool**: Combines vision, control, and code generation
- **Learning Loop**: Improves over time based on experiences

## 📊 System Status Indicators

- 🟢 **Green dot** = Connected and ready
- 🔴 **Red dot** = Disconnected from backend
- ⚡ **Blue messages** = AI responses
- 💚 **Green messages** = System notifications
- ❌ **Red messages** = Errors

## 🛠️ Customization

### Change UI Position
Edit `.autodevrc.json`:
```json
{
  "ui": {
    "position": "bottom-right"  // or "top-right", "bottom-left", etc.
  }
}
```

### Adjust Observation Interval
Edit `.autodevrc.json`:
```json
{
  "autonomous": {
    "observeInterval": 5000  // milliseconds
  }
}
```

### Use Local LLM (Ollama)
Edit `.autodevrc.json`:
```json
{
  "useLocalLLM": true,
  "ollama": {
    "model": "llama3.1:8b-instruct"
  }
}
```

## 📚 Next Steps

1. **Explore Features**: Try different commands and see what works
2. **Check Logs**: Look in `data/memory.json` for system history
3. **Customize**: Modify `.autodevrc.json` for your workflow
4. **Extend**: Add plugins in the `plugins/` directory
5. **Contribute**: Report issues or suggest improvements

## 🆘 Getting Help

- Check `SYSTEM_AUDIT.md` for detailed documentation
- Review `data/memory.json` for error logs
- Inspect browser console for frontend errors
- Check terminal output for backend errors

## 🎉 You're Ready!

The AutoDev Assistant is now your AI pair programmer that can:
- See what you're working on
- Write and execute code
- Control your development tools
- Learn from your patterns

Happy coding with your new AI assistant! 🚀
