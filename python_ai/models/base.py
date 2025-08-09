"""Base model class for AI integrations."""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, AsyncGenerator
from dataclasses import dataclass, field
import time
import asyncio
from enum import Enum

from ..utils.logger import get_logger

logger = get_logger(__name__)

class Role(Enum):
    """Message roles."""
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    FUNCTION = "function"

@dataclass
class ModelResponse:
    """Standard response from AI models."""
    content: str
    model: str
    tokens_used: Optional[int] = None
    response_time: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    finish_reason: Optional[str] = None

@dataclass
class Message:
    """Standard message format."""
    role: Role
    content: str
    name: Optional[str] = None
    function_call: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API calls."""
        result = {
            "role": self.role.value if isinstance(self.role, Role) else self.role,
            "content": self.content
        }
        if self.name:
            result["name"] = self.name
        if self.function_call:
            result["function_call"] = self.function_call
        return result

@dataclass
class ModelConfig:
    """Model configuration."""
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    top_p: float = 1.0
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0
    stop: Optional[List[str]] = None
    stream: bool = False
    functions: Optional[List[Dict[str, Any]]] = None
    function_call: Optional[str] = None

class BaseModel(ABC):
    """Abstract base class for AI models."""
    
    def __init__(self, model_name: str, api_key: Optional[str] = None):
        """Initialize base model."""
        self.model_name = model_name
        self.api_key = api_key
        self.total_tokens = 0
        self.total_requests = 0
        self.total_time = 0.0
        self.error_count = 0
        self._initialized = False
    
    async def initialize(self):
        """Initialize model (async setup if needed)."""
        if not self._initialized:
            await self._setup()
            self._initialized = True
    
    async def _setup(self):
        """Override for model-specific setup."""
        pass
    
    @abstractmethod
    async def generate(self, 
                       messages: List[Message], 
                       config: Optional[ModelConfig] = None,
                       **kwargs) -> ModelResponse:
        """Generate response from model."""
        pass
    
    @abstractmethod
    async def generate_stream(self,
                            messages: List[Message],
                            config: Optional[ModelConfig] = None,
                            **kwargs) -> AsyncGenerator[str, None]:
        """Generate streaming response from model."""
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """Check if model is available."""
        pass
    
    @abstractmethod
    def get_context_limit(self) -> int:
        """Get the context window size for this model."""
        pass
    
    def track_usage(self, tokens: int, response_time: float, error: bool = False):
        """Track model usage statistics."""
        self.total_tokens += tokens
        self.total_requests += 1
        self.total_time += response_time
        if error:
            self.error_count += 1
        
        logger.debug(
            f"{self.model_name} usage - Tokens: {tokens}, "
            f"Time: {response_time:.2f}s, Error: {error}"
        )
    
    def get_stats(self) -> Dict[str, Any]:
        """Get usage statistics."""
        avg_time = self.total_time / self.total_requests if self.total_requests > 0 else 0
        error_rate = self.error_count / self.total_requests if self.total_requests > 0 else 0
        
        return {
            "model": self.model_name,
            "total_requests": self.total_requests,
            "total_tokens": self.total_tokens,
            "total_time": self.total_time,
            "average_time": avg_time,
            "error_count": self.error_count,
            "error_rate": error_rate
        }
    
    def format_messages(self, messages: List[Message]) -> List[Dict[str, Any]]:
        """Format messages for API calls."""
        return [msg.to_dict() for msg in messages]
    
    async def generate_with_retry(self, 
                                 messages: List[Message],
                                 config: Optional[ModelConfig] = None,
                                 max_retries: int = 3,
                                 **kwargs) -> ModelResponse:
        """Generate with retry logic."""
        last_error = None
        
        for attempt in range(max_retries):
            try:
                start_time = time.time()
                response = await self.generate(messages, config, **kwargs)
                response_time = time.time() - start_time
                response.response_time = response_time
                
                if response.error:
                    last_error = response.error
                    logger.warning(
                        f"{self.model_name} attempt {attempt + 1} failed: {response.error}"
                    )
                    self.track_usage(0, response_time, error=True)
                    await self._wait_before_retry(attempt)
                    continue
                
                self.track_usage(response.tokens_used or 0, response_time)
                return response
                
            except Exception as e:
                last_error = str(e)
                logger.error(
                    f"{self.model_name} attempt {attempt + 1} error: {e}",
                    exc_info=True
                )
                
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
        wait_time = min(2 ** attempt, 32)  # Cap at 32 seconds
        logger.debug(f"Waiting {wait_time}s before retry...")
        await asyncio.sleep(wait_time)
    
    def estimate_tokens(self, text: str) -> int:
        """Estimate token count for text (rough approximation)."""
        # Rough estimate: 1 token ≈ 4 characters
        return len(text) // 4
    
    def truncate_to_context(self, messages: List[Message], max_tokens: int) -> List[Message]:
        """Truncate messages to fit within context limit."""
        total_tokens = 0
        truncated = []
        
        # Always keep system message if present
        if messages and messages[0].role == Role.SYSTEM:
            truncated.append(messages[0])
            total_tokens += self.estimate_tokens(messages[0].content)
            messages = messages[1:]
        
        # Add messages from most recent backwards
        for msg in reversed(messages):
            msg_tokens = self.estimate_tokens(msg.content)
            if total_tokens + msg_tokens > max_tokens:
                break
            truncated.insert(len(truncated) if truncated else 0, msg)
            total_tokens += msg_tokens
        
        return truncated