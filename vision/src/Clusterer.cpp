//
// Created by Gutnar on 08/08/2018.
//
#include <iostream>
#include "Clusterer.h"
#include "Config.h"

Clusterer::Clusterer() {
    openCLCompute = &OpenCLCompute::getInstance();

    clustered = (unsigned char *)_aligned_malloc(Config::cameraWidth * Config::cameraHeight * sizeof(unsigned char), 4096);

    setCentroidCount(20);
}

Clusterer::~Clusterer() {
    openCLCompute = nullptr;
    clustered = nullptr;
    centroids = nullptr;
}

void Clusterer::processFrame(unsigned char *bgr) {
    openCLCompute->kMeans(bgr, clustered, centroids, centroidCount, Config::cameraWidth, Config::cameraHeight);

    // Calculate new centroids
    int b[centroidCount] = {0};
    int g[centroidCount] = {0};
    int r[centroidCount] = {0};
    int n[centroidCount] = {0};

    int size = 1280 * 1024;
    for (int p = 0; p < size; ++p) {
        int cluster = *(clustered + p);
        b[cluster] += *(bgr + p*3 + 0);
        g[cluster] += *(bgr + p*3 + 1);
        r[cluster] += *(bgr + p*3 + 2);
        n[cluster] += 1;
    }

    for (int cluster = 0; cluster < centroidCount; ++cluster) {
        if (n[cluster] == 0) {
            continue;
        }

        *(centroids + cluster*3 + 0) = b[cluster] / n[cluster];
        *(centroids + cluster*3 + 1) = g[cluster] / n[cluster];
        *(centroids + cluster*3 + 2) = r[cluster] / n[cluster];
    }
}

// Get clustered image
void Clusterer::getSegmentedRgb(unsigned char* out) {
    int size = 1280 * 1024;

    for (int p = 0; p < size; ++p) {
        int cluster = *(clustered + p);

        out[p * 3 + 0] = *(centroids + cluster*3 + 0);
        out[p * 3 + 1] = *(centroids + cluster*3 + 1);
        out[p * 3 + 2] = *(centroids + cluster*3 + 2);
    }
}


void Clusterer::getClusterRange(int x, int y) {
    // Get corresponding centroid to a given pixel
    int pos = y*Config::cameraWidth + x;
    int r = *(clustered + pos + 0);
    int g = *(clustered + pos + 1);
    int b = *(clustered + pos + 2);

}

int Clusterer::getCentroidIndexAt(int x, int y) {
    return *(clustered + y * Config::cameraWidth + x);
}

void Clusterer::setCentroidCount(int newCentroidCount) {
    centroidCount = newCentroidCount;

    // Generate initial random centroids
    centroids = (unsigned char *)_aligned_malloc(3 * centroidCount * sizeof(unsigned char), 4096);

    for (int i = 0; i < 3 * centroidCount; ++i) {
        *(centroids + i) = rand() % 256;
    }
}