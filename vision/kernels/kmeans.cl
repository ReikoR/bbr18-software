__kernel void kMeans(
    __global uchar* input,
    __global uchar* output,
    __global uchar* centroids,
    __const int centroidCount
) {
    int x = get_global_id(0);
    int y = get_global_id(1);

    int width = get_global_size(0);
    int p = y*width + x;
    int i = p * 3;

    // Get pixel color
    int r = input[i + 0];
    int g = input[i + 1];
    int b = input[i + 2];

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

    output[p] = closestCentroid;
}