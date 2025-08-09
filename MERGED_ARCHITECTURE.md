# AutoDev Assistant - Merged Architecture (v2.0)

## Overview

This document describes the merged architecture of AutoDev Assistant, combining the best features of JavaScript and Python implementations into a unified, enterprise-grade autonomous AI coding assistant.

## Architecture Decision

After analyzing both implementations, we chose **JavaScript/Node.js as the primary platform** with an **optional Python AI module** for advanced AI capabilities. This decision was based on:

### Why JavaScript as Primary:
- ✅ **Complete implementation**: All core features already working
- ✅ **Electron desktop app**: Cross-platform UI with real-time updates
- ✅ **Native async/await**: Better for I/O-heavy operations
- ✅ **npm ecosystem**: Rich package availability
- ✅ **WebSocket support**: Real-time communication built-in
- ✅ **PC control integration**: Works seamlessly with OS automation

### Python AI Module (Optional):
- ✅ **Advanced AI models**: Better support for ML/AI libraries
- ✅ **Model flexibility**: Easy integration with Transformers, PyTorch
- ✅ **Scientific computing**: NumPy, pandas for data processing
- ✅ **Specialized tasks**: Computer vision, NLP, embeddings

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                           │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Electron   │  │   Web UI     │  │   REST API Client    │  │
│  │   Desktop   │  │  (Browser)   │  │   (External Apps)    │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────────┘  │
└─────────┼─────────────────┼──────────────────┼─────────────────┘
          │     WebSocket    │     REST API     │
          └─────────┬────────┴───────┬──────────┘
                    │                │
┌───────────────────▼────────────────▼────────────────────────────┐
│                    JavaScript Backend (Node.js)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Express.js Server                       │  │
│  └──────────────────────┬───────────────────────────────────┘  │
│                         │                                       │
│  ┌──────────────────────▼───────────────────────────────────┐  │
│  │                    Core Modules                           │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │  │
│  │  │ Orchestrator │  │ Autonomous   │  │ Task History  │  │  │
│  │  │              │  │    Loop      │  │   Manager     │  │  │
│  │  └──────────────┘  └──────────────┘  └───────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │  │
│  │  │ Model Router │  │   Memory     │  │  PC Control   │  │  │
│  │  │              │  │  Management  │  │  (Mouse/KB)   │  │  │
│  │  └──────────────┘  └──────────────┘  └───────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────▼───────────────────────────────┐  │
│  │                   Python AI Bridge                        │  │
│  │                    (Optional Module)                      │  │
│  └───────────────────────────┬───────────────────────────────┘  │
└──────────────────────────────┼───────────────────────────────────┘
                               │ JSON-RPC
┌──────────────────────────────▼───────────────────────────────────┐
│                      Python AI Module                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Model Router                           │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │   │
│  │  │  Claude  │  │   GPT-4  │  │  Gemini  │  │  Local  │ │   │
│  │  │   API    │  │    API   │  │    API   │  │   LLM   │ │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Specialized AI Capabilities                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │   Vision     │  │  Embeddings  │  │    Code      │   │   │
│  │  │  Analysis    │  │   & Vector   │  │  Generation  │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
AutoDev-Assistant/
├── src/                      # JavaScript backend
│   ├── server.js            # Main Express server
│   ├── agent/               # AI agent modules
│   │   ├── orchestrator.js  # Task orchestration
│   │   ├── autonomousLoop.js # OPAL cycle implementation
│   │   ├── taskHistoryManager.js # Per-task memory
│   │   ├── modelRouter.js   # AI model routing
│   │   ├── pythonBridge.js  # Python AI interface (NEW)
│   │   └── ...
│   ├── tools/               # System tools
│   │   ├── screen.js        # Screen capture
│   │   ├── pc-control.js    # Mouse/keyboard control
│   │   ├── vision.js        # Image analysis
│   │   └── ...
│   └── utils/               # Utilities
│
├── python_ai/               # Python AI module (NEW)
│   ├── bridge.py           # JSON-RPC bridge
│   ├── models/             # AI model implementations
│   │   ├── base.py         # Base model class
│   │   ├── router.py       # Model routing logic
│   │   ├── claude.py       # Claude API
│   │   ├── gpt4o.py        # GPT-4 API
│   │   └── local_llm.py    # Local models
│   ├── core/               # Core AI logic
│   ├── vision/             # Computer vision
│   └── requirements.txt    # Python dependencies
│
├── desktop/                 # Electron app
│   ├── main.js             # Main process
│   ├── preload.js          # Security bridge
│   └── ui.html             # User interface
│
├── data/                    # Runtime data
│   ├── tasks/              # Task history
│   └── screens/            # Screenshots
│
├── package.json            # Node.js dependencies
├── .autodevrc.json         # Configuration
└── README.md               # Documentation
```

## Key Features

### 1. Multi-Language AI Processing
- **JavaScript**: Primary orchestration and real-time operations
- **Python**: Advanced AI models and specialized processing
- **Seamless Integration**: JSON-RPC bridge for cross-language calls

### 2. Intelligent Model Routing
- **Task-based routing**: Automatically selects best model for task type
- **Fallback chains**: Graceful degradation if primary model fails
- **Cost optimization**: Uses cheaper models for simple tasks

### 3. Enhanced Memory Management
- **Per-task isolation**: Separate context for each task
- **Vector embeddings**: Semantic search in conversation history
- **Automatic cleanup**: Prevents memory leaks in long sessions

### 4. Screen Control & Automation
- **Vision analysis**: GPT-4V for understanding screen content
- **PC control**: Mouse, keyboard, and application automation
- **Cross-platform**: Works on Windows, macOS, Linux

### 5. Autonomous Operation
- **OPAL cycle**: Observe → Plan → Act → Learn
- **Self-correction**: Detects and fixes errors automatically
- **Long-running**: Optimized for 3+ hour continuous operation

## Configuration

### Basic Configuration (.autodevrc.json)
```json
{
  "openai": {
    "model": "gpt-4o-mini"
  },
  "pythonAI": {
    "enabled": false,  // Enable Python AI module
    "pythonPath": "python3",
    "models": {
      "claude": {
        "enabled": true,
        "apiKey": "${ANTHROPIC_API_KEY}"
      }
    }
  },
  "server": {
    "httpPort": 5178,
    "wsPath": "/ws"
  }
}
```

### Environment Variables (.env)
```bash
# Required
OPENAI_API_KEY=your_openai_key

# Optional (for Python AI module)
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_key
```

## Installation & Setup

### JavaScript Backend (Required)
```bash
# Install Node.js dependencies
npm install

# Start the server
npm start
```

### Python AI Module (Optional)
```bash
# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r python_ai/requirements.txt

# Enable in configuration
# Set pythonAI.enabled = true in .autodevrc.json
```

### Desktop App (Optional)
```bash
# Run Electron desktop app
npm run desktop
```

## API Endpoints

### Core Endpoints
- `POST /api/suggest` - Get AI suggestions
- `POST /api/vision/capture` - Capture screenshot
- `POST /api/vision/analyze` - Analyze image
- `POST /api/control/mouse` - Mouse control
- `POST /api/control/keyboard` - Keyboard input
- `POST /api/loop/start` - Start autonomous loop
- `WebSocket /ws` - Real-time updates

### Python AI Bridge (when enabled)
- `POST /api/python/generate` - Generate using Python models
- `POST /api/python/analyze` - Advanced image analysis
- `GET /api/python/models` - List available Python models

## Performance Optimizations

### JavaScript Optimizations
- Event-driven architecture for low latency
- WebSocket connection pooling
- Async/await for non-blocking I/O
- Memory-mapped file caching

### Python Optimizations
- Process pooling for parallel inference
- Model caching to avoid reload
- Batch processing for multiple requests
- Lazy loading of heavy dependencies

## Security Considerations

- **Sandboxed execution**: All code runs in isolated environments
- **Path validation**: Prevents directory traversal attacks
- **API key encryption**: Secure storage of credentials
- **Rate limiting**: Prevents abuse of AI APIs
- **CORS configuration**: Controlled cross-origin access

## Future Enhancements

1. **Plugin System**: Extensible architecture for custom tools
2. **Multi-agent**: Coordinate multiple AI agents for complex tasks
3. **Fine-tuning**: Custom models for specific domains
4. **Distributed**: Scale across multiple machines
5. **Mobile App**: iOS/Android companion apps

## Migration Guide

### From Pure JavaScript
No changes needed - the JavaScript implementation remains the primary system.

### From Pure Python
1. Install Node.js and npm
2. Copy Python AI logic to `python_ai/` directory
3. Implement model classes extending `BaseModel`
4. Enable Python bridge in configuration

## Troubleshooting

### Python Bridge Not Starting
- Check Python path in configuration
- Verify Python dependencies installed
- Check logs in `data/logs/python_ai.log`

### Memory Issues
- Enable memory optimizer in config
- Reduce context window size
- Clear task history periodically

### Model Timeouts
- Increase timeout in model configuration
- Check network connectivity
- Verify API keys are valid

## Contributing

1. Fork the repository
2. Create feature branch
3. Follow code style (ESLint for JS, Black for Python)
4. Add tests for new features
5. Submit pull request

## License

MIT License - See LICENSE file for details