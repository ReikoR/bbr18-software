#include <iostream>
#include <vector>
#include <fstream>
#include <Util.h>
#include "OpenCLCompute.h"

OpenCLCompute::OpenCLCompute() {
	inputBuffer = nullptr;
	rgbOutBuffer = nullptr;
	lookupBuffer = nullptr;
	segmentedBuffer = nullptr;
}

OpenCLCompute::~OpenCLCompute() {
	clReleaseMemObject(rgbOutBuffer);
	clReleaseMemObject(inputBuffer);
	clReleaseMemObject(lookupBuffer);
	clReleaseMemObject(segmentedBuffer);

	clReleaseCommandQueue(clQueue);
	clReleaseKernel(deBayerKernel);
	clReleaseProgram(deBayerProgram);
	clReleaseContext(deBayerContext);
}

void OpenCLCompute::setup() {
	bool isDeviceFound = findDevice("Intel(R) OpenCL", "Intel");
	setupDeBayer();
}

bool OpenCLCompute::findDevice(std::string platformName, std::string deviceVendor) {
	cl_uint platformIdCount = 0;
	clGetPlatformIDs(0, nullptr, &platformIdCount);

	if (platformIdCount == 0) {
		std::cerr << "No OpenCL platforms found" << std::endl;
		return false;
	} else {
		std::cout << "Found " << platformIdCount << " platform(s)" << std::endl;
	}

	std::vector<cl_platform_id> platformIds(platformIdCount);
	clGetPlatformIDs(platformIdCount, platformIds.data(), nullptr);

	for (cl_uint i = 0; i < platformIdCount; ++i) {
		std::string platform = GetPlatformName(platformIds[i]);

		std::cout << "Platform: " << platform << std::endl;

		if (platform.find(platformName) != std::string::npos) {
			selectedPlatformIds.push_back(platformIds[i]);
			//matchingPlatformIds[0] = platformIds[i];
			std::cout << "\tMatch" << std::endl;

			cl_uint deviceIdCount = 0;
			clGetDeviceIDs(platformIds[i], CL_DEVICE_TYPE_ALL, 0, nullptr, &deviceIdCount);

			if (deviceIdCount == 0) {
				break;
			}

			std::vector<cl_device_id> deviceIds(deviceIdCount);
			clGetDeviceIDs(platformIds[i], CL_DEVICE_TYPE_ALL, deviceIdCount, deviceIds.data(), nullptr);

			for (cl_uint j = 0; j < deviceIdCount; ++j) {
				std::string vendor = GetDeviceVendor(deviceIds[j]);
				int type = GetDeviceType(deviceIds[j]);

				std::cout << "Device: " << GetDeviceName(deviceIds[j]) << std::endl;

				if (
						platform.find(platformName) != std::string::npos &&
						vendor.find(deviceVendor) != std::string::npos &&
						type == CL_DEVICE_TYPE_GPU
				) {
					selectedDeviceIds.push_back(deviceIds[j]);
					std::cout << "\tMatch" << std::endl;

					LogDeviceSVM(deviceIds[j]);

					break;
				}
			}

			if (!selectedPlatformIds.empty()) {
				break;
			}
		}
	}

	if (selectedDeviceIds.empty()) {
		std::cerr << "No OpenCL devices found" << std::endl;
		return false;
	}

	return true;
}

std::string OpenCLCompute::GetPlatformName(cl_platform_id id) {
	size_t size = 0;
	clGetPlatformInfo(id, CL_PLATFORM_NAME, 0, nullptr, &size);

	std::string result;
	result.resize(size);
	clGetPlatformInfo(id, CL_PLATFORM_NAME, size,
					  const_cast<char *> (result.data()), nullptr);

	return result;
}

std::string OpenCLCompute::GetDeviceName(cl_device_id id) {
	size_t size = 0;
	clGetDeviceInfo(id, CL_DEVICE_NAME, 0, nullptr, &size);

	std::string result;
	result.resize(size);
	clGetDeviceInfo(id, CL_DEVICE_NAME, size,
					const_cast<char *> (result.data()), nullptr);

	return result;
}

std::string OpenCLCompute::GetDeviceVendor(cl_device_id id) {
	size_t size = 0;
	clGetDeviceInfo(id, CL_DEVICE_VENDOR, 0, nullptr, &size);

	std::string result;
	result.resize(size);
	clGetDeviceInfo(id, CL_DEVICE_VENDOR, size, const_cast<char *> (result.data()), nullptr);

	return result;
}

int OpenCLCompute::GetDeviceType(cl_device_id id) {
	size_t size = 0;
	clGetDeviceInfo(id, CL_DEVICE_TYPE, 0, nullptr, &size);

	int deviceType = CL_DEVICE_TYPE_DEFAULT;
	clGetDeviceInfo(id, CL_DEVICE_TYPE, size, &deviceType, &size);

	return deviceType;
}

void OpenCLCompute::LogDeviceSVM(cl_device_id id) {
	cl_device_svm_capabilities caps;

	cl_int err = clGetDeviceInfo(
			id,
			CL_DEVICE_SVM_CAPABILITIES,
			sizeof(cl_device_svm_capabilities),
			&caps,
			nullptr
	);

	if (err == CL_INVALID_VALUE) {
		std::cout << "No SVM support" << std::endl;
	} else if (err == CL_SUCCESS && (caps & CL_DEVICE_SVM_COARSE_GRAIN_BUFFER)) {
		std::cout << "Coarse-grained buffer" << std::endl;
	} else if (err == CL_SUCCESS && (caps & CL_DEVICE_SVM_FINE_GRAIN_BUFFER)) {
		std::cout << "Fine-grained buffer" << std::endl;
	} else if (err == CL_SUCCESS && (caps & CL_DEVICE_SVM_FINE_GRAIN_BUFFER) && (caps & CL_DEVICE_SVM_ATOMICS)) {
		std::cout << "Fine-grained buffer with atomics" << std::endl;
	} else if (err == CL_SUCCESS && (caps & CL_DEVICE_SVM_FINE_GRAIN_SYSTEM)) {
		std::cout << "Fine-grained system" << std::endl;
	} else if (err == CL_SUCCESS && (caps & CL_DEVICE_SVM_FINE_GRAIN_SYSTEM) && (caps & CL_DEVICE_SVM_ATOMICS)) {
		std::cout << "Fine-grained system with atomics" << std::endl;
	}
}



void OpenCLCompute::CheckError(cl_int error, std::string message) {
	if (error != CL_SUCCESS) {
		std::cerr << "OpenCL error " << error << " " << message << std::endl;
		//std::exit(1);
	}
}

std::string OpenCLCompute::LoadKernel(const char *name) {
	std::ifstream in(name);
	std::string result(
			(std::istreambuf_iterator<char>(in)),
			std::istreambuf_iterator<char>());
	return result;
}

cl_program OpenCLCompute::CreateProgram(const std::string &source, cl_context context) {
	size_t lengths[1] = {source.size()};
	const char *sources[1] = {source.data()};

	cl_int error = 0;
	cl_program program = clCreateProgramWithSource(context, 1, sources, lengths, &error);
	CheckError(error, "Create program");

	return program;
}

void OpenCLCompute::setupDeBayer() {
	const cl_context_properties contextProperties[] = {
			CL_CONTEXT_PLATFORM, reinterpret_cast<cl_context_properties> (selectedPlatformIds[0]),
			0
	};

	cl_int error = CL_SUCCESS;
	deBayerContext = clCreateContext(
			contextProperties,
			static_cast<cl_uint>(selectedDeviceIds.size()),
			selectedDeviceIds.data(),
			nullptr,
			nullptr,
			&error
	);
	/*deBayerContext = clCreateContextFromType(
			contextProperties,
			CL_DEVICE_TYPE_GPU,
			nullptr,
			nullptr,
			&error
	);*/
	CheckError(error, "Create context");

	deBayerProgram = CreateProgram(LoadKernel("../kernels/debayer.cl"), deBayerContext);

	CheckError(clBuildProgram(
			deBayerProgram,
			static_cast<cl_uint>(selectedDeviceIds.size()),
			selectedDeviceIds.data(),
			nullptr,
			nullptr,
			nullptr
	), "Build program");

	deBayerKernel = clCreateKernel(deBayerProgram, "debayerAndSegment", &error);
	CheckError(error, "Create kernel");

	const cl_queue_properties queueProperties[] = {0};

	clQueue = clCreateCommandQueue(deBayerContext, selectedDeviceIds[0], 0, &error);
	//clQueue = clCreateCommandQueueWithProperties(deBayerContext, selectedDeviceIds[0], queueProperties, &error);
	CheckError(error, "Create command queue");

	clFinish(clQueue);
}

void OpenCLCompute::deBayer(
		unsigned char *frame,
		unsigned char *rgbOut,
		unsigned char *lookup,
		unsigned char *segmentedOut,
		int width,
		int height,
		int colorsLookupSize
) {
	__int64 startTime = Util::timerStart();

	cl_int error = CL_SUCCESS;

	if (inputBuffer == nullptr) {
		inputBuffer = clCreateBuffer(
				deBayerContext,
				//CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR,
				CL_MEM_READ_ONLY | CL_MEM_USE_HOST_PTR,
				width * height * sizeof(char),
				(void *)frame,
				&error
		);

		CheckError(error, "Could not create inputBuffer");
	}

	if (rgbOutBuffer == nullptr) {
		rgbOutBuffer = clCreateBuffer(
				deBayerContext,
				//CL_MEM_WRITE_ONLY,
				CL_MEM_READ_WRITE | CL_MEM_USE_HOST_PTR,
				3 * width * height * sizeof(char),
				rgbOut,
				&error
		);

		CheckError(error, "Could not create rgbOutBuffer");
	}

	if (lookupBuffer == nullptr) {
		lookupBuffer = clCreateBuffer(
				deBayerContext,
				CL_MEM_READ_WRITE | CL_MEM_USE_HOST_PTR,
				static_cast<size_t>(colorsLookupSize),
				(void *)lookup,
				&error
		);

		CheckError(error, "Could not create lookupBuffer");
	}

	if (segmentedBuffer == nullptr) {
		segmentedBuffer = clCreateBuffer(
				deBayerContext,
				CL_MEM_READ_WRITE | CL_MEM_USE_HOST_PTR,
				width * height * sizeof(char),
				segmentedOut,
				&error
		);

		CheckError(error, "Could not create segmentedBuffer");
	}

	/*clEnqueueUnmapMemObject(clQueue, rgbOutBuffer, rgbOut, 0, nullptr, nullptr);
	clEnqueueUnmapMemObject(clQueue, segmentedBuffer, segmentedOut, 0, nullptr, nullptr);
	clEnqueueUnmapMemObject(clQueue, lookupBuffer, lookup, 0, nullptr, nullptr);*/

	clSetKernelArg(deBayerKernel, 0, sizeof(cl_mem), &inputBuffer);
	clSetKernelArg(deBayerKernel, 1, sizeof(cl_mem), &rgbOutBuffer);
	clSetKernelArg(deBayerKernel, 2, sizeof(cl_mem), &lookupBuffer);
	clSetKernelArg(deBayerKernel, 3, sizeof(cl_mem), &segmentedBuffer);

	// http://www.khronos.org/registry/cl/sdk/1.1/docs/man/xhtml/clEnqueueNDRangeKernel.html
	std::size_t offset[3] = {0};
	std::size_t size[3] = {static_cast<size_t>(width / 2), static_cast<size_t>(height / 2), 1};
	/*CheckError(*/clEnqueueNDRangeKernel(clQueue, deBayerKernel, 2, offset, size, nullptr, 0, nullptr, nullptr)/*)*/;

	/*lookup = (unsigned char*)clEnqueueMapBuffer(
			clQueue,
			lookupBuffer,
			CL_TRUE,
			CL_MAP_READ,
			0,
			static_cast<size_t>(colorsLookupSize),
			0,
			nullptr,
			nullptr,
			nullptr
	);

	rgbOut = (unsigned char*)clEnqueueMapBuffer(
			clQueue,
			rgbOutBuffer,
			CL_TRUE,
			CL_MAP_WRITE,
			0,
			3 * width * height * sizeof(char),
			0,
			nullptr,
			nullptr,
			nullptr
	);

	segmentedOut = (unsigned char*)clEnqueueMapBuffer(
			clQueue,
			segmentedBuffer,
			CL_TRUE,
			CL_MAP_WRITE,
			0,
			width * height * sizeof(char),
			0,
			nullptr,
			nullptr,
			nullptr
	);*/

	clFinish(clQueue);

	std::cout << "! deBayer time: " << Util::timerEnd(startTime) << std::endl;
}
