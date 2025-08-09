"""Configuration management for Python AI module."""

import os
import json
from pathlib import Path
from typing import Dict, Any, Optional

class Config:
    """Configuration manager."""
    
    def __init__(self, config_path: Optional[str] = None):
        """Initialize configuration."""
        self.config_path = config_path or os.getenv("AUTODEV_CONFIG", ".autodevrc.json")
        self.config = self._load_config()
    
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from file."""
        config_file = Path(self.config_path)
        
        if config_file.exists():
            with open(config_file, 'r') as f:
                return json.load(f)
        
        # Return default config if file doesn't exist
        return {
            "pythonAI": {
                "enabled": True,
                "models": {
                    "gpt-4": {"enabled": True},
                    "claude": {"enabled": False},
                    "local": {"enabled": False}
                }
            }
        }
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value."""
        keys = key.split('.')
        value = self.config
        
        for k in keys:
            if isinstance(value, dict):
                value = value.get(k)
                if value is None:
                    return default
            else:
                return default
        
        return value
    
    def set(self, key: str, value: Any):
        """Set configuration value."""
        keys = key.split('.')
        config = self.config
        
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        
        config[keys[-1]] = value
    
    def save(self):
        """Save configuration to file."""
        config_file = Path(self.config_path)
        with open(config_file, 'w') as f:
            json.dump(self.config, f, indent=2)