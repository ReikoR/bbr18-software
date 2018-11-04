#include "VisionManager.h"
#include "XimeaCamera.h"
#include "Gui.h"
#include "FpsCounter.h"
#include "SignalHandler.h"
#include "Util.h"
#include <algorithm>
#include <json.hpp>

VisionManager::VisionManager() :
	frontCamera(nullptr),
	gui(nullptr),
	blobber(nullptr),
	vision(nullptr),
	fpsCounter(nullptr),
	hubCom(nullptr),
	running(false), debugVision(false),
	dt(0.01666f), lastStepTime(0.0), totalTime(0.0f),
	debugCameraDir(Dir::FRONT)
{
	visionResult = new Vision::Result();
	visionResult->vision = vision;
}

VisionManager::~VisionManager() {
	std::cout << "! Releasing all resources" << std::endl;

	delete gui;
	gui = nullptr;
	delete frontCamera;
	frontCamera = nullptr;
    delete blobber;
	blobber = nullptr;
    delete hubCom;
	hubCom = nullptr;

	std::cout << "! Resources freed" << std::endl;
}

void VisionManager::loadConf() {
	std::ifstream infile("../public-conf.json");

	if (infile.fail()) {
		std::cout << "! Parsing command line options" << std::endl;
		throw std::runtime_error("Could not open public-conf.json");
	}

	infile >> conf;
}

void VisionManager::setup() {
	loadConf();

	std::cout << conf.dump() << std::endl;

	setupCameras();
	setupVision();
	setupFpsCounter();
	setupHubCom();
	setupSignalHandler();

	if (showGui) {
		setupGui();
	}
}

void VisionManager::run() {
	std::cout << "! Starting main loop" << std::endl;

	running = true;

	if (frontCamera->isOpened()) {
		frontCamera->startAcquisition();
	}

	if (!frontCamera->isOpened()) {
		std::cout << "! Neither of the cameras was opened, running in test mode" << std::endl;

		while (running) {
			Sleep(100);

			handleCommunicationMessages();

			if (SignalHandler::exitRequested) {
				running = false;
			}
		}

		return;
	}

	//bool gotFrontFrame, gotRearFrame;
	double time;
	double debugging;

	while (running) {
		//__int64 startTime = Util::timerStart();

		time = Util::millitime();

		if (lastStepTime != 0.0) {
			dt = (float)(time - lastStepTime);
		} else {
			dt = 1.0f / 60.0f;
		}

		/*if (dt > 0.04f) {
			std::cout << "@ LARGE DT: " << dt << std::endl;
		}*/

		totalTime += dt;

		//gotFrontFrame = gotRearFrame = false;
		debugging = debugVision || showGui;

		/*gotFrontFrame = fetchFrame(frontCamera, frontProcessor);
		gotRearFrame = fetchFrame(rearCamera, rearProcessor);

		if (!gotFrontFrame && !gotRearFrame && fpsCounter->frameNumber > 0) {
			//std::cout << "- Didn't get any frames from either of the cameras" << std::endl;

			continue;
		}*/

		fpsCounter->step();

		BaseCamera::Frame *frame = frontCamera->getFrame();

		blobber->analyse(frame->data);

		if (showGui) {
			if (gui == nullptr) {
				setupGui();
			}

			gui->processFrame(blobber->bgr);

			vision->setDebugImage(gui->rgb, Config::cameraWidth, Config::cameraHeight);
		}

		visionResult = vision->process();

		if (showGui) {

			gui->setFps(fpsCounter->getFps());

			gui->update(visionResult);

			if (gui->isQuitRequested()) {
				running = false;
			}
		}

		//__int64 startTime = Util::timerStart();

		//std::cout << "! Total time: " << Util::timerEnd(startTime) << std::endl;
		
		/*if (fpsCounter->frameNumber % 60 == 0) {
			std::cout << "! FPS: " << fpsCounter->getFps() << std::endl;
		}*/

		sendState();

		handleCommunicationMessages();

		lastStepTime = time;

		if (SignalHandler::exitRequested) {
			running = false;
		}

		//std::cout << "! Total time: " << Util::timerEnd(startTime) << std::endl;

		//std::cout << "FRAME" << std::endl;
	}

	std::cout << "! Main loop ended" << std::endl;
}

void VisionManager::setupGui() {
	std::cout << "! Setting up GUI" << std::endl;

	gui = new Gui(
		GetModuleHandle(0),
		blobber,
		Config::cameraWidth, Config::cameraHeight
	);
}

void VisionManager::setupCameras() {
	std::cout << "! Setting up cameras" << std::endl;

	//frontCamera = new XimeaCamera(374363729);
	//frontCamera = new XimeaCamera(857769553);
	frontCamera = new XimeaCamera(conf["cameraSerial"].get<int>());
	frontCamera->open();

	if (frontCamera->isOpened()) {
		setupXimeaCamera("Front", frontCamera);
	} else {
		std::cout << "- Opening front camera failed" << std::endl;
	}
}

void VisionManager::setupFpsCounter() {
	std::cout << "! Setting up fps counter.. ";

	fpsCounter = new FpsCounter();

	std::cout << "done!" << std::endl;
}


void VisionManager::setupXimeaCamera(std::string name, XimeaCamera* camera) {
	camera->setFormat(XI_RAW8);
	camera->setGain(Config::cameraGain);
	camera->setExposure(Config::cameraExposure);
	camera->setAutoWhiteBalance(false);
	camera->setAutoExposureGain(false);
	//camera->setLuminosityGamma(1.0f);
	//camera->setWhiteBalanceBlue(1.0f); // TODO check
	camera->setQueueSize(1);

	std::cout << "! " << name << " camera info:" << std::endl;
	std::cout << "  > Name: " << camera->getName() << std::endl;
	std::cout << "  > Type: " << camera->getDeviceType() << std::endl;
	std::cout << "  > API version: " << camera->getApiVersion() << std::endl;
	std::cout << "  > Driver version: " << camera->getDriverVersion() << std::endl;
	std::cout << "  > Serial number: " << camera->getSerialNumber() << std::endl;
	std::cout << "  > Color: " << (camera->supportsColor() ? "yes" : "no") << std::endl;
	std::cout << "  > Framerate: " << camera->getFramerate() << std::endl;
	std::cout << "  > Available bandwidth: " << camera->getAvailableBandwidth() << std::endl;
}

void VisionManager::setupSignalHandler() {
	SignalHandler::setup();
}

void VisionManager::setupVision() {
	blobber = new Blobber();

    blobber->loadColors("colors.dat");
	blobber->setColorMinArea(1, 5);
	blobber->setColorMinArea(2, 100);
	blobber->setColorMinArea(3, 100);
	blobber->setColorMinArea(4, 100);
	blobber->setColorMinArea(5, 100);
	blobber->setColorMinArea(6, 100);

	vision = new Vision(blobber, Dir::FRONT, Config::cameraWidth, Config::cameraHeight);

	blobber->start();
}

void VisionManager::setupHubCom() {
	hubCom = new HubCom(
			conf["port"],
			conf["hubIpAddress"],
			conf["hubPort"]
	);

	hubCom->run();

	/*auto jsonString = R"(
	  {
		"type": "subscribe",
		"topics": ["vision_close"]
	  }
	)"_json.dump();

	hubCom->send(const_cast<char *>(jsonString.c_str()), jsonString.length());*/
}

void VisionManager::sendState() {
	//__int64 startTime = Util::timerStart();

	nlohmann::json j;

	j["type"] = "message";
	j["topic"] = "vision";
	//j["blobs"] = nlohmann::json::object();
	j["balls"] = nlohmann::json::array();
	j["baskets"] = nlohmann::json::array();
    j["metrics"] = nlohmann::json::object();

	for (auto ball : visionResult->balls) {
        nlohmann::json ballJson;
        ballJson["cx"] = ball->x;
        ballJson["cy"] = ball->y;
        ballJson["w"] = ball->width;
        ballJson["h"] = ball->height;
        ballJson["metrics"] = {ball->surroundMetrics[0], ball->surroundMetrics[1]};
		ballJson["straightAhead"] = {
			{"reach", ball->straightAheadInfo.reach},
			{"driveability", ball->straightAheadInfo.driveability},
			{"sideMetric", ball->straightAheadInfo.sideMetric},
		};

        j["balls"].push_back(ballJson);
	}

	for (auto basket : visionResult->baskets) {
        nlohmann::json basketJson;
        basketJson["cx"] = basket->x;
        basketJson["cy"] = basket->y;
        basketJson["w"] = basket->width;
        basketJson["h"] = basket->height;
        basketJson["color"] = basket->type == 0 ? "blue" : "magenta";
        basketJson["metrics"] = {basket->surroundMetrics[3], basket->surroundMetrics[4]};

        j["baskets"].push_back(basketJson);
	}

    j["metrics"]["straightAhead"] = {
            {"reach", visionResult->straightAheadInfo.reach},
            {"driveability", visionResult->straightAheadInfo.driveability},
            {"sideMetric", visionResult->straightAheadInfo.sideMetric},
	};

	/*for (int colorIndex = 0; colorIndex < blobber->getColorCount(); colorIndex++) {
		Blobber::ColorClassState* color = blobber->getColor(Blobber::BlobColor(colorIndex));

		if (color == nullptr || color->name == nullptr) {
			continue;
		}

		std::string colorName(color->name);

		if (
				colorName != "green"
				&& colorName != "blue"
				&& colorName != "magenta"
		) {
			continue;
		}

		Blobber::BlobInfo* blobInfo = blobber->getBlobs(Blobber::BlobColor(colorIndex));

		if (blobInfo->count > 0) {
			j["blobs"][colorName] = nlohmann::json::array();

			for (int i = 0; i < blobInfo->count; i++) {
				Blobber::Blob blob = blobInfo->blobs[i];

				nlohmann::json blobJson;
				blobJson["area"] = blob.area;
				blobJson["cx"] = blob.centerX;
				blobJson["cy"] = blob.centerY;
				blobJson["x1"] = blob.x1;
				blobJson["x2"] = blob.x2;
				blobJson["y1"] = blob.y1;
				blobJson["y2"] = blob.y2;

				if (colorName == "green" && isBlobBall(blob)) {
					j["blobs"][colorName].push_back(blobJson);
					//j["balls"].push_back(blobJson);
				}
			}
		}
	}*/

	auto jsonString = j.dump();

	//std::cout << "! JSON time: " << Util::timerEnd(startTime) << std::endl;

	hubCom->send(const_cast<char *>(jsonString.c_str()), jsonString.length());
}

void VisionManager::handleCommunicationMessages() {
	std::string message;

	while (hubCom->gotMessages()) {
		message = hubCom->dequeueMessage();

		handleCommunicationMessage(message);
	}
}

void VisionManager::handleCommunicationMessage(std::string message) {
	auto jsonMessage = nlohmann::json::parse(message);

	//std::cout << "JSON: " << jsonMessage.dump() << std::endl;

	if ((jsonMessage["topic"] == "vision_close")) {
		running = false;
	}
}

bool VisionManager::isBlobBall(Blobber::Blob blob) {
	// Simple validations
	if (blob.y2 > 1000) {
		return false;
	}

	// Check if ball is over the line
	const int white = 6;
	const int black = 5;
	const int tolerance = 5;
	const int minStripeHeight = 10;

	int whitePixels = 0;
	int blackPixels = 0;
	int otherPixels = 0;

	for (int y = blob.y2; y < Config::cameraHeight; ++y) {
		unsigned char color = *(blobber->segmented + (Config::cameraWidth*y + blob.centerX));

		if (blackPixels > minStripeHeight && whitePixels > minStripeHeight) {
			return false;
		}

		// Collect white stripe
		if (blackPixels > minStripeHeight) {
			if (color == white) {
				++whitePixels;
				otherPixels = 0;
				continue;
			}

			if (whitePixels) {
				if (++otherPixels > tolerance) {
					blackPixels = otherPixels = 0;
				} else {
					++whitePixels;
					continue;
				}
			}
		}

		// Collect black stripe
		whitePixels = 0;

		if (color == black) {
			++blackPixels;
			otherPixels = 0;
		} else if (blackPixels) {
			if (++otherPixels > tolerance) {
				blackPixels = otherPixels = 0;
			} else {
				++blackPixels;
			}
		}
	}

	return true;
}
