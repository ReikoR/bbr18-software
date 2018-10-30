#ifndef GUI_H
#define GUI_H

#define _WINSOCKAPI_
#include <windows.h>

#include "DisplayWindow.h"
#include "Canvas.h"
#include "MouseListener.h"
#include "Config.h"
#include "BaseCamera.h"
#include "Vision.h"
#include <vector>
#include <string>

class CameraTranslator;
class Command;
class Vision;
class Blobber;
class Clusterer;
class ParticleFilterLocalizer;

class Gui : public MouseListener {

public:
	class Element : public MouseListener {
	public:
		Element();
		virtual void draw(unsigned char* image, int imageWidth = Config::cameraWidth, int imageHeight = Config::cameraHeight) = 0;
		virtual bool contains(int x, int y) { return false; };
		Canvas canvas;
		double lastInteractionTime;
	};

	class Button : public Element {
	public:
		Button(std::string text, int x, int y, int width = 0, int type = 0, bool visible = true, void* data = NULL);
		void draw(unsigned char* image, int imageWidth = Config::cameraWidth, int imageHeight = Config::cameraHeight);
		bool contains(int x, int y);
		void onMouseMove(int x, int y, DisplayWindow* win);
		void setVisible(bool visible) { this->visible = visible; }

		std::string text;
		int x;
		int y;
		int width;
		int type;
		void* data;
		bool active;
		bool visible;


	private:
		int getWidth();
		int getHeight();

		bool over;
	};

	//Gui(HINSTANCE instance, CameraTranslator* frontCameraTranslator, CameraTranslator* rearCameraTranslator, Blobber* blobberFront, Blobber* blobberRear, int width, int height);
	Gui(HINSTANCE instance, Blobber* blobber, int width, int height);
	~Gui();

	DisplayWindow* createWindow(int width, int height, std::string name);
	Button* createButton(std::string text, int x, int y, int width = 0, int type = 0, bool visible = true, void* data = NULL);

	unsigned char* rgb;

	void processFrame(unsigned char* bgr);
	void drawElements(unsigned char* image, int width, int height);
	void drawCenterLine(unsigned char* image, int width, int height);
	void drawMouse(CameraTranslator* cameraTranslator, unsigned char* image, int width, int height);
	bool isMouseOverElement(int x, int y);
	bool update(Vision::Result* visionResult);
	bool isQuitRequested() { return quitRequested; }
	void addMouseListener(MouseListener* listener);
	void setFps(int fps) { this->fps = fps; };
	void setFrontImages(unsigned char* rgb, unsigned char* yuyv, unsigned char* dataY, unsigned char* dataU, unsigned char* dataV, unsigned char* classification);
	void setFrontImages(unsigned char* rgb, unsigned char* rgbData, Vision::Result* visionResult);
	void setRearImages(unsigned char* rgb, unsigned char* yuyv, unsigned char* dataY, unsigned char* dataU, unsigned char* dataV, unsigned char* classification);
	void onMouseMove(int x, int y, DisplayWindow* win);
	void onMouseDown(int x, int y, MouseListener::MouseBtn btn, DisplayWindow* win);
	void onMouseUp(int x, int y, MouseListener::MouseBtn btn, DisplayWindow* win);
	void onMouseWheel(int delta, DisplayWindow* win);
	void emitMouseDown(int x, int y, MouseListener::MouseBtn btn, DisplayWindow* win);
	void emitMouseUp(int x, int y, MouseListener::MouseBtn btn, DisplayWindow* win);
	void emitMouseMove(int x, int y, DisplayWindow* win);
	void emitMouseWheel(int delta, DisplayWindow* win);

private:
	//void handleColorThresholding(unsigned char* dataY, unsigned char* dataU, unsigned char* dataV, unsigned char* rgb, unsigned char* classification);
	void handleColorThresholding(unsigned char* rgbData, unsigned char* rgb);
	void handleElements();
	void onElementClick(Element* element);

	HINSTANCE instance;
	MSG msg;
	std::vector<MouseListener*> mouseListeners;
	std::vector<DisplayWindow*> windows;
	DisplayWindow* frontRGB;
	DisplayWindow* frontClassification;
	//DisplayWindow* rearRGB;
	//DisplayWindow* frontClassification;
	//DisplayWindow* rearClassification;
	DisplayWindow* activeWindow;
	//CameraTranslator* frontCameraTranslator;
	//CameraTranslator* rearCameraTranslator;
	//Blobber* blobberFront;
	//Blobber* blobberRear;
	Blobber* blobber;
	Clusterer* clusterer;
	Button* clearSelectedBtn;
	Button* centroidCountButton;
	std::vector<Element*> elements;
	std::string selectedColorName;
	int width;
	int height;
	int fps;
	int mouseX;
	int mouseY;
	bool mouseDown;
	bool quitRequested;
	bool clustering;
	MouseListener::MouseBtn mouseBtn;
	int brushRadius;
	unsigned char* segmentedRgb;

	unsigned char* rgbData;
};

#endif // GUI_H
