#include <cstdio>
#include <memory.h>
#include <cstdlib>
#include <cmath>
#include <iostream>
#include <array>
#include <cstring>
#include <Blobber.h>
#include <Util.h>
#include <Config.h>

const int Blobber::COLORS_LOOKUP_SIZE = 0x1000000;

Blobber::Blobber() {
	bpp = 1;
	width = 0;
	height = 0;
	segmented = nullptr;
	bgr = nullptr;
	pout = (unsigned short *) malloc(10000 * 9 * sizeof(unsigned short));
	run_c = 0;
	region_c = 0;
	max_area = 0;

	//https://software.intel.com/en-us/articles/getting-the-most-from-opencl-12-how-to-increase-performance-by-minimizing-buffer-copies-on-intel-processor-graphics
	colors_lookup = (unsigned char*)_aligned_malloc((size_t) COLORS_LOOKUP_SIZE, 4096);
	
	int i;
	for (i = 0; i < COLOR_COUNT; i++) {
		colors[i].list = NULL;
		colors[i].num = 0;
		colors[i].min_area = MAX_INT;
		colors[i].color = i;

        switch(i) {
            case 1:
                colors[i].name = const_cast<char *>("green");
				colors[i].r = 19;
				colors[i].g = 142;
				colors[i].b = 34;
                break;
            case 2:
                colors[i].name = const_cast<char *>("blue");
				colors[i].r = 21;
				colors[i].g = 106;
				colors[i].b = 125;
                break;
            case 3:
                colors[i].name = const_cast<char *>("magenta");
				colors[i].r = 197;
				colors[i].g = 77;
				colors[i].b = 197;
                break;
            case 4:
                colors[i].name = const_cast<char *>("orange");
				colors[i].r = 236;
				colors[i].g = 120;
				colors[i].b = 38;
                break;
            case 5:
                colors[i].name = const_cast<char *>("black");
				colors[i].r = 66;
				colors[i].g = 60;
				colors[i].b = 60;
                break;
            case 6:
                colors[i].name = const_cast<char *>("white");
				colors[i].r = 255;
				colors[i].g = 255;
				colors[i].b = 255;
                break;
        }
	}

	for (i = 0; i < MAX_WIDTH * MAX_HEIGHT; i++) {
		pixel_active[i] = 1;
	}

	width = 1280;
	height = 1024;

	int size = width * width;

	segmented = (unsigned char *)_aligned_malloc(size * sizeof(unsigned char), 4096);
	memset(segmented, 0, size * sizeof(unsigned char));

	bgr = (unsigned char *)_aligned_malloc(size * sizeof(unsigned char) * 3, 4096);

	//openCLCompute = new OpenCLCompute();
	//openCLCompute->setup();

	openCLCompute = &OpenCLCompute::getInstance();
}

Blobber::~Blobber() {
	// clear blobs cache
	for (int i = 0; i < COLOR_COUNT; ++i) {
		blobInfoCache[i] = nullptr;
	}

	//exit, free resources
    if (saveColors("colors.dat")) {
        std::cout << "! Colors saved" << std::endl;
    } else {
        std::cout << "! Colors not saved" << std::endl;
    }

    if (segmented != nullptr) {
		_aligned_free(segmented);
    }

    if (bgr != nullptr) {
		_aligned_free(bgr);
    }

    if (pout != nullptr) {
        free(pout);
    }

	_aligned_free(colors_lookup);

	delete openCLCompute;
}

void Blobber::setColorMinArea(int color, int min_area) {
	//set min blob size

	if (color < COLOR_COUNT) {
		colors[color].min_area = min_area;
	}
}

void Blobber::setColors(unsigned char *data) {
	memcpy(colors_lookup, data, COLORS_LOOKUP_SIZE);
}

void Blobber::setPixelColor(unsigned char r, unsigned char g, unsigned char b, unsigned char color) {
	colors_lookup[b + (g << 8) + (r << 16)] = color;
}

void Blobber::setPixelColorRange(ImageProcessor::RGBRange rgbRange, unsigned char color) {
	for (unsigned int r = rgbRange.minR; r < rgbRange.maxR + 1 ; r++) {
		for (unsigned int g = rgbRange.minG; g < rgbRange.maxG + 1; g++) {
			for (unsigned int b = rgbRange.minB; b < rgbRange.maxB + 1; b++) {
				colors_lookup[b + (g << 8) + (r << 16)] = color;
			}
		}
	}
}

void Blobber::setPixelClusterRange(unsigned char *centroids, int centroidIndex, int centroidCount, unsigned char color) {
	openCLCompute->generateLookupTable(centroids, colors_lookup, centroidIndex, centroidCount, color);
}

void Blobber::setActivePixels(unsigned char *data) {
	//set colortable
	//unsigned long size = min2(MAX_WIDTH * MAX_HEIGHT, (unsigned long)PyArray_NBYTES(pixels));
	unsigned long size = MAX_WIDTH * MAX_HEIGHT;
	memcpy(pixel_active, data, size);
}

void Blobber::refreshSize() {
	//set cam size and allocate buffers
	
	//self->width = (int)self->image.width;
	//self->height = (int)self->image.height;

    /*width = 1280;
    height = 1024;

	int size = width * width;
	
	if (segmented != nullptr) {
		_aligned_free(segmented);
	}

	segmented = (unsigned char *)_aligned_malloc(size * sizeof(unsigned char), 4096);
	memset(segmented, 0, size * sizeof(unsigned char));
	
	if (bgr != nullptr) {
		_aligned_free(bgr);
	}

	bgr = (unsigned char *)_aligned_malloc(size * sizeof(unsigned char) * 3, 4096);*/
}

void Blobber::start() {
	//start capture
	refreshSize();
}

void Blobber::segEncodeRuns() {
// Changes the flat array version of the thresholded image into a run
// length encoded version, which speeds up later processing since we
// only have to look at the points where values change.
	unsigned char m, save;
	unsigned char *row = NULL;
	int x, y, j, l;
	BlobberRun r;
	unsigned char *map = segmented;
	BlobberRun *rle = this->rle;
	
	int w = width;
	int h = height;

	r.next = 0;

	// initialize terminator restore
	save = map[0];

	j = 0;
	for(y = 0; y < h; y++){
		row = &map[y * w];

		// restore previous terminator and store next
		// one in the first pixel on the next row
		row[0] = save;
		save = row[w];
		row[w] = 255;
		
		r.y = y;

		x = 0;
		while(x < w){
			m = row[x];
			r.x = x;

			l = x;
			while(row[x] == m) x++;

			if(colors[m].min_area < MAX_INT || x >= w ) {
				r.color = m;
				r.width = x - l;
				r.parent = j;
				rle[j++] = r;

				if(j >= MAX_RUNS) {
					row[w] = save;
					run_c = j;
					return;
				}
			}
		}
	}

	run_c = j;
}

void Blobber::segConnectComponents() {
// Connect components using four-connecteness so that the runs each
// identify the global parent of the connected region they are a part
// of.	It does this by scanning adjacent rows and merging where
// similar colors overlap.	Used to be union by rank w/ path
// compression, but now it just uses path compression as the global
// parent index, a simpler rank bound in practice.
// WARNING: This code is complicated.	I'm pretty sure it's a correct
//	 implementation, but minor changes can easily cause big problems.
//	 Read the papers on this library and have a good understanding of
//	 tree-based union find before you touch it
	int l1, l2;
	BlobberRun r1, r2;
	int i, j, s;
	int num = run_c;
	BlobberRun *map = rle;

	// l2 starts on first scan line, l1 starts on second
	l2 = 0;
	l1 = 1;
	while(map[l1].y == 0) l1++; // skip first line

	// Do rest in lock step
	r1 = map[l1];
	r2 = map[l2];
	s = l1;
	while(l1 < num){
		if(r1.color==r2.color && colors[r1.color].min_area < MAX_INT){
			if((r2.x<=r1.x && r1.x<r2.x+r2.width) || (r1.x<=r2.x && r2.x<r1.x+r1.width)){
				if(s != l1){
					// if we didn't have a parent already, just take this one
					map[l1].parent = r1.parent = r2.parent;
					s = l1;
				} else if(r1.parent != r2.parent) {
					// otherwise union two parents if they are different

					// find terminal roots of each path up tree
					i = r1.parent;
					while(i != map[i].parent) i = map[i].parent;
					j = r2.parent;
					while(j != map[j].parent) j = map[j].parent;

					// union and compress paths; use smaller of two possible
					// representative indicies to preserve DAG property
					if(i < j) {
						map[j].parent = i;
						map[l1].parent = map[l2].parent = r1.parent = r2.parent = i;
					} else {
						map[i].parent = j;
						map[l1].parent = map[l2].parent = r1.parent = r2.parent = j;
					}
				}
			}
		}

		// Move to next point where values may change
		i = (r2.x + r2.width) - (r1.x + r1.width);
		if(i >= 0) r1 = map[++l1];
		if(i <= 0) r2 = map[++l2];
	}

	// Now we need to compress all parent paths
	for(i=0; i<num; i++){
		j = map[i].parent;
		map[i].parent = map[j].parent;
	}
}

int Blobber::rangeSum(int x, int w) {
	//foo bar
	return(w*(2*x + w-1) / 2);
}

void Blobber::segExtractRegions() {
// Takes the list of runs and formats them into a region table,
// gathering the various statistics along the way.	num is the number
// of runs in the rmap array, and the number of unique regions in
// reg[] (bounded by max_reg) is returned.	Implemented as a single
// pass over the array of runs.
	int b, i, n, a;
	int num = run_c;
	BlobberRun *rmap = rle;
	BlobberRegion *reg = regions;
	BlobberRun r;
	n = 0;

	for(i=0; i<num; i++){
		if( colors[rmap[i].color].min_area < MAX_INT){
			r = rmap[i];
			if(r.parent == i){
				// Add new region if this run is a root (i.e. self parented)
				rmap[i].parent = b = n;	// renumber to point to region id
				reg[b].color = r.color;
				reg[b].area = r.width;
				reg[b].x1 = r.x;
				reg[b].y1 = r.y;
				reg[b].x2 = r.x + r.width;
				reg[b].y2 = r.y;
				reg[b].cen_x = rangeSum(r.x,r.width);
				reg[b].cen_y = r.y * r.width;
				reg[b].run_start = i;
				reg[b].iterator_id = i; // temporarily use to store last run
				n++;
				if(n >= MAX_REG) {
					printf( "Regions buffer exceeded.\n" );
					region_c = MAX_REG;
					return;
				}
			} else {
				// Otherwise update region stats incrementally
				b = rmap[r.parent].parent;
				rmap[i].parent = b; // update parent to identify region id
				reg[b].area += r.width;
				reg[b].x2 = max2(r.x + r.width,reg[b].x2);
				reg[b].x1 = min2((int)r.x,reg[b].x1);
				reg[b].y2 = r.y; // last set by lowest run
				reg[b].cen_x += rangeSum(r.x,r.width);
				reg[b].cen_y += r.y * r.width;
				// set previous run to point to this one as next
				rmap[reg[b].iterator_id].next = i;
				reg[b].iterator_id = i;
			}
		}
	}

	// calculate centroids from stored sums
	for(i=0; i<n; i++){
		a = reg[i].area;
		reg[i].cen_x = (float)reg[i].cen_x / a;
		reg[i].cen_y = (float)reg[i].cen_y / a;
		rmap[reg[i].iterator_id].next = 0; // -1;
		reg[i].iterator_id = 0;
		reg[i].x2--; // change to inclusive range
	}
	region_c = n;
}

void Blobber::segSeparateRegions() {
// Splits the various regions in the region table a separate list for
// each color.	The lists are threaded through the table using the
// region's 'next' field.	Returns the maximal area of the regions,
// which can be used later to speed up sorting.
	BlobberRegion *p = NULL;
	int i;
	int c;
	int area;
	int num = region_c;
	BlobberRegion *reg = regions;
	ColorClassState *color = colors;

	// clear out the region list head table
	for(i=0; i<COLOR_COUNT; i++) {
		color[i].list = NULL;
		color[i].num	= 0;
	}
	// step over the table, adding successive
	// regions to the front of each list
	max_area = 0;
	for(i=0; i<num; i++){
		p = &reg[i];
		c = p->color;
		area = p->area;

		if(area >= color[c].min_area){
			if(area > max_area) max_area = area;
			color[c].num++;
			p->next = color[c].list;
			color[c].list = p;
		}
	}
}

Blobber::BlobberRegion* Blobber::segSortRegions(BlobberRegion *list, int passes) {
// Sorts a list of regions by their area field.
// Uses a linked list based radix sort to process the list.
	BlobberRegion *tbl[CMV_RADIX]={NULL}, *p=NULL, *pn=NULL;
	int slot, shift;
	int i, j;

	// Handle trivial cases
	if(!list || !list->next) return(list);

	// Initialize table
	for(j=0; j<CMV_RADIX; j++) tbl[j] = NULL;

	for(i=0; i<passes; i++){
		// split list into buckets
		shift = CMV_RBITS * i;
		p = list;
		while(p){
			pn = p->next;
			slot = ((p->area) >> shift) & CMV_RMASK;
			p->next = tbl[slot];
			tbl[slot] = p;
			p = pn;
		}

		// integrate back into partially ordered list
		list = NULL;
		for(j=0; j<CMV_RADIX; j++){
			p = tbl[j];
			tbl[j] = NULL; // clear out table for next pass
			while(p){
				pn = p->next;
				p->next = list;
				list = p;
				p = pn;
			}
		}
	}

	return(list);
}

void Blobber::getSegmentedRgb(unsigned char* out) {
	for (int y = 0; y < height; y++) {
		for (int x = 0; x < width; x++) {
			unsigned char colorIndex = *(segmented + (y * width + x));

			if (colorIndex > getColorCount()) {
				continue;
			}

			unsigned char r = colors[colorIndex].r;
			unsigned char g = colors[colorIndex].g;
			unsigned char b = colors[colorIndex].b;

			out[(y * width + x) * 3] = b;
			out[(y * width + x) * 3 + 1] = g;
			out[(y * width + x) * 3 + 2] = r;
		}
	}
}

void Blobber::analyse(unsigned char *frame) {
	//get new frame and find blobs
	
	/*
	//use CameraRefreshFrame to convert RGGB to BGR. slower, but shorter code
	CameraRefreshFrame(self);
	int w = width;
	int h = height;
	
	unsigned char *f;
	f = bgr;
	int y, x;
	for (y=1; y<h-1; y++) {//threshold
		for (x=1; x<w-1; x++) {
			segmented[y*w+x] = colors_lookup[f[y*w*3+x*3] + (f[y*w*3+x*3+1] << 8) + (f[y*w*3+x*3+2] << 16)];
		}
	}
	*/

    //unsigned char *f = frame;

	//__int64 startTime = Util::timerStart();

	/*int w = width;
	int h = height;*/

	openCLCompute->deBayer(frame, bgr, colors_lookup, segmented, width, height, COLORS_LOOKUP_SIZE);
	
	/*#pragma omp parallel for
	for (int y = 1; y < h - 1; y += 2) {//threshold RGGB Bayer matrix
		for (int x = 1; x < w - 1; x += 2) {//ignore sides
			//http://en.wikipedia.org/wiki/Bayer_filter
			//current block is BGGR
			//blue f[y*w+x],green1 f[y*w+x+1],green2 f[y*w+x+w],red f[y*w+x+w+1]
			int xy = y * w + x;
			int b;//blue
			int g;//green
			int r;//red

			if (pixel_active[xy]) {
				b = f[xy];
				//g = (f[xy-1]+f[xy+1]+f[xy-w]+f[xy+w]+2) >> 2;//left,right,up,down
				g = f[xy - 1];//left,right,up,down
				r = (f[xy - w - 1] + f[xy - w + 1] + f[xy + w - 1] + f[xy + w + 1] + 2) >> 2;//diagonal
				segmented[xy] = colors_lookup[b + (g << 8) + (r << 16)];
			}

			xy += 1;
			if (pixel_active[xy]) {
				b = (f[xy - 1] + f[xy + 1] + 1) >> 1;//left,right
				g = f[xy];
				r = (f[xy - w] + f[xy + w] + 1) >> 1;//up,down
				segmented[xy] = colors_lookup[b + (g << 8) + (r << 16)];
			}

			xy += w - 1;
			if (pixel_active[xy]) {
				b = (f[xy - w] + f[xy + w] + 1) >> 1;//up,down
				g = f[xy];
				r = (f[xy - 1] + f[xy + 1] + 1) >> 1;//left,right
				segmented[xy] = colors_lookup[b + (g << 8) + (r << 16)];
			}

			xy += 1;
			if (pixel_active[xy]) {
				b = (f[xy - w - 1] + f[xy - w + 1] + f[xy + w - 1] + f[xy + w + 1] + 2) >> 2;//diagonal
				g = (f[xy - 1] + f[xy + 1] + f[xy - w] + f[xy + w] + 2) >> 2;//left,right,up,down
				r = f[xy];
				segmented[xy] = colors_lookup[b + (g << 8) + (r << 16)];
			}
		}
	}*/

	//std::cout << "! Total time: " << Util::timerEnd(startTime) << std::endl;

	segEncodeRuns();
	segConnectComponents();
	segExtractRegions();
	segSeparateRegions();

	// do minimal number of passes sufficient to touch all set bits
	int y = 0;
	while( max_area != 0 ) {
		max_area >>= CMV_RBITS;
		y++;
	}
	passes = y;

	// clear blobs cache
	for (int i = 0; i < COLOR_COUNT; ++i) {
		blobInfoCache[i] = nullptr;
	}
}

Blobber::BlobInfo* Blobber::getBlobs(BlobColor colorIndex) {
	if (blobInfoCache[colorIndex] != nullptr) {
		return blobInfoCache[colorIndex];
	}

	ColorClassState color = colors[colorIndex];
	BlobberRegion *list = segSortRegions(color.list, passes);
	int rows = color.num;
	//int cols = 7;
	int i = 0;
	//int n = 0;
	int w = width;
	//int xy;
	unsigned short cen_x, cen_y;
	//unsigned short *pout = (unsigned short *) malloc(rows * cols * sizeof(unsigned short));
    Blob* blobs = new Blob[rows];
    BlobInfo* blobInfo = new BlobInfo();

    blobInfo->count = rows;
    blobInfo->blobs = blobs;

	/*if (rows > 0) {
		std::cout << "rows " << rows << std::endl;
	}*/

	while (list != nullptr) {
        cen_x = (unsigned short)round(list->cen_x);
		cen_y = (unsigned short)round(list->cen_y);
		//xy = cen_y * w + cen_x;

        blobs[i].area = (unsigned short)min2(65535 , list->area);
        blobs[i].centerX = cen_x;
        blobs[i].centerY = cen_y;
        blobs[i].x1 = (unsigned short)list->x1;
        blobs[i].x2 = (unsigned short)list->x2;
        blobs[i].y1 = (unsigned short)list->y1;
        blobs[i].y2 = (unsigned short)list->y2;

        list = list->next;
        i++;
	}

	blobInfoCache[colorIndex] = blobInfo;

	return blobInfo;
}

bool Blobber::saveColors(std::string filename) {
    FILE* file = fopen(filename.c_str(), "w");

    if (!file) {
        return false;
    }

    fwrite(colors_lookup, sizeof(char), COLORS_LOOKUP_SIZE, file);

    fclose(file);

    return true;
}

bool Blobber::loadColors(std::string filename) {
    FILE* file = fopen(filename.c_str(), "r");

    if (!file) {
        return false;
    }

    // obtain file size:
    fseek(file, 0, SEEK_END);
    long fileSize = ftell (file);
    rewind(file);

    if (fileSize != COLORS_LOOKUP_SIZE) {
        return false;
    }

    fread(colors_lookup, sizeof(char), COLORS_LOOKUP_SIZE, file);

    fclose(file);

    return true;
}

int Blobber::getColorCount() {
    return sizeof(colors) / sizeof(Blobber::ColorClassState);
}

Blobber::ColorClassState* Blobber::getColor(BlobColor colorIndex) {
    return &colors[colorIndex];
}

Blobber::ColorClassState* Blobber::getColor(std::string name) {
	for (int i = 0; i < getColorCount(); i++) {
		if (colors[i].name != NULL && strcmp(colors[i].name, name.c_str()) == 0) {
			return &colors[i];
		}
	}

	return NULL;
}

Blobber::BlobColor Blobber::getColorAt(int x, int y) {
    if (x < 0 || y < 0 || x >= Config::cameraWidth || y >= Config::cameraHeight) {
        return Blobber::BlobColor::unknown;
    }

    unsigned char colorIndex = *(segmented + (Config::cameraWidth * y + x));
    return Blobber::BlobColor(colorIndex);
}

void Blobber::clearColors() {
	memset(colors_lookup, 0, COLORS_LOOKUP_SIZE);
}

void Blobber::clearColor(unsigned char colorIndex) {
    for (int i = 0; i < COLORS_LOOKUP_SIZE; i++) {
        if (colors_lookup[i] == colorIndex) {
			colors_lookup[i] = 0;
        }
    }
}

void Blobber::clearColor(std::string colorName) {
    ColorClassState* color = getColor(std::move(colorName));

    if (color == NULL) {
        return;
    }

	for (int i = 0; i < COLORS_LOOKUP_SIZE; i++) {
		if (colors_lookup[i] == color->color) {
			colors_lookup[i] = 0;
		}
	}
}