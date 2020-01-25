#include "VisionManager.h"
#include "XimeaCamera.h"
#include "Gui.h"
#include "FpsCounter.h"
#include "SignalHandler.h"
#include "Util.h"
#include <algorithm>
#include <json.hpp>
#include <jpge.h>
//#include <turbojpeg.h>
#include "webp/encode.h"

VisionManager::VisionManager() :
	frontCamera(nullptr),
	gui(nullptr),
	blobber(nullptr),
	vision(nullptr),
	fpsCounter(nullptr),
	hubCom(nullptr),
	running(false), debugVision(false),
	dt(0.01666f), lastStepTime(0.0), totalTime(0.0f),
	debugCameraDir(Dir::FRONT),
	isImageSaved(false)
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

        if (!isImageSaved) {
            //isImageSaved = saveFrame("frame.png");
            isImageSaved = saveRawFrame("frame.webp");
            saveRawSegmentedFrame("segmented.webp");
            isImageSaved = true;
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

	auto jsonString = R"(
	  {
		"type": "subscribe",
		"topics": ["save_frame"]
	  }
	)"_json.dump();

	hubCom->send(const_cast<char *>(jsonString.c_str()), jsonString.length());
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
			{"leftSideMetric", ball->straightAheadInfo.leftSideMetric},
			{"rightSideMetric", ball->straightAheadInfo.rightSideMetric},
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
        basketJson["straightAhead"] = {
                {"reach", basket->straightAheadInfo.reach},
                {"driveability", basket->straightAheadInfo.driveability},
                {"leftSideMetric", basket->straightAheadInfo.leftSideMetric},
                {"rightSideMetric", basket->straightAheadInfo.rightSideMetric},
        };

        j["baskets"].push_back(basketJson);
	}

	j["metrics"]["borderY"] = visionResult->borderY;

    j["metrics"]["straightAhead"] = {
            {"reach", visionResult->straightAheadInfo.reach},
            {"driveability", visionResult->straightAheadInfo.driveability},
            {"leftSideMetric", visionResult->straightAheadInfo.leftSideMetric},
            {"rightSideMetric", visionResult->straightAheadInfo.rightSideMetric}
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
	} else if ((jsonMessage["topic"] == "save_frame")) {
        saveRawFrame("frame.webp");
        //saveRawSegmentedFrame("segmented.raw");
        //saveFrame("frame.png");
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

bool VisionManager::saveRawFrame(std::string filename) {
    __int64 startTime = Util::timerStart();

    /*FILE* file = fopen(filename.c_str(), "wb");

    if (!file) {
        return false;
    }

    fwrite(blobber->bgr, sizeof(char), 3 * Config::cameraWidth * Config::cameraHeight, file);

    fclose(file);*/

    int width = Config::cameraWidth;
    int height = Config::cameraHeight;

    saveWebP(blobber->bgr, filename, width, height);

    std::cout << "! save raw frame time: " << Util::timerEnd(startTime) << std::endl;

    return true;
}
bool VisionManager::saveRawSegmentedFrame(std::string filename) {
    __int64 startTime = Util::timerStart();

    /*FILE* file = fopen(filename.c_str(), "wb");

    if (!file) {
        return false;
    }*/

    int width = Config::cameraWidth;
    int height = Config::cameraHeight;

    auto segmentedRgb = new unsigned char[3 * width * height];
    blobber->getSegmentedRgb(segmentedRgb);

    /*fwrite(segmentedRgb, sizeof(char), 3 * width * height, file);

    fclose(file);*/

    saveWebP(segmentedRgb, filename, width, height);

    std::cout << "! save raw segmented frame time: " << Util::timerEnd(startTime) << std::endl;

    return true;
}

bool VisionManager::saveFrame(std::string filename) {
    __int64 startTime = Util::timerStart();

    /* create file */
    FILE *fp = fopen(filename.c_str(), "wb");
    if (!fp)
        std::cout << "[write_png_file] File could not be opened for writing" << std::endl;

    __int64 encodeStartTime = Util::timerStart();

    /* initialize stuff */
    png_structp png_ptr = png_create_write_struct(PNG_LIBPNG_VER_STRING, nullptr, nullptr, nullptr);

    if (!png_ptr)
        std::cout << "[write_png_file] png_create_write_struct failed" << std::endl;

    png_infop info_ptr = png_create_info_struct(png_ptr);
    if (!info_ptr)
        std::cout << "[write_png_file] png_create_info_struct failed" << std::endl;

    if (setjmp(png_jmpbuf(png_ptr)))
        std::cout << "[write_png_file] Error during init_io" << std::endl;

    png_set_bgr(png_ptr);
    png_init_io(png_ptr, fp);
    png_set_compression_level(png_ptr, 3);

    /* write header */
    if (setjmp(png_jmpbuf(png_ptr)))
        std::cout << "[write_png_file] Error during writing header" << std::endl;

    png_set_IHDR(png_ptr, info_ptr, Config::cameraWidth, Config::cameraHeight,
                 8, PNG_COLOR_TYPE_RGB, PNG_INTERLACE_NONE,
                 PNG_COMPRESSION_TYPE_BASE, PNG_FILTER_TYPE_BASE);

    png_write_info(png_ptr, info_ptr);


    /* write bytes */
    if (setjmp(png_jmpbuf(png_ptr)))
        std::cout << "[write_png_file] Error during writing bytes" << std::endl;

    auto row_pointers = (png_bytep*) malloc(sizeof(png_bytep) * Config::cameraHeight);;

    for (int i = 0; i < Config::cameraHeight; i++) {
        row_pointers[i] = &blobber->bgr[i * Config::cameraWidth * 3];
    }

    png_write_image(png_ptr, row_pointers);

    /* end write */
    if (setjmp(png_jmpbuf(png_ptr)))
        std::cout << "[write_png_file] Error during end of write" << std::endl;

    png_write_end(png_ptr, nullptr);

    std::cout << "! PNG encode time: " << Util::timerEnd(startTime) << std::endl;

    /* cleanup heap allocation */
    /*for (int y = 0; y < Config::cameraHeight; y++) {
        free(row_pointers[y]);
    }*/

    free(row_pointers);

    fclose(fp);

    std::cout << "! save frame time: " << Util::timerEnd(startTime) << std::endl;

    return true;
}

bool VisionManager::saveJPEG(unsigned char* data, std::string filename, int width, int height, int channels) {
    __int64 startTime = Util::timerStart();
    bool isSuccess = jpge::compress_image_to_jpeg_file(filename.c_str(), width, height, channels, data);
    std::cout << "! save jpeg " << filename <<" time: " << Util::timerEnd(startTime) << std::endl;
    return isSuccess;
}

/*bool VisionManager::saveWebP(unsigned char* data, std::string filename, int width, int height) {
    __int64 startTime = Util::timerStart();

    FILE* file = fopen(filename.c_str(), "wb");

    if (!file) {
        return false;
    }

    uint8_t** output = nullptr;

    size_t outputSize = WebPEncodeBGR(blobber->bgr, width, height, width * 3, 80.0, output);

    std::cout << "! webp outputSize" << +outputSize << std::endl;

    fwrite(output, sizeof(char), outputSize, file);

    fclose(file);

    WebPFree(output);

    std::cout << "! save webp " << filename << " time: " << Util::timerEnd(startTime) << std::endl;

    return true;
}*/

bool VisionManager::saveWebP(unsigned char* data, std::string filename, int width, int height) {
    __int64 startTime = Util::timerStart();

    FILE* file = fopen(filename.c_str(), "wb");

    if (!file) {
        return false;
    }

    WebPConfig config;

    //if (!WebPConfigPreset(&config, WEBP_PRESET_DEFAULT, 80)) return false;   // version error

    WebPConfigInit(&config);

    /*config.lossless = 1;
    config.quality = 0;
    config.method = 0;
    config.image_hint = WEBP_HINT_DEFAULT;*/

    config.method = 0;
    config.quality = 80;

    int config_error = WebPValidateConfig(&config);

    std::cout << "config_error: " << config_error << std::endl;

    WebPPicture pic;

    if (!WebPPictureInit(&pic)) return false;  // version error
    pic.width = width;
    pic.height = height;
    if (!WebPPictureAlloc(&pic)) return false;   // memory error

    __int64 importBGRStartTime = Util::timerStart();
    WebPPictureImportBGR(&pic, data, 3 * width);
    std::cout << "! import bgr " << filename << " time: " << Util::timerEnd(importBGRStartTime) << std::endl;

    WebPMemoryWriter writer;
    WebPMemoryWriterInit(&writer);
    pic.writer = WebPMemoryWrite;
    pic.custom_ptr = &writer;

    __int64 encodeStartTime = Util::timerStart();
    int ok = WebPEncode(&config, &pic);
    std::cout << "! encode webp " << filename << " time: " << Util::timerEnd(encodeStartTime) << std::endl;

    if (!ok) {
        printf("Encoding error: %d\n", pic.error_code);
    } else {
        printf("Output size: %d\n", writer.size);

        fwrite(writer.mem, sizeof(char), writer.size, file);
    }

    fclose(file);

    WebPPictureFree(&pic);   // Always free the memory associated with the input.

    std::cout << "! save webp " << filename << " time: " << Util::timerEnd(startTime) << std::endl;

    return true;
}

/*bool VisionManager::saveJPEGTurbo(unsigned char* data, std::string filename, int width, int height, int channels) {
    __int64 startTime = Util::timerStart();

    FILE* file = fopen(filename.c_str(), "wb");

    if (!file) {
        return false;
    }

    const int JPEG_QUALITY = 75;
    int _width = Config::cameraWidth;
    int _height = Config::cameraHeight;
    long unsigned int _jpegSize = 0;
    unsigned char* _compressedImage = nullptr; //!< Memory is allocated by tjCompress2 if _jpegSize == 0

    tjhandle _jpegCompressor = tjInitCompress();

    tjCompress2(_jpegCompressor, data, _width, 0, _height, TJPF_BGR,
                &_compressedImage, &_jpegSize, TJSAMP_444, JPEG_QUALITY,
                TJFLAG_FASTDCT);

    tjDestroy(_jpegCompressor);

    fwrite(_compressedImage, sizeof(char), _jpegSize, file);

    fclose(file);

    //to free the memory allocated by TurboJPEG (either by tjAlloc(),
    //or by the Compress/Decompress) after you are done working on it:
    tjFree(_compressedImage);

    bool isSuccess = jpge::compress_image_to_jpeg_file(filename.c_str(), width, height, channels, data);
    std::cout << "! save jpeg " << filename <<" time: " << Util::timerEnd(startTime) << std::endl;
    return isSuccess;
}*/