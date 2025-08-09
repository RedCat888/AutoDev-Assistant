/**
 * Chat History Manager
 * Maintains conversation context for the AI assistant
 */
class ChatHistory {
  constructor(maxMessages = 50) {
    this.messages = [];
    this.maxMessages = maxMessages;
  }

  addMessage(role, content, metadata = {}) {
    const message = {
      role, // 'user', 'assistant', 'system'
      content,
      timestamp: Date.now(),
      ...metadata
    };
    
    this.messages.push(message);
    
    // Keep only recent messages
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
    
    return message;
  }

  getContext(limit = 10) {
    // Get recent messages for context
    const recent = this.messages.slice(-limit);
    return recent.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  getFullHistory() {
    return this.messages;
  }

  clear() {
    this.messages = [];
  }

  getFormattedContext() {
    // Format history for LLM context
    const context = this.getContext();
    if (context.length === 0) return '';
    
    return 'Previous conversation:\n' + 
      context.map(m => `${m.role}: ${m.content}`).join('\n') + '\n\n';
  }
}

module.exports = { ChatHistory };
