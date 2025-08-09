"""Python AI Module for AutoDev Assistant.

This module provides advanced AI capabilities that can be called from the
JavaScript backend for specialized tasks.
"""

from .models import ModelRouter, ModelResponse
from .core import Orchestrator, Memory, ActionExecutor
from .vision import VisionAnalyzer

__version__ = "2.0.0"
__all__ = [
    "ModelRouter",
    "ModelResponse", 
    "Orchestrator",
    "Memory",
    "ActionExecutor",
    "VisionAnalyzer"
]