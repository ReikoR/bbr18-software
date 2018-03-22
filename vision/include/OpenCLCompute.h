#ifndef XIMEA_TEST_OPENCLCOMPUTE_H
#define XIMEA_TEST_OPENCLCOMPUTE_H

#include "CL/cl.h"
#include <vector>

class OpenCLCompute {
public:;
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

	cl_command_queue clQueue;

	cl_context deBayerContext;
	cl_program deBayerProgram;
	cl_kernel deBayerKernel;

	void setupDeBayer();
};

#endif
