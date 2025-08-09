# AutoDev Assistant - Technical Architecture

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         User Interface                       │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Electron   │  │   Chat UI    │  │  Quick Actions   │  │
│  │   Desktop   │  │              │  │   (Buttons)      │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼─────────────────┼──────────────────┼─────────────┘
          │     WebSocket    │     REST API     │
          └─────────┬────────┴───────┬──────────┘
                    │                │
┌───────────────────▼────────────────▼────────────────────────┐
│                      Backend Server                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │               Express.js + WebSocket                  │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │                                   │
│  ┌──────────────────────▼───────────────────────────────┐  │
│  │                  Core Modules                         │  │
│  │                                                       │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │  │
│  │  │ Automation  │  │  Autonomous  │  │   Vision   │ │  │
│  │  │ Controller  │  │     Loop     │  │  Analysis  │ │  │
│  │  └─────────────┘  └──────────────┘  └────────────┘ │  │
│  │                                                       │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │  │
│  │  │ PC Control  │  │    Memory    │  │   Model    │ │  │
│  │  │  (Mouse/KB) │  │  Management  │  │   Router   │ │  │
│  │  └─────────────┘  └──────────────┘  └────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  External Services                     │  │
│  │                                                        │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │  │
│  │  │ OpenAI   │  │Anthropic │  │  Ollama  │           │  │
│  │  │   API    │  │   API    │  │  (Local) │           │  │
│  │  └──────────┘  └──────────┘  └──────────┘           │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Frontend Layer

#### Electron Desktop App (`desktop/`)
- **main.js**: Main process handling window creation, IPC, and system tray
- **preload.js**: Secure bridge between renderer and main process
- **ui.html**: Glassmorphic interface with chat and controls
- **ui-minimal.html**: Lightweight alternative UI

**Key Features:**
- Draggable, resizable window
- Ghost mode (click-through)
- Compact mode (minimal UI)
- Real-time WebSocket updates
- Keyboard shortcuts

### 2. Backend Server (`src/server.js`)

**Core Responsibilities:**
- REST API endpoints
- WebSocket connections
- Event broadcasting
- Request routing
- State management

**API Structure:**
```javascript
// Main endpoints
POST /api/suggest         // AI suggestions
POST /api/vision/capture  // Screenshot capture
POST /api/vision/analyze  // Image analysis
POST /api/control/mouse   // Mouse control
POST /api/control/keyboard // Keyboard control
POST /api/control/app     // App launch
POST /api/loop/start      // Start autonomous loop
POST /api/loop/pause      // Pause loop
GET  /api/memory/history  // Get chat history
WebSocket /ws            // Real-time updates
```

### 3. Agent Modules (`src/agent/`)

#### AutomationController (`automationController.js`)
**Purpose**: High-level orchestration of AI-driven automation

**Key Methods:**
- `processUserMessage()`: Routes messages to appropriate handlers
- `handleVisionTask()`: Processes vision-related requests
- `handleControlTask()`: Executes PC control commands
- `handleConversation()`: Manages chat interactions

**Flow:**
```
User Input → Intent Analysis → Task Routing → Execution → Response
```

#### AutonomousLoop (`autonomousLoop.js`)
**Purpose**: Implements OPAL cycle for continuous operation

**OPAL Cycle:**
```
┌─────────────────────────────────┐
│         OBSERVE                  │
│   (Screen capture & analysis)    │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│          PLAN                    │
│   (Task decomposition & strategy)│
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│           ACT                    │
│   (Execute planned actions)      │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│          LEARN                   │
│   (Store results & improve)      │
└─────────────────────────────────┘
```

**Key Features:**
- Task queue management
- Retry logic with exponential backoff
- Error recovery
- Memory optimization
- Resource cleanup

#### ModelRouter (`modelRouter.js`)
**Purpose**: Intelligent AI model selection

**Model Selection Logic:**
```javascript
taskType → requiredCapabilities → compatibleModels → ranking → selection
```

**Supported Models:**
- GPT-4o (vision, complex reasoning)
- GPT-4-turbo (code generation)
- GPT-3.5-turbo (fast responses)
- Claude-3-opus (creative tasks)
- Ollama models (local inference)

#### TaskHistoryManager (`taskHistoryManager.js`)
**Purpose**: Per-task context isolation

**Data Structure:**
```javascript
{
  taskId: "unique_identifier",
  type: "task_category",
  startTime: timestamp,
  conversation: [...messages],
  memories: [...contextual_info],
  actions: [...executed_actions],
  modelPreference: "preferred_model"
}
```

### 4. Tool Modules (`src/tools/`)

#### Vision (`vision.js`)
- Screenshot capture using `screenshot-desktop`
- Image storage and management
- Integration with GPT-4o vision API
- Screen region analysis

#### PC Control (`pc-control.js`)
- Mouse operations via `@nut-tree/nut-js`
- Keyboard input simulation
- Hotkey combinations
- Application launching
- Clipboard operations

#### Browser (`browser.js`)
- Puppeteer integration
- Web scraping
- Form automation
- JavaScript execution

#### Terminal (`terminal.js`)
- Command execution
- Output capture
- Process management
- Shell integration

### 5. Memory System

#### ChatHistory (`chatHistory.js`)
- Conversation context
- Message formatting
- Token management
- Context window optimization

#### MemoryStore (`memoryStore.js`)
- Event logging
- Action history
- Observation records
- Persistent storage

#### VectorStore (`vector.js`)
- Semantic search
- Embedding generation
- Similarity matching
- Knowledge retrieval

### 6. Utility Modules (`src/utils/`)

#### Logger (`logger.js`)
- Structured logging
- File rotation
- Performance timing
- Memory tracking

#### MemoryOptimizer (`memoryOptimizer.js`)
- Garbage collection
- Leak detection
- Resource monitoring
- Cleanup scheduling

## Data Flow

### 1. User Interaction Flow
```
User Input → UI → WebSocket/REST → Server → Agent → AI Model → Response → UI
```

### 2. Autonomous Operation Flow
```
Timer → Observe → Capture Screen → Analyze → Plan → Execute → Learn → Timer
```

### 3. Vision Processing Flow
```
Screen → Capture → Save Image → Send to GPT-4o → Parse Response → Action
```

## State Management

### Global State
- Server configuration
- Active connections
- Model statistics
- System status

### Session State
- Chat history
- Current task
- User preferences
- Active automations

### Persistent State
- Task history (`data/tasks/`)
- Screenshots (`data/screens/`)
- Memory store (`data/memory.json`)
- Vector embeddings (`data/vectors.json`)

## Security Considerations

### Current Implementation
1. **Process Isolation**: Electron context isolation
2. **IPC Security**: Validated message passing
3. **Input Validation**: Sanitized user inputs
4. **Rate Limiting**: API call throttling
5. **Error Boundaries**: Contained failures

### Planned Enhancements
1. **API Key Encryption**: Secure credential storage
2. **Sandboxing**: Isolated code execution
3. **Access Control**: Role-based permissions
4. **Audit Logging**: Security event tracking
5. **Network Security**: HTTPS/WSS protocols

## Performance Optimization

### Current Optimizations
1. **Lazy Loading**: On-demand module imports
2. **Caching**: Screenshot and API response caching
3. **Debouncing**: Rate-limited operations
4. **Async Operations**: Non-blocking I/O
5. **Resource Cleanup**: Automatic memory management

### Optimization Strategies
```javascript
// Example: Debounced screenshot capture
let captureTimeout;
function debouncedCapture() {
  clearTimeout(captureTimeout);
  captureTimeout = setTimeout(() => {
    vision.captureScreen();
  }, 500);
}

// Example: Resource cleanup
async function cleanupResources() {
  await cleanupOldScreenshots();
  await compactMemoryStore();
  if (global.gc) global.gc();
}
```

## Error Handling

### Error Hierarchy
```
┌─────────────────────┐
│   System Errors     │ → Crash recovery
├─────────────────────┤
│   API Errors        │ → Retry with fallback
├─────────────────────┤
│   Validation Errors │ → User feedback
├─────────────────────┤
│   Logic Errors      │ → Graceful degradation
└─────────────────────┘
```

### Recovery Strategies
1. **Exponential Backoff**: Increasing delays between retries
2. **Circuit Breaker**: Prevent cascading failures
3. **Fallback Models**: Alternative AI providers
4. **State Recovery**: Restore from last known good
5. **User Notification**: Clear error messaging

## Extension Points

### Plugin Architecture
```javascript
// Plugin interface
class AutoDevPlugin {
  constructor(context) {
    this.context = context;
  }
  
  async initialize() {}
  async execute(command, args) {}
  async cleanup() {}
}

// Plugin registration
automationController.registerPlugin('myPlugin', new MyPlugin());
```

### Event Hooks
- `beforeObserve`: Pre-observation processing
- `afterAnalyze`: Post-analysis actions
- `beforeExecute`: Pre-execution validation
- `afterExecute`: Post-execution cleanup
- `onError`: Error handling

### Custom Tools
```javascript
// Tool registration
toolRegistry.register('customTool', {
  name: 'Custom Tool',
  execute: async (params) => {
    // Tool logic
  }
});
```

## Testing Strategy

### Unit Tests
- Individual module testing
- Mock external dependencies
- Coverage targets: >80%

### Integration Tests
- End-to-end workflows
- API endpoint testing
- WebSocket communication

### Performance Tests
- Load testing
- Memory leak detection
- Response time benchmarks

### User Acceptance Tests
- Real-world scenarios
- UI interaction testing
- Cross-platform validation

## Deployment

### Development Setup
```bash
# Install dependencies
npm install

# Start backend
npm run backend

# Start desktop app
npm run desktop

# Development mode
npm run dev
```

### Production Build
```bash
# Build desktop app
npm run build:desktop

# Package for distribution
npm run package

# Create installer
npm run make
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 5178
CMD ["node", "src/server.js"]
```

## Monitoring & Observability

### Metrics Collection
- Response times
- Error rates
- API usage
- Memory consumption
- Active sessions

### Logging Levels
- **DEBUG**: Detailed execution flow
- **INFO**: Normal operations
- **WARN**: Potential issues
- **ERROR**: Failures requiring attention

### Health Checks
```javascript
GET /health → {
  status: "healthy",
  uptime: 3600,
  memory: { used: 250, total: 1024 },
  connections: 3,
  version: "1.0.0"
}
```

## Future Architecture Considerations

### Microservices Migration
- Separate vision service
- Independent automation service
- Dedicated AI gateway
- Distributed task queue

### Scalability Improvements
- Horizontal scaling
- Load balancing
- Caching layer (Redis)
- Message queue (RabbitMQ)

### Cloud Native Features
- Kubernetes deployment
- Service mesh integration
- Distributed tracing
- Centralized logging

---

*This architecture document reflects the current implementation and planned improvements for AutoDev Assistant.*
