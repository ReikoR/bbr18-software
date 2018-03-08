# Installing
Everything should be for Windows and 64-bit
* Install CLion
  * https://www.jetbrains.com/clion/
* Install Ximea API
  * https://www.ximea.com/support/wiki/apis/XIMEA_Windows_Software_Package
* Install node.js (for testing UDP)
  * https://nodejs.org/en/
* Install Intel OpenCL SDK
  * https://software.intel.com/en-us/intel-opencl
* Install msys2
  * http://www.msys2.org/
* Install mingw and boost
  * Based on https://github.com/orlp/dev-on-windows/wiki/Installing-GCC--&-MSYS2
  * `pacman -Syuu` close terminal and repeat until all updated
  * `pacman -S --needed base-devel mingw-w64-x86_64-toolchain mingw-w64-x86_64-cmake`
  * `pacman -Sy mingw-w64-x86_64-boost`

# Building
* Set Clion to use msys2 mingw64
  * Use `C:\msys64\mingw64\bin\cmake.exe` instead of embedded cmake
* Copy `xiapi64.dll` and `libboost_system-mt.dll` to build folder
  * `xiApi\xiapi64.dll`
  * `C:\msys64\mingw64\bin\libboost_system-mt.dll`