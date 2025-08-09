"""Base model class for AI integrations."""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import time

from utils.logger import logger

@dataclass
class ModelResponse:
    """Standard response from AI models."""
    content: str
    model: str
    tokens_used: Optional[int] = None
    response_time: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

@dataclass
class Message:
    """Standard message format."""
    role: str  # 'system', 'user', 'assistant'
    content: str
    name: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class BaseModel(ABC):
    """Abstract base class for AI models."""
    
    def __init__(self, model_name: str, api_key: Optional[str] = None):
        """Initialize base model."""
        self.model_name = model_name
        self.api_key = api_key
        self.total_tokens = 0
        self.total_requests = 0
        self.total_time = 0.0
    
    @abstractmethod
    async def generate(self, messages: List[Message], **kwargs) -> ModelResponse:
        """Generate response from model."""
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """Check if model is available."""
        pass
    
    def track_usage(self, tokens: int, response_time: float):
        """Track model usage statistics."""
        self.total_tokens += tokens
        self.total_requests += 1
        self.total_time += response_time
        
        logger.debug(f"{self.model_name} usage - Tokens: {tokens}, Time: {response_time:.2f}s")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get usage statistics."""
        avg_time = self.total_time / self.total_requests if self.total_requests > 0 else 0
        
        return {
            "model": self.model_name,
            "total_requests": self.total_requests,
            "total_tokens": self.total_tokens,
            "total_time": self.total_time,
            "average_time": avg_time
        }
    
    def format_messages(self, messages: List[Message]) -> List[Dict[str, str]]:
        """Format messages for API calls."""
        return [
            {
                "role": msg.role,
                "content": msg.content,
                **({"name": msg.name} if msg.name else {})
            }
            for msg in messages
        ]
    
    async def generate_with_retry(self, messages: List[Message], 
                                 max_retries: int = 3, **kwargs) -> ModelResponse:
        """Generate with retry logic."""
        last_error = None
        
        for attempt in range(max_retries):
            try:
                start_time = time.time()
                response = await self.generate(messages, **kwargs)
                response.response_time = time.time() - start_time
                
                if response.error:
                    last_error = response.error
                    logger.warning(f"{self.model_name} attempt {attempt + 1} failed: {response.error}")
                    await self._wait_before_retry(attempt)
                    continue
                
                return response
                
            except Exception as e:
                last_error = str(e)
                logger.error(f"{self.model_name} attempt {attempt + 1} error", exception=e)
                
                if attempt < max_retries - 1:
                    await self._wait_before_retry(attempt)
                    continue
        
        # All retries failed
        return ModelResponse(
            content="",
            model=self.model_name,
            error=f"Failed after {max_retries} attempts: {last_error}"
        )
    
    async def _wait_before_retry(self, attempt: int):
        """Wait before retrying with exponential backoff."""
        import asyncio
        wait_time = 2 ** attempt  # Exponential backoff
        logger.debug(f"Waiting {wait_time}s before retry...")
        await asyncio.sleep(wait_time)