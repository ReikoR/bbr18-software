#ifndef XIMEA_TEST_BLOBBER_H
#define XIMEA_TEST_BLOBBER_H

#include <ImageProcessor.h>
#include "OpenCLCompute.h"

#define MAX_WIDTH 1280
#define MAX_HEIGHT 1024
#define MAX_INT 2147483647
#define COLOR_COUNT 10
#define CMV_RBITS 6
#define CMV_RADIX (1 << CMV_RBITS)
#define CMV_RMASK (CMV_RADIX-1)
#define MAX_RUNS MAX_WIDTH * MAX_HEIGHT / 4
#define MAX_REG MAX_WIDTH * MAX_HEIGHT / 16

#define max2(a,b) \
	({ __typeof__ (a) _a = (a); \
		__typeof__ (b) _b = (b); \
		_a > _b ? _a : _b; })

#define min2(a,b) \
	({ __typeof__ (a) _a = (a); \
		__typeof__ (b) _b = (b); \
		_a < _b ? _a : _b; })

class Blobber {
public:
	Blobber();
	~Blobber();

	static const int COLORS_LOOKUP_SIZE;

	typedef struct {
		short x, y, width;
		unsigned char color;
		int parent, next;
	} BlobberRun;

    typedef struct {
        unsigned int index;
        unsigned char prevColor;
        unsigned char newColor;
    } LookupPixelChange;

	enum BlobColor {
		unknown,
		green,
		blue,
		magenta,
		orange,
		black,
		white
	};

	typedef struct BlobberRegion {
		int color;
		int x1, y1, x2, y2;
		float cen_x, cen_y;
		int area;
		int run_start;
		int iterator_id;
		struct BlobberRegion* next;
	} BlobberRegion;

	typedef struct {
		BlobberRegion *list;
		int num;
		int min_area;
		unsigned char color;
		char *name;
		unsigned char r;
		unsigned char g;
		unsigned char b;
	} ColorClassState;

	typedef struct Blob {
		unsigned short area;
		unsigned short centerX;
		unsigned short centerY;
		unsigned short x1;
		unsigned short x2;
		unsigned short y1;
		unsigned short y2;
	} Blob;

	typedef struct BlobInfo {
		Blob* blobs;
		unsigned short count;
	} BlobInfo;

    typedef struct Offset3 {
        Offset3() : x(0), y(0), z(0) {}
        Offset3(int x, int y, int z) : x(x), y(y), z(z) {}

        int x, y, z;
    } Offset3;

    typedef struct Offset3Pair {
        Offset3 a, b;
    } Offset3Pair;

	void undo();
	void createHistoryEntry();
	void setColorMinArea(int color, int min_area);
	void setColors(unsigned char *data);
    void setPixelColor(unsigned char r, unsigned char g, unsigned char b, unsigned char color);
    void fillAdjacentColorPixels(unsigned char r, unsigned char g, unsigned char b, unsigned char color);
    unsigned char getLookupColor(int r, int g, int b);
	void setPixelColorRange(ImageProcessor::RGBRange rgbRange, unsigned char color);
	void setPixelClusterRange(unsigned char *centroids, int centroidIndex, int centroidCount, unsigned char color);
	void setActivePixels(unsigned char *data);
	void segEncodeRuns();
	void segConnectComponents();

	void segExtractRegions();
	void segSeparateRegions();
	BlobberRegion* segSortRegions(BlobberRegion *list, int passes);
	void analyse(unsigned char *frame);
	BlobInfo* getBlobs(BlobColor color);

	void getSegmentedRgb(unsigned char* out);
    unsigned char *segmented;//segmented image buffer 0-9

	bool saveColors(const std::string& filename);
    bool loadColors(const std::string& filename);

    int getColorCount();
    ColorClassState* getColor(BlobColor colorIndex);
    ColorClassState* getColor(const std::string& name);
    BlobColor getColorAt(int x, int y);

	void clearColors();
	void clearColor(unsigned char colorIndex);
	void clearColor(std::string colorName);

	unsigned char *bgr;//BGR buffer

private:
	//unsigned char colors_lookup[0x1000000];//all possible bgr combinations lookup table/
	unsigned char* colors_lookup;//all possible bgr combinations lookup table/
    unsigned char* prev_colors_lookup;
    std::vector<std::vector<LookupPixelChange>> lookupChangeHistory;
	unsigned char pixel_active[MAX_WIDTH * MAX_HEIGHT]{};//0=ignore in segmentation, 1=use pixel
	//unsigned char *segmented;//segmented image buffer 0-9

	bool hasLookupChanged;

	unsigned short *pout;//Temp out buffer (for blobs)
	int width, height, bpp;

	OpenCLCompute* openCLCompute;

	BlobberRun rle[MAX_RUNS]{};
	BlobberRegion regions[MAX_REG]{};
	ColorClassState colors[COLOR_COUNT]{};
	BlobInfo* blobInfoCache[COLOR_COUNT]{};
	int run_c;
	int region_c;
	int max_area;
	int passes{};

	static int rangeSum(int x, int w) {
        return w * (2 * x + w - 1) / 2;
    }

	std::vector<Offset3Pair> fillerOffsetPairs;
	void createFillerOffsetPairs();
};

#endif //XIMEA_TEST_BLOBBER_H
