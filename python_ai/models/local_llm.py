"""Local LLM model implementation stub."""

import os
from typing import List, Optional, AsyncGenerator

from .base import BaseModel, Message, ModelResponse, ModelConfig
from ..utils.logger import get_logger

logger = get_logger(__name__)

class LocalLLMModel(BaseModel):
    """Local LLM model implementation (Ollama, etc)."""
    
    def __init__(self):
        """Initialize local LLM model."""
        super().__init__("local-llm", None)
        self.endpoint = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.context_limit = 8192  # Default context window
    
    async def generate(self, 
                       messages: List[Message],
                       config: Optional[ModelConfig] = None,
                       **kwargs) -> ModelResponse:
        """Generate response from local LLM."""
        # Stub implementation
        return ModelResponse(
            content="Local LLM not yet implemented",
            model=self.model_name,
            error="Not implemented"
        )
    
    async def generate_stream(self,
                            messages: List[Message],
                            config: Optional[ModelConfig] = None,
                            **kwargs) -> AsyncGenerator[str, None]:
        """Generate streaming response from local LLM."""
        yield "Local LLM streaming not yet implemented"
    
    def is_available(self) -> bool:
        """Check if local LLM is available."""
        # Could check if Ollama is running
        return False
    
    def get_context_limit(self) -> int:
        """Get context window size."""
        return self.context_limit