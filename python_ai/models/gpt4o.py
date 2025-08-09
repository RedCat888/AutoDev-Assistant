"""GPT-4 model implementation."""

import os
from typing import List, Optional, AsyncGenerator
from openai import AsyncOpenAI

from .base import BaseModel, Message, ModelResponse, ModelConfig
from ..utils.logger import get_logger

logger = get_logger(__name__)

class GPT4OModel(BaseModel):
    """OpenAI GPT-4 model implementation."""
    
    def __init__(self):
        """Initialize GPT-4 model."""
        api_key = os.getenv("OPENAI_API_KEY")
        super().__init__("gpt-4o", api_key)
        self.client = None
        self.context_limit = 128000  # GPT-4 Turbo context window
    
    async def _setup(self):
        """Setup OpenAI client."""
        if self.api_key:
            self.client = AsyncOpenAI(api_key=self.api_key)
    
    async def generate(self, 
                       messages: List[Message],
                       config: Optional[ModelConfig] = None,
                       **kwargs) -> ModelResponse:
        """Generate response from GPT-4."""
        if not self.client:
            await self.initialize()
        
        if not self.is_available():
            return ModelResponse(
                content="",
                model=self.model_name,
                error="GPT-4 model not available (missing API key)"
            )
        
        try:
            # Format messages for OpenAI API
            formatted_messages = self.format_messages(messages)
            
            # Apply config
            params = {
                "model": "gpt-4-turbo-preview",
                "messages": formatted_messages,
                "temperature": config.temperature if config else 0.7,
                "max_tokens": config.max_tokens if config and config.max_tokens else None,
            }
            
            # Make API call
            response = await self.client.chat.completions.create(**params)
            
            return ModelResponse(
                content=response.choices[0].message.content,
                model=self.model_name,
                tokens_used=response.usage.total_tokens if response.usage else None,
                finish_reason=response.choices[0].finish_reason
            )
            
        except Exception as e:
            logger.error(f"GPT-4 generation error: {e}")
            return ModelResponse(
                content="",
                model=self.model_name,
                error=str(e)
            )
    
    async def generate_stream(self,
                            messages: List[Message],
                            config: Optional[ModelConfig] = None,
                            **kwargs) -> AsyncGenerator[str, None]:
        """Generate streaming response from GPT-4."""
        if not self.client:
            await self.initialize()
        
        if not self.is_available():
            yield ""
            return
        
        try:
            formatted_messages = self.format_messages(messages)
            
            params = {
                "model": "gpt-4-turbo-preview",
                "messages": formatted_messages,
                "temperature": config.temperature if config else 0.7,
                "stream": True
            }
            
            stream = await self.client.chat.completions.create(**params)
            
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
                    
        except Exception as e:
            logger.error(f"GPT-4 streaming error: {e}")
            yield ""
    
    def is_available(self) -> bool:
        """Check if GPT-4 is available."""
        return bool(self.api_key)
    
    def get_context_limit(self) -> int:
        """Get context window size."""
        return self.context_limit