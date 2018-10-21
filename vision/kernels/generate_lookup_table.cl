__kernel void generate_lookup_table(
    __global uchar* centroids,
    __global uchar* lookupTable,
    __const int centroidIndex,
    __const int centroidCount,
    __const uchar color
) {
    int r = get_global_id(0);
    int g = get_global_id(1);
    int b = get_global_id(2);

    // Find closest centroid
    int minDist;
    int closestCentroid = -1;

    for (int c = 0; c < centroidCount; ++c) {
        int dist =
            (r - centroids[0 + c*3])*(r - centroids[0 + c*3])
            + (g - centroids[1 + c*3])*(g - centroids[1 + c*3])
            + (b - centroids[2 + c*3])*(b - centroids[2 + c*3]);

        if (closestCentroid == -1 || dist < minDist) {
            minDist = dist;
            closestCentroid = c;
        }
    }

    if (closestCentroid == centroidIndex) {
        lookupTable[r + (g << 8) + (b << 16)] = color;
    }
}