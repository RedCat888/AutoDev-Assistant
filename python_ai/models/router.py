"""Model router for intelligent AI model selection."""

from typing import List, Dict, Any, Optional
from enum import Enum
import asyncio

from .base import BaseModel, Message, ModelResponse, ModelConfig
from ..utils.logger import get_logger

logger = get_logger(__name__)

class TaskType(Enum):
    """Types of tasks for routing."""
    GENERAL = "general"
    CODE_GENERATION = "code_generation"
    CODE_REVIEW = "code_review"
    DOCUMENTATION = "documentation"
    DEBUGGING = "debugging"
    VISION = "vision"
    CONVERSATION = "conversation"
    ANALYSIS = "analysis"
    TRANSLATION = "translation"

class ModelRouter:
    """Routes requests to appropriate AI models based on task type."""
    
    def __init__(self, config_path: Optional[str] = None):
        """Initialize the model router."""
        self.models: Dict[str, BaseModel] = {}
        self.task_routing: Dict[TaskType, List[str]] = {}
        self.config = self._load_config(config_path)
        self._initialize_models()
        self._setup_routing()
    
    def _load_config(self, config_path: Optional[str]) -> Dict[str, Any]:
        """Load configuration from file or use defaults."""
        # For now, return default config
        return {
            "models": {
                "gpt-4": {"enabled": True, "priority": 1},
                "claude": {"enabled": False, "priority": 2},
                "local": {"enabled": False, "priority": 3}
            }
        }
    
    def _initialize_models(self):
        """Initialize available models based on configuration."""
        # Import models dynamically to avoid circular imports
        if self.config["models"].get("gpt-4", {}).get("enabled"):
            try:
                from .gpt4o import GPT4OModel
                self.models["gpt-4"] = GPT4OModel()
                logger.info("Initialized GPT-4 model")
            except Exception as e:
                logger.error(f"Failed to initialize GPT-4: {e}")
        
        if self.config["models"].get("claude", {}).get("enabled"):
            try:
                from .claude import ClaudeModel
                self.models["claude"] = ClaudeModel()
                logger.info("Initialized Claude model")
            except Exception as e:
                logger.error(f"Failed to initialize Claude: {e}")
        
        if self.config["models"].get("local", {}).get("enabled"):
            try:
                from .local_llm import LocalLLMModel
                self.models["local"] = LocalLLMModel()
                logger.info("Initialized Local LLM model")
            except Exception as e:
                logger.error(f"Failed to initialize Local LLM: {e}")
    
    def _setup_routing(self):
        """Setup task type to model routing."""
        # Default routing strategy
        self.task_routing = {
            TaskType.GENERAL: ["gpt-4", "claude", "local"],
            TaskType.CODE_GENERATION: ["gpt-4", "claude"],
            TaskType.CODE_REVIEW: ["gpt-4", "claude"],
            TaskType.DOCUMENTATION: ["gpt-4", "claude", "local"],
            TaskType.DEBUGGING: ["gpt-4", "claude"],
            TaskType.VISION: ["gpt-4"],  # Only GPT-4V supports vision
            TaskType.CONVERSATION: ["claude", "gpt-4", "local"],
            TaskType.ANALYSIS: ["gpt-4", "claude"],
            TaskType.TRANSLATION: ["gpt-4", "claude", "local"]
        }
    
    async def route(self,
                   messages: List[Message],
                   task_type: TaskType = TaskType.GENERAL,
                   preferred_model: Optional[str] = None,
                   config: Optional[ModelConfig] = None) -> ModelResponse:
        """Route request to appropriate model."""
        
        # Use preferred model if specified and available
        if preferred_model and preferred_model in self.models:
            model = self.models[preferred_model]
            if model.is_available():
                logger.info(f"Using preferred model: {preferred_model}")
                return await model.generate_with_retry(messages, config)
        
        # Get model priority list for task type
        model_priority = self.task_routing.get(task_type, [])
        
        # Try models in priority order
        for model_name in model_priority:
            if model_name not in self.models:
                continue
                
            model = self.models[model_name]
            if not model.is_available():
                logger.debug(f"Model {model_name} not available")
                continue
            
            try:
                logger.info(f"Routing to {model_name} for {task_type.value}")
                response = await model.generate_with_retry(messages, config)
                
                if not response.error:
                    return response
                    
            except Exception as e:
                logger.error(f"Error with {model_name}: {e}")
                continue
        
        # All models failed
        return ModelResponse(
            content="",
            model="none",
            error="No available models could process this request"
        )
    
    def get_available_models(self) -> List[str]:
        """Get list of available models."""
        return [
            name for name, model in self.models.items()
            if model.is_available()
        ]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics for all models."""
        stats = {}
        for name, model in self.models.items():
            stats[name] = model.get_stats()
        return stats
    
    async def shutdown(self):
        """Shutdown all models gracefully."""
        for model in self.models.values():
            if hasattr(model, 'shutdown'):
                await model.shutdown()
        logger.info("Model router shutdown complete")