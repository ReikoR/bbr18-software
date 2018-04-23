cmake_minimum_required(VERSION 3.8)
project(bbr18_vision)
SET(CMAKE_MODULE_PATH ${PROJECT_SOURCE_DIR}/cmake)

set(CMAKE_CXX_STANDARD 14)

#set(CMAKE_CXX_FLAGS "-D_GLIBCXX_USE_CXX11_ABI=0")

set(CMAKE_CXX_FLAGS "-fopenmp --std=gnu++11 ${CMAKE_CXX_FLAGS}")

include_directories(include lib xiAPi)

FIND_PACKAGE(OpenCL REQUIRED)
INCLUDE_DIRECTORIES(${OPENCL_INCLUDE})

find_package(Boost REQUIRED COMPONENTS system)

include_directories(${Boost_INCLUDE_DIRS})

link_directories(xiApi ${Boost_LIBRARY_DIRS})

file(GLOB SOURCE_FILES
        main.cpp
        stdafx.h
        src/*.cpp
        include/*.h
        lib/*.hpp
        )

configure_file(xiApi/xiapi64.dll xiapi64.dll COPYONLY)
configure_file(${Boost_LIBRARY_DIRS}/../bin/libboost_system-mt.dll libboost_system-mt.dll COPYONLY)

add_executable(bbr18_vision ${SOURCE_FILES})

set(CMAKE_EXE_LINKER_FLAGS " -static")
target_link_libraries(bbr18_vision -static-libgcc -static-libstdc++)

target_link_libraries(bbr18_vision winmm.lib)
target_link_libraries(bbr18_vision xiapi64.lib)
target_link_libraries(bbr18_vision ws2_32 ${Boost_LIBRARIES})
target_link_libraries(bbr18_vision ${OPENCL_LIBRARY})
