"""Model router for intelligent task delegation."""

import asyncio
from typing import List, Dict, Any, Optional
from enum import Enum

from .base import BaseModel, ModelResponse, Message
from .gpt4o import GPT4Model
from utils.logger import logger
from utils.config import config

class TaskType(Enum):
    """Types of tasks for model routing."""
    REASONING = "reasoning"          # Complex reasoning and planning
    CODING = "coding"                # Code generation and review
    SUMMARIZATION = "summarization"  # Text summarization
    VISION = "vision"                # Image analysis
    QUICK_RESPONSE = "quick"         # Fast, simple responses
    ANALYSIS = "analysis"            # Data and pattern analysis

class ModelRouter:
    """Routes tasks to appropriate AI models."""
    
    def __init__(self):
        """Initialize model router with available models."""
        self.models: Dict[str, BaseModel] = {}
        self.task_routing: Dict[TaskType, List[str]] = {}
        
        # Initialize models
        self._initialize_models()
        
        # Setup task routing preferences
        self._setup_routing()
        
        logger.success(f"Model router initialized with {len(self.models)} models")
    
    def _initialize_models(self):
        """Initialize all available AI models."""
        # GPT-4
        gpt4 = GPT4Model()
        if gpt4.is_available():
            self.models["gpt4"] = gpt4
            logger.info("✓ GPT-4 model available")
        else:
            logger.warning("✗ GPT-4 model not available")
        
        # Additional models would be initialized here
        # self.models["claude"] = ClaudeModel()
        # self.models["local"] = LocalLLM()
    
    def _setup_routing(self):
        """Setup task routing preferences."""
        # Define which models are best for each task type
        self.task_routing = {
            TaskType.REASONING: ["gpt4", "claude"],
            TaskType.CODING: ["gpt4", "claude"],
            TaskType.SUMMARIZATION: ["claude", "gpt4"],
            TaskType.VISION: ["gpt4"],
            TaskType.QUICK_RESPONSE: ["local", "gpt4"],
            TaskType.ANALYSIS: ["gpt4", "claude"]
        }
    
    def get_available_models(self) -> List[str]:
        """Get list of available models."""
        return list(self.models.keys())
    
    def select_model(self, task_type: TaskType) -> Optional[BaseModel]:
        """Select best available model for task type."""
        preferred_models = self.task_routing.get(task_type, [])
        
        # Try preferred models in order
        for model_name in preferred_models:
            if model_name in self.models:
                logger.debug(f"Selected {model_name} for {task_type.value} task")
                return self.models[model_name]
        
        # Fallback to any available model
        if self.models:
            model_name = list(self.models.keys())[0]
            logger.debug(f"Fallback to {model_name} for {task_type.value} task")
            return self.models[model_name]
        
        logger.error("No models available")
        return None
    
    async def route_task(self, task_type: TaskType, messages: List[Message], 
                         **kwargs) -> ModelResponse:
        """Route task to appropriate model."""
        model = self.select_model(task_type)
        
        if not model:
            return ModelResponse(
                content="",
                model="none",
                error="No models available for task"
            )
        
        logger.task(f"Routing {task_type.value} task to {model.model_name}")
        
        # Use retry logic for reliability
        response = await model.generate_with_retry(messages, **kwargs)
        
        # Store in memory if successful
        if not response.error:
            logger.success(f"Task completed by {model.model_name}")
        
        return response
    
    async def parallel_generate(self, messages: List[Message], 
                              models: Optional[List[str]] = None) -> List[ModelResponse]:
        """Generate responses from multiple models in parallel."""
        if models is None:
            models = list(self.models.keys())
        
        tasks = []
        for model_name in models:
            if model_name in self.models:
                model = self.models[model_name]
                tasks.append(model.generate(messages))
        
        if not tasks:
            return []
        
        logger.info(f"Parallel generation with {len(tasks)} models")
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle exceptions
        results = []
        for i, response in enumerate(responses):
            if isinstance(response, Exception):
                results.append(ModelResponse(
                    content="",
                    model=models[i],
                    error=str(response)
                ))
            else:
                results.append(response)
        
        return results
    
    async def consensus_generate(self, messages: List[Message], 
                                threshold: float = 0.7) -> ModelResponse:
        """Generate response with consensus from multiple models."""
        responses = await self.parallel_generate(messages)
        
        if not responses:
            return ModelResponse(
                content="",
                model="consensus",
                error="No models available"
            )
        
        # Filter successful responses
        valid_responses = [r for r in responses if not r.error]
        
        if not valid_responses:
            return ModelResponse(
                content="",
                model="consensus",
                error="All models failed"
            )
        
        # For now, return the first valid response
        # TODO: Implement actual consensus logic
        return valid_responses[0]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics for all models."""
        stats = {}
        for name, model in self.models.items():
            stats[name] = model.get_stats()
        return stats
    
    async def analyze_task(self, description: str) -> TaskType:
        """Analyze task description to determine type."""
        # Simple keyword-based classification for now
        description_lower = description.lower()
        
        if any(word in description_lower for word in ["code", "function", "implement", "debug"]):
            return TaskType.CODING
        elif any(word in description_lower for word in ["summarize", "summary", "brief"]):
            return TaskType.SUMMARIZATION
        elif any(word in description_lower for word in ["image", "screen", "visual", "see"]):
            return TaskType.VISION
        elif any(word in description_lower for word in ["analyze", "pattern", "data"]):
            return TaskType.ANALYSIS
        elif any(word in description_lower for word in ["plan", "reason", "think", "decide"]):
            return TaskType.REASONING
        else:
            return TaskType.QUICK_RESPONSE