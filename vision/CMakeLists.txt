cmake_minimum_required(VERSION 3.8)
project(bbr18_vision)
SET(CMAKE_MODULE_PATH ${PROJECT_SOURCE_DIR}/cmake)

set(CMAKE_CXX_STANDARD 14)

#set(CMAKE_CXX_FLAGS "-D_GLIBCXX_USE_CXX11_ABI=0")

set(CMAKE_CXX_FLAGS "-fopenmp --std=gnu++11 ${CMAKE_CXX_FLAGS}")

include_directories(include lib lib/jpeg xiAPi)

FIND_PACKAGE(OpenCL REQUIRED)
INCLUDE_DIRECTORIES(${OPENCL_INCLUDE})

find_package(Boost REQUIRED COMPONENTS system)
include_directories(${Boost_INCLUDE_DIRS})
link_directories(xiApi ${Boost_LIBRARY_DIRS})

find_package(PNG REQUIRED)
include_directories(${PNG_INCLUDE_DIRS})

#find_package(JPEGTURBO REQUIRED)
#include_directories(${JPEGTURBO_INCLUDE_DIR})

find_package(WebP REQUIRED)
include_directories(${WEBP_INCLUDE_DIRS})

file(GLOB SOURCE_FILES
        main.cpp
        stdafx.h
        src/*.cpp
        include/*.h
        lib/*.hpp
        lib/jpeg/*.h
        lib/jpeg/*.cpp
        )

#message(STATUS JPEGTURBO_LIBRARY: ${JPEGTURBO_LIBRARY})
#message(STATUS JPEGTURBO_LIBRARIES: ${JPEGTURBO_LIBRARIES})

configure_file(xiApi/xiapi64.dll xiapi64.dll COPYONLY)
configure_file(${Boost_LIBRARY_DIRS}/../bin/libboost_system-mt.dll libboost_system-mt.dll COPYONLY)
#configure_file(${JPEGTURBO_LIBRARY} libjpeg.dll.a COPYONLY)

add_executable(bbr18_vision ${SOURCE_FILES})

set(CMAKE_EXE_LINKER_FLAGS " -static")
target_link_libraries(bbr18_vision -static-libgcc -static-libstdc++)

target_link_libraries(bbr18_vision winmm.lib)
target_link_libraries(bbr18_vision xiapi64.lib)
target_link_libraries(bbr18_vision ws2_32 ${Boost_LIBRARIES})
target_link_libraries(bbr18_vision ${OPENCL_LIBRARY})
target_link_libraries(bbr18_vision ${PNG_LIBRARIES})
#target_link_libraries(bbr18_vision ${JPEGTURBO_LIBRARIES})
target_link_libraries(bbr18_vision ${WEBP_LIBRARIES})