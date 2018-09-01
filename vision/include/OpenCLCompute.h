#ifndef XIMEA_TEST_OPENCLCOMPUTE_H
#define XIMEA_TEST_OPENCLCOMPUTE_H

#include "CL/cl.h"
#include <vector>

class OpenCLCompute {
public:
    static OpenCLCompute& getInstance() {
        static OpenCLCompute instance; // Guaranteed to be destroyed.
        static bool singletonSetupDone = false;

        if (!singletonSetupDone) {
            (&instance)->setup();
            singletonSetupDone = true;
        }

        return instance;
    }

	OpenCLCompute();
	~OpenCLCompute();

	void setup();

	void deBayer(
			unsigned char* frame,
			unsigned char* rgbOut,
			unsigned char* lookup,
			unsigned char* segmentedOut,
			int width,
			int height,
			int colorsLookupSize
	);

    void kMeans(
            unsigned char* rgb,
            unsigned char* clustered,
            unsigned char *centroids,
            int centroidCount,
            int width,
            int height
    );

    void generateLookupTable(
			unsigned char *centroids,
			unsigned char *lookupTable,
			int centroidIndex,
			int centroidCount,
			unsigned char color
	);

private:
	std::vector<cl_platform_id> selectedPlatformIds;
	std::vector<cl_device_id> selectedDeviceIds;

	bool findDevice(std::string platformName, std::string deviceVendor);
	std::string GetPlatformName(cl_platform_id id);
	std::string GetDeviceName(cl_device_id id);
	std::string GetDeviceVendor(cl_device_id id);
	int GetDeviceType(cl_device_id id);
	void LogDeviceSVM(cl_device_id id);
	void CheckError(cl_int error, std::string message);
	std::string LoadKernel(const char *name);
	cl_program CreateProgram(const std::string &source, cl_context context);

	cl_mem inputBuffer;
	cl_mem rgbOutBuffer;
	cl_mem lookupBuffer;
	cl_mem segmentedBuffer;

	cl_context clContext;
	cl_command_queue clQueue;

	cl_program deBayerProgram;
	cl_kernel deBayerKernel;

	cl_program kMeansProgram;
	cl_kernel kMeansKernel;

	cl_program generateLookupTableProgram;
	cl_kernel generateLookupTableKernel;

	void setupDeBayer();
	void setupKMeans();
	void setupGenerateLookupTable();
};

#endif
