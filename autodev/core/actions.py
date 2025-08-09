"""Mouse and keyboard automation actions."""

import os
import time
from typing import Tuple, Optional, List, Union
from enum import Enum

# Handle headless environment
try:
    import pyautogui
    from pynput import keyboard, mouse
    from pynput.keyboard import Key, Controller as KeyboardController
    from pynput.mouse import Button, Controller as MouseController
    AUTOMATION_AVAILABLE = True
except Exception:
    AUTOMATION_AVAILABLE = False
    pyautogui = None
    keyboard = None
    mouse = None
    Key = None
    KeyboardController = None
    MouseController = None
    Button = None

from utils.logger import logger
from utils.config import config

class ActionType(Enum):
    """Types of automation actions."""
    CLICK = "click"
    DOUBLE_CLICK = "double_click"
    RIGHT_CLICK = "right_click"
    MOVE = "move"
    DRAG = "drag"
    SCROLL = "scroll"
    TYPE = "type"
    KEY_PRESS = "key_press"
    HOTKEY = "hotkey"

class AutomationController:
    """Controls mouse and keyboard automation."""
    
    def __init__(self):
        """Initialize automation controller."""
        self.headless_mode = not AUTOMATION_AVAILABLE or os.environ.get('DISPLAY') is None
        
        if self.headless_mode:
            logger.warning("Running in headless mode - automation disabled")
            self.keyboard_controller = None
            self.mouse_controller = None
        else:
            self.keyboard_controller = KeyboardController() if KeyboardController else None
            self.mouse_controller = MouseController() if MouseController else None
            
            # Configure pyautogui safety
            if pyautogui:
                pyautogui.FAILSAFE = True
                pyautogui.PAUSE = config.action_delay
        
        self.action_history = []
        logger.success("Automation controller initialized" + (" (headless)" if self.headless_mode else ""))
    
    def is_available(self) -> bool:
        """Check if automation is available."""
        return not self.headless_mode and AUTOMATION_AVAILABLE
    
    # Mouse Actions
    
    def click(self, x: Optional[int] = None, y: Optional[int] = None, 
             button: str = "left", clicks: int = 1) -> bool:
        """Click at specified position or current position."""
        if not self.is_available():
            logger.debug(f"Headless mode - simulating click at ({x}, {y})")
            return True
        
        try:
            if x is not None and y is not None:
                pyautogui.click(x, y, button=button, clicks=clicks)
                logger.debug(f"Clicked {button} button {clicks}x at ({x}, {y})")
            else:
                pyautogui.click(button=button, clicks=clicks)
                logger.debug(f"Clicked {button} button {clicks}x at current position")
            
            self._record_action(ActionType.CLICK, {"x": x, "y": y, "button": button, "clicks": clicks})
            return True
            
        except Exception as e:
            logger.error(f"Click failed", exception=e)
            return False
    
    def double_click(self, x: Optional[int] = None, y: Optional[int] = None) -> bool:
        """Double click at position."""
        return self.click(x, y, clicks=2)
    
    def right_click(self, x: Optional[int] = None, y: Optional[int] = None) -> bool:
        """Right click at position."""
        return self.click(x, y, button="right")
    
    def move_to(self, x: int, y: int, duration: Optional[float] = None) -> bool:
        """Move mouse to position."""
        if not self.is_available():
            logger.debug(f"Headless mode - simulating move to ({x}, {y})")
            return True
        
        try:
            duration = duration or config.mouse_move_duration
            pyautogui.moveTo(x, y, duration=duration)
            logger.debug(f"Moved to ({x}, {y})")
            
            self._record_action(ActionType.MOVE, {"x": x, "y": y, "duration": duration})
            return True
            
        except Exception as e:
            logger.error(f"Move failed", exception=e)
            return False
    
    def drag_to(self, x: int, y: int, duration: Optional[float] = None, 
               button: str = "left") -> bool:
        """Drag from current position to target."""
        if not self.is_available():
            logger.debug(f"Headless mode - simulating drag to ({x}, {y})")
            return True
        
        try:
            duration = duration or config.mouse_move_duration
            pyautogui.dragTo(x, y, duration=duration, button=button)
            logger.debug(f"Dragged to ({x}, {y})")
            
            self._record_action(ActionType.DRAG, {"x": x, "y": y, "duration": duration, "button": button})
            return True
            
        except Exception as e:
            logger.error(f"Drag failed", exception=e)
            return False
    
    def scroll(self, clicks: int, x: Optional[int] = None, y: Optional[int] = None) -> bool:
        """Scroll at position."""
        if not self.is_available():
            logger.debug(f"Headless mode - simulating scroll {clicks} clicks")
            return True
        
        try:
            if x is not None and y is not None:
                pyautogui.scroll(clicks, x, y)
            else:
                pyautogui.scroll(clicks)
            
            logger.debug(f"Scrolled {clicks} clicks")
            self._record_action(ActionType.SCROLL, {"clicks": clicks, "x": x, "y": y})
            return True
            
        except Exception as e:
            logger.error(f"Scroll failed", exception=e)
            return False
    
    def get_mouse_position(self) -> Tuple[int, int]:
        """Get current mouse position."""
        if not self.is_available():
            return (0, 0)
        
        try:
            return pyautogui.position()
        except:
            return (0, 0)
    
    # Keyboard Actions
    
    def type_text(self, text: str, interval: Optional[float] = None) -> bool:
        """Type text with specified interval between characters."""
        if not self.is_available():
            logger.debug(f"Headless mode - simulating typing: {text[:50]}...")
            return True
        
        try:
            interval = interval or config.typing_speed
            pyautogui.typewrite(text, interval=interval)
            logger.debug(f"Typed {len(text)} characters")
            
            self._record_action(ActionType.TYPE, {"text": text[:100], "interval": interval})
            return True
            
        except Exception as e:
            logger.error(f"Typing failed", exception=e)
            return False
    
    def press_key(self, key: Union[str, Key]) -> bool:
        """Press a single key."""
        if not self.is_available():
            logger.debug(f"Headless mode - simulating key press: {key}")
            return True
        
        try:
            if isinstance(key, str):
                pyautogui.press(key)
            else:
                self.keyboard_controller.press(key)
                self.keyboard_controller.release(key)
            
            logger.debug(f"Pressed key: {key}")
            self._record_action(ActionType.KEY_PRESS, {"key": str(key)})
            return True
            
        except Exception as e:
            logger.error(f"Key press failed", exception=e)
            return False
    
    def hotkey(self, *keys: str) -> bool:
        """Press a hotkey combination."""
        if not self.is_available():
            logger.debug(f"Headless mode - simulating hotkey: {'+'.join(keys)}")
            return True
        
        try:
            pyautogui.hotkey(*keys)
            logger.debug(f"Pressed hotkey: {'+'.join(keys)}")
            
            self._record_action(ActionType.HOTKEY, {"keys": keys})
            return True
            
        except Exception as e:
            logger.error(f"Hotkey failed", exception=e)
            return False
    
    # Common Shortcuts
    
    def copy(self) -> bool:
        """Copy to clipboard."""
        return self.hotkey('ctrl', 'c')
    
    def paste(self) -> bool:
        """Paste from clipboard."""
        return self.hotkey('ctrl', 'v')
    
    def cut(self) -> bool:
        """Cut to clipboard."""
        return self.hotkey('ctrl', 'x')
    
    def undo(self) -> bool:
        """Undo last action."""
        return self.hotkey('ctrl', 'z')
    
    def redo(self) -> bool:
        """Redo last undone action."""
        return self.hotkey('ctrl', 'y')
    
    def select_all(self) -> bool:
        """Select all."""
        return self.hotkey('ctrl', 'a')
    
    def save(self) -> bool:
        """Save file."""
        return self.hotkey('ctrl', 's')
    
    def open_file(self) -> bool:
        """Open file dialog."""
        return self.hotkey('ctrl', 'o')
    
    def new_tab(self) -> bool:
        """Open new tab."""
        return self.hotkey('ctrl', 't')
    
    def close_tab(self) -> bool:
        """Close current tab."""
        return self.hotkey('ctrl', 'w')
    
    def switch_tab(self, direction: str = "next") -> bool:
        """Switch to next/previous tab."""
        if direction == "next":
            return self.hotkey('ctrl', 'tab')
        else:
            return self.hotkey('ctrl', 'shift', 'tab')
    
    def alt_tab(self) -> bool:
        """Switch application."""
        return self.hotkey('alt', 'tab')
    
    # Utility Methods
    
    def wait(self, seconds: float):
        """Wait for specified seconds."""
        logger.debug(f"Waiting {seconds} seconds...")
        time.sleep(seconds)
    
    def _record_action(self, action_type: ActionType, details: dict):
        """Record action in history."""
        self.action_history.append({
            "type": action_type.value,
            "details": details,
            "timestamp": time.time()
        })
        
        # Keep only last 100 actions
        if len(self.action_history) > 100:
            self.action_history = self.action_history[-100:]
    
    def get_action_history(self) -> List[dict]:
        """Get recent action history."""
        return self.action_history
    
    def clear_history(self):
        """Clear action history."""
        self.action_history = []
        logger.debug("Action history cleared")
    
    def take_screenshot(self, region: Optional[Tuple[int, int, int, int]] = None):
        """Take a screenshot."""
        if not self.is_available():
            logger.debug("Headless mode - cannot take screenshot")
            return None
        
        try:
            if region:
                return pyautogui.screenshot(region=region)
            else:
                return pyautogui.screenshot()
        except Exception as e:
            logger.error(f"Screenshot failed", exception=e)
            return None