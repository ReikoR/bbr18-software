#include "Gui.h"
#include "CameraTranslator.h"
#include "DebugRenderer.h"
#include "ImageProcessor.h"
#include "Util.h"
#include "Clusterer.h"

#include <iostream>
#include <string>
#include <algorithm>

LRESULT CALLBACK WinProc(HWND hWnd,UINT message,WPARAM wParam,LPARAM lParam);

//Gui::Gui(HINSTANCE instance, CameraTranslator* frontCameraTranslator, CameraTranslator* rearCameraTranslator, Blobber* blobberFront, Blobber* blobberRear, int width, int height) : instance(instance), frontCameraTranslator(frontCameraTranslator), rearCameraTranslator(rearCameraTranslator), blobberFront(blobberFront), blobberRear(blobberRear), width(width), height(height), activeWindow(NULL), quitRequested(false) {
//	WNDCLASSEX wClass;
//	ZeroMemory(&wClass, sizeof(WNDCLASSEX));
//
//	wClass.cbClsExtra = 0;
//	wClass.cbSize = sizeof(WNDCLASSEX);
//	wClass.cbWndExtra = 0;
//	wClass.hbrBackground = (HBRUSH)COLOR_WINDOW;
//	wClass.hCursor = LoadCursor(NULL, IDC_ARROW);
//	wClass.hIcon = LoadIcon(NULL, IDI_APPLICATION);
//	wClass.hIconSm = LoadIcon(NULL, IDI_APPLICATION);
//	wClass.hInstance = instance;
//	wClass.lpfnWndProc = (WNDPROC)WinProc;
//	wClass.lpszClassName = "Window Class";
//	wClass.lpszMenuName = NULL;
//	wClass.style = CS_HREDRAW | CS_VREDRAW;
//
//	if (!RegisterClassEx(&wClass)) {
//		int nResult = GetLastError();
//
//		MessageBox(
//				NULL,
//				"Window class creation failed",
//				"Window Class Failed",
//				MB_ICONERROR
//		);
//	}
//
//	ZeroMemory(&msg, sizeof(MSG));
//
//	addMouseListener(this);
//
//	mouseX = 0;
//	mouseY = 0;
//	mouseDown = false;
//	mouseBtn = MouseListener::MouseBtn::LEFT;
//	brushRadius = 50;
//
//	frontRGB = createWindow(width, height, "Camera 1 RGB");
//	//rearRGB = createWindow(width, height, "Camera 2 RGB");
//	//frontClassification = createWindow(width, height, "Camera 1 classification");
//	//rearClassification = createWindow(width, height, "Camera 2 classification");
//
//	selectedColorName = "";
//
//	/*Blobber::Color* color;
//
//	for (int i = 0; i < blobberFront->getColorCount(); i++) {
//		color = blobberFront->getColor(i);
//
//		createButton(color->name, 20, 40 + i * 18, 160, 1);
//	}*/
//
//	createButton("green", 20, 40, 160, 1);
//
//	createButton("Clear all", 20 + 160 + 10, 40, 100, 2);
//	clearSelectedBtn = createButton("Clear selected", 20 + 280 + 10, 40, 140, 3, false);
//
//	createButton("Quit", Config::cameraWidth - 80, 20, 60, 4);
//}

Gui::Gui(HINSTANCE instance, Blobber* blobber, int width, int height) : instance(instance), blobber(blobber), width(width), height(height), activeWindow(NULL), quitRequested(false) {
    WNDCLASSEX wClass;
    ZeroMemory(&wClass, sizeof(WNDCLASSEX));

    wClass.cbClsExtra = 0;
    wClass.cbSize = sizeof(WNDCLASSEX);
    wClass.cbWndExtra = 0;
    wClass.hbrBackground = (HBRUSH)COLOR_WINDOW;
    wClass.hCursor = LoadCursor(NULL, IDC_ARROW);
    wClass.hIcon = LoadIcon(NULL, IDI_APPLICATION);
    wClass.hIconSm = LoadIcon(NULL, IDI_APPLICATION);
    wClass.hInstance = instance;
    wClass.lpfnWndProc = (WNDPROC)WinProc;
    wClass.lpszClassName = "Window Class";
    wClass.lpszMenuName = NULL;
    wClass.style = CS_HREDRAW | CS_VREDRAW;

	if (!RegisterClassEx(&wClass)) {
		int nResult = GetLastError();

		MessageBox(
				NULL,
				"Window class creation failed",
				"Window Class Failed",
				MB_ICONERROR
		);
	}

	ZeroMemory(&msg, sizeof(MSG));

	addMouseListener(this);

	mouseX = 0;
	mouseY = 0;
	mouseDown = false;
	mouseBtn = MouseListener::MouseBtn::LEFT;
	brushRadius = 50;

    rgbData = new unsigned char[3 * width * height];
    rgb = new unsigned char[3 * width * height];
	segmentedRgb = new unsigned char[3 * width * height];

	frontClassification = createWindow(width, height, "Camera 1 classification");
	frontRGB = createWindow(width, height, "Camera 1 RGB");

	selectedColorName = "";

	Blobber::ColorClassState* color;

	for (int i = 0, y = 0; i < blobber->getColorCount(); i++) {
		color = blobber->getColor(i);

        if (color->name != NULL) {
            createButton(color->name, 20, 40 + y * 18, 160, 1);
            y++;
        }
	}

	//createButton("green", 20, 40, 160, 1);

	createButton("Clear all", 20 + 160 + 10, 40, 100, 2);
	clearSelectedBtn = createButton("Clear selected", 20 + 280 + 10, 40, 140, 3, false);

	createButton("Quit", Config::cameraWidth - 80, 20, 60, 4);

	createButton("Clustering mode", Config::cameraWidth - 80 - 85, 38, 145, 5);
	clustering = false;
	clusterer = new Clusterer();

	createButton("-", Config::cameraWidth - 80 - 85, 56, 20, 6);
	centroidCountButton = createButton(std::to_string(clusterer->centroidCount), Config::cameraWidth - 80 - 85 + 20, 56, 30, 7);
	createButton("+", Config::cameraWidth - 80 - 85 + 50, 56, 20, 8);
}

Gui::~Gui() {
	for (std::vector<DisplayWindow*>::const_iterator i = windows.begin(); i != windows.end(); i++) {
		delete *i;
	}

	windows.clear();

	for (std::vector<Element*>::const_iterator i = elements.begin(); i != elements.end(); i++) {
		delete *i;
	}

	elements.clear();
}

DisplayWindow* Gui::createWindow(int width, int height, std::string name) {
	DisplayWindow* window = new DisplayWindow(instance, width, height, name, this);

	windows.push_back(window);

	return window;
}

Gui::Button* Gui::createButton(std::string text, int x, int y, int width, int type, bool visible, void* data) {
	Button* button = new Button(text, x, y, width, type, visible, data);

	addMouseListener(button);

	elements.push_back(button);

	return button;
}

void Gui::processFrame(unsigned char* bgr) {
    //unsigned char* f = frame->data;
    //int w = width;
    //int h = height;
    //unsigned char* p = rgb;

	//__int64 startTime = Util::timerStart();

	//openCLCompute->deBayer(f, p, w, h);

	//std::cout << "! deBayer time: " << Util::timerEnd(startTime) << std::endl;

    /*for (int y=1; y < h-1; y += 2) {//ignore sides
        for (int x = 1; x < w-1; x+=2) {
            //http://en.wikipedia.org/wiki/Bayer_filter
            //current block is BGGR
            //blue f[y*w+x],green1 f[y*w+x+1],green2 f[y*w+x+w],red f[y*w+x+w+1]
            int xy = y*w+x;
            int txy = xy*3;

            p[txy++] = f[xy];
            p[txy++] = (f[xy-1]+f[xy+1]+f[xy-w]+f[xy+w]+2) >> 2;//left,right,up,down
            p[txy++] = (f[xy-w-1]+f[xy-w+1]+f[xy+w-1]+f[xy+w+1]+2) >> 2;//diagonal

            xy += 1;
            p[txy++] = (f[xy-1]+f[xy+1]+1) >> 1;//left,right
            p[txy++] = f[xy];
            p[txy++] = (f[xy-w]+f[xy+w]+1) >> 1;//up,down

            xy += w - 1;
            txy = xy * 3;
            p[txy++] = (f[xy-w] + f[xy+w]+1) >> 1;//up,down
            p[txy++] = f[xy];
            p[txy++] = (f[xy-1]+f[xy+1]+1) >> 1;//left,right

            xy += 1;
            p[txy++] = (f[xy-w-1]+f[xy-w+1]+f[xy+w-1]+f[xy+w+1]+2) >> 2;//diagonal
            p[txy++] = (f[xy-1]+f[xy+1]+f[xy-w]+f[xy+w]+2) >> 2;//left,right,up,down
            p[txy]   = f[xy];
        }
    }*/

	rgbData = bgr;
	memcpy(rgb, rgbData, static_cast<size_t>(3 * width * height));
}


void Gui::drawElements(unsigned char* image, int width, int height) {
	for (std::vector<Element*>::const_iterator i = elements.begin(); i != elements.end(); i++) {
		(*i)->draw(image, width, height);
	}
}

void Gui::drawCenterLine(unsigned char* image, int width, int height) {
	Canvas canvas;

	canvas.width = width;
	canvas.height = height;
	canvas.data = image;

	canvas.drawLine(width / 2, 0, width / 2, height - 1);
}

void Gui::drawMouse(CameraTranslator* cameraTranslator, unsigned char* image, int width, int height) {
	/*Canvas canvas;

	canvas.width = width;
	canvas.height = height;
	canvas.data = image;

	CameraTranslator::CameraPosition distorted = cameraTranslator->distort(mouseX, mouseY);
	CameraTranslator::CameraPosition undistorted = cameraTranslator->undistort(mouseX, mouseY);

	char buf[256];

	sprintf(buf, "distorted: %dx%d, undistorted: %dx%d", distorted.x, distorted.y, undistorted.x, undistorted.y);
	canvas.drawText(mouseX, mouseY, buf, 0, 0, 128);*/
}

bool Gui::isMouseOverElement(int x, int y) {
	for (std::vector<Element*>::const_iterator i = elements.begin(); i != elements.end(); i++) {
		if ((*i)->contains(x, y)) {
			return true;
		}
	}

	return false;
}

bool Gui::update() {
	setFrontImages(rgb, rgbData);

	while (PeekMessage(&msg, NULL, 0, 0, PM_REMOVE) != 0) {
		TranslateMessage(&msg);
		DispatchMessage(&msg);

		if (msg.message == WM_QUIT) {
			return false;
		}
	}

	return true;
}

void Gui::addMouseListener(MouseListener* listener) {
	mouseListeners.push_back(listener);
	auto size = this->mouseListeners.size();
}

void Gui::setFrontImages(unsigned char* rgb, unsigned char* yuyv, unsigned char* dataY, unsigned char* dataU, unsigned char* dataV, unsigned char* classification) {
	DebugRenderer::renderFPS(rgb, fps);

	drawElements(rgb, width, height);
	//drawElements(classification, width, height);
	//drawMouse(frontCameraTranslator, rgb, width, height);

	//if (activeWindow == frontClassification || activeWindow == frontRGB) {
	if (activeWindow == frontRGB) {
		if (!isMouseOverElement(mouseX, mouseY)) {
			if (selectedColorName.length() > 0) {
				//handleColorThresholding(dataY, dataU, dataV, rgb, classification);
				//handleColorThresholding(rgbData, rgb);
			}
		} else {
			handleElements();
		}
	}

	frontClassification->setImage(classification, true);
	frontRGB->setImage(rgb, true);
}

void Gui::setFrontImages(unsigned char* rgb, unsigned char* rgbData) {
	if (clustering) {
		clusterer->processFrame(rgbData);
		clusterer->getSegmentedRgb(rgb);
	}

	DebugRenderer::renderFPS(rgb, fps);

	blobber->getSegmentedRgb(segmentedRgb);
	
	DebugRenderer::renderBlobs(segmentedRgb, blobber, width, height);
	DebugRenderer::renderBlobs(rgb, blobber, width, height);

	drawElements(rgb, width, height);
	drawElements(segmentedRgb, width, height);
	drawCenterLine(rgb, width, height);
	//drawMouse(frontCameraTranslator, rgb, width, height);

	//if (activeWindow == frontClassification || activeWindow == frontRGB) {
	if (activeWindow == frontRGB || activeWindow == frontClassification) {
		if (!isMouseOverElement(mouseX, mouseY)) {
			if (selectedColorName.length() > 0) {
				//handleColorThresholding(dataY, dataU, dataV, rgb, classification);
				handleColorThresholding(rgbData, rgb);
			}
		} else {
			handleElements();
		}
	}

	frontClassification->setImage(segmentedRgb, true);
	frontRGB->setImage(rgb, true);
}

//void Gui::setRearImages(unsigned char* rgb, unsigned char* yuyv, unsigned char* dataY, unsigned char* dataU, unsigned char* dataV, unsigned char* classification) {
//	DebugRenderer::renderFPS(rgb, fps);
//
//	drawElements(rgb, width, height);
//	drawElements(classification, width, height);
//	drawMouse(rearCameraTranslator, rgb, width, height);
//
//	if (activeWindow == rearClassification || activeWindow == rearRGB) {
//		if (!isMouseOverElement(mouseX, mouseY)) {
//			if (selectedColorName.length() > 0) {
//				//handleColorThresholding(dataY, dataU, dataV, rgb, classification);
//				handleColorThresholding(rgb);
//			}
//		} else {
//			handleElements();
//		}
//	}
//
//	rearRGB->setImage(rgb, true);
//	rearClassification->setImage(classification, true);
//}

//void Gui::handleColorThresholding(unsigned char* dataY, unsigned char* dataU, unsigned char* dataV, unsigned char* rgb, unsigned char* classification) {
void Gui::handleColorThresholding(unsigned char* rgbData, unsigned char* rgb) {
    if (!clustering) {
        DebugRenderer::renderBrush(rgb, mouseX, mouseY, brushRadius, mouseDown);
        DebugRenderer::renderBrush(segmentedRgb, mouseX, mouseY, brushRadius, mouseDown);
    }

    if (mouseDown) {
		float stdDev = 2.0f;

		//ImageProcessor::RGBInfo rgbInfo = ImageProcessor::extractColors(rgbData, width, height, mouseX, mouseY, brushRadius, stdDev);
		ImageProcessor::RGBRange rgbRange = ImageProcessor::extractColorRange(rgbData, width, height, mouseX, mouseY, brushRadius, stdDev);
        std::cout << "rgbRange " << +rgbRange.minR << " " << +rgbRange.maxR << "; "
                  << +rgbRange.minG << " " << +rgbRange.maxG << "; "
                  << +rgbRange.minB << " " << +rgbRange.maxB << " " << std::endl;

        if (mouseBtn == MouseListener::MouseBtn::LEFT) {
            /*unsigned char b = rgb[mouseY * width + mouseX];
            unsigned char g = rgb[mouseY * width + mouseX + 1];
            unsigned char r = rgb[mouseY * width + mouseX + 2];
            blobber->setPixelColor(r, g, b, 1);*/

			/*for (int i = 0; i < rgbInfo.count; i++) {
				ImageProcessor::RGBColor pixel = rgbInfo.pixels[i];
				blobber->setPixelColor(pixel.r, pixel.g, pixel.b, 1);
			}*/

            Blobber::ColorClassState* selectedColor = blobber->getColor(selectedColorName);

            if (selectedColor != NULL) {
                if (clustering) {
                    blobber->setPixelClusterRange(
                    		clusterer->centroids,
							clusterer->getCentroidIndexAt(mouseX, mouseY),
							clusterer->centroidCount,
							selectedColor->color
					);
                } else {
                    blobber->setPixelColorRange(rgbRange, selectedColor->color);
                }
            }

		} else if (mouseBtn == MouseListener::MouseBtn::RIGHT) {
        	if (clustering) {
				blobber->setPixelClusterRange(
						clusterer->centroids,
						clusterer->getCentroidIndexAt(mouseX, mouseY),
						clusterer->centroidCount,
						0
				);
        	} else {
				blobber->setPixelColorRange(rgbRange, 0);
			}
		} else if (mouseBtn == MouseListener::MouseBtn::MIDDLE) {
            blobber->clearColor(selectedColorName);
		}
	}
}

void Gui::handleElements() {
	if (!mouseDown) {
		return;
	}

	Element* element;

	for (std::vector<Element*>::const_iterator i = elements.begin(); i != elements.end(); i++) {
		element = *i;

		if (element->contains(mouseX, mouseY)) {
			onElementClick(element);
		}
	}
}

void Gui::onElementClick(Element* element) {
	Button* button = dynamic_cast<Button*>(element);
	bool unset = false;

	if (button != NULL) {
		if (Util::duration(button->lastInteractionTime) < 0.2) {
			return;
		}

		button->lastInteractionTime = Util::millitime();

		if (button->type == 1) {
			std::cout << "! Button '" << button->text << "' clicked" << std::endl;

			if (button->type == 1) {
				if (button->text != selectedColorName) {
					selectedColorName = button->text;

					clearSelectedBtn->setVisible(true);
				} else {
					selectedColorName = "";
					unset = true;

					clearSelectedBtn->setVisible(false);
				}
			}

			Element* el;
			Button* btn;

			for (std::vector<Element*>::const_iterator i = elements.begin(); i != elements.end(); i++) {
				el = *i;
				btn = dynamic_cast<Button*>(el);

				if (btn == NULL) {
					continue;
				}

				if (btn == button) {
					btn->active = unset ? false : true;
				} else {
					btn->active = false;
				}
			}
		} else if (button->type == 2) {
            blobber->clearColors();
		} else if (button->type == 3) {
            blobber->clearColor(selectedColorName);
		} else if (button->type == 4) {
			quitRequested = true;
		} else if (button->type == 5) {
		    clustering = !clustering;

		    if (clustering) {
				//clusterer->processFrame(rgbData, 5);
			}
		}  else if (button->type == 6) {
			clusterer->setCentroidCount(std::max(clusterer->centroidCount - 1, 1));
			centroidCountButton->text = std::to_string(clusterer->centroidCount);
		} else if (button->type == 8) {
			clusterer->setCentroidCount(clusterer->centroidCount + 1);
			centroidCountButton->text = std::to_string(clusterer->centroidCount);
		}
	}
}



void Gui::onMouseMove(int x, int y, DisplayWindow* win) {
	mouseX = x;
	mouseY = y;

	activeWindow = win;
}

void Gui::onMouseDown(int x, int y, MouseListener::MouseBtn btn, DisplayWindow* win) {
	mouseDown = true;
	mouseBtn = btn;

	activeWindow = win;
}

void Gui::onMouseUp(int x, int y, MouseListener::MouseBtn btn, DisplayWindow* win) {
	mouseDown = false;
	mouseBtn = btn;

	activeWindow = win;
}

void Gui::onMouseWheel(int delta, DisplayWindow* win) {
	brushRadius += delta / 120 * 5;

	if (brushRadius < 5) {
		brushRadius = 5;
	}

	activeWindow = win;
}

void Gui::emitMouseDown(int x, int y, MouseListener::MouseBtn btn, DisplayWindow* win) {
    for (std::vector<MouseListener*>::const_iterator i = mouseListeners.begin(); i != mouseListeners.end(); i++) {
		(*i)->onMouseDown(x, y, btn, win);
	}
}

void Gui::emitMouseUp(int x, int y, MouseListener::MouseBtn btn, DisplayWindow* win) {
    for (std::vector<MouseListener*>::const_iterator i = mouseListeners.begin(); i != mouseListeners.end(); i++) {
		(*i)->onMouseUp(x, y, btn, win);
	}
}

void Gui::emitMouseMove(int x, int y, DisplayWindow* win) {
	for (std::vector<MouseListener*>::const_iterator i = mouseListeners.begin(); i != mouseListeners.end(); i++) {
		(*i)->onMouseMove(x, y, win);
	}
}

void Gui::emitMouseWheel(int delta, DisplayWindow* win) {
    for (std::vector<MouseListener*>::const_iterator i = mouseListeners.begin(); i != mouseListeners.end(); i++) {
		(*i)->onMouseWheel(delta, win);
	}
}

Gui::Element::Element() : lastInteractionTime(0.0) {

}

Gui::Button::Button(std::string text, int x, int y, int width, int type, bool visible, void* data) : Element(), text(text), x(x), y(y), width(width), type(type), visible(visible), data(data), over(false), active(false) {

}

void Gui::Button::draw(unsigned char* image, int imageWidth, int imageHeight) {

    if (!visible) {
		return;
	}

	canvas.width = imageWidth;
	canvas.height = imageHeight;
	canvas.data = image;

	if (active) {
		canvas.fillBox(x, y, getWidth(), getHeight(), 255, 0, 0);
		canvas.drawBox(x, y, getWidth(), getHeight(), 255, over ? 0 : 255, over ? 0 : 255);
		canvas.drawText(x + 6, y + 4, text, 255, 255, 255, false);
	} else {
		canvas.drawBox(x, y, getWidth(), getHeight(), over ? 255 : 0, over ? 0 : 0, over ? 0 : 255);
		canvas.drawText(x + 6, y + 4, text, over ? 255 : 0, over ? 0 : 0, over ? 0 : 255, false);
	}
}

int Gui::Button::getWidth() {
	if (width != 0) {
		return width;
	} else {
		return text.length() * 9 + 6 * 2;
	}
}

int Gui::Button::getHeight() {
	return 16;
}

void Gui::Button::onMouseMove(int x, int y, DisplayWindow* win) {
	over = contains(x, y);
}

bool Gui::Button::contains(int px, int py) {
	return px >= x
		   && px <= x + getWidth()
		   && py >= y
		   && py <= y + getHeight();
}

LRESULT CALLBACK WinProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam) {
	switch(msg) {
		case WM_CREATE:
			//SetWindowLong(hWnd, GWL_USERDATA, LONG(LPCREATESTRUCT(lParam)->lpCreateParams));
			SetWindowLongPtr(hWnd, GWLP_USERDATA, PtrToUlong(LPCREATESTRUCT(lParam)->lpCreateParams));
			//SetWindowLongPtr(hWnd, GWLP_USERDATA, lParam);
			break;

		case WM_DESTROY:
			PostQuitMessage(0);
			printf("Destroy\n");

			return 0;
			break;

		default:
			//DisplayWindow* displayWindow = (DisplayWindow*)GetWindowLong(hWnd, GWL_USERDATA);
			DisplayWindow* displayWindow = (DisplayWindow*)GetWindowLongPtr(hWnd, GWLP_USERDATA);

			if (displayWindow != NULL) {
				return displayWindow->handleMessage(hWnd, msg, wParam, lParam);
			} else {
				return DefWindowProc(hWnd, msg, wParam, lParam);
			}
			break;
	}

	return 0;
}
