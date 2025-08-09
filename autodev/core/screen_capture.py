"""Screen capture and OCR functionality."""

import io
import os
import time
from pathlib import Path
from typing import Tuple, Optional, Dict, Any, List
from PIL import Image, ImageEnhance
import cv2
import numpy as np
from tenacity import retry, stop_after_attempt, wait_fixed

# Handle headless environment
try:
    import pyautogui
    PYAUTOGUI_AVAILABLE = True
except Exception as e:
    PYAUTOGUI_AVAILABLE = False
    pyautogui = None

try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except Exception as e:
    TESSERACT_AVAILABLE = False
    pytesseract = None

from utils.logger import logger
from utils.config import config

class ScreenCapture:
    """Handles screen capture and text extraction."""
    
    def __init__(self):
        """Initialize screen capture with OCR."""
        self.last_capture_time = 0
        self.min_capture_interval = 0.1  # Minimum time between captures
        self.headless_mode = not PYAUTOGUI_AVAILABLE or os.environ.get('DISPLAY') is None
        
        if self.headless_mode:
            logger.warning("Running in headless mode - screen capture disabled")
        else:
            # Configure pyautogui for safety
            if PYAUTOGUI_AVAILABLE:
                pyautogui.FAILSAFE = True
                pyautogui.PAUSE = 0.1
        
        # Test OCR availability
        self._test_ocr()
        
        logger.success("Screen capture initialized" + (" (headless mode)" if self.headless_mode else ""))
    
    def _test_ocr(self):
        """Test if Tesseract OCR is available."""
        if not TESSERACT_AVAILABLE:
            logger.warning("pytesseract module not available")
            return
            
        try:
            version = pytesseract.get_tesseract_version()
            logger.info(f"Tesseract OCR version: {version}")
        except Exception as e:
            logger.warning(f"Tesseract OCR not found: {e}")
            logger.info("Install from: https://github.com/UB-Mannheim/tesseract/wiki")
    
    @retry(stop=stop_after_attempt(3), wait=wait_fixed(0.5))
    def capture_screen(self, region: Optional[Tuple[int, int, int, int]] = None) -> Optional[Image.Image]:
        """Capture screenshot of screen or specific region."""
        if self.headless_mode:
            # Return a dummy image in headless mode
            logger.debug("Headless mode - returning dummy image")
            return Image.new('RGB', (800, 600), color='gray')
            
        try:
            # Rate limiting
            elapsed = time.time() - self.last_capture_time
            if elapsed < self.min_capture_interval:
                time.sleep(self.min_capture_interval - elapsed)
            
            # Capture screenshot
            if region:
                screenshot = pyautogui.screenshot(region=region)
                logger.debug(f"Captured region: {region}")
            else:
                screenshot = pyautogui.screenshot()
                logger.debug(f"Captured full screen: {screenshot.size}")
            
            self.last_capture_time = time.time()
            return screenshot
            
        except Exception as e:
            logger.error("Failed to capture screen", exception=e)
            # Return dummy image on failure
            return Image.new('RGB', (800, 600), color='gray')
    
    def extract_text(self, image: Image.Image, enhance: bool = True) -> str:
        """Extract text from image using OCR."""
        if not TESSERACT_AVAILABLE:
            logger.debug("Tesseract not available - returning empty text")
            return "Tesseract OCR not available in this environment"
            
        try:
            # Enhance image for better OCR
            if enhance:
                image = self._enhance_for_ocr(image)
            
            # Configure OCR
            custom_config = r'--oem 3 --psm 6'
            
            # Extract text
            text = pytesseract.image_to_string(
                image,
                lang=config.ocr_language,
                config=custom_config
            )
            
            # Clean up text
            text = text.strip()
            
            logger.metric("OCR extracted", len(text), " chars")
            return text
            
        except Exception as e:
            logger.error("OCR extraction failed", exception=e)
            return ""
    
    def extract_data(self, image: Image.Image) -> Dict[str, Any]:
        """Extract detailed data from image including bounding boxes."""
        try:
            # Get detailed OCR data
            data = pytesseract.image_to_data(
                image,
                lang=config.ocr_language,
                output_type=pytesseract.Output.DICT
            )
            
            # Process into structured format
            n_boxes = len(data['text'])
            results = {
                'text': [],
                'boxes': [],
                'confidence': []
            }
            
            for i in range(n_boxes):
                if int(data['conf'][i]) > 0:  # Filter out low confidence
                    results['text'].append(data['text'][i])
                    results['boxes'].append({
                        'x': data['left'][i],
                        'y': data['top'][i],
                        'width': data['width'][i],
                        'height': data['height'][i]
                    })
                    results['confidence'].append(data['conf'][i])
            
            return results
            
        except Exception as e:
            logger.error("Data extraction failed", exception=e)
            return {'text': [], 'boxes': [], 'confidence': []}
    
    def _enhance_for_ocr(self, image: Image.Image) -> Image.Image:
        """Enhance image for better OCR results."""
        # Convert to grayscale
        if image.mode != 'L':
            image = image.convert('L')
        
        # Enhance contrast
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(2.0)
        
        # Convert to numpy array for OpenCV processing
        img_array = np.array(image)
        
        # Apply threshold to get binary image
        _, img_array = cv2.threshold(img_array, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Denoise
        img_array = cv2.medianBlur(img_array, 1)
        
        # Convert back to PIL Image
        return Image.fromarray(img_array)
    
    def find_text_on_screen(self, text: str, exact: bool = False) -> Optional[Tuple[int, int]]:
        """Find text on screen and return its coordinates."""
        screenshot = self.capture_screen()
        data = self.extract_data(screenshot)
        
        search_text = text.lower()
        
        for i, extracted_text in enumerate(data['text']):
            if not extracted_text:
                continue
                
            extracted_lower = extracted_text.lower()
            
            if exact and extracted_lower == search_text:
                box = data['boxes'][i]
                center_x = box['x'] + box['width'] // 2
                center_y = box['y'] + box['height'] // 2
                logger.info(f"Found text '{text}' at ({center_x}, {center_y})")
                return (center_x, center_y)
            elif not exact and search_text in extracted_lower:
                box = data['boxes'][i]
                center_x = box['x'] + box['width'] // 2
                center_y = box['y'] + box['height'] // 2
                logger.info(f"Found text containing '{text}' at ({center_x}, {center_y})")
                return (center_x, center_y)
        
        logger.debug(f"Text '{text}' not found on screen")
        return None
    
    def detect_ui_elements(self, image: Image.Image) -> List[Dict[str, Any]]:
        """Detect UI elements like buttons, text fields, etc."""
        # Convert to OpenCV format
        img_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        
        elements = []
        
        # Detect edges for UI elements
        edges = cv2.Canny(gray, 50, 150)
        
        # Find contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 100:  # Filter small noise
                continue
            
            x, y, w, h = cv2.boundingRect(contour)
            
            # Classify element type based on aspect ratio and size
            aspect_ratio = w / h if h > 0 else 0
            element_type = self._classify_element(w, h, aspect_ratio)
            
            if element_type:
                elements.append({
                    'type': element_type,
                    'bounds': {'x': x, 'y': y, 'width': w, 'height': h},
                    'center': (x + w // 2, y + h // 2)
                })
        
        logger.debug(f"Detected {len(elements)} UI elements")
        return elements
    
    def _classify_element(self, width: int, height: int, aspect_ratio: float) -> Optional[str]:
        """Classify UI element based on dimensions."""
        if width < 20 or height < 20:
            return None
        
        if 0.8 < aspect_ratio < 1.2 and width < 100:
            return "icon"
        elif 2 < aspect_ratio < 8 and height < 50:
            return "button"
        elif aspect_ratio > 5 and height < 40:
            return "text_field"
        elif width > 200 and height > 200:
            return "panel"
        else:
            return "unknown"
    
    def capture_and_analyze(self) -> Tuple[Image.Image, str, Dict[str, Any]]:
        """Capture screen and perform full analysis."""
        # Capture screenshot
        screenshot = self.capture_screen()
        
        # Extract text
        text = self.extract_text(screenshot)
        
        # Detect UI elements
        elements = self.detect_ui_elements(screenshot)
        
        # Prepare analysis
        analysis = {
            'screen_size': screenshot.size,
            'text_length': len(text),
            'ui_elements': elements,
            'timestamp': time.time()
        }
        
        logger.success(f"Screen analysis complete: {len(text)} chars, {len(elements)} elements")
        
        return screenshot, text, analysis
    
    def save_screenshot(self, image: Image.Image, path: Optional[Path] = None) -> Path:
        """Save screenshot to file."""
        if path is None:
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            path = Path.home() / ".autodev" / "screenshots" / f"screen_{timestamp}.png"
        
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path, quality=config.screenshot_quality)
        logger.debug(f"Screenshot saved to {path}")
        
        return path
    
    def monitor_screen_changes(self, callback, interval: float = None):
        """Monitor screen for changes and call callback on change."""
        if interval is None:
            interval = config.ocr_refresh_rate
        
        last_text = ""
        
        try:
            while True:
                screenshot = self.capture_screen()
                current_text = self.extract_text(screenshot)
                
                if current_text != last_text:
                    logger.debug("Screen content changed")
                    callback(screenshot, current_text)
                    last_text = current_text
                
                time.sleep(interval)
                
        except KeyboardInterrupt:
            logger.info("Screen monitoring stopped")