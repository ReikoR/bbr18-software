#ifndef XIMEA_TEST_VISION_MANAGER_H
#define XIMEA_TEST_VISION_MANAGER_H

#include "Vision.h"
#include "FpsCounter.h"
#include "HubCom.h"
#include <string>
#include <json.hpp>

class XimeaCamera;
class Blobber;
class Gui;

class VisionManager {

public:
	VisionManager();
	~VisionManager();

	void setup();
	void run();

	void setupCameras();
	void setupSignalHandler();
	void setupGui();
	void setupVision();
	void setupFpsCounter();
	void setupHubCom();

	bool debugVision;
	bool showGui;

private:
	void loadConf();
	void setupXimeaCamera(std::string name, XimeaCamera* camera);

	XimeaCamera* frontCamera;
	Gui* gui;
	Blobber* blobber;
	FpsCounter* fpsCounter;
	HubCom* hubCom;

	nlohmann::json conf;

	bool running;
	float dt;
	double lastStepTime;
	float totalTime;
	Dir debugCameraDir;

	void sendState();
};

#endif