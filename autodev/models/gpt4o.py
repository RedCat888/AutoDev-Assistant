"""OpenAI GPT-4 model integration."""

import asyncio
from typing import List, Dict, Any, Optional

try:
    import openai
    from openai import AsyncOpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    openai = None
    AsyncOpenAI = None

from .base import BaseModel, ModelResponse, Message
from utils.logger import logger
from utils.config import config

class GPT4Model(BaseModel):
    """OpenAI GPT-4 model implementation."""
    
    def __init__(self, model_name: Optional[str] = None, api_key: Optional[str] = None):
        """Initialize GPT-4 model."""
        model_name = model_name or config.primary_model
        api_key = api_key or config.openai_api_key
        
        super().__init__(model_name, api_key)
        
        if OPENAI_AVAILABLE and api_key:
            self.client = AsyncOpenAI(api_key=api_key)
        else:
            self.client = None
            if not OPENAI_AVAILABLE:
                logger.warning("OpenAI library not installed. Install with: pip install openai")
            if not api_key:
                logger.warning("OpenAI API key not configured")
    
    def is_available(self) -> bool:
        """Check if GPT-4 is available."""
        return bool(self.client and self.api_key)
    
    async def generate(self, messages: List[Message], **kwargs) -> ModelResponse:
        """Generate response from GPT-4."""
        if not self.is_available():
            return ModelResponse(
                content="",
                model=self.model_name,
                error="GPT-4 not available - missing API key or library"
            )
        
        try:
            # Format messages for OpenAI API
            formatted_messages = self.format_messages(messages)
            
            # Set default parameters
            params = {
                "model": self.model_name,
                "messages": formatted_messages,
                "temperature": kwargs.get("temperature", 0.7),
                "max_tokens": kwargs.get("max_tokens", 2000),
                "top_p": kwargs.get("top_p", 0.9),
                "frequency_penalty": kwargs.get("frequency_penalty", 0),
                "presence_penalty": kwargs.get("presence_penalty", 0),
            }
            
            # Add optional parameters
            if "stop" in kwargs:
                params["stop"] = kwargs["stop"]
            if "functions" in kwargs:
                params["functions"] = kwargs["functions"]
            if "function_call" in kwargs:
                params["function_call"] = kwargs["function_call"]
            
            # Make API call
            response = await self.client.chat.completions.create(**params)
            
            # Extract response
            choice = response.choices[0]
            content = choice.message.content or ""
            
            # Track usage
            if response.usage:
                tokens = response.usage.total_tokens
                self.track_usage(tokens, 0)  # Time tracked externally
            else:
                tokens = None
            
            return ModelResponse(
                content=content,
                model=self.model_name,
                tokens_used=tokens,
                metadata={
                    "finish_reason": choice.finish_reason,
                    "model": response.model,
                    "id": response.id
                }
            )
            
        except Exception as e:
            logger.error(f"GPT-4 generation failed", exception=e)
            return ModelResponse(
                content="",
                model=self.model_name,
                error=str(e)
            )
    
    async def generate_with_vision(self, image_url: str, prompt: str, **kwargs) -> ModelResponse:
        """Generate response with vision capabilities."""
        if not self.is_available():
            return ModelResponse(
                content="",
                model=config.vision_model,
                error="GPT-4 Vision not available"
            )
        
        try:
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": image_url}}
                    ]
                }
            ]
            
            response = await self.client.chat.completions.create(
                model=config.vision_model,
                messages=messages,
                max_tokens=kwargs.get("max_tokens", 1000),
                temperature=kwargs.get("temperature", 0.7)
            )
            
            content = response.choices[0].message.content or ""
            tokens = response.usage.total_tokens if response.usage else None
            
            return ModelResponse(
                content=content,
                model=config.vision_model,
                tokens_used=tokens,
                metadata={"finish_reason": response.choices[0].finish_reason}
            )
            
        except Exception as e:
            logger.error(f"GPT-4 Vision failed", exception=e)
            return ModelResponse(
                content="",
                model=config.vision_model,
                error=str(e)
            )
    
    async def stream_generate(self, messages: List[Message], callback, **kwargs):
        """Stream response from GPT-4."""
        if not self.is_available():
            await callback(ModelResponse(
                content="",
                model=self.model_name,
                error="GPT-4 not available"
            ))
            return
        
        try:
            formatted_messages = self.format_messages(messages)
            
            stream = await self.client.chat.completions.create(
                model=self.model_name,
                messages=formatted_messages,
                temperature=kwargs.get("temperature", 0.7),
                max_tokens=kwargs.get("max_tokens", 2000),
                stream=True
            )
            
            full_content = ""
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    full_content += content
                    await callback(ModelResponse(
                        content=content,
                        model=self.model_name,
                        metadata={"streaming": True}
                    ))
            
            # Final response
            await callback(ModelResponse(
                content=full_content,
                model=self.model_name,
                metadata={"streaming": False, "complete": True}
            ))
            
        except Exception as e:
            logger.error(f"GPT-4 streaming failed", exception=e)
            await callback(ModelResponse(
                content="",
                model=self.model_name,
                error=str(e)
            ))