#ifndef OBJECT_H
#define OBJECT_H

#include "Config.h"
#include "Maths.h"

#include <vector>

class Object {

public:
	Object(int x = 0, int y = 0, int width = 0, int height = 0, int area = 0, float distance = 0.0f, float distanceX = 0.0f, float distanceY = 0.0f, float angle = 0.0f, int type = -1, bool behind = false);
	void copyFrom(const Object* other);
	bool intersects(Object* other, int margin = 0) const;
	float getDribblerDistance() { return Math::max(distance - Config::robotDribblerDistance, 0.0f); };
	bool contains(Object* other) const;
	Object* mergeWith(Object* other) const;

	static std::vector<Object*> mergeOverlapping(const std::vector<Object*>& set, int margin = 0, bool requireSameType = false);

    int x;
    int y;
    int width;
    int height;
    int area;
    float distance;
	float distanceX;
	float distanceY;
    float angle;
    int type;
	double lastSeenTime;
	bool behind;
	bool processed;
};

typedef std::vector<Object*> ObjectList;
typedef ObjectList::iterator ObjectListIt;
typedef ObjectList::const_iterator ObjectListItc;

#endif // OBJECT_H
