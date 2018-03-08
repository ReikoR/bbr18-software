#ifndef IMAGEPROCESSOR_H
#define IMAGEPROCESSOR_H

//#include <libyuv.h>

#include <string>

class ImageProcessor {

public:
	struct RGBColor {
		RGBColor() : r(0), g(0), b(0) {}

        unsigned char r, g, b;
    };

	struct RGBRange {
		unsigned char minR, maxR;
		unsigned char minG, maxG;
		unsigned char minB, maxB;

		bool isInRange(RGBColor pixel) {
			return minR <= pixel.r && pixel.r <= maxR
				   && minG <= pixel.g && pixel.g <= maxG
				   && minB <= pixel.b && pixel.b <= maxB;
		}
	};

	struct RGBInfo {
		~RGBInfo() {
			delete pixels;
		}

		RGBColor* pixels;
		unsigned long long int count;
	};



	static void bayerRGGBToI420(unsigned char* input, unsigned char* outputY, unsigned char* outputU, unsigned char* outputV, int width, int height);
	static void I420ToYUYV(unsigned char* inputY, unsigned char* inputU, unsigned char* inputV, unsigned char* output, int width, int height);
	static void YUYVToARGB(unsigned char* input, unsigned char* output, int width, int height);
	static void ARGBToBGR(unsigned char* input, unsigned char* output, int width, int height);
	static void ARGBToRGB(unsigned char* input, unsigned char* output, int width, int height);
	static bool rgbToJpeg(unsigned char* input, unsigned char* output, int& bufferSize, int width, int height, int channels = 3);
	static RGBColor* getRgbPixelAt(unsigned char* rgb, int width, int height, int x, int y);
	static RGBInfo extractColors(unsigned char* rgb, int imageWidth, int imageHeight, int centerX, int centerY, int brushRadius, float stdDev);
	static RGBRange extractColorRange(unsigned char* rgb, int imageWidth, int imageHeight, int centerX, int centerY, int brushRadius, float stdDev);
	static bool saveBitmap(unsigned char* data, std::string filename, int size);
	static bool loadBitmap(std::string filename, unsigned char* buffer, int size);
	static bool saveJPEG(unsigned char* data, std::string filename, int width, int height, int channels = 3);

};

#endif // IMAGEPROCESSOR_H