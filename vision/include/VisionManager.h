#ifndef XIMEA_TEST_VISION_MANAGER_H
#define XIMEA_TEST_VISION_MANAGER_H

#include "Vision.h"
#include "FpsCounter.h"
#include "HubCom.h"
#include <string>
#include <json.hpp>
#include "png.h"

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
    bool saveRawFrame(std::string filename);
    bool saveRawSegmentedFrame(std::string filename);
    bool saveFrame(std::string filename);
    bool saveJPEG(unsigned char* data, std::string filename, int width, int height, int channels = 3);
    //bool saveJPEGTurbo(unsigned char* data, std::string filename, int width, int height, int channels = 3);
    bool saveWebP(unsigned char* data, std::string filename, int width, int height);

	bool debugVision;
	bool showGui;

private:
	void loadConf();
	void setupXimeaCamera(std::string name, XimeaCamera* camera);

	XimeaCamera* frontCamera;
	Gui* gui;
	Blobber* blobber;
	Vision* vision;
	Vision::Result* visionResult;
	FpsCounter* fpsCounter;
	HubCom* hubCom;

	nlohmann::json conf;

	bool running;
	float dt;
	double lastStepTime;
	float totalTime;
	Dir debugCameraDir;

    bool isImageSaved;

	void sendState();
	void handleCommunicationMessages();
	void handleCommunicationMessage(std::string message);
	bool isBlobBall(Blobber::Blob blob);
};

#endif