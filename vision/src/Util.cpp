#include "Util.h"
#include <iostream>
#include <ctime>
#include <stdio.h>
#include <Windows.h>
#include <tchar.h> 
#include <stdio.h>
#include <strsafe.h>

double Util::queryPerformanceFrequency = 0;
__int64 Util::timerStartCount = 0;
//float Util::cameraCorrectionK = Config::cameraCorrectionK;
//float Util::cameraCorrectionZoom = Config::cameraCorrectionZoom;

__int64 Util::timerStart() {
	LARGE_INTEGER li;
    QueryPerformanceFrequency(&li);

    queryPerformanceFrequency = double(li.QuadPart)/1000.0;

    QueryPerformanceCounter(&li);
    timerStartCount = li.QuadPart;

	return li.QuadPart;
}

double Util::timerEnd(__int64 startTime) {
	LARGE_INTEGER li;
    QueryPerformanceCounter(&li);

    return double(li.QuadPart - (startTime != -1 ? startTime : timerStartCount)) / queryPerformanceFrequency;
}

const std::string Util::base64Chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789+/";

std::string Util::base64Encode(const unsigned char* data, unsigned int length) {
    std::string ret;
    int i = 0;
    int j = 0;
    unsigned char char_array_3[3];
    unsigned char char_array_4[4];

    while (length--) {
        char_array_3[i++] = *(data++);
        if (i == 3) {
            char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
            char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
            char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
            char_array_4[3] = char_array_3[2] & 0x3f;

            for(i = 0; (i <4) ; i++)
                ret += base64Chars[char_array_4[i]];
            i = 0;
        }
    }

    if (i) {
        for(j = i; j < 3; j++)
            char_array_3[j] = '\0';

        char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
        char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
        char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
        char_array_4[3] = char_array_3[2] & 0x3f;

        for (j = 0; (j < i + 1); j++)
            ret += base64Chars[char_array_4[j]];

        while((i++ < 3))
            ret += '=';

    }

    return ret;
}

double Util::millitime() {
	return (double)timeGetTime() / 1000.0;
}

double Util::duration(double start) {
    return Util::millitime() - start;
}

float Util::signum(float value) {
    if (value > 0) return 1;
    if (value < 0) return -1;

    return 0;
}

float Util::limit(float num, float min, float max) {
    if (num < min) {
        num = min;
    } else if (num > max) {
        num = max;
    }

    return num;
}

int Util::strpos(const std::string &haystack, const std::string &needle) {
    int inputLength = haystack.length();
    int needleLength = needle.length();

    if (inputLength == 0 || needleLength == 0) {
        return -1;
    }

    for (int i = 0, j = 0; i < inputLength; j = 0, i++) {
        while (i + j < inputLength && j < needleLength && haystack[i + j] == needle[j]) {
            j++;
        }

        if (j == needleLength) {
            return i;
        }
    }

    return -1;
}
