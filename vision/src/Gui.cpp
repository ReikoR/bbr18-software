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
    mouseStartX = -1;
    mouseStartY = -1;
	mouseDown = false;
	prevMouseDown = false;
	mouseBtn = MouseListener::MouseBtn::LEFT;
	brushRadius = 50;

    rgbData = new unsigned char[3 * width * height];
    rgb = new unsigned char[3 * width * height];
	segmentedRgb = new unsigned char[3 * width * height];

	frontClassification = createWindow(width, height, "Camera 1 classification");
	frontRGB = createWindow(width, height, "Camera 1 RGB");

	selectedColorName = "";

    colorSelectionStdDev = 2.0f;

	Blobber::ColorClassState* color;

	for (int i = 0, y = 0; i < blobber->getColorCount(); i++) {
		color = blobber->getColor(Blobber::BlobColor(i));

        if (color->name != nullptr) {
            createButton(color->name, 20, 40 + y * 18, 160, ButtonType::selectColor);
            y++;
        }
	}

	createButton("Clear all", 20 + 160 + 10, 40, 100, ButtonType::clearAll);
	clearSelectedBtn = createButton("Clear selected", 20 + 280 + 10, 40, 140, ButtonType::clearColor, false);

	createButton("Quit", width - 80, 20, 60, ButtonType::quit);
    createButton("Save", width - 160, 20, 60, ButtonType::save);
    createButton("Undo", width - 240, 20, 60, ButtonType::undo);

	createButton("Clustering mode", width - 80 - 85, 50, 145, ButtonType::toggleClustering);
	clustering = false;
	clusterer = new Clusterer();

	createButton("-", width - 80 - 85, 68, 20, ButtonType::decreaseClusters);
	centroidCountButton = createButton(std::to_string(clusterer->centroidCount), width - 80 - 85 + 20, 68, 30, ButtonType::unknown);
	createButton("+", width - 80 - 85 + 50, 68, 20, ButtonType::increaseClusters);

    createButton("-", width - 360, 20, 20, ButtonType::decreaseStdDev);
    colorSelectionStdDevButton = createButton(Util::floatToString(colorSelectionStdDev, 1), width - 360 + 20, 20, 60, ButtonType::unknown);
    createButton("+", width - 360 + 80, 20, 20, ButtonType::increaseStdDev);
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
	auto* window = new DisplayWindow(instance, width, height, name, this);

	windows.push_back(window);

	return window;
}

Gui::Button* Gui::createButton(std::string text, int x, int y, int width, ButtonType type, bool visible, void* data) {
	auto* button = new Button(text, x, y, width, type, visible, data);

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
	for (auto element : elements) {
		element->draw(image, width, height);
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
	for (auto element : elements) {
		if (element->contains(x, y)) {
			return true;
		}
	}

	return false;
}

bool Gui::update(Vision::Result* visionResult) {
	setFrontImages(rgb, rgbData, visionResult);

	while (PeekMessage(&msg, nullptr, 0, 0, PM_REMOVE) != 0) {
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

void Gui::setFrontImages(unsigned char* rgb, unsigned char* rgbData, Vision::Result* visionResult) {
	if (clustering) {
		clusterer->processFrame(rgbData);
		clusterer->getSegmentedRgb(rgb);
	}

	DebugRenderer::renderFPS(rgb, fps);

	blobber->getSegmentedRgb(segmentedRgb);

	//DebugRenderer::renderBlobs(rgb, blobber, width, height);
	//DebugRenderer::renderBlobs(segmentedRgb, blobber, width, height);

	DebugRenderer::renderBaskets(rgb, visionResult->baskets, blobber);
	DebugRenderer::renderBalls(rgb, visionResult->balls, blobber);

	drawElements(rgb, width, height);
	drawElements(segmentedRgb, width, height);
	drawCenterLine(rgb, width, height);
	//drawMouse(frontCameraTranslator, rgb, width, height);

	//if (activeWindow == frontClassification || activeWindow == frontRGB) {
	if (activeWindow == frontRGB || activeWindow == frontClassification) {
		if (selectedColorName.length() > 0 && !isMouseOverElement(mouseStartX, mouseStartY)) {
            handleColorThresholding(rgbData, rgb);
		}
	}

	frontClassification->setImage(segmentedRgb, true);
	frontRGB->setImage(rgb, true);
}


void Gui::handleColorThresholding(unsigned char* rgbData, unsigned char* rgb) {
    if (!clustering) {
        DebugRenderer::renderBrush(rgb, mouseX, mouseY, brushRadius, mouseDown);
        DebugRenderer::renderBrush(segmentedRgb, mouseX, mouseY, brushRadius, mouseDown);
    }

    if (mouseDown) {
		//ImageProcessor::RGBInfo rgbInfo = ImageProcessor::extractColors(rgbData, width, height, mouseX, mouseY, brushRadius, stdDev);
		/*ImageProcessor::RGBRange rgbRange = ImageProcessor::extractColorRange(rgbData, width, height, mouseX, mouseY, brushRadius, stdDev);
        std::cout << "rgbRange " << +rgbRange.minR << " " << +rgbRange.maxR << "; "
                  << +rgbRange.minG << " " << +rgbRange.maxG << "; "
                  << +rgbRange.minB << " " << +rgbRange.maxB << " " << std::endl;*/

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

            if (selectedColor != nullptr) {
                if (clustering) {
                    blobber->setPixelClusterRange(
                    		clusterer->centroids,
							clusterer->getCentroidIndexAt(mouseX, mouseY),
							clusterer->centroidCount,
							selectedColor->color
					);
                } else {
                    //blobber->setPixelColorRange(rgbRange, selectedColor->color);

                    ImageProcessor::RGBInfo rgbInfo = ImageProcessor::extractColors(rgbData, width, height, mouseX, mouseY, brushRadius, colorSelectionStdDev);

                    for (int i = 0; i < rgbInfo.count; i++) {
                        ImageProcessor::RGBColor pixel = rgbInfo.pixels[i];
                        blobber->setPixelColor(pixel.r, pixel.g, pixel.b, selectedColor->color);
                    }

                    for (int i = 0; i < rgbInfo.count; i++) {
                        ImageProcessor::RGBColor pixel = rgbInfo.pixels[i];
                        blobber->fillAdjacentColorPixels(pixel.r, pixel.g, pixel.b, selectedColor->color);
                    }
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
				//blobber->setPixelColorRange(rgbRange, 0);

                ImageProcessor::RGBInfo rgbInfo = ImageProcessor::extractColors(rgbData, width, height, mouseX, mouseY, brushRadius, colorSelectionStdDev);

                for (int i = 0; i < rgbInfo.count; i++) {
                    ImageProcessor::RGBColor pixel = rgbInfo.pixels[i];
                    blobber->setPixelColor(pixel.r, pixel.g, pixel.b, 0);
                }
			}
		} else if (mouseBtn == MouseListener::MouseBtn::MIDDLE) {
            blobber->clearColor(selectedColorName);
		}
	}

    if (prevMouseDown && !mouseDown) {
        std::cout << "MOUSE UP" << std::endl;
        blobber->createHistoryEntry();
    }

    prevMouseDown = mouseDown;
}

void Gui::handleElements() {
	Element* element;

	for (auto i : elements) {
		element = i;

		if (element->contains(mouseStartX, mouseStartY) && element->contains(mouseX, mouseY)) {
			onElementClick(element);
			break;
		}
	}
}

void Gui::onElementClick(Element* element) {
	auto* button = dynamic_cast<Button*>(element);
	bool unset = false;

	if (button != nullptr) {
		if (Util::duration(button->lastInteractionTime) < 0.2) {
			return;
		}

		button->lastInteractionTime = Util::millitime();

		if (button->type == ButtonType::selectColor) {
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

			for (auto element : elements) {
				el = element;
				btn = dynamic_cast<Button*>(el);

				if (btn == nullptr) {
					continue;
				}

				if (btn == button) {
					btn->active = !unset;
				} else {
					btn->active = false;
				}
			}
		} else if (button->type == ButtonType::clearAll) {
            blobber->clearColors();
            blobber->createHistoryEntry();
		} else if (button->type == ButtonType::clearColor) {
            blobber->clearColor(selectedColorName);
            blobber->createHistoryEntry();
		} else if (button->type == ButtonType::quit) {
			quitRequested = true;
		} else if (button->type == ButtonType::toggleClustering) {
		    clustering = !clustering;
		    button->active = clustering;
		} else if (button->type == ButtonType::decreaseClusters) {
			clusterer->setCentroidCount(std::max(clusterer->centroidCount - 1, 1));
			centroidCountButton->text = std::to_string(clusterer->centroidCount);
		} else if (button->type == ButtonType::increaseClusters) {
			clusterer->setCentroidCount(clusterer->centroidCount + 1);
			centroidCountButton->text = std::to_string(clusterer->centroidCount);
		} else if (button->type == ButtonType::undo) {
            std::cout << "! UNDO" << std::endl;
            blobber->undo();
        } else if (button->type == ButtonType::save) {
            std::cout << "! Save" << std::endl;
            blobber->saveColors("colors.dat");
        } else if (button->type == ButtonType::decreaseStdDev) {
            colorSelectionStdDev = std::max(colorSelectionStdDev - 1, 1.0f);
            colorSelectionStdDevButton->text = Util::floatToString(colorSelectionStdDev, 1);
        } else if (button->type == ButtonType::increaseStdDev) {
            colorSelectionStdDev += 1;
            colorSelectionStdDevButton->text = Util::floatToString(colorSelectionStdDev, 1);
        }
	}
}



void Gui::onMouseMove(int x, int y, DisplayWindow* win) {
	mouseX = x;
	mouseY = y;

	activeWindow = win;
}

void Gui::onMouseDown(int x, int y, MouseListener::MouseBtn btn, DisplayWindow* win) {
    std::cout << "onMouseDown " << +x << " " << +y << std::endl;
    mouseStartX = x;
    mouseStartY = y;

    mouseDown = true;
	mouseBtn = btn;

	activeWindow = win;
}

void Gui::onMouseUp(int x, int y, MouseListener::MouseBtn btn, DisplayWindow* win) {
    std::cout << "onMouseUp " << +x << " " << +y << std::endl;
	mouseDown = false;
	mouseBtn = btn;

	activeWindow = win;

	handleElements();

    mouseStartX = -1;
    mouseStartY = -1;
}

void Gui::onMouseWheel(int delta, DisplayWindow* win) {
	brushRadius += delta / 120 * 5;

	if (brushRadius < 2) {
		brushRadius = 2;
	}

	activeWindow = win;
}

void Gui::emitMouseDown(int x, int y, MouseListener::MouseBtn btn, DisplayWindow* win) {
    for (auto mouseListener : mouseListeners) {
		mouseListener->onMouseDown(x, y, btn, win);
	}
}

void Gui::emitMouseUp(int x, int y, MouseListener::MouseBtn btn, DisplayWindow* win) {
    for (auto mouseListener : mouseListeners) {
		mouseListener->onMouseUp(x, y, btn, win);
	}
}

void Gui::emitMouseMove(int x, int y, DisplayWindow* win) {
	for (auto mouseListener : mouseListeners) {
		mouseListener->onMouseMove(x, y, win);
	}
}

void Gui::emitMouseWheel(int delta, DisplayWindow* win) {
    for (auto mouseListener : mouseListeners) {
		mouseListener->onMouseWheel(delta, win);
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
		canvas.drawBox(x, y, getWidth(), getHeight(), over ? 255 : 0, 0, over ? 0 : 255);
		canvas.drawText(x + 6, y + 4, text, over ? 255 : 0, 0, over ? 0 : 255, false);
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
			auto* displayWindow = (DisplayWindow*)GetWindowLongPtr(hWnd, GWLP_USERDATA);

			if (displayWindow != nullptr) {
				return displayWindow->handleMessage(hWnd, msg, wParam, lParam);
			} else {
				return DefWindowProc(hWnd, msg, wParam, lParam);
			}
			break;
	}

	return 0;
}
