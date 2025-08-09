"""Configuration management for AutoDev Assistant."""

import os
from pathlib import Path
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Central configuration for AutoDev Assistant."""
    
    def __init__(self):
        """Initialize configuration from environment variables."""
        
        # API Keys
        self.openai_api_key = os.getenv("OPENAI_API_KEY", None)
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", None)
        self.ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
        
        # Model Settings
        self.primary_model = os.getenv("PRIMARY_MODEL", "gpt-4-turbo-preview")
        self.vision_model = os.getenv("VISION_MODEL", "gpt-4-vision-preview")
        self.claude_model = os.getenv("CLAUDE_MODEL", "claude-3-opus-20240229")
        self.local_model = os.getenv("LOCAL_MODEL", "llama2")
        
        # Screen Capture Settings
        self.ocr_refresh_rate = float(os.getenv("OCR_REFRESH_RATE", "2.0"))
        self.screenshot_quality = int(os.getenv("SCREENSHOT_QUALITY", "95"))
        self.ocr_language = os.getenv("OCR_LANGUAGE", "eng")
        
        # Memory Settings
        memory_db_path = os.getenv("MEMORY_DB_PATH", "")
        if memory_db_path:
            self.memory_db_path = Path(memory_db_path)
        else:
            self.memory_db_path = Path.home() / ".autodev" / "memory.db"
        
        self.max_memory_entries = int(os.getenv("MAX_MEMORY_ENTRIES", "10000"))
        self.memory_context_window = int(os.getenv("MEMORY_CONTEXT_WINDOW", "50"))
        
        # Automation Settings
        self.action_delay = float(os.getenv("ACTION_DELAY", "0.5"))
        self.typing_speed = float(os.getenv("TYPING_SPEED", "0.05"))
        self.mouse_move_duration = float(os.getenv("MOUSE_MOVE_DURATION", "0.5"))
        
        # System Settings
        self.log_level = os.getenv("LOG_LEVEL", "INFO")
        
        log_file = os.getenv("LOG_FILE", "")
        if log_file:
            self.log_file = Path(log_file)
        else:
            self.log_file = Path.home() / ".autodev" / "autodev.log"
        
        self.max_retries = int(os.getenv("MAX_RETRIES", "3"))
        self.retry_delay = float(os.getenv("RETRY_DELAY", "1.0"))
        
        # Runtime Settings
        self.max_runtime_hours = float(os.getenv("MAX_RUNTIME_HOURS", "24.0"))
        self.health_check_interval = float(os.getenv("HEALTH_CHECK_INTERVAL", "60.0"))
        self.auto_cleanup = os.getenv("AUTO_CLEANUP", "true").lower() in ["true", "1", "yes"]
        
        # Ensure directories exist
        self.ensure_directories()
    
    def ensure_directories(self):
        """Create necessary directories if they don't exist."""
        self.memory_db_path.parent.mkdir(parents=True, exist_ok=True)
        if self.log_file:
            self.log_file.parent.mkdir(parents=True, exist_ok=True)
    
    def validate_api_keys(self) -> Dict[str, bool]:
        """Check which API keys are configured."""
        return {
            "openai": bool(self.openai_api_key),
            "anthropic": bool(self.anthropic_api_key),
            "ollama": self._check_ollama_connection(),
        }
    
    def _check_ollama_connection(self) -> bool:
        """Check if Ollama is accessible."""
        try:
            import requests
            response = requests.get(f"{self.ollama_host}/api/tags", timeout=2)
            return response.status_code == 200
        except:
            return False
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary."""
        return {
            "api_keys": {
                "openai": bool(self.openai_api_key),
                "anthropic": bool(self.anthropic_api_key),
                "ollama": self.ollama_host
            },
            "models": {
                "primary": self.primary_model,
                "vision": self.vision_model,
                "claude": self.claude_model,
                "local": self.local_model
            },
            "screen_capture": {
                "ocr_refresh_rate": self.ocr_refresh_rate,
                "screenshot_quality": self.screenshot_quality,
                "ocr_language": self.ocr_language
            },
            "memory": {
                "db_path": str(self.memory_db_path),
                "max_entries": self.max_memory_entries,
                "context_window": self.memory_context_window
            },
            "automation": {
                "action_delay": self.action_delay,
                "typing_speed": self.typing_speed,
                "mouse_move_duration": self.mouse_move_duration
            },
            "system": {
                "log_level": self.log_level,
                "log_file": str(self.log_file),
                "max_retries": self.max_retries,
                "retry_delay": self.retry_delay
            },
            "runtime": {
                "max_runtime_hours": self.max_runtime_hours,
                "health_check_interval": self.health_check_interval,
                "auto_cleanup": self.auto_cleanup
            }
        }

# Global config instance
config = Config()