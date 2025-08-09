#!/usr/bin/env python3
"""AutoDev Assistant - Autonomous AI Developer

An intelligent assistant that can control your desktop, write code,
and complete complex tasks autonomously.
"""

import sys
import argparse
from pathlib import Path
from dotenv import load_dotenv

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from core.orchestrator import Orchestrator
from utils.logger import logger
from utils.config import config

def main():
    """Main entry point for AutoDev Assistant."""
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description="AutoDev Assistant - Autonomous AI Developer",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument(
        "--config",
        type=Path,
        help="Path to configuration file (.env)",
        default=Path(".env")
    )
    
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default=None,
        help="Override log level from config"
    )
    
    parser.add_argument(
        "--test",
        action="store_true",
        help="Run in test mode (limited functionality)"
    )
    
    parser.add_argument(
        "--no-ocr",
        action="store_true",
        help="Disable OCR functionality"
    )
    
    args = parser.parse_args()
    
    # Load environment variables
    if args.config.exists():
        load_dotenv(args.config)
        logger.info(f"Loaded configuration from {args.config}")
    
    # Override log level if specified
    if args.log_level:
        config.log_level = args.log_level
        logger.logger.setLevel(args.log_level)
    
    # Display banner
    print("""
    ╔═══════════════════════════════════════════════════════╗
    ║                                                       ║
    ║            AutoDev Assistant v1.0.0                   ║
    ║         Autonomous AI Developer System                ║
    ║                                                       ║
    ╚═══════════════════════════════════════════════════════╝
    """)
    
    try:
        # Initialize and run orchestrator
        orchestrator = Orchestrator()
        
        if args.test:
            logger.info("Running in test mode...")
            # Just do a screen scan and exit
            orchestrator.scan_screen()
            logger.success("Test completed successfully!")
        else:
            # Run the main loop
            orchestrator.run()
            
    except KeyboardInterrupt:
        logger.info("\nShutdown requested by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exception=e)
        sys.exit(1)

if __name__ == "__main__":
    main()