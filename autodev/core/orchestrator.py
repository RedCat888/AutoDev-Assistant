"""Main orchestrator for AutoDev Assistant."""

import asyncio
import time
from datetime import datetime
from typing import Optional, Dict, Any, List
from pathlib import Path

from .memory import MemoryManager
from .screen_capture import ScreenCapture
from .actions import AutomationController
from models.router import ModelRouter
from utils.logger import logger
from utils.config import config

class Orchestrator:
    """Orchestrates all AutoDev Assistant components."""
    
    def __init__(self):
        """Initialize orchestrator with all components."""
        logger.info("Initializing AutoDev Orchestrator...")
        
        # Core components
        self.memory = MemoryManager()
        self.screen_capture = ScreenCapture()
        self.automation = AutomationController()
        self.model_router = ModelRouter()
        
        # State management
        self.running = False
        self.start_time = None
        self.task_queue = asyncio.Queue() if asyncio.get_event_loop().is_running() else None
        
        # Performance tracking
        self.stats = {
            'tasks_completed': 0,
            'errors_encountered': 0,
            'screens_captured': 0,
            'memory_entries': self.memory.get_entry_count(),
            'model_requests': 0
        }
        
        logger.success("Orchestrator initialized successfully")
    
    def scan_screen(self) -> Dict[str, Any]:
        """Capture and analyze current screen."""
        try:
            screenshot, text, analysis = self.screen_capture.capture_and_analyze()
            
            # Store in memory
            if text:
                self.memory.add_entry(
                    role="system",
                    content=f"Screen capture: {text[:500]}...",
                    metadata=analysis
                )
            
            self.stats['screens_captured'] += 1
            
            logger.info(f"Extracted screen text length: {len(text)}")
            
            return {
                'text': text,
                'analysis': analysis,
                'screenshot': screenshot
            }
            
        except Exception as e:
            logger.error("Screen scan failed", exception=e)
            self.stats['errors_encountered'] += 1
            return {'text': '', 'analysis': {}, 'screenshot': None}
    
    def run(self):
        """Main run loop for the orchestrator."""
        self.running = True
        self.start_time = datetime.now()
        
        logger.success("=" * 50)
        logger.success("AutoDev Assistant started")
        logger.success("=" * 50)
        
        # Display startup info
        self._display_startup_info()
        
        # Perform initial screen scan
        logger.task("Performing initial screen scan...")
        screen_data = self.scan_screen()
        
        if screen_data['text']:
            logger.success(f"Screen scan successful - {len(screen_data['text'])} characters detected")
        else:
            logger.warning("No text detected on initial screen scan")
        
        # Main loop
        try:
            while self.running:
                # Check runtime limit
                if self._check_runtime_limit():
                    logger.warning("Runtime limit reached, shutting down...")
                    break
                
                # Placeholder for main loop logic
                # This will be expanded with task processing, model calls, etc.
                time.sleep(1)
                
                # Periodic health check
                if int(time.time()) % int(config.health_check_interval) == 0:
                    self._health_check()
                
        except KeyboardInterrupt:
            logger.info("Received interrupt signal")
        except Exception as e:
            logger.error("Orchestrator error", exception=e)
        finally:
            self.shutdown()
    
    def _display_startup_info(self):
        """Display startup information."""
        api_status = config.validate_api_keys()
        
        logger.info("Configuration:")
        logger.metric("Memory DB", config.memory_db_path)
        logger.metric("Log Level", config.log_level)
        logger.metric("OCR Refresh Rate", f"{config.ocr_refresh_rate}s")
        
        logger.info("API Status:")
        for api, available in api_status.items():
            status = "✓" if available else "✗"
            logger.metric(f"{api.capitalize()}", status)
        
        logger.info("Memory Status:")
        logger.metric("Previous entries", self.memory.get_entry_count())
        logger.metric("Session ID", self.memory.session_id)
    
    def _check_runtime_limit(self) -> bool:
        """Check if runtime limit has been exceeded."""
        if not self.start_time:
            return False
        
        elapsed = (datetime.now() - self.start_time).total_seconds() / 3600
        return elapsed >= config.max_runtime_hours
    
    def _health_check(self):
        """Perform health check and log metrics."""
        import psutil
        
        process = psutil.Process()
        memory_mb = process.memory_info().rss / 1024 / 1024
        cpu_percent = process.cpu_percent(interval=0.1)
        
        logger.debug("Health Check:")
        logger.metric("Memory Usage", f"{memory_mb:.1f}", "MB")
        logger.metric("CPU Usage", f"{cpu_percent:.1f}", "%")
        logger.metric("Tasks Completed", self.stats['tasks_completed'])
        logger.metric("Screens Captured", self.stats['screens_captured'])
        
        # Memory cleanup if needed
        if memory_mb > 1000:  # Over 1GB
            logger.warning("High memory usage detected, triggering cleanup...")
            import gc
            gc.collect()
    
    def shutdown(self):
        """Clean shutdown of the orchestrator."""
        logger.info("Shutting down AutoDev Assistant...")
        
        self.running = False
        
        # Display final stats
        runtime = (datetime.now() - self.start_time).total_seconds() if self.start_time else 0
        
        logger.info("Session Statistics:")
        logger.metric("Runtime", f"{runtime/3600:.2f}", " hours")
        logger.metric("Tasks Completed", self.stats['tasks_completed'])
        logger.metric("Errors Encountered", self.stats['errors_encountered'])
        logger.metric("Screens Captured", self.stats['screens_captured'])
        logger.metric("Memory Entries", self.memory.get_entry_count())
        
        # Export session if configured
        if config.auto_cleanup:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            export_path = Path.home() / ".autodev" / "sessions" / f"session_{timestamp}.json"
            self.memory.export_session(export_path)
        
        logger.success("AutoDev Assistant shutdown complete")
    
    async def process_task(self, task: Dict[str, Any]):
        """Process a single task."""
        task_id = task.get('id', 'unknown')
        logger.task(f"Processing task: {task_id}")
        
        try:
            # Store task in memory
            self.memory.add_entry(
                role="user",
                content=task.get('description', ''),
                task_id=task_id
            )
            
            # Task processing logic will be expanded here
            # For now, just mark as completed
            
            self.stats['tasks_completed'] += 1
            
            # Save task summary
            self.memory.save_task_summary(
                task_id=task_id,
                summary=task.get('description', ''),
                status="completed"
            )
            
            logger.success(f"Task {task_id} completed")
            
        except Exception as e:
            logger.error(f"Task {task_id} failed", exception=e)
            self.stats['errors_encountered'] += 1
            
            self.memory.save_task_summary(
                task_id=task_id,
                summary=task.get('description', ''),
                status="failed",
                result=str(e)
            )