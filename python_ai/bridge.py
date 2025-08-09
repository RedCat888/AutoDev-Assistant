#!/usr/bin/env python3
"""Bridge script for calling Python AI functions from JavaScript.

This script provides a simple JSON-RPC interface that can be called
from the JavaScript backend using child_process.
"""

import sys
import json
import asyncio
from typing import Dict, Any
import argparse

from utils.logger import setup_logging, get_logger
from models.router import ModelRouter
from models.base import Message, Role, ModelConfig

# Setup logging
setup_logging(level="INFO")
logger = get_logger(__name__)

class AIBridge:
    """Bridge for AI operations callable from JavaScript."""
    
    def __init__(self, config_path: str = None):
        """Initialize the bridge."""
        self.router = ModelRouter(config_path)
        logger.info("AI Bridge initialized")
    
    async def process_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Process a JSON-RPC request."""
        try:
            method = request.get("method")
            params = request.get("params", {})
            request_id = request.get("id")
            
            if method == "generate":
                result = await self._generate(params)
            elif method == "analyze_image":
                result = await self._analyze_image(params)
            elif method == "get_models":
                result = await self._get_models()
            elif method == "get_stats":
                result = self.router.get_stats()
            else:
                raise ValueError(f"Unknown method: {method}")
            
            return {
                "jsonrpc": "2.0",
                "result": result,
                "id": request_id
            }
            
        except Exception as e:
            logger.error(f"Error processing request: {e}", exc_info=True)
            return {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32603,
                    "message": str(e)
                },
                "id": request.get("id")
            }
    
    async def _generate(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Generate AI response."""
        messages = []
        for msg in params.get("messages", []):
            role = Role[msg["role"].upper()] if msg["role"].upper() in Role.__members__ else Role.USER
            messages.append(Message(
                role=role,
                content=msg["content"],
                name=msg.get("name"),
                function_call=msg.get("function_call")
            ))
        
        task_type = params.get("task_type", "general")
        model_name = params.get("model")
        
        config = ModelConfig(
            temperature=params.get("temperature", 0.7),
            max_tokens=params.get("max_tokens"),
            stream=params.get("stream", False)
        )
        
        response = await self.router.route(
            messages=messages,
            task_type=task_type,
            preferred_model=model_name,
            config=config
        )
        
        return {
            "content": response.content,
            "model": response.model,
            "tokens_used": response.tokens_used,
            "response_time": response.response_time,
            "metadata": response.metadata
        }
    
    async def _analyze_image(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze an image using vision models."""
        image_path = params.get("image_path")
        prompt = params.get("prompt", "Describe this image")
        
        # This would use a vision model
        # For now, return a placeholder
        return {
            "description": f"Image analysis for {image_path}",
            "objects": [],
            "text": []
        }
    
    async def _get_models(self) -> Dict[str, Any]:
        """Get available models."""
        return {
            "models": self.router.get_available_models()
        }

async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Python AI Bridge")
    parser.add_argument("--config", help="Config file path")
    parser.add_argument("--mode", default="stdio", choices=["stdio", "http"],
                       help="Communication mode")
    args = parser.parse_args()
    
    bridge = AIBridge(args.config)
    
    if args.mode == "stdio":
        # Read JSON-RPC from stdin, write to stdout
        while True:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                    
                request = json.loads(line.strip())
                response = await bridge.process_request(request)
                print(json.dumps(response))
                sys.stdout.flush()
                
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON: {e}")
                error_response = {
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32700,
                        "message": "Parse error"
                    },
                    "id": None
                }
                print(json.dumps(error_response))
                sys.stdout.flush()
            except KeyboardInterrupt:
                break
            except Exception as e:
                logger.error(f"Unexpected error: {e}", exc_info=True)
    
    logger.info("AI Bridge shutting down")

if __name__ == "__main__":
    asyncio.run(main())