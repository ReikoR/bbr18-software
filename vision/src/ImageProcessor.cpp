#include "ImageProcessor.h"
#include "Maths.h"

//#include "jpge.h"

#include <vector>
#include <iostream>
#include <fstream>
#include <Util.h>

/*bool ImageProcessor::rgbToJpeg(unsigned char* input, unsigned char* output, int& bufferSize, int width, int height, int channels) {
	return jpge::compress_image_to_jpeg_file_in_memory(output, bufferSize, width, height, channels, input);
}*/

ImageProcessor::RGBColor* ImageProcessor::getRgbPixelAt(unsigned char* rgb, int width, int height, int x, int y) {
	if (
		x < 0
		|| x > width - 1
		|| y < 0
		|| y > height - 1
	) {
		return NULL;
	}

	RGBColor* pixel = new RGBColor();
	int bPosition = 3 * (y * width + x);

	pixel->b = rgb[bPosition];
	pixel->g = rgb[bPosition + 1];
	pixel->r = rgb[bPosition + 2];

    return pixel;
}

ImageProcessor::RGBInfo ImageProcessor::extractColors(unsigned char* rgb, int imageWidth, int imageHeight, int centerX, int centerY, int brushRadius, float stdDev) {
    int R, G, B;

    std::vector<float> rValues;
    std::vector<float> gValues;
    std::vector<float> bValues;

    std::vector<RGBColor> filteredPixels;
    std::vector<RGBColor> allPixels;

    for (int x = -brushRadius; x < brushRadius; x++) {
        int height = (int)::sqrt(brushRadius * brushRadius - x * x);

        for (int y = -height; y < height; y++) {
            if (
                    x + centerX < 0
                    || x + centerX > imageWidth - 1
                    || y + centerY < 0
                    || y + centerY > imageHeight - 1
                    ) {
                continue;
            }

            RGBColor* pixel = getRgbPixelAt(rgb, imageWidth, imageHeight, x + centerX, y + centerY);

            if (pixel != nullptr) {
                allPixels.push_back(*(pixel));

                R = pixel->r;
                G = pixel->g;
                B = pixel->b;

                delete pixel;

                rValues.push_back((float)R);
                gValues.push_back((float)G);
                bValues.push_back((float)B);
            } else {
                std::cout << "- Didn't get pixel at " << (x + centerX) << "x" << (y + centerY) << std::endl;
            }
        }
    }

    float rMean, gMean, bMean;
    float rStdDev = Math::standardDeviation(rValues, rMean);
    float gStdDev = Math::standardDeviation(gValues, gMean);
    float bStdDev = Math::standardDeviation(bValues, bMean);

    RGBRange range{};

    range.minR = Math::max<int>((int)(rMean - (float)rStdDev * stdDev), 0);
    range.maxR = Math::min<int>((int)(rMean + (float)rStdDev * stdDev), 255);
    range.minG = Math::max<int>((int)(gMean - (float)gStdDev * stdDev), 0);
    range.maxG = Math::min<int>((int)(gMean + (float)gStdDev * stdDev), 255);
    range.minB = Math::max<int>((int)(bMean - (float)bStdDev * stdDev), 0);
    range.maxB = Math::min<int>((int)(bMean + (float)bStdDev * stdDev), 255);

    /*std::cout << "mean: " << +rMean << " " << +gMean << "; "  << +bMean << std::endl;
    std::cout << "stdDev: " << +rStdDev << " " << +gStdDev << "; "  << +bStdDev << std::endl;

    std::cout << "range: "
        << +range.minR << " " << +range.maxR << "; "
        << +range.minG << " " << +range.maxG << "; "
        << +range.minB << " " << +range.maxB << std::endl;*/

    for (auto pixel : allPixels) {
        if (range.isInRange(pixel)){
            filteredPixels.push_back(pixel);
        }
    }

    auto* filteredPixelsArray = new RGBColor[filteredPixels.size()];

    for (unsigned int i = 0; i < filteredPixels.size(); i++) {
        filteredPixelsArray[i] = filteredPixels.at(i);
    }

    RGBInfo rgbInfo = {
            .pixels = filteredPixelsArray,
            .count = filteredPixels.size()
    };

    return rgbInfo;
}

ImageProcessor::RGBRange ImageProcessor::extractColorRange(unsigned char* rgb, int imageWidth, int imageHeight, int centerX, int centerY, int brushRadius, float stdDev) {
    int R, G, B;

    std::vector<float> rValues;
    std::vector<float> gValues;
    std::vector<float> bValues;

    for (int x = -brushRadius; x < brushRadius; x++) {
        int height = (int)::sqrt(brushRadius * brushRadius - x * x);

        for (int y = -height; y < height; y++) {
            if (
                    x + centerX < 0
                    || x + centerX > imageWidth - 1
                    || y + centerY < 0
                    || y + centerY > imageHeight - 1
                    ) {
                continue;
            }

            RGBColor* pixel = getRgbPixelAt(rgb, imageWidth, imageHeight, x + centerX, y + centerY);

            if (pixel != NULL) {
                R = pixel->r;
                G = pixel->g;
                B = pixel->b;

                delete pixel;

                rValues.push_back((float)R);
                gValues.push_back((float)G);
                bValues.push_back((float)B);
            } else {
                std::cout << "- Didn't get pixel at " << (x + centerX) << "x" << (y + centerY) << std::endl;
            }
        }
    }

    float rMean, gMean, bMean;
    float rStdDev = Math::standardDeviation(rValues, rMean);
    float gStdDev = Math::standardDeviation(gValues, gMean);
    float bStdDev = Math::standardDeviation(bValues, bMean);

    RGBRange range;

    range.minR = (unsigned char)Util::limit(rMean - rStdDev * stdDev, 0, 255);
    range.maxR = (unsigned char)Util::limit(rMean + rStdDev * stdDev, 0, 255);
    range.minG = (unsigned char)Util::limit(gMean - gStdDev * stdDev, 0, 255);
    range.maxG = (unsigned char)Util::limit(gMean + gStdDev * stdDev, 0, 255);
    range.minB = (unsigned char)Util::limit(bMean - bStdDev * stdDev, 0, 255);
    range.maxB = (unsigned char)Util::limit(bMean + bStdDev * stdDev, 0, 255);



    return range;
}

bool ImageProcessor::saveBitmap(unsigned char* data, std::string filename, int size) {
	try {
		std::ofstream file(filename, std::ios::binary);
		file.write((char*)data, size);

		return true;
	} catch (...) {
		return false;
	}
}

bool ImageProcessor::loadBitmap(std::string filename, unsigned char* buffer, int size) {
	try {
		std::ifstream file(filename, std::ios::in|std::ios::binary);
		file.read((char*)buffer, size);

		return true;
	} catch (...) {
		return false;
	}
}

/*bool ImageProcessor::saveJPEG(unsigned char* data, std::string filename, int width, int height, int channels) {
	return jpge::compress_image_to_jpeg_file(filename.c_str(), width, height, channels, data);
}*/