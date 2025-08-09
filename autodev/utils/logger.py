"""Logging configuration for AutoDev Assistant."""

import logging
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional
from rich.logging import RichHandler
from rich.console import Console

console = Console()

class AutoDevLogger:
    """Custom logger with rich formatting and file output."""
    
    def __init__(self, name: str = "AutoDev", level: str = "INFO", 
                 log_file: Optional[Path] = None):
        self.name = name
        self.logger = logging.getLogger(name)
        self.logger.setLevel(getattr(logging, level.upper()))
        self.logger.handlers.clear()
        
        # Console handler with rich formatting
        console_handler = RichHandler(
            console=console,
            show_time=True,
            show_path=False,
            markup=True,
            rich_tracebacks=True,
            tracebacks_show_locals=True
        )
        console_format = "%(message)s"
        console_handler.setFormatter(logging.Formatter(console_format))
        self.logger.addHandler(console_handler)
        
        # File handler if specified
        if log_file:
            file_handler = logging.FileHandler(log_file, encoding='utf-8')
            file_format = "[%(asctime)s] %(levelname)-8s — %(message)s"
            file_handler.setFormatter(logging.Formatter(
                file_format, 
                datefmt="%Y-%m-%d %H:%M:%S"
            ))
            self.logger.addHandler(file_handler)
    
    def debug(self, message: str, **kwargs):
        """Log debug message."""
        self.logger.debug(message, extra=kwargs)
    
    def info(self, message: str, **kwargs):
        """Log info message."""
        self.logger.info(message, extra=kwargs)
    
    def warning(self, message: str, **kwargs):
        """Log warning message."""
        self.logger.warning(message, extra=kwargs)
    
    def error(self, message: str, exception: Optional[Exception] = None, **kwargs):
        """Log error message with optional exception."""
        if exception:
            self.logger.error(f"{message}: {str(exception)}", exc_info=True, extra=kwargs)
        else:
            self.logger.error(message, extra=kwargs)
    
    def critical(self, message: str, **kwargs):
        """Log critical message."""
        self.logger.critical(message, extra=kwargs)
    
    def success(self, message: str, **kwargs):
        """Log success message (info level with green color)."""
        self.logger.info(f"[green]✓[/green] {message}", extra=kwargs)
    
    def task(self, message: str, **kwargs):
        """Log task message (info level with blue color)."""
        self.logger.info(f"[blue]►[/blue] {message}", extra=kwargs)
    
    def metric(self, name: str, value: any, unit: str = "", **kwargs):
        """Log a metric value."""
        self.logger.info(f"[cyan]{name}:[/cyan] {value}{unit}", extra=kwargs)

def get_logger(name: str = "AutoDev", level: Optional[str] = None, 
               log_file: Optional[Path] = None) -> AutoDevLogger:
    """Get or create a logger instance."""
    from utils.config import config
    
    if level is None:
        level = config.log_level
    if log_file is None:
        log_file = config.log_file
    
    return AutoDevLogger(name, level, log_file)

# Global logger instance
logger = get_logger()