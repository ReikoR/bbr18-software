__kernel void debayerAndSegment(
    __global uchar* input,
    __global uchar* output,
    __global uchar* lookup,
    __global uchar* segmented
) {
    int x = get_global_id(0);
    int y = get_global_id(1);

    int width = 2 * get_global_size(0);
    int maxIndex = width * 2 * get_global_size(1) - 1;

    int destY     = 2 * y;
    int destX     = 2 * x;
    int xy = destY * width + destX;

    // 4 pixels per call, 2 pixels of 2 lines
    int sourcePixelIndex = xy - width;

    uchar4 line_0;
    uchar4 line_1;
    uchar4 line_2;
    uchar4 line_3;

    // vector access .x .y .z. w
    line_0.x = input[clamp(sourcePixelIndex-1, 0, maxIndex)];
    line_0.y = input[clamp(sourcePixelIndex, 0, maxIndex)];
    line_0.z = input[clamp(sourcePixelIndex+1, 0, maxIndex)];
    line_0.w = input[clamp(sourcePixelIndex+2, 0, maxIndex)];

    sourcePixelIndex += width;
    line_1.x = input[clamp(sourcePixelIndex-1, 0, maxIndex)];
    line_1.y = input[clamp(sourcePixelIndex, 0, maxIndex)];
    line_1.z = input[clamp(sourcePixelIndex+1, 0, maxIndex)];
    line_1.w = input[clamp(sourcePixelIndex+2, 0, maxIndex)];

    sourcePixelIndex += width;
    line_2.x = input[clamp(sourcePixelIndex-1, 0, maxIndex)];
    line_2.y = input[clamp(sourcePixelIndex, 0, maxIndex)];
    line_2.z = input[clamp(sourcePixelIndex+1, 0, maxIndex)];
    line_2.w = input[clamp(sourcePixelIndex+2, 0, maxIndex)];

    sourcePixelIndex += width;
    line_3.x = input[clamp(sourcePixelIndex-1, 0, maxIndex)];
    line_3.y = input[clamp(sourcePixelIndex, 0, maxIndex)];
    line_3.z = input[clamp(sourcePixelIndex+1, 0, maxIndex)];
    line_3.w = input[clamp(sourcePixelIndex+2, 0, maxIndex)];

    //R G R G R G
    //G B G B G B
    //R G R G R G
    //G B G B G B
    //R G R G R G
    //G B G B G B

    // first pixel first line
    ushort blue_00  = (line_0.x + line_0.z + line_2.x + line_2.z) / 4;
    ushort green_00 = (line_0.y + line_1.x + line_1.z + line_2.y) / 4;
    ushort red_00   = line_1.y;

    // second pixel first line
    ushort blue_01   = hadd(line_0.z, line_2.z);
    ushort green_01  = line_1.z;
    ushort red_01    = hadd(line_1.y, line_1.w);

    // first pixel second line
    ushort blue_10   = hadd(line_2.x, line_2.z);
    ushort green_10  = line_2.y;
    ushort red_10    = hadd(line_1.y, line_3.y);

    // second pixel second line
    ushort blue_11   = line_2.z;
    ushort green_11  = (line_1.z + line_2.y + line_2.w + line_3.z) / 4;
    ushort red_11    = (line_1.y + line_1.w + line_3.y + line_3.w) / 4;

    // first pixel first line
    int n = 1;
    int destPixelIndex = (destY * width + destX) * 3;
    output[destPixelIndex]    = blue_00 * n;
    output[destPixelIndex+1]  = green_00 * n;
    output[destPixelIndex+2]  = red_00 * n;
    segmented[xy] = lookup[blue_00 + (green_00 << 8) + (red_00 << 16)];

    // second pixel first line
    output[destPixelIndex+3]  = blue_01 * n;
    output[destPixelIndex+4]  = green_01 * n;
    output[destPixelIndex+5]  = red_01 * n;
    segmented[xy + 1] = lookup[blue_01 + (green_01 << 8) + (red_01 << 16)];

    // first pixel second line
    destPixelIndex += width * 3;
    output[destPixelIndex]    = blue_10 * n;
    output[destPixelIndex+1]  = green_10 * n;
    output[destPixelIndex+2]  = red_10 * n;
    xy += width;
    segmented[xy] = lookup[blue_10 + (green_10 << 8) + (red_10 << 16)];

    // second pixel second line
    output[destPixelIndex+3]  = blue_11 * n;
    output[destPixelIndex+4]  = green_11 * n;
    output[destPixelIndex+5]  = red_11 * n;
    segmented[xy + 1] = lookup[blue_11 + (green_11 << 8) + (red_11 << 16)];
}