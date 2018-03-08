find_path(OPENCL_INCLUDE CL/opencl.h CL/cl.h PATHS $ENV{INTELOCLSDKROOT}/include)
find_library(OPENCL_LIBRARY OpenCL.lib PATHS $ENV{INTELOCLSDKROOT}/lib/x64)

set(OCL_LIBS "")

if (NOT OPENCL_INCLUDE MATCHES NOTFOUND)
    if (NOT OPENCL_LIBRARY MATCHES NOTFOUND)
        set (OPENCL_FOUND TRUE)

        get_filename_component(OPENCL_LIBRARY_PATH ${OPENCL_LIBRARY} PATH)

        list(APPEND OPENCL_LIBS OpenCL)
    endif()
endif()

if (NOT DEFINED OPENCL_FOUND)
    message(STATUS "OpenCL was not found (optional). The following will not be built: rotate_opencl plugin.")
else ()
    message(STATUS "OpenCL was found here: ${OPENCL_LIBRARY_PATH} and ${OPENCL_INCLUDE}")
endif()
