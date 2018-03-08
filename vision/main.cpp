#include "stdafx.h"
#include <iostream>
#include <chrono>
#include "VisionManager.h"

/** Use to init the clock */
#define TIMER_INIT \
    LARGE_INTEGER frequency; \
    LARGE_INTEGER t1,t2; \
    double elapsedTime; \
    QueryPerformanceFrequency(&frequency);


/** Use to start the performance timer */
#define TIMER_START QueryPerformanceCounter(&t1);

/** Use to stop the performance timer and output the result to the standard stream. Less verbose than \c TIMER_STOP_VERBOSE */
#define TIMER_STOP \
    QueryPerformanceCounter(&t2); \
    elapsedTime=(float)(t2.QuadPart-t1.QuadPart)/frequency.QuadPart;

int main(int argc, char* argv[]) {
    bool showGui = false;

    if (argc > 0) {
        std::cout << "! Parsing command line options" << std::endl;

        for (int i = 1; i < argc; i++) {
            if (strcmp(argv[i], "gui") == 0) {
                showGui = true;

                std::cout << "  > Showing the GUI" << std::endl;
            } else {
                std::cout << "  > Unknown command line option: " << argv[i] << std::endl;

                return 1;
            }
        }
    }

    auto* visionManager = new VisionManager();

    visionManager->showGui = showGui;

    visionManager->setup();

    visionManager->run();

    delete visionManager;
    visionManager = nullptr;
}

