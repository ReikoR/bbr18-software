/*
Python wrapper for XIMEA camera, search for colored blobs
Lauri Hamarik 2015
Blob finding methods (starts with Seg) taken from CMVision
	
Needs xiAPI library:
http://www.ximea.com/support/wiki/apis/XIMEA_Linux_Software_Package

xiAPI installation:
wget http://www.ximea.com/downloads/recent/XIMEA_Linux_SP.tgz
tar xzf XIMEA_Linux_SP.tgz
cd package
./install -cam_usb30

USAGE
Grab image:
	import numpy as np
	import pyXiQ
	cam = pyXiQ.Camera()
	cam.start()
	image = cam.image()
Get blobs:
	import numpy as np
	import pyXiQ

	cam = pyXiQ.Camera()
	cam.setInt("exposure", 10000)
	colors = np.zeros((256,256,256), dtype=np.uint8)
	colors[0:200,1:201,2:202] = 1#select colors where blue=0..200, green=1..201, red=2..202
	cam.setColors(colors)
	cam.setColorMinArea(1, 100)#show only blobs larger than 100
	cam.start()
	cam.analyse()
	blobs = cam.getBlobs(1)
*/
#include <stdio.h>
#include <m3api/xiApi.h>
#include <memory.h>
#include <Python.h>
#define NPY_NO_DEPRECATED_API NPY_1_7_API_VERSION
#include "numpy/arrayobject.h"

#define MAX_WIDTH 1280
#define MAX_HEIGHT 1024
#define MAX_INT 2147483647
#define COLOR_COUNT 10
#define CMV_RBITS 6
#define CMV_RADIX (1 << CMV_RBITS)
#define CMV_RMASK (CMV_RADIX-1)
#define MAX_RUNS MAX_WIDTH * MAX_HEIGHT / 4
#define MAX_REG MAX_WIDTH * MAX_HEIGHT / 16

#define max(a,b) \
	({ __typeof__ (a) _a = (a); \
		__typeof__ (b) _b = (b); \
		_a > _b ? _a : _b; })
	 
#define min(a,b) \
	({ __typeof__ (a) _a = (a); \
		__typeof__ (b) _b = (b); \
		_a < _b ? _a : _b; })

typedef struct {
	short x, y, width;
	unsigned char color;
	int parent, next;
} run;

typedef struct region {
	int color;
	int x1, y1, x2, y2;
	float cen_x, cen_y;
	int area;
	int run_start;
	int iterator_id;
	struct region* next;
} region;

typedef struct {
	region *list;
	int num;
	int min_area;
	unsigned char color;
	char *name;
} color_class_state;

typedef struct {
	PyObject_HEAD;
	XI_IMG image;//image buffer (RGGB)
	HANDLE xiH;
	unsigned char colors_lookup[0x1000000];//all possible bgr combinations lookup table
	unsigned short loc_r[MAX_WIDTH * MAX_HEIGHT];//pixel location to distance lookup table
	unsigned short loc_phi[MAX_WIDTH * MAX_HEIGHT];//pixel location to angle lookup table
	unsigned char pixel_active[MAX_WIDTH * MAX_HEIGHT];//0=ignore in segmentation, 1=use pixel
	unsigned char *segmented;//segmented image buffer 0-9
	unsigned char *bgr;//BGR buffer
	unsigned short *pout;//Temp out buffer (for blobs)
	int width, height, bpp;
	unsigned char started;
	
	run rle[MAX_RUNS];
	region regions[MAX_REG];
	color_class_state colors[COLOR_COUNT];
	int run_c;
	int region_c;
	int max_area;
	int passes;
} Camera;

static int CameraInit(Camera *self, PyObject *args, PyObject *kwargs) {
	//find camera, set init values
	self->xiH = NULL;

	// ignore debug messages
	xiSetParamInt(0, XI_PRM_DEBUG_LEVEL, XI_DL_FATAL);

	// image buffer
	memset(&self->image, 0, sizeof(self->image));
	self->image.size = sizeof(XI_IMG);

	// Get number of camera devices
	DWORD dwNumberOfDevices = 0;
	xiGetNumberDevices(&dwNumberOfDevices);
	
	if (!dwNumberOfDevices) {
		PyErr_SetString(PyExc_ValueError, "Camera not found");
		return 0;
	}

	xiOpenDevice(0, &self->xiH);
	//default parameters
	xiSetParamInt(self->xiH, XI_PRM_BUFFERS_QUEUE_SIZE, 2);
	xiSetParamInt(self->xiH, XI_PRM_RECENT_FRAME, 1);
	//xiSetParamInt(self->xiH, XI_PRM_IMAGE_DATA_FORMAT, XI_RGB24);
	xiSetParamInt(self->xiH, XI_PRM_IMAGE_DATA_FORMAT, XI_RAW8);
	xiSetParamInt(self->xiH, XI_PRM_AUTO_WB , 0);
	
	self->started = 0;
	self->bpp = 1;
	self->width = 0;
	self->height = 0;
	self->segmented = NULL;
	self->bgr = NULL;
	self->pout = (unsigned short *) malloc(10000 * 9 * sizeof(unsigned short));
	self->run_c = 0;
	self->region_c = 0;
	self->max_area = 0;
	
	int i;
	for(i=0; i<COLOR_COUNT; i++) {
		self->colors[i].list = NULL;
		self->colors[i].num	= 0;
		self->colors[i].min_area = MAX_INT;
		self->colors[i].color = i;
	}
	
	for (i=0; i<MAX_WIDTH * MAX_HEIGHT; i++) {
		self->pixel_active[i] = 1;
	}

	return 0;
}

static void CameraDealloc(Camera *self) {
	//exit, free resources
	if (self->xiH) {
		xiCloseDevice(self->xiH);
		if (self->segmented != NULL) {
			free(self->segmented);
		}
		if (self->bgr != NULL) {
			free(self->bgr);
		}
		if (self->pout != NULL) {
			free(self->pout);
		}
	}
}

static PyObject *CameraOpened(Camera *self) {
	//camera selected? return bool
	return Py_BuildValue("b", !(self->xiH == NULL));
}

static PyObject *CameraStarted(Camera *self) {
	//camera started? return bool
	return Py_BuildValue("b", self->started);
}

static PyObject *CameraSetColorMinArea(Camera *self, PyObject *args) {
	//set min blob size
	int color;
	int min_area;

	if (!PyArg_ParseTuple(args, "ii", &color, &min_area)) {
		return NULL;
	}
	if (color < COLOR_COUNT) {
		self->colors[color].min_area = min_area;
	}
	
	Py_RETURN_NONE;
}

static PyObject *CameraSetColors(Camera *self, PyObject *args) {
	//set colortable
	PyObject *arg1=NULL;
	PyArrayObject *lookup=NULL;

	if (!PyArg_ParseTuple(args, "O!", &PyArray_Type, &arg1)) return NULL;
	lookup = (PyArrayObject*)PyArray_FROM_OTF(arg1, NPY_UINT8, NPY_ARRAY_IN_ARRAY);
	if (lookup == NULL) {
		Py_XDECREF(lookup);
		return NULL;
	}
	
	unsigned char *data = (unsigned char*)PyArray_DATA(lookup);
	unsigned long size = min(0x1000000, (unsigned long)PyArray_NBYTES(lookup));
	memcpy(self->colors_lookup, data, size);
	
	Py_DECREF(lookup);
	Py_RETURN_NONE;
}

static PyObject *CameraSetActivePixels(Camera *self, PyObject *args) {
	//set colortable
	PyObject *arg1=NULL;
	PyArrayObject *pixels=NULL;

	if (!PyArg_ParseTuple(args, "O!", &PyArray_Type, &arg1)) return NULL;
	pixels = (PyArrayObject*)PyArray_FROM_OTF(arg1, NPY_UINT8, NPY_ARRAY_IN_ARRAY);
	if (pixels == NULL) {
		Py_XDECREF(pixels);
		return NULL;
	}
	
	unsigned char *data = (unsigned char*)PyArray_DATA(pixels);
	unsigned long size = min(MAX_WIDTH * MAX_HEIGHT, (unsigned long)PyArray_NBYTES(pixels));
	memcpy(self->pixel_active, data, size);
	
	Py_DECREF(pixels);
	Py_RETURN_NONE;
}

static PyObject *CameraSetLocations(Camera *self, PyObject *args) {
	//set colortable
	PyObject *arg1=NULL, *arg2=NULL;
	PyArrayObject *d_r=NULL, *d_phi=NULL;

	if (!PyArg_ParseTuple(args, "O!O!", &PyArray_Type, &arg1, &PyArray_Type, &arg2)) return NULL;
	d_r = (PyArrayObject*)PyArray_FROM_OTF(arg1, NPY_UINT16, NPY_ARRAY_IN_ARRAY);
	if (d_r == NULL) {
		Py_XDECREF(d_r);
		return NULL;
	}
	d_phi = (PyArrayObject*)PyArray_FROM_OTF(arg2, NPY_UINT16, NPY_ARRAY_IN_ARRAY);
	if (d_phi == NULL) {
		Py_XDECREF(d_phi);
		return NULL;
	}
	
	unsigned short *data_r = (unsigned short*)PyArray_DATA(d_r);
	unsigned long size_r = min(MAX_WIDTH * MAX_HEIGHT * sizeof(unsigned short), (unsigned long)PyArray_NBYTES(d_r));
	memcpy(self->loc_r, data_r, size_r);
	
	unsigned short *data_phi = (unsigned short*)PyArray_DATA(d_phi);
	unsigned long size_phi = min(MAX_WIDTH * MAX_HEIGHT * sizeof(unsigned short), (unsigned long)PyArray_NBYTES(d_phi));
	memcpy(self->loc_phi, data_phi, size_phi);
	
	Py_DECREF(d_r);
	Py_DECREF(d_phi);
	Py_RETURN_NONE;
}

static void CameraRefreshSize(Camera *self) {
	//set cam size and allocate buffers
	if (!self->started) return;
	xiGetImage(self->xiH, 5000, &self->image);
	
	self->width = (int)self->image.width;
	self->height = (int)self->image.height;
	
	int size = self->width * self->width;
	
	if (self->segmented != NULL) {
		free(self->segmented);
	}
	self->segmented = (unsigned char *)calloc(size, sizeof(unsigned char));
	
	if (self->bgr != NULL) {
		free(self->bgr);
	}
	self->bgr = (unsigned char *)malloc(size * sizeof(unsigned char) * 3);
}

static PyObject *CameraShape(Camera *self) {
	//return tuple (height, width)
	return Py_BuildValue("(ii)", self->height, self->width);
}

static PyObject *CameraStart(Camera *self) {
	//start capture
	if (self->xiH) {
		self->started = 1;
		xiStartAcquisition(self->xiH);
		CameraRefreshSize(self);
	}
	Py_RETURN_NONE;
}

static PyObject *CameraStop(Camera *self) {
	//stop capture
	if (self->xiH) {
		self->started = 0;
		xiStopAcquisition(self->xiH);
	}
	Py_RETURN_NONE;
}

static void CameraRefreshFrame(Camera *self) {
	//fetch image, convert to BGR (image available at self->bgr)
	if (!self->started) return;
	
	xiGetImage(self->xiH, 1000, &self->image);
	unsigned char* f = (unsigned char*)self->image.bp;
	int w = self->width;
	int h = self->height;
	
	unsigned char *p;
	p = self->bgr;
	int y, x;
	
	for (y=1; y < h-1; y += 2) {//ignore sides
		for (x = 1; x < w-1; x+=2) {
			//http://en.wikipedia.org/wiki/Bayer_filter
			//current block is BGGR
			//blue f[y*w+x],green1 f[y*w+x+1],green2 f[y*w+x+w],red f[y*w+x+w+1]
			int xy = y*w+x;
			int txy = xy*3;
			
			p[txy++] = f[xy];
			p[txy++] = (f[xy-1]+f[xy+1]+f[xy-w]+f[xy+w]+2) >> 2;//left,right,up,down
			p[txy++] = (f[xy-w-1]+f[xy-w+1]+f[xy+w-1]+f[xy+w+1]+2) >> 2;//diagonal
			
			xy += 1;
			p[txy++] = (f[xy-1]+f[xy+1]+1) >> 1;//left,right
			p[txy++] = f[xy];
			p[txy++] = (f[xy-w]+f[xy+w]+1) >> 1;//up,down
			
			xy += w - 1;
			txy = xy * 3;
			p[txy++] = (f[xy-w] + f[xy+w]+1) >> 1;//up,down
			p[txy++] = f[xy];
			p[txy++] = (f[xy-1]+f[xy+1]+1) >> 1;//left,right
			
			xy += 1;
			p[txy++] = (f[xy-w-1]+f[xy-w+1]+f[xy+w-1]+f[xy+w+1]+2) >> 2;//diagonal
			p[txy++] = (f[xy-1]+f[xy+1]+f[xy-w]+f[xy+w]+2) >> 2;//left,right,up,down
			p[txy]   = f[xy];
		}
	}
}
		
static PyObject *CameraImage(Camera *self) {
	//return BGR image as numpy array
	if (!self->started) return Py_BuildValue("s", "");
	
	CameraRefreshFrame(self);
	
	npy_intp dims[3] = {self->height, self->width, 3};
	PyArrayObject *outArray = (PyArrayObject *) PyArray_SimpleNewFromData(3, dims, NPY_UINT8, self->bgr);
	return PyArray_Return(outArray);
}	

static PyObject *CameraGetBuffer(Camera *self, PyObject *args) {
	//return segmented buffer (usage np.frombuffer(cam.getBuffer(), dtype=np.uint8).reshape(cam.shape()))
	if (!self->started) Py_RETURN_NONE;
	
	/*int size = sizeof(char) * self->width * self->height;
	
	return PyBuffer_FromMemory(self->segmented, size);*/
	
	npy_intp dims[2] = {self->height, self->width};
	PyArrayObject *outArray = (PyArrayObject *) PyArray_SimpleNewFromData(2, dims, NPY_UINT8, self->segmented);
	return PyArray_Return(outArray);
}

static void SegEncodeRuns(Camera *self) {
// Changes the flat array version of the thresholded image into a run
// length encoded version, which speeds up later processing since we
// only have to look at the points where values change.
	unsigned char m, save;
	unsigned char *row = NULL;
	int x, y, j, l;
	run r;
	unsigned char *map = self->segmented;
	run *rle = self->rle;
	
	int w = self->width;
	int h = self->height;

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

			if(self->colors[m].min_area < MAX_INT || x >= w ) {
				r.color = m;
				r.width = x - l;
				r.parent = j;
				rle[j++] = r;

				if(j >= MAX_RUNS) {
					row[w] = save;
					self->run_c = j;
					return;
				}
			}
		}
	}

	self->run_c = j;
}

static void SegConnectComponents(Camera *self) {
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
	run r1, r2;
	int i, j, s;
	int num = self->run_c;
	run *map = self->rle;

	// l2 starts on first scan line, l1 starts on second
	l2 = 0;
	l1 = 1;
	while(map[l1].y == 0) l1++; // skip first line

	// Do rest in lock step
	r1 = map[l1];
	r2 = map[l2];
	s = l1;
	while(l1 < num){
		if(r1.color==r2.color && self->colors[r1.color].min_area < MAX_INT){
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

inline int range_sum(int x, int w) {
	//foo bar
	return(w*(2*x + w-1) / 2);
}

static void SegExtractRegions(Camera *self) {
// Takes the list of runs and formats them into a region table,
// gathering the various statistics along the way.	num is the number
// of runs in the rmap array, and the number of unique regions in
// reg[] (bounded by max_reg) is returned.	Implemented as a single
// pass over the array of runs.
	int b, i, n, a;
	int num = self->run_c;
	run *rmap = self->rle;
	region *reg = self->regions;
	run r;
	n = 0;

	for(i=0; i<num; i++){
		if( self->colors[rmap[i].color].min_area < MAX_INT){
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
				reg[b].cen_x = range_sum(r.x,r.width);
				reg[b].cen_y = r.y * r.width;
				reg[b].run_start = i;
				reg[b].iterator_id = i; // temporarily use to store last run
				n++;
				if(n >= MAX_REG) {
					printf( "Regions buffer exceeded.\n" );
					self->region_c = MAX_REG;
					return;
				}
			} else {
				// Otherwise update region stats incrementally
				b = rmap[r.parent].parent;
				rmap[i].parent = b; // update parent to identify region id
				reg[b].area += r.width;
				reg[b].x2 = max(r.x + r.width,reg[b].x2);
				reg[b].x1 = min((int)r.x,reg[b].x1);
				reg[b].y2 = r.y; // last set by lowest run
				reg[b].cen_x += range_sum(r.x,r.width);
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
	self->region_c = n;
}

static void SegSeparateRegions(Camera *self) {
// Splits the various regions in the region table a separate list for
// each color.	The lists are threaded through the table using the
// region's 'next' field.	Returns the maximal area of the regions,
// which can be used later to speed up sorting.
	region *p = NULL;
	int i;
	int c;
	int area;
	int num = self->region_c;
	region *reg = self->regions;
	color_class_state *color = self->colors;

	// clear out the region list head table
	for(i=0; i<COLOR_COUNT; i++) {
		color[i].list = NULL;
		color[i].num	= 0;
	}
	// step over the table, adding successive
	// regions to the front of each list
	self->max_area = 0;
	for(i=0; i<num; i++){
		p = &reg[i];
		c = p->color;
		area = p->area;

		if(area >= color[c].min_area){
			if(area > self->max_area) self->max_area = area;
			color[c].num++;
			p->next = color[c].list;
			color[c].list = p;
		}
	}
}

region* SegSortRegions( region *list, int passes ) {
// Sorts a list of regions by their area field.
// Uses a linked list based radix sort to process the list.
	region *tbl[CMV_RADIX]={NULL}, *p=NULL, *pn=NULL;
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

static PyObject *CameraAnalyse(Camera *self) {
	//get new frame and find blobs
	if (!self->started) return NULL;
	
	/*
	//use CameraRefreshFrame to convert RGGB to BGR. slower, but shorter code
	CameraRefreshFrame(self);
	int w = self->width;
	int h = self->height;
	
	unsigned char *f;
	f = self->bgr;
	int y, x;
	for (y=1; y<h-1; y++) {//threshold
		for (x=1; x<w-1; x++) {
			self->segmented[y*w+x] = self->colors_lookup[f[y*w*3+x*3] + (f[y*w*3+x*3+1] << 8) + (f[y*w*3+x*3+2] << 16)];
		}
	}
	*/
	xiGetImage(self->xiH, 100, &self->image);
	unsigned char* f = (unsigned char*)self->image.bp;
	int w = self->width;
	int h = self->height;
	int y, x;
	for (y=1; y < h-1; y += 2) {//threshold RGGB Bayer matrix
		for (x = 1; x < w-1; x+=2) {//ignore sides
			//http://en.wikipedia.org/wiki/Bayer_filter
			//current block is BGGR
			//blue f[y*w+x],green1 f[y*w+x+1],green2 f[y*w+x+w],red f[y*w+x+w+1]
			int xy = y*w+x;
			int b;//blue
			int g;//green
			int r;//red
			
			if (self->pixel_active[xy]) {
				b = f[xy];
				g = (f[xy-1]+f[xy+1]+f[xy-w]+f[xy+w]+2) >> 2;//left,right,up,down
				r = (f[xy-w-1]+f[xy-w+1]+f[xy+w-1]+f[xy+w+1]+2) >> 2;//diagonal
				self->segmented[xy] = self->colors_lookup[b + (g << 8) + (r << 16)];
			}
			
			xy += 1;
			if (self->pixel_active[xy]) {
				b = (f[xy-1]+f[xy+1]+1) >> 1;//left,right
				g = f[xy];
				r = (f[xy-w]+f[xy+w]+1) >> 1;//up,down
				self->segmented[xy] = self->colors_lookup[b + (g << 8) + (r << 16)];
			}
			
			xy += w - 1;
			if (self->pixel_active[xy]) {
				b = (f[xy-w] + f[xy+w]+1) >> 1;//up,down
				g = f[xy];
				r = (f[xy-1]+f[xy+1]+1) >> 1;//left,right
				self->segmented[xy] = self->colors_lookup[b + (g << 8) + (r << 16)];
			}
			
			xy += 1;
			if (self->pixel_active[xy]) {
				b = (f[xy-w-1]+f[xy-w+1]+f[xy+w-1]+f[xy+w+1]+2) >> 2;//diagonal
				g = (f[xy-1]+f[xy+1]+f[xy-w]+f[xy+w]+2) >> 2;//left,right,up,down
				r = f[xy];
				self->segmented[xy] = self->colors_lookup[b + (g << 8) + (r << 16)];
			}
		}
	}
	
	SegEncodeRuns(self);
	SegConnectComponents(self);
	SegExtractRegions(self);
	SegSeparateRegions(self);

	// do minimal number of passes sufficient to touch all set bits
	y = 0;
	while( self->max_area != 0 ) {
		self->max_area >>= CMV_RBITS;
		y++;
	}
	self->passes = y;
	
	Py_RETURN_NONE;
}

static PyObject *CameraSetParamInt(Camera *self, PyObject *args) {
	//set camera param
	if (self->xiH) {
		char *param;
		int val;

		if (!PyArg_ParseTuple(args, "si", &param, &val)) {
			return NULL;
		}	
	
		xiSetParamInt(self->xiH, param, val);
	}
	
	Py_RETURN_NONE;
}

static PyObject *CameraSetParamFloat(Camera *self, PyObject *args) {
	//set camera param
	if (self->xiH) {
		char *param;
		float val;

		if (!PyArg_ParseTuple(args, "sf", &param, &val)) {
			return NULL;
		}
		
		xiSetParamFloat(self->xiH, param, val);
	}
	
	Py_RETURN_NONE;
}

static PyObject *CameraSetParamString(Camera *self, PyObject *args) {
	//set camera param
	if (self->xiH) {
		char *param;
		char *val;
		int size;

		if (!PyArg_ParseTuple(args, "ss", &param, &val)) {
			return NULL;
		}
		
		for(size=0; val[size]!='\0'; ++size);
	
		xiSetParamString(self->xiH, param, val, size);
	}
	Py_RETURN_NONE;
}

static PyObject *CameraGetParamInt(Camera *self, PyObject *args) {
	//get camera param
	int val = 0;
	if (self->xiH) {
		char *param;

		if (!PyArg_ParseTuple(args, "s", &param)) {
			return NULL;
		}	
	
		xiGetParamInt(self->xiH, param, &val);
	}
	return Py_BuildValue("i", val);
}

static PyObject *CameraGetParamFloat(Camera *self, PyObject *args) {
	//get camera param
	float val = 0;
	if (self->xiH) {
		char *param;

		if (!PyArg_ParseTuple(args, "s", &param)) {
			return NULL;
		}	
	
		xiGetParamFloat(self->xiH, param, &val);
	}
	return Py_BuildValue("f", val);
}

static PyObject *CameraGetParamString(Camera *self, PyObject *args) {
	//get camera param
	char *val = 0;
	int size = 1;
	if (self->xiH) {
		char *param;

		if (!PyArg_ParseTuple(args, "s", &param, &size)) {
			return NULL;
		}	
	
		xiGetParamString(self->xiH, param, &val, size);
	}
	return Py_BuildValue("s#", val, size);
}

static PyObject *CameraGetBlobs(Camera *self, PyObject *args) {
	//get blobs for color, return numpy array [[distance,angle,area,cen_x,cen_y,x1,x2,y1,y2],...]
	int color;
	if (!PyArg_ParseTuple(args, "i", &color)) {
		return NULL;
	}
	
	region *list = SegSortRegions(self->colors[color].list, self->passes);
	int rows = self->colors[color].num;
	int cols = 9;
	int i;
	int n = 0;
	int w = self->width;
	int xy;
	unsigned short cen_x, cen_y;
	unsigned short *pout = (unsigned short *) malloc(rows * cols * sizeof(unsigned short));

	for (i=0; i<rows; i++) {
		cen_x = (unsigned short)round(list[i].cen_x);
		cen_y = (unsigned short)round(list[i].cen_y);
		xy = cen_y * w + cen_x;
		
		pout[n++] = self->loc_r[xy];
		pout[n++] = self->loc_phi[xy];
		pout[n++] = (unsigned short)min(65535 , list[i].area);
		pout[n++] = cen_x;
		pout[n++] = cen_y;
		pout[n++] = (unsigned short)list[i].x1;
		pout[n++] = (unsigned short)list[i].x2;
		pout[n++] = (unsigned short)list[i].y1;
		pout[n++] = (unsigned short)list[i].y2;
	}
	
	npy_intp dims[2] = {rows, cols};
	PyArrayObject *outArray = (PyArrayObject *) PyArray_SimpleNewFromData(2, dims, NPY_UINT16, pout);
	PyArray_ENABLEFLAGS(outArray, NPY_ARRAY_OWNDATA);
	return PyArray_Return(outArray);
}

static PyObject *CameraTest(Camera *self) {
	//test
	printf("x0 y0 r %hu phi %hu \n", self->loc_r[0], self->loc_phi[0]);
	
	Py_RETURN_NONE;
}

static PyMethodDef Camera_methods[] = {
	{"start", (PyCFunction)CameraStart, METH_NOARGS,
		"start()\n\n"
		"Starts the data acquisition on the camera."},
	{"stop", (PyCFunction)CameraStop, METH_NOARGS,
		"stop()\n\n"
		"Stops data acquisition and deallocates internal image buffers."},
	{"opened", (PyCFunction)CameraOpened, METH_NOARGS,
		"opened()\n\n"
		"True if camera is opened."},
	{"started", (PyCFunction)CameraStarted, METH_NOARGS,
		"started()\n\n"
		"True if camera is started."},
	{"image", (PyCFunction)CameraImage, METH_NOARGS,
		"image()\n\n"
		"Capture image."},
	{"setInt", (PyCFunction)CameraSetParamInt, METH_VARARGS,
		"setInt(str param, int value)\n\n"
		"Set camera parameters."},
	{"setFloat", (PyCFunction)CameraSetParamFloat, METH_VARARGS,
		"setFloat(str param, float value)\n\n"
		"Set camera parameters."},
	{"setString", (PyCFunction)CameraSetParamString, METH_VARARGS,
		"setString(str param, str value, size)\n\n"
		"Set camera parameters."},
	{"getInt", (PyCFunction)CameraGetParamInt, METH_VARARGS,
		"getInt(str param)\n\n"
		"get camera parameters."},
	{"getFloat", (PyCFunction)CameraGetParamFloat, METH_VARARGS,
		"getFloat(param)\n\n"
		"get camera parameters."},
	{"getString", (PyCFunction)CameraGetParamString, METH_VARARGS,
		"getString(param, size)\n\n"
		"get camera parameters."},
	{"analyse", (PyCFunction)CameraAnalyse, METH_NOARGS,
		"analyse()\n\n"
		"Threshold, find connected components."},
	{"getBuffer", (PyCFunction)CameraGetBuffer, METH_NOARGS,
		"getBuffer()\n\n"
		"Retrieve segmentation buffer."},
	{"shape", (PyCFunction)CameraShape, METH_NOARGS,
		"shape()\n\n"
		"Retrieve image dimensions (height, width)."},
	{"getBlobs", (PyCFunction)CameraGetBlobs, METH_VARARGS,
		"getBlobs(int color_id)\n\n"
		"Return connected components with color_id."},
	{"setColorMinArea", (PyCFunction)CameraSetColorMinArea, METH_VARARGS,
		"setColorMinArea(int color_id, int min_area)\n\n"
		"Find only blobs larger than min_area"},
	{"setColors", (PyCFunction)CameraSetColors, METH_VARARGS,
		"setColors(nparr)\n\n"
		"Set color lookup table."},
	{"setPixels", (PyCFunction)CameraSetActivePixels, METH_VARARGS,
		"setPixels(nparr)\n\n"
		"Set active pixels table."},
	{"setLocations", (PyCFunction)CameraSetLocations, METH_VARARGS,
		"setLocations(nparr distances, nparr angles)\n\n"
		"Set location lookup table."},
	{"test", (PyCFunction)CameraTest, METH_NOARGS,
		"test()\n\n"
		"For debugging C code."},
	{NULL}
};

static PyTypeObject Camera_type = {
	PyObject_HEAD_INIT(NULL) 0,
	"pyXiQ.Camera", sizeof(Camera), 0,
	(destructor)CameraDealloc, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, Py_TPFLAGS_DEFAULT, "Camera()\n\nOpens the video device.", 0, 0, 0,
	0, 0, 0, Camera_methods, 0, 0, 0, 0, 0, 0, 0,
	(initproc)CameraInit
};

static PyMethodDef module_methods[] = {
	{NULL}
};

PyMODINIT_FUNC initpyXiQ(void) {
	Camera_type.tp_new = PyType_GenericNew;

	if (PyType_Ready(&Camera_type) < 0) return;

	PyObject *module;
	module = Py_InitModule3("pyXiQ", module_methods, "Computer vision: Robotex, Ximea cam");
	if (!module) return;

	Py_INCREF(&Camera_type);
	PyModule_AddObject(module, "Camera", (PyObject *)&Camera_type);
	import_array();
}