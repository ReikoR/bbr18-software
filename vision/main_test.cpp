#include "stdafx.h"

#include "xiApi/xiApi.h"       // Windows
#include <memory.h>

#define HandleResult(res,place) if (res!=XI_OK) {printf("Error after %s (%d)\n",place,res);goto finish;}

int _tmain(int argc, _TCHAR* argv[]) {

    // image buffer
    XI_IMG image;
    memset(&image, 0, sizeof(image));
    image.size = sizeof(XI_IMG);

    // Sample for XIMEA API V4.05
    HANDLE xiH = NULL;
    XI_RETURN stat = XI_OK;

    // Retrieving a handle to the camera device
    printf("Opening first camera...\n");
    stat = xiOpenDevice(0, &xiH);
    HandleResult(stat, "xiOpenDevice");

    // Setting "exposure" parameter (10ms=10000us)
    stat = xiSetParamInt(xiH, XI_PRM_EXPOSURE, 10000);
    HandleResult(stat, "xiSetParam (exposure set)");

    // Note:
    // The default parameters of each camera might be different in different API versions
    // In order to ensure that your application will have camera in expected state,
    // please set all parameters expected by your application to required value.

    printf("Starting acquisition...\n");
    stat = xiStartAcquisition(xiH);
    HandleResult(stat, "xiStartAcquisition");

    for (int images = 0; images < 10; images++)
    {
        // getting image from camera
        stat = xiGetImage(xiH, 5000, &image);
        HandleResult(stat, "xiGetImage");
        unsigned char pixel = *(unsigned char*)image.bp;
        printf("Image %d %d (%dx%d) received from camera. First pixel value: %d\n", images, (int)image.bp_size, (int)image.width, (int)image.height, pixel);
    }

    printf("Stopping acquisition...\n");
    xiStopAcquisition(xiH);
    xiCloseDevice(xiH);
    finish:
    printf("Done\n");

    return 0;
}