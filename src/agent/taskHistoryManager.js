const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Task History Manager
 * Maintains separate conversation and memory context for each task
 * Enables task-specific learning and context preservation
 */
class TaskHistoryManager {
  constructor(dataDir = path.join(process.cwd(), 'data', 'tasks')) {
    this.dataDir = dataDir;
    this.activeTasks = new Map();
    this.taskIndex = new Map();
    
    // Ensure data directory exists
    fs.mkdirSync(this.dataDir, { recursive: true });
    
    // Load task index
    this.loadTaskIndex();
  }

  /**
   * Create a new task with unique ID and initial context
   * @param {Object} params - Task parameters
   * @returns {string} Task ID
   */
  createTask({ name, type, context, metadata = {} }) {
    const taskId = this.generateTaskId(name);
    
    const task = {
      id: taskId,
      name,
      type, // 'coding', 'debugging', 'documentation', 'automation', etc.
      status: 'active',
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      context: context || {},
      metadata,
      history: [],
      memories: [],
      actions: [],
      learnings: [],
      modelPreferences: this.getModelPreferences(type)
    };
    
    this.activeTasks.set(taskId, task);
    this.taskIndex.set(taskId, { name, type, createdAt: task.createdAt });
    this.saveTask(taskId);
    this.saveTaskIndex();
    
    return taskId;
  }

  /**
   * Add an interaction to task history
   * @param {string} taskId - Task identifier
   * @param {Object} interaction - Interaction data
   */
  addInteraction(taskId, interaction) {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    
    const entry = {
      timestamp: Date.now(),
      type: interaction.type, // 'user_input', 'ai_response', 'action', 'observation'
      role: interaction.role,
      content: interaction.content,
      metadata: interaction.metadata || {},
      modelUsed: interaction.modelUsed
    };
    
    task.history.push(entry);
    task.lastUpdated = Date.now();
    
    // Keep history manageable (last 100 interactions)
    if (task.history.length > 100) {
      // Archive old history before trimming
      this.archiveOldHistory(taskId, task.history.slice(0, -100));
      task.history = task.history.slice(-100);
    }
    
    this.saveTask(taskId);
    return entry;
  }

  /**
   * Add a memory/learning to the task
   * @param {string} taskId - Task identifier
   * @param {Object} memory - Memory to store
   */
  addMemory(taskId, memory) {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    
    const memoryEntry = {
      timestamp: Date.now(),
      type: memory.type, // 'pattern', 'solution', 'error', 'preference'
      content: memory.content,
      importance: memory.importance || 'normal',
      metadata: memory.metadata || {}
    };
    
    task.memories.push(memoryEntry);
    task.lastUpdated = Date.now();
    
    // Keep only important memories after limit
    if (task.memories.length > 50) {
      task.memories = task.memories
        .sort((a, b) => {
          const importanceWeight = { high: 3, normal: 1, low: 0 };
          return (importanceWeight[b.importance] || 1) - (importanceWeight[a.importance] || 1);
        })
        .slice(0, 30);
    }
    
    this.saveTask(taskId);
    return memoryEntry;
  }

  /**
   * Record an action taken for the task
   * @param {string} taskId - Task identifier
   * @param {Object} action - Action details
   */
  recordAction(taskId, action) {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    
    const actionEntry = {
      timestamp: Date.now(),
      type: action.type,
      description: action.description,
      success: action.success,
      result: action.result,
      error: action.error,
      duration: action.duration
    };
    
    task.actions.push(actionEntry);
    task.lastUpdated = Date.now();
    
    // Analyze patterns in actions for learning
    if (task.actions.length % 10 === 0) {
      this.analyzeActionPatterns(taskId);
    }
    
    this.saveTask(taskId);
    return actionEntry;
  }

  /**
   * Get task context for AI prompts
   * @param {string} taskId - Task identifier
   * @param {number} historyLimit - Number of recent interactions to include
   * @returns {Object} Formatted context
   */
  getTaskContext(taskId, historyLimit = 10) {
    const task = this.getTask(taskId);
    if (!task) return null;
    
    const recentHistory = task.history.slice(-historyLimit);
    const importantMemories = task.memories.filter(m => m.importance === 'high');
    const recentActions = task.actions.slice(-5);
    
    return {
      taskInfo: {
        id: task.id,
        name: task.name,
        type: task.type,
        duration: Date.now() - task.createdAt,
        status: task.status
      },
      conversation: recentHistory.map(h => ({
        role: h.role,
        content: h.content,
        timestamp: h.timestamp
      })),
      memories: importantMemories.map(m => m.content),
      recentActions: recentActions.map(a => ({
        type: a.type,
        success: a.success,
        description: a.description
      })),
      learnings: task.learnings.slice(-3),
      metadata: task.metadata
    };
  }

  /**
   * Get model preferences for task type
   * @param {string} taskType - Type of task
   * @returns {Object} Model preferences
   */
  getModelPreferences(taskType) {
    const preferences = {
      'vision': {
        primary: 'gpt-4o',
        fallback: 'gpt-4-vision-preview',
        reasoning: 'Vision tasks require image understanding'
      },
      'coding': {
        primary: 'gpt-4-turbo-preview',
        fallback: 'claude-3-opus',
        reasoning: 'Complex coding needs advanced reasoning'
      },
      'debugging': {
        primary: 'gpt-4-turbo-preview',
        fallback: 'gpt-4o',
        reasoning: 'Debugging requires careful analysis'
      },
      'documentation': {
        primary: 'gpt-4o-mini',
        fallback: 'gpt-3.5-turbo',
        reasoning: 'Documentation is straightforward text generation'
      },
      'automation': {
        primary: 'gpt-4o-mini',
        fallback: 'gpt-3.5-turbo',
        reasoning: 'Simple control flow can use faster models'
      },
      'planning': {
        primary: 'gpt-4-turbo-preview',
        fallback: 'claude-3-opus',
        reasoning: 'Planning requires strategic thinking'
      }
    };
    
    return preferences[taskType] || preferences['coding'];
  }

  /**
   * Analyze action patterns for learning
   * @param {string} taskId - Task identifier
   */
  analyzeActionPatterns(taskId) {
    const task = this.getTask(taskId);
    if (!task) return;
    
    const recentActions = task.actions.slice(-20);
    const successRate = recentActions.filter(a => a.success).length / recentActions.length;
    const commonErrors = {};
    
    recentActions.forEach(action => {
      if (!action.success && action.error) {
        commonErrors[action.error] = (commonErrors[action.error] || 0) + 1;
      }
    });
    
    const learning = {
      timestamp: Date.now(),
      type: 'pattern_analysis',
      insights: {
        successRate,
        totalActions: task.actions.length,
        commonErrors: Object.entries(commonErrors)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([error, count]) => ({ error, count }))
      }
    };
    
    if (successRate < 0.5) {
      learning.recommendation = 'Task experiencing difficulties - consider changing approach';
    }
    
    task.learnings.push(learning);
    this.saveTask(taskId);
  }

  /**
   * Load a task from disk or memory
   * @param {string} taskId - Task identifier
   * @returns {Object} Task object
   */
  getTask(taskId) {
    // Check active tasks first
    if (this.activeTasks.has(taskId)) {
      return this.activeTasks.get(taskId);
    }
    
    // Try loading from disk
    const taskFile = path.join(this.dataDir, `${taskId}.json`);
    if (fs.existsSync(taskFile)) {
      try {
        const task = JSON.parse(fs.readFileSync(taskFile, 'utf-8'));
        this.activeTasks.set(taskId, task);
        return task;
      } catch (error) {
        console.error(`Failed to load task ${taskId}:`, error);
        return null;
      }
    }
    
    return null;
  }

  /**
   * Save task to disk
   * @param {string} taskId - Task identifier
   */
  saveTask(taskId) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;
    
    const taskFile = path.join(this.dataDir, `${taskId}.json`);
    try {
      fs.writeFileSync(taskFile, JSON.stringify(task, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to save task ${taskId}:`, error);
    }
  }

  /**
   * Archive old history entries
   * @param {string} taskId - Task identifier
   * @param {Array} oldHistory - History entries to archive
   */
  archiveOldHistory(taskId, oldHistory) {
    const archiveDir = path.join(this.dataDir, 'archives');
    fs.mkdirSync(archiveDir, { recursive: true });
    
    const archiveFile = path.join(archiveDir, `${taskId}_${Date.now()}.json`);
    try {
      fs.writeFileSync(archiveFile, JSON.stringify(oldHistory, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to archive history for task ${taskId}:`, error);
    }
  }

  /**
   * Complete a task
   * @param {string} taskId - Task identifier
   * @param {Object} summary - Task completion summary
   */
  completeTask(taskId, summary = {}) {
    const task = this.getTask(taskId);
    if (!task) return;
    
    task.status = 'completed';
    task.completedAt = Date.now();
    task.summary = summary;
    task.duration = task.completedAt - task.createdAt;
    
    // Add final learning
    const finalLearning = {
      timestamp: Date.now(),
      type: 'completion_summary',
      insights: {
        totalInteractions: task.history.length,
        totalActions: task.actions.length,
        successRate: task.actions.filter(a => a.success).length / task.actions.length,
        duration: task.duration,
        outcome: summary.outcome || 'completed'
      }
    };
    
    task.learnings.push(finalLearning);
    this.saveTask(taskId);
    
    // Remove from active tasks to free memory
    this.activeTasks.delete(taskId);
  }

  /**
   * Get all active tasks
   * @returns {Array} Active task summaries
   */
  getActiveTasks() {
    const tasks = [];
    for (const [id, info] of this.taskIndex.entries()) {
      const task = this.getTask(id);
      if (task && task.status === 'active') {
        tasks.push({
          id,
          name: task.name,
          type: task.type,
          createdAt: task.createdAt,
          lastUpdated: task.lastUpdated,
          interactionCount: task.history.length
        });
      }
    }
    return tasks;
  }

  /**
   * Search for similar past tasks
   * @param {string} query - Search query
   * @returns {Array} Similar tasks
   */
  findSimilarTasks(query) {
    const results = [];
    const queryLower = query.toLowerCase();
    
    for (const [id, info] of this.taskIndex.entries()) {
      if (info.name.toLowerCase().includes(queryLower) ||
          info.type.toLowerCase().includes(queryLower)) {
        results.push({ id, ...info });
      }
    }
    
    return results.slice(0, 5);
  }

  /**
   * Generate unique task ID
   * @param {string} name - Task name
   * @returns {string} Task ID
   */
  generateTaskId(name) {
    const timestamp = Date.now();
    const hash = crypto.createHash('md5')
      .update(`${name}_${timestamp}`)
      .digest('hex')
      .substring(0, 8);
    return `task_${timestamp}_${hash}`;
  }

  /**
   * Load task index from disk
   */
  loadTaskIndex() {
    const indexFile = path.join(this.dataDir, 'index.json');
    if (fs.existsSync(indexFile)) {
      try {
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
        this.taskIndex = new Map(Object.entries(index));
      } catch (error) {
        console.error('Failed to load task index:', error);
        this.taskIndex = new Map();
      }
    }
  }

  /**
   * Save task index to disk
   */
  saveTaskIndex() {
    const indexFile = path.join(this.dataDir, 'index.json');
    try {
      const index = Object.fromEntries(this.taskIndex);
      fs.writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save task index:', error);
    }
  }

  /**
   * Clean up old completed tasks
   * @param {number} daysOld - Days threshold
   */
  cleanupOldTasks(daysOld = 30) {
    const threshold = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    let cleaned = 0;
    
    for (const [id, info] of this.taskIndex.entries()) {
      if (info.createdAt < threshold) {
        const task = this.getTask(id);
        if (task && task.status === 'completed') {
          const taskFile = path.join(this.dataDir, `${id}.json`);
          try {
            // Archive before deletion
            this.archiveOldHistory(id, task.history);
            fs.unlinkSync(taskFile);
            this.taskIndex.delete(id);
            this.activeTasks.delete(id);
            cleaned++;
          } catch (error) {
            console.error(`Failed to clean up task ${id}:`, error);
          }
        }
      }
    }
    
    if (cleaned > 0) {
      this.saveTaskIndex();
      console.log(`Cleaned up ${cleaned} old tasks`);
    }
  }
}

module.exports = { TaskHistoryManager };

