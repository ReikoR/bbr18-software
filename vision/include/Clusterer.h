//
// Created by Gutnar on 08/08/2018.
//

#ifndef BBR18_VISION_CLUSTERER_H
#define BBR18_VISION_CLUSTERER_H

#include "OpenCLCompute.h"


class Clusterer {

public:
    Clusterer();
    ~Clusterer();

    unsigned char* centroids;
    int centroidCount;

    void processFrame(unsigned char *bgr);
    void getSegmentedRgb(unsigned char* out);
    void getClusterRange(int x, int y);
    int getCentroidIndexAt(int x, int y);
    void setCentroidCount(int newCentroidCount);
private:
    OpenCLCompute* openCLCompute;
    unsigned char* clustered;
};


#endif //BBR18_VISION_CLUSTERER_H
