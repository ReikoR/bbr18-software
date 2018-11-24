#include "Vision.h"
#include "Config.h"
#include "Util.h"

#include <iostream>
#include <algorithm>

Vision::Vision(Blobber* blobber, Dir dir, int width, int height) : blobber(blobber), dir(dir), width(width), height(height) {
    validBallBgColors.push_back("green");
    validBallBgColors.push_back("white");
    validBallBgColors.push_back("black");
    validBallBgColors.push_back("ball");
    validBallBgColors.push_back("yellow-goal");
    validBallBgColors.push_back("blue-goal");

    validBallPathColors.push_back("green");
    validBallPathColors.push_back("white");
    validBallPathColors.push_back("black");
    validBallPathColors.push_back("ball");
    validBallPathColors.push_back("yellow-goal");
    validBallPathColors.push_back("blue-goal");

	viewObstructedValidColors.push_back("green");
    viewObstructedValidColors.push_back("white");
    viewObstructedValidColors.push_back("black");
    viewObstructedValidColors.push_back("ball");
    viewObstructedValidColors.push_back("yellow-goal");
    viewObstructedValidColors.push_back("blue-goal");

    goalObstructedValidColors.push_back("green");
	goalObstructedValidColors.push_back("white");
	goalObstructedValidColors.push_back("black");
    goalObstructedValidColors.push_back("ball");

    validGoalPathColors.push_back("green");
    validGoalPathColors.push_back("white");
    validGoalPathColors.push_back("black");
    validGoalPathColors.push_back("ball");
    //validGoalPathColors.push_back("yellow-goal");
    //validGoalPathColors.push_back("blue-goal");

	validColorsBelowBall.push_back("none");
	validColorsBelowBall.push_back("black");

	goalColors.push_back("yellow-goal");
    goalColors.push_back("blue-goal");

	const int frameCenterX = Config::cameraWidth / 2;
	const int sideColumnCount = gridColumnCount / 2;
	int y;

	for (int yIndex = 0; yIndex < gridRowCount; yIndex++) {
		for (int xIndex = 0; xIndex < gridColumnCount; xIndex++) {
			validGrid[xIndex][yIndex] = 0;
			y = Config::surroundSenseThresholdY - 10 * yIndex;
			xGrid[xIndex][yIndex] = frameCenterX + (xIndex - sideColumnCount) * (y / 18 + 24);
			yGrid[xIndex][yIndex] = y;
		}
	}
}

Vision::~Vision() {
   
}

void Vision::setDebugImage(unsigned char* image, int width, int height) {
	canvas.data = image;
	canvas.width = width;
	canvas.height = height;
}

Vision::Result* Vision::process() {
	Result* result = new Result();

	result->vision = this;

	result->baskets = processBaskets(dir);
	result->balls = processBalls(dir, result->baskets);

	std::vector<Blobber::BlobColor> validDriveableColors = {
			Blobber::BlobColor::orange,
			Blobber::BlobColor::green
	};

	result->straightAheadInfo = getStraightAheadMetric(validDriveableColors, result->balls);

	//std::cout << getBorderY() << std::endl;
	result->borderY = getBorderY();

	/*updateColorDistances();
	updateColorOrder();

	result->colorOrder = colorOrder;
	result->whiteDistance = whiteDistance;
	result->blackDistance = blackDistance;*/

	return result;
}

ObjectList Vision::processBalls(Dir dir, ObjectList& baskets) {
	ObjectList allBalls;
	ObjectList filteredBalls;

    Distance distance;

    Blobber::BlobInfo* blobInfo = blobber->getBlobs(Blobber::BlobColor::green);

    for (int j = 0; j < blobInfo->count; j++) {
        Blobber::Blob blob = blobInfo->blobs[j];
		if (blob.area < Config::ballBlobMinArea) {
			continue;
		}

		//distance = getDistance((int)blob->centerX, (int)blob->y2);

		/*if (dir == Dir::REAR) {
			if (distance.angle > 0.0f) {
				distance.angle -= Math::PI;
			} else {
				distance.angle += Math::PI;
			}
		}*/

		/*if (blob->x1 < 0) blob->x1 = 0;
		if (blob->x2 > width - 1) blob->x2 = width - 1;
		if (blob->y1 < 0) blob->y1 = 0;
		if (blob->y2 > height - 1) blob->y2 = height - 1;*/

		int width = blob.x2 - blob.x1;
		int height = blob.y2 - blob.y1;

        Object* ball = new Object(
            blob.x1 + width / 2,
            blob.y1 + height / 2,
            width,
            height,
            blob.area,
			distance.straight,
			distance.x,
			distance.y,
            distance.angle,
			3,
            !(dir == Dir::FRONT)
        );
		
        allBalls.push_back(ball);
    }

	// TODO Make the overlap margin dependent on distance (larger for objects close-by)
	ObjectList mergedBalls = Object::mergeOverlapping(allBalls, Config::ballOverlapMargin);

	for (ObjectListItc it = mergedBalls.begin(); it != mergedBalls.end(); it++) {
		Object* ball = *it;

		if (isValidBall(ball, dir, baskets)) {
			/*int extendHeightBelow = getPixelsBelow(ball->x, ball->y + ball->height / 2, validColorsBelowBall);

			if (extendHeightBelow > 0) {
				ball->y += extendHeightBelow / 2;
				ball->height = (int)Math::min((float)(ball->height + extendHeightBelow), (float)ball->width);
			}

			distance = getDistance(ball->x, ball->y + ball->height / 2);

			if (dir == Dir::REAR) {
				if (distance.angle > 0.0f) {
					distance.angle -= Math::PI;
				} else {
					distance.angle += Math::PI;
				}
			}

			ball->distance = distance.straight;
			ball->distanceX = distance.x;
			ball->distanceY = distance.y;
			ball->angle = distance.angle;

			// TODO Review this
			if (ball->distance < 0.0f) {
				std::cout << "- Skipping ball with invalid distance: " << ball->distance << std::endl;

				continue;
			}*/

			filteredBalls.push_back(ball);
		}
	}

	return filteredBalls;
}

ObjectList Vision::processBaskets(Dir dir) {
	ObjectList allGoals;
	ObjectList filteredGoals;

    Distance distance;

    for (int i = 0; i < 2; i++) {
        Blobber::BlobInfo* blobInfo = blobber->getBlobs(i == 0 ? Blobber::BlobColor::blue : Blobber::BlobColor::magenta);

        for (int j = 0; j < blobInfo->count; j++) {
        	Blobber::Blob blob = blobInfo->blobs[j];

			if (blob.area < Config::basketBlobMinArea) {
				continue;
			}

			//distance = getDistance((int)blob.centerX, (int)blob.y2);

			/*if (dir == Dir::REAR) {
				if (distance.angle > 0.0f) {
					distance.angle -= Math::PI;
				} else {
					distance.angle += Math::PI;
				}
			}*/

			/*if (blob.x1 < 0) blob.x1 = 0;
			if (blob.x2 > width - 1) blob.x2 = width - 1;
			if (blob.y1 < 0) blob.y1 = 0;
			if (blob.y2 > height - 1) blob.y2 = height - 1;*/

			int width = blob.x2 - blob.x1;
			int height = blob.y2 - blob.y1;

			auto * goal = new Object(
				blob.x1 + width / 2,
				blob.y1 + height / 2,
				width,
				height,
				blob.area,
				distance.straight,
				distance.x,
				distance.y,
				distance.angle,
				i == 0 ? Side::BLUE : Side::MAGENTA,
				!(dir == Dir::FRONT)
			);

			goal->processed = false;
			allGoals.push_back(goal);
        }
    }

	ObjectList mergedGoals = Object::mergeOverlapping(allGoals, Config::goalOverlapMargin, true);

	float maxGoalDistance = Math::sqrt(Math::pow(Config::fieldHeight / 2.0f, 2.0) + Math::pow(Config::fieldWidth, 2.0f));

	for (ObjectListItc it = mergedGoals.begin(); it != mergedGoals.end(); it++) {
		Object* goal = *it;

		if (isValidbasket(goal, goal->type == 0 ? Side::BLUE : Side::MAGENTA)) {
			// TODO Extend the goal downwards using extended color / limited ammount horizontal too

			//distance = getDistance(goal->x, goal->y + goal->height / 2);

			/*if (dir == Dir::REAR) {
				if (distance.angle > 0.0f) {
					distance.angle -= Math::PI;
				} else {
					distance.angle += Math::PI;
				}
			}*/

			// straight distance is already updated in valid goal check
			//goal->distance = distance.straight;

			// limit goal distance to maximum possible when on the field
			/*goal->distanceX = distance.x;
			goal->distanceY = Math::min(distance.y, maxGoalDistance);
			goal->distance = Math::min(goal->distance, maxGoalDistance);
			goal->angle = distance.angle;*/

			/*if (goal->distance < 0.0f) {
				std::cout << "- Skipping goal with invalid distance: " << goal->distance << std::endl;

				continue;
			}*/

			filteredGoals.push_back(goal);
		}
	}

	return filteredGoals;
}

bool Vision::isValidbasket(Object *basket, Side side) {
    bool debug = canvas.data != nullptr;

    int minAreaSideLength = 20;
    int maxBottomHeight = 40;
    int x1 = basket->x - basket->width / 2;
    int y1 = basket->y - basket->height / 2;

    if (basket->width < 3 || basket->height < 3) {
        return false;
    }

    if ((float)basket->width / (float)basket->height > 10) {
        return false;
    }

	/*std::vector<Blobber::BlobColor> sideValidColors = {
			Blobber::BlobColor::orange,
			//Blobber::BlobColor::white,
			//Blobber::BlobColor::black
	};*/

    std::vector<Blobber::BlobColor> bottomValidColors = {
            Blobber::BlobColor::orange
    };

	/*std::vector<Blobber::BlobColor> topValidColors = {
			Blobber::BlobColor::white
	};*/

	int sideWidth = std::max(basket->width, minAreaSideLength);
    int boxWidthBottom = sideWidth + basket->width / 2;
    int bottomHeight = std::min(sideWidth, maxBottomHeight);

    /*float topMetric = getAreaMetric(
            x1 - sideWidth,
            y1 - sideWidth,
            2 * sideWidth + basket->width,
            sideWidth,
            topValidColors
    );

    float sideLeftMetric = getAreaMetric(
            x1 - sideWidth,
            y1,
            sideWidth,
            basket->height,
            sideValidColors
    );

    float sideRightMetric = getAreaMetric(
            x1 + basket->width,
            y1,
            sideWidth,
            basket->height,
            sideValidColors
    );*/

	float bottomLeftMetric = getAreaMetric(
			basket->x - boxWidthBottom,
			basket->y + basket->height / 2,
			boxWidthBottom,
            bottomHeight,
			bottomValidColors
			);

    float bottomRightMetric = getAreaMetric(
            basket->x,
            basket->y + basket->height / 2,
            boxWidthBottom,
            bottomHeight,
            bottomValidColors
    );

    /*basket->surroundMetrics[0] = topMetric;
    basket->surroundMetrics[1] = sideLeftMetric;
    basket->surroundMetrics[2] = sideRightMetric;*/
    basket->surroundMetrics[3] = bottomLeftMetric;
    basket->surroundMetrics[4] = bottomRightMetric;

	/*std::cout << "@ SIDE LEFT METRIC: " << sideLeftMetric << std::endl;
	std::cout << "@ SIDE RIGHT METRIC: " << sideRightMetric << std::endl;
	std::cout << "@ BOTTOM LEFT METRIC: " << bottomLeftMetric << std::endl;
	std::cout << "@ BOTTOM RIGHT METRIC: " << bottomRightMetric << std::endl;
	std::cout << "@ TOP METRIC: " << topMetric << std::endl;*/

    //return bottomLeftMetric > 0.5 || bottomRightMetric > 0.5;

    if (debug) {
        /*canvas.drawBox(
                x1 - sideWidth, y1 - sideWidth,
                2 * sideWidth + basket->width, sideWidth,
                255, 0, 0
        );

        canvas.drawBox(
                x1 - sideWidth, y1,
                sideWidth, basket->height,
                255, 0, 0
        );

        canvas.drawBox(
                x1 + basket->width, y1,
                sideWidth, basket->height,
                255, 0, 0
        );*/

        canvas.drawBox(
                basket->x - boxWidthBottom, basket->y + basket->height / 2,
                boxWidthBottom, bottomHeight,
                255, 0, 0
        );

        canvas.drawBox(
                basket->x, basket->y + basket->height / 2,
                boxWidthBottom, bottomHeight,
                255, 0, 0
        );

        char buf[256];

        int r = 0, g = 0, b = 0;

        if (basket->type == Side::MAGENTA) {
            Blobber::ColorClassState* color = blobber->getColor(Blobber::BlobColor::magenta);
            r = color->r;
            g = color->g;
            b = color->b;
        } else if (basket->type == Side::BLUE) {
            Blobber::ColorClassState* color = blobber->getColor(Blobber::BlobColor::blue);
            r = color->r;
            g = color->g;
            b = color->b;
        }

        /*sprintf(buf, "%.2f", basket->surroundMetrics[0]);
        canvas.drawText(x1 - sideWidth, std::max(y1 - sideWidth, 0), buf, r, g, b);

        sprintf(buf, "%.2f", basket->surroundMetrics[1]);
        canvas.drawText(x1 - sideWidth, y1, buf, r, g, b);

        sprintf(buf, "%.2f", basket->surroundMetrics[2]);
        canvas.drawText(x1 + basket->width, y1, buf, r, g, b);*/

        sprintf(buf, "%.2f", basket->surroundMetrics[3]);
        canvas.drawText(basket->x - boxWidthBottom, basket->y + basket->height / 2, buf, r, g, b);

        sprintf(buf, "%.2f", basket->surroundMetrics[4]);
        canvas.drawText(basket->x, basket->y + basket->height / 2, buf, r, g, b);
    }

    return true;
}

//bool Vision::isValidbasket(Object* goal, Side side) {
//	/*int x1, y1, x2, y2;
//
//	float undersideMetric = getUndersideMetric(
//		goal->x - goal->width / 2,
//		goal->y - goal->height / 2,
//		goal->distance,
//		goal->width,
//		goal->height,
//		side == Side::MAGENTA ? "yellow-goal" : "blue-goal",
//		side == Side::MAGENTA ? "yellow-goal-wide" : "blue-goal-wide",
//		validGoalPathColors,
//		x1, y1, x2, y2
//	);
//
//	if (x1 != -1 && y1 != -1 && x2 != -1 && y2 != -1) {
//		goal->width = x2 - x1;
//		goal->height = y2 - y1;
//		goal->x = x1 + goal->width / 2;
//		goal->y = y1 + goal->height / 2;
//	}*/
//
//	//std::cout << "@ EDGE LEFT: " << edgeDistanceMetric.leftTopDistance.distance << "m, right: " << edgeDistanceMetric.rightTopDistance.distance << "m" << std::endl;
//
//	if (goal->area < Config::goalMinArea) {
//		// std::cout << "@ GOAL INVALID MIN AREA: " << goal->area << " VS " << Config::goalMinArea << std::endl;
//
//		return false;
//	}/* else if (goal->area > Config::goalCertainArea) {
//		return true;
//	}*/
//
//	if (goal->y - goal->height / 2 > Config::goalTopMaxY) {
//		// std::cout << "@ GOAL NOT TOP ENOUGH: " << (goal->y - goal->height / 2) << " VS " << Config::goalTopMaxY << std::endl;
//
//		// TODO restore in some form
//		return false;
//	}
//
//	std::string color1 = goal->type == 0 ? "blue-goal" : "yellow-goal";
//	std::string color2 = goal->type == 0 ? "blue-goal-wide" : "yellow-goal-wide";
//	int halfWidth = goal->width / 2;
//	int halfHeight = goal->height / 2;
//
//	EdgeDistanceMetric edgeDistanceMetric = getEdgeDistanceMetric(goal->x - halfWidth, goal->y - halfHeight, goal->width, goal->height, color1, color2);
//
//	// also comparing pixel values because distance calculation messes up for very high pixels..
//	// expect both sides to fail as one of them can get incorecctly labelled
//	// if (
//	//	(edgeDistanceMetric.leftTopDistance.distance < Config::goalTopMinDistance && edgeDistanceMetric.leftTopDistance.screenY > Config::goalTopMaxY)
//	//	&& (edgeDistanceMetric.rightTopDistance.distance < Config::goalTopMinDistance && edgeDistanceMetric.rightTopDistance.screenY > Config::goalTopMaxY)
//	//) {
//
//
//	if (
//		edgeDistanceMetric.leftTopDistance.distance < Config::goalTopMinDistance
//		&& edgeDistanceMetric.rightTopDistance.distance < Config::goalTopMinDistance
//	) {
//		// std::cout << "@ GOAL INVALID TOP EDGE DISTANCE LEFT: " << edgeDistanceMetric.leftTopDistance.distance << "m, right: " << edgeDistanceMetric.rightTopDistance.distance << "m" << std::endl;
//
//		return false;
//	}
//
//	// set real distance from edge distance metric center distance
//	// only update the distance if the new distance does not differ from the original one by more then some ammount
//	if (edgeDistanceMetric.centerDistance.distance != -1/* && Math::abs(edgeDistanceMetric.centerDistance.distance - goal->distance) < 1.0f*/) {
//		//std::cout << "UPDATE GOAL DISTANCE FROM " << goal->distance << " TO " << edgeDistanceMetric.centerDistance.distance << std::endl;
//
//		// substract goal depth to get distance at the front
//		goal->distance = Math::min(edgeDistanceMetric.centerDistance.distance - 0.25f, 5.5f);
//	}
//
//	// CAN MESS UP GOAL SIZE, TAKING THE SMALLER ONE!
//	// update position and width from obstructed goal, used when there's a low robot in the way
//	if (edgeDistanceMetric.newWidth != -1) {
//		goal->width = edgeDistanceMetric.newWidth;
//	}
//
//	// update position and width if available, note that goal x is in center but edge metric from corner
//	if (edgeDistanceMetric.newX != -1) {
//		goal->x = edgeDistanceMetric.newX + goal->width / 2;
//	}
//
//	// check for colors on lines from robot to goal left-center-right
//	if (goal->y + goal->height < Config::goalPathSenseStartY) {
//		PathMetric pathMetricCenter = getPathMetric(
//			Config::cameraWidth / 2,
//			Config::goalPathSenseStartY,
//			goal->x,
//			goal->y + goal->height / 2,
//			validGoalPathColors
//			//,"green"
//			);
//
//		int goalHalfWidth = goal->width / 2;
//		int goalEdgeSensePixels = (int)((float)goalHalfWidth * 0.85f);
//
//		PathMetric pathMetricLeft = getPathMetric(
//			Config::cameraWidth / 2 - goalEdgeSensePixels,
//			Config::goalPathSenseStartY,
//			goal->x - goalEdgeSensePixels,
//			goal->y + goal->height / 2,
//			validGoalPathColors
//			//,"green"
//			);
//
//		PathMetric pathMetricRight = getPathMetric(
//			Config::cameraWidth / 2 + goalEdgeSensePixels,
//			Config::goalPathSenseStartY,
//			goal->x + goalEdgeSensePixels,
//			goal->y + goal->height / 2,
//			validGoalPathColors
//			//,"green"
//			);
//
//		if (
//			// center
//			pathMetricCenter.invalidColorCount > Config::maxGoalInvalidColorCount
//			&& pathMetricCenter.percentage < Config::minValidGoalPathThreshold
//
//			// left
//			&& pathMetricLeft.invalidColorCount > Config::maxGoalInvalidColorCount
//			&& pathMetricLeft.percentage < Config::minValidGoalPathThreshold
//
//			// right
//			&& pathMetricRight.invalidColorCount > Config::maxGoalInvalidColorCount
//			&& pathMetricRight.percentage < Config::minValidGoalPathThreshold
//		) {
//			// std::cout << "@ GOAL INVALID COLOR FAILS LEFT: " << pathMetricLeft.percentage << "; CENTER: " << pathMetricCenter.percentage << "; RIGHT: " << pathMetricRight.percentage << std::endl;
//
//			return false;
//		}
//	}
//
//	// TODO update goal angle
//
//	/*if (undersideMetric < Config::goalMinUndersideMetric) {
//		//std::cout << "@ GOAL INVALID UNDERSIDE: " << undersideMetric << " VS " << Config::goalMinUndersideMetric << std::endl;
//
//		return false;
//	}*/
//
//    return true;
//}

bool Vision::isNotOpponentMarker(Object* goal, Side side, ObjectList& goals)
{
	// check for goal intersecting opposite goal to detect the marker on the opponent robot
	Object* otherGoal;

	for (ObjectListItc it = goals.begin(); it != goals.end(); it++) {
		otherGoal = *it;

		// ignore same side intersecting baskets
		if (goal->type == otherGoal->type) {
			continue;
		}

		// this is only reliable if the goal is close by
		if (goal->intersects(otherGoal)) {
			// std::cout << "@ Goal intersects opposite side goal, must be opponent marker" << std::endl;

			return false;
		}
	}

	return true;
}

bool Vision::isValidBall(Object* ball, Dir dir, ObjectList& baskets) {
	if (ball->y < 50) {
		return false;
	}

	int senseRadius = ball->y / 5 - std::max(std::abs(ball->x - Config::cameraWidth / 2), 0) / 20 + 2;
	int ballMinArea = senseRadius * senseRadius / 25;

	//std::cout << "area: " << ball->area << " min: " << ballMinArea << std::endl;

	if (ball->area < ballMinArea) {
		return false;
	}

    float sizeRatio = (float)ball->width / (float)ball->height;

	if (sizeRatio > Config::maxBallSizeRatio || sizeRatio < 1.0f / Config::maxBallSizeRatio) {
		return false;
	}

    int ballRadius = getBallRadius(ball->width, ball->height);
	//int senseRadius = getBallSenseRadius(ballRadius, ball->distance);

	//int surroundSenseY = (int)((float)ball->y + (float)ballRadius * Math::map(ball->distance, 0.0f, 2.0f, 0.75f, 0.2f));
	int surroundSenseY = ball->y;
	//int pathMetricSenseY = surroundSenseY + senseRadius;

	std::vector<Blobber::BlobColor> validColors = {
			Blobber::BlobColor::orange,
			Blobber::BlobColor::white,
			Blobber::BlobColor::green
	};

	if (ball->y + ballRadius < Config::surroundSenseThresholdY) {
		float bottomSurroundMetric = getSurroundMetric(
			ball->x,
			surroundSenseY,
			senseRadius,
			validColors,
			1
		);

		float topSurroundMetric = getSurroundMetric(
				ball->x,
				surroundSenseY,
				senseRadius,
				validColors,
				-1
		);

		ball->surroundMetrics[0] = bottomSurroundMetric;
		ball->surroundMetrics[1] = topSurroundMetric;

		if (bottomSurroundMetric == -1.0f || bottomSurroundMetric < Config::minValidBallSurroundThreshold) {
			//std::cout << "@ BALL SURROUND FAIL: " << surroundMetric << " VS " << Config::minValidBallSurroundThreshold << std::endl;

			return false;
		}
	} else {
		ball->surroundMetrics[0] = 1.0;
		ball->surroundMetrics[1] = 1.0;
	}

	if (!isBallWithinBorders(ball, baskets)) {
	    return false;
	}

    return true;
}

bool Vision::isBallWithinBorders(Object* ball, ObjectList& baskets) {
	std::vector<Blobber::BlobColor> colorsFromInside = {
			//Blobber::BlobColor::orange,
			Blobber::BlobColor::white,
			Blobber::BlobColor::black
	};

	std::vector<Blobber::BlobColor> colorsFromOutside = {
			Blobber::BlobColor::black,
			Blobber::BlobColor::white,
			Blobber::BlobColor::orange
	};

	//canvas.drawLine(Config::cameraWidth * 3/4, 0, Config::cameraWidth, Config::cameraHeight / 2);
	//canvas.drawLine(Config::cameraWidth * 1/4, 0, 0, Config::cameraHeight / 2);

	/*
	if (isBorderBetweenPoints(ball->x, ball->y - ball->width / 2, ball->x, 0, colorsFromInside)
			|| isBorderBetweenPoints(
					ball->x + ball->width / 2, ball->y,
					Config::cameraWidth, ball->y,
					colorsFromInside
			)
			|| isBorderBetweenPoints(
					ball->x - ball->width / 2, ball->y,
					0, ball->y,
					colorsFromInside
			) || getBorderDirectionBetweenPoints(ball->x, ball->y + ball->width / 2, ball->x, Config::surroundSenseThresholdY, colorsFromInside)
	) {
		return true;
	}
	 */

    return getBorderDirectionBetweenPoints(ball->x, ball->y + ball->width / 2, ball->x, Config::surroundSenseThresholdY,
										   colorsFromInside) != -1
    	&& getBorderDirectionBetweenPoints(
			ball->x + ball->width / 2, ball->y,
			Config::cameraWidth, ball->y,
			colorsFromInside
	) != -1
		&& getBorderDirectionBetweenPoints(
			ball->x - ball->width / 2, ball->y,
			0, ball->y,
			colorsFromInside
	) != -1 &&
			getBorderDirectionBetweenPoints(ball->x, ball->y - ball->width / 2, ball->x, 0, colorsFromInside) != -1;
}

int Vision::getBorderDirectionBetweenPoints(int startX, int startY, int endX, int endY,
											std::vector<Blobber::BlobColor> colorSequence) {
	if (colorSequence.empty() || (startX == endX && startY == endY)) {
		return false;
	}

	bool debug = canvas.data != nullptr;
	const int tolerance = 10;
	const int minStripeHeight = 12;

	Blobber::BlobColor currentColor = Blobber::BlobColor::unknown;
	int currentPixels = 0;
	int otherPixels = 0;

	auto colorIterator = colorSequence.begin();
	std::vector<int> stripeLengths;
	std::vector<Blobber::BlobColor> validColorStripes;

	bool isMainAxisY = abs(startY - endY) > abs(startX - endX);
	int mainAxisStart = isMainAxisY ? startY : startX;
	int mainAxisEnd = isMainAxisY ? endY : endX;
	int secondaryAxisStart = isMainAxisY ? startX : startY;
	int secondaryAxisEnd = isMainAxisY ? endX : endY;
	int mainAxisStep = (mainAxisStart < mainAxisEnd) ? 1 : -1;

	for (int main = mainAxisStart; main != mainAxisEnd; main += mainAxisStep) {
		int secondary = (int) Math::interpolate(main, mainAxisStart, mainAxisEnd, secondaryAxisStart, secondaryAxisEnd);

		int x = isMainAxisY ? secondary : main;
		int y = isMainAxisY ? main : secondary;

		Blobber::BlobColor color = blobber->getColorAt(x, y);

		if (!currentPixels && std::find(colorSequence.begin(), colorSequence.end(), color) != colorSequence.end()) {
			currentColor = color;
			++currentPixels;
			otherPixels = 0;

			if (debug) {
				canvas.drawMarker(x, y, 0, 200, 0, true);
			}
		} else if (currentPixels) {
			if (color == currentColor) {
				++currentPixels;

				if (debug) {
					canvas.drawMarker(x, y, 0, 200, 0, true);
				}
			} else if (++otherPixels > tolerance) {
				currentPixels = otherPixels = 0;

				if (std::find(colorSequence.begin(), colorSequence.end(), color) == colorSequence.end()) {
					validColorStripes.clear();
				}

				if (debug) {
					canvas.drawMarker(x, y, 200, 0, 0, true);
				}
			}
		}

		if (currentPixels > minStripeHeight) {
			validColorStripes.push_back(currentColor);

			otherPixels = 0;
			currentPixels = 0;

			if (validColorStripes.size() < colorSequence.size()) {
				continue;
			}

			int i = 0;
			bool foundForward = true;
			bool foundBackward = true;

			/*
			for (auto color : validColorStripes) {
				std::cout << color << " ";
			}

			std::cout << "\n";
			 */

			for (auto color : colorSequence) {
				if (validColorStripes.at(validColorStripes.size() - 1 - i) != color) {
					foundBackward = false;
				}

				if (validColorStripes.at(validColorStripes.size() - colorSequence.size() + i) != color) {
					foundForward = false;
				}

				i++;
			}

			if (foundForward || foundBackward) {
				if (borderX != nullptr) {
					*borderX = x;
				}

				if (borderY != nullptr) {
					*borderY = y;
				}
			}

			if (foundForward) {
				return 1;
			} else if (foundBackward) {
				return -1;
			}
		}
	}

	return 0;
}

int Vision::getBorderY() {
	int borderY = 0;
	std::vector<Blobber::BlobColor> colors = { Blobber::BlobColor::white, Blobber::BlobColor::black };

	if (getBorderDirectionBetweenPoints(
			Config::cameraWidth / 2, Config::surroundSenseThresholdY,
			Config::cameraWidth / 2, 50,
			colors, nullptr, &borderY
	) == -1) {
        return 0;
    }

    return borderY;

	/*
        borderYStack.push_back(borderY);

        if (borderYStack.size() > 10) {
            borderYStack.erase(borderYStack.begin());
        }
    }

	return *std::max_element(borderYStack.begin(), borderYStack.end());
	 */
}

/*
bool Vision::isBorderBetweenPointsOld(int startX, int startY, int endX, int endY, std::vector<Blobber::BlobColor> colorSequence) {
	if (colorSequence.empty() || (startX == endX && startY == endY)) {
		return false;
	}

	bool debug = canvas.data != nullptr;
	const int tolerance = 10;
	const int minStripeHeight = 12;

	int currentPixels = 0;
	int otherPixels = 0;

	auto colorIterator = colorSequence.begin();
	std::vector<int> stripeLengths;
	std::vector<Blobber::BlobColor> validColorStripes;

	bool isMainAxisY = abs(startY - endY) > abs(startX - endX);
	int mainAxisStart = isMainAxisY ? startY : startX;
	int mainAxisEnd = isMainAxisY ? endY : endX;
	int secondaryAxisStart = isMainAxisY ? startX : startY;
	int secondaryAxisEnd = isMainAxisY ? endX : endY;
	int mainAxisStep = (mainAxisStart < mainAxisEnd) ? 1 : -1;

	for (int main = mainAxisStart; main != mainAxisEnd; main += mainAxisStep) {
		int secondary = (int) Math::interpolate(main, mainAxisStart, mainAxisEnd, secondaryAxisStart, secondaryAxisEnd);

		int x = isMainAxisY ? secondary : main;
		int y = isMainAxisY ? main : secondary;

		Blobber::BlobColor color = blobber->getColorAt(x, y);

		if (color == *colorIterator) {
			++currentPixels;
			otherPixels = 0;

			if (debug) {
				canvas.drawMarker(x, y, 0, 200, 0, true);
			}
		} else if (currentPixels) {
			if (++otherPixels > tolerance) {
				currentPixels = otherPixels = 0;
				colorIterator = colorSequence.begin();
				stripeLengths.clear();

				if (debug) {
					canvas.drawMarker(x, y, 200, 0, 0, true);
				}
			} else {
				++currentPixels;

				if (debug) {
					canvas.drawMarker(x, y, 0, 200, 0, true);
				}
			}
		}

		if (currentPixels > minStripeHeight) {
			if (std::next(colorIterator) == colorSequence.end()) {
				if (otherPixels < tolerance) {
					continue;
				}

				stripeLengths.push_back(currentPixels);

				return true;
			}

			if (color != *std::next(colorIterator)) {
				continue;
			}

			stripeLengths.push_back(currentPixels);
			colorIterator = std::next(colorIterator);

			otherPixels = 0;
			currentPixels = 1;
		}
	}

	return false;
}
*/



//bool Vision::isValidBall(Object* ball, Dir dir, ObjectList& baskets) {
//	//int ballMinArea = (int)Math::map(ball->distance, 0.0f, 4.5f, 16.0f, 2.0f);
//
//	int ballMinArea = (int)(50.0f * Math::pow(Math::E, -0.715f * ball->distance));
//
//    //if (ball->area < Config::ballMinArea) {
//    if (ball->area < ballMinArea) {
//		//std::cout << "@ BALL AREA TOO SMALL: " << ball->area << " VS " << Config::ballMinArea << std::endl;
//
//        return false;
//    }
//
//	/*float sizeRatio = (float)ball->width / (float)ball->height;
//
//	if (sizeRatio > Config::maxBallSizeRatio || sizeRatio < 1.0f / Config::maxBallSizeRatio) {
//		return false;
//	}*/
//
//	if (!ball->behind && ball->y - ball->height / 2 > Config::cameraHeight - 85) {
//		//std::cout << "@ BALL ON ROBOT IN FRONT" << std::endl;
//
//		return false;
//	}
//
//	if (ball->behind && ball->y - ball->height / 2 > Config::cameraHeight - 135) {
//		//std::cout << "@ BALL ON ROBOT FROM BEHIND" << std::endl;
//
//		return false;
//	}
//
//	int ballRadius = getBallRadius(ball->width, ball->height);
//	int senseRadius = getBallSenseRadius(ballRadius, ball->distance);
//	int surroundSenseY = (int)((float)ball->y + (float)ballRadius * Math::map(ball->distance, 0.0f, 2.0f, 0.75f, 0.2f));
//	int pathMetricSenseY = surroundSenseY + senseRadius;
//
//	if (ball->y + ballRadius < Config::surroundSenseThresholdY) {
//		float surroundMetric = getSurroundMetric(
//			ball->x,
//			//(int)((float)ball->y + (float)ballRadius * 0.75f),
//			surroundSenseY,
//			senseRadius,
//			validBallBgColors,
//			"",
//			1
//		);
//
//		//std::cout << "Surround: " << surroundMetric << std::endl;
//
//		if (surroundMetric != -1.0f && surroundMetric < Config::minValidBallSurroundThreshold) {
//			//std::cout << "@ BALL SURROUND FAIL: " << surroundMetric << " VS " << Config::minValidBallSurroundThreshold << std::endl;
//
//			return false;
//		}
//	}
//
//	// don't calculate path metric if senseY is too low
//	if (Config::ballPathSenseStartY - pathMetricSenseY > 50) {
//		PathMetric pathMetric = getPathMetric(
//			Config::cameraWidth / 2,
//			Config::ballPathSenseStartY,
//			ball->x,
//			//(int)((float)ball->y + (float)ballRadius * 0.75f + (float)senseRadius),
//			//ball->y + ballRadius + senseRadius / 2 + 10,
//			pathMetricSenseY,
//			validBallPathColors
//			//,"green"
//		);
//
//		//std::cout << "Ball path: " << pathMetric << std::endl;
//
//		if (
//			pathMetric.percentage < Config::minValidBallPathThreshold
//			|| pathMetric.out
//			//|| !pathMetric.validColorFound
//			//|| pathMetric.invalidSpree > getBallMaxInvalidSpree(ball->y + ball->height / 2)
//		) {
//			//std::cout << "@ BALL PATH FAIL: " << pathMetric.percentage << " VS " << Config::minValidBallPathThreshold << ", OUT: " << (pathMetric.out ? "YES" : "NO") << " FROM " << Config::ballPathSenseStartY << " TO " << pathMetricSenseY << std::endl;
//
//			return false;
//		}
//	}
//
//	if (isBallInGoal(ball, dir, baskets)) {
//		//std::cout << "@ BALL IN GOAL FAIL" << std::endl;
//
//		return false;
//	}
//
//    return true;
//}

bool Vision::isBallInGoal(Object* ball, Dir dir, ObjectList& goals) {
	// think's the ball is in goal when it's near the side posts
	/*if (ball->distance < Config::ballInGoalConsiderMaxDistance) {
		int ballRadius = getBallRadius(ball->width, ball->height);
		int senseRadius = getBallSenseRadius(ballRadius, ball->distance);

		float surroundMetric = getSurroundMetric(
			ball->x,
			(int)((float)ball->y - (float)ballRadius * 0.5f),
			senseRadius,
			goalColors,
			"",
			-1,
			true
		);

		if (surroundMetric != -1.0f && surroundMetric > Config::ballInGoalSurroundThreshold) {
			//std::cout << "@ BALL IN GOAL SURROUND: " << surroundMetric << " VS " << Config::ballInGoalThreshold << std::endl;

			return true;
		}
	}*/

	/*if (dir == Dir::FRONT) {
		for (ObjectListItc it = frontGoals.begin(); it != frontGoals.end(); it++) {
			if (ball->contains(*it)) {
				//std::cout << "@ BALL IN GOAL INTERSECTS FRONT" << std::endl;

				return true;
			}
		}
	} else if (dir == Dir::REAR) {
		for (ObjectListItc it = rearGoals.begin(); it != rearGoals.end(); it++) {
			if (ball->contains(*it)) {
				//std::cout << "@ BALL IN GOAL INTERSECTS REAR" << std::endl;

				return true;
			}
		}
	}*/

	// goal containment is not valid for larger distances as the ball can be contained when not in goal
	// this can fail if the ball and goal are too far away
	Object* goal;

	for (ObjectListItc it = goals.begin(); it != goals.end(); it++) {
		goal = *it;

		// this is only reliable if the goal is close by
		if (goal->distance <= 0.35f && ball->behind == goal->behind && goal->contains(ball)) {
			return true;
		}
	}

	return false;
}

/*int Vision::getBallMaxInvalidSpree(int y) {
	return y / 20.0f; // @TODO Something reasonable..
}

int Vision::getGoalMaxInvalidSpree(int y) {
	return y / 20.0f;
}*/

int Vision::getBallRadius(int width, int height) {
	// divide by four because we want radius not diameter
	return (int)((float)(width + height) / 4.0f);
}

int Vision::getBallSenseRadius(int ballRadius, float distance) {
	return (int)Math::min((float)ballRadius * 1.5f * Math::max(distance / 2.0f, 1.0f) + 10.0f, (float)Config::maxBallSenseRadius);
}

/*int Vision::getPixelsBelow(int startX, int startY, std::vector<std::string> validColors, int allowedWrongPixels) {
	int wrongPixelCount = 0;
	int validPixelCount = 0;
	int senseX = startX;
	bool unsegmentedAllowed = find(validColors.begin(), validColors.end(), std::string("none")) != validColors.end();
	bool debug = canvas.data != NULL;
	Blobber::Color* color;

	for (int senseY = startY + 1; senseY < height; senseY++) {
		color = getColorAt(senseX, senseY);

		if (color == NULL) {
			if (unsegmentedAllowed) {
				validPixelCount++;

				if (debug) canvas.drawMarker(senseX, senseY, 0, 128, 0);
			} else {
				wrongPixelCount++;

				if (debug) canvas.drawMarker(senseX, senseY, 128, 0, 0);
			}
		} else {
			if (find(validColors.begin(), validColors.end(), std::string(color->name)) != validColors.end()) {
				validPixelCount++;

				if (debug) canvas.drawMarker(senseX, senseY, 0, 128, 0);
			} else {
				wrongPixelCount++;

				if (debug) canvas.drawMarker(senseX, senseY, 128, 0, 0);
			}
		}

		if (wrongPixelCount > allowedWrongPixels) {
			if (debug) canvas.drawMarker(senseX, senseY, 255, 0, 0);

			break;
		}
	}

	return validPixelCount;
}*/

/*int Vision::getPixelRowAt(float distance) {
	CameraTranslator::CameraPosition pos = cameraTranslator->getCameraPosition(0, distance);

	return pos.y;
}*/

CameraTranslator::CameraPosition Vision::getPixelAt(float distanceX, float distanceY) {
	return cameraTranslator->getCameraPosition(distanceX, distanceY);
}

// TODO Implement..
Math::Point Vision::getScreenCoords(float distanceX, float distanceY) {
	return Math::Point(0, 0);
}

Vision::Distance Vision::getDistance(int x, int y) {
	/*int realX = x;
	int realY = y;

	Util::correctCameraPoint(realX, realY);

	float distance;

    if (dir == FRONT) {
		distance = frontDistanceLookup.getValue((float)realY);
    } else {
        distance = rearDistanceLookup.getValue((float)realY);
    }

	return Math::max(distance + Config::distanceCorrection, 0.01f);*/

	CameraTranslator::WorldPosition pos = cameraTranslator->getWorldPosition(x, y);

	//if (pos.dx < -20.0f || pos.dx > 20.0f) std::cout << "- Invalid distance dx: " << pos.dx << " for " << x << "x" << y << ", dir: " << (dir == Dir::FRONT ? "front" : "rear") << std::endl;
	//if (pos.dy < 0.0f || pos.dy > 20.0f) std::cout << "- Invalid distance dy: " << pos.dy << " for " << x << "x" << y << ", dir: " << (dir == Dir::FRONT ? "front" : "rear") << std::endl;
	//if (pos.distance < 0.0f || pos.distance > 20.0f) std::cout << "- Invalid distance: " << pos.distance << " for " << x << "x" << y << ", dir: " << (dir == Dir::FRONT ? "front" : "rear") << std::endl;

	return Distance(pos.dx, pos.dy, pos.distance, pos.angle);
}

float Vision::getAngle(int x, int y) {
	/*int realX = x;
	int realY = y;

	Util::correctCameraPoint(realX, realY);

	// last working
	float centerOffset = (float)(realX - (Config::cameraWidth / 2.0f)),
		angle = Math::degToRad(centerOffset / 11.5f);

	if (dir == Dir::REAR) {
		if (angle < 0.0f) {
			angle += Math::PI;
		} else {
			angle -= Math::PI;
		}
	}

	return angle;*/

	CameraTranslator::WorldPosition pos = cameraTranslator->getWorldPosition(x, y);

	float angle = pos.angle;

	if (dir == Dir::REAR) {
		if (angle < 0.0f) {
			angle += Math::PI;
		} else {
			angle -= Math::PI;
		}
	}

	return angle;
}

/*Blobber::Color* Vision::getColorAt(int x, int y) {
    return blobber->getColorAt(x, y);
}*/

// TODO When scanning the underside then some on the topside are also still created
float Vision::getSurroundMetric(
		int x, int y, int radius, std::vector<Blobber::BlobColor> validColors,
		int side, bool allowNone
) {
	int matches = 0;
	int misses = 0;
    int points = radius * 2;
    bool debug = canvas.data != nullptr;

	int start = 0;
	int sensePoints = points;
	
	if (side == 1) {
		start = points / 2;
		sensePoints = points / 2 + 1;
	} else if (side == -1) {
		sensePoints = points / 2 + 1;
	}

    for (int i = start; i <= start + sensePoints; i++) {
        double t = 2 * Math::PI * i / points + Math::PI;

        int senseX = (int)(x + radius * cos(t));
        int senseY = (int)(y + radius * sin(t));

		if (
			senseX < 0
			|| senseX > width - 1
			|| senseY < 0
			|| senseY > Config::surroundSenseThresholdY
		) {
			continue;
		}

        Blobber::BlobColor color = blobber->getColorAt(senseX, senseY);

        if (color != Blobber::BlobColor::unknown) {
            if (find(validColors.begin(), validColors.end(), color) != validColors.end()) {
                matches++;

                if (debug) {
                    canvas.drawMarker(senseX, senseY, 0, 200, 0);
                }
            } else {
				misses++;

				if (debug) {
					canvas.drawMarker(senseX, senseY, 200, 0, 0);
				}
			}
        } else {
			if (!allowNone) {
				misses++;

				if (debug) {
					canvas.drawMarker(senseX, senseY, 200, 0, 0);
				}
			} else {
				if (debug) {
					canvas.drawMarker(senseX, senseY, 128, 128, 128);
				}
			}
        }
    }

	int sensedPoints = matches + misses;

	if (sensedPoints == 0) {
		return -1.0f;
	} else {
        return (float)matches / (float)sensedPoints;
    }
}

Object::StraightAheadInfo Vision::getStraightAheadMetric(
		std::vector<Blobber::BlobColor> validColors, ObjectList& balls
) {
	bool debug = canvas.data != nullptr;

    std::vector<Blobber::BlobColor> outsideValidGapColorCombination = {
            Blobber::BlobColor::white,
            Blobber::BlobColor::black
    };

    std::vector<Blobber::BlobColor> insideValidGapColorCombination = {
            Blobber::BlobColor::black,
            Blobber::BlobColor::white
    };

    std::vector<Blobber::BlobColor> centerLineValidGapColorCombination = {
            Blobber::BlobColor::orange,
            Blobber::BlobColor::white,
            Blobber::BlobColor::orange
    };

	const int frameCenterX = Config::cameraWidth / 2;
	int yStep = 10;
	int maxInvalidPixelCount = 30;
	int invalidPixelCount = 0;
	int maxSideColumns = gridColumnCount / 2;
	int x = 0;
	int y = 0;
	int totalCount = 0;
	int totalSideCount = 0;
	int validCount = 0;
	int leftInvalidCount = 0;
	int rightInvalidCount = 0;
	int reach = Config::surroundSenseThresholdY;
	int columnCount = maxSideColumns * 2 + 1;
	int lastValidXIndexList[columnCount];
	int lastValidYIndexList[columnCount];
	int validYListIndex = 0;

	int lastValidXIndex = 0;
	int lastValidYIndex = 0;

	int lastValidRowIndex;
	int lastValidRowX = 0;

	for (int i = 0; i < columnCount; i++) {
		lastValidXIndexList[i] = 0;
        lastValidYIndexList[i] = 0;
	}

	int xIndex = 0;
	int yIndex = 0;
	int i;

	for (; yIndex < gridRowCount; yIndex++) {
		xIndex = 0;
		y = yGrid[xIndex][yIndex];
		maxInvalidPixelCount = y / 20;

		lastValidRowIndex = columnCount;
		lastValidRowX = 0;

		for (; xIndex < gridColumnCount; xIndex++) {
			x = xGrid[xIndex][yIndex];
			i = xIndex - maxSideColumns;

			if (i == -maxSideColumns) {
				lastValidRowX = x;
			}

			Blobber::BlobColor color = blobber->getColorAt(x, y);

			if (find(validColors.begin(), validColors.end(), color) != validColors.end()) {
				validGrid[xIndex][yIndex] = 1;

				validYListIndex = i + maxSideColumns;
				invalidPixelCount = yIndex - lastValidYIndexList[xIndex] - 1;

				lastValidXIndex = lastValidXIndexList[xIndex];
				lastValidYIndex = lastValidYIndexList[xIndex];
				int lastValidX = xGrid[lastValidXIndex][lastValidYIndex];
				int lastValidY = yGrid[lastValidXIndex][lastValidYIndex];

				// Found valid pixel after allowed gap length
				// If there is correct color combination found in the gap,
				// then the gap pixel can be considered valid
				if (invalidPixelCount > 0 && invalidPixelCount <= maxInvalidPixelCount) {
				    if (
				            isColorCombinationBetweenPoints(
				                    x, y - 20,
				                    lastValidX, lastValidY + 20,
				                    centerLineValidGapColorCombination) ||
                            isColorCombinationBetweenPoints(
                                    x, y,
                                    lastValidX, lastValidY,
                                    insideValidGapColorCombination) ||
							isColorCombinationBetweenPoints(
							        x, y,
							        lastValidX, lastValidY,
							        outsideValidGapColorCombination)
                    ) {
                        for (int invalidYIndex = lastValidYIndex + 1; invalidYIndex < yIndex; invalidYIndex++) {
                            validGrid[xIndex][invalidYIndex] = 1;
                        }
				    }
				}

				if (xIndex - lastValidRowIndex > 1) {
				    if (
                            isColorCombinationBetweenPoints(
                                    lastValidRowX - 20, y,
                                    x + 20, y,
                                    centerLineValidGapColorCombination) ||
                            isColorCombinationBetweenPoints(
                                    lastValidRowX, y,
                                    x, y,
                                    insideValidGapColorCombination) ||
                            isColorCombinationBetweenPoints(
                                    lastValidRowX, y,
                                    x, y,
                                    outsideValidGapColorCombination)
                    ) {
                        for (int invalidXIndex = lastValidRowIndex + 1; invalidXIndex < xIndex; invalidXIndex++) {
                            validGrid[invalidXIndex][yIndex] = 1;
                        }
				    }
				}

				lastValidXIndexList[validYListIndex] = xIndex;
				lastValidYIndexList[validYListIndex] = yIndex;

				lastValidRowIndex = xIndex;
				lastValidRowX = x;
			} else {
				validGrid[xIndex][yIndex] = 0;
			}
		}
	}

	yIndex = 0;

	for (; yIndex < gridRowCount; yIndex++) {
		xIndex = 0;
		y = yGrid[xIndex][yIndex];

		for (; xIndex < gridColumnCount; xIndex++) {
			i = xIndex - maxSideColumns;

			totalCount += std::abs(i);

			if (i > 0) {
				totalSideCount += i;
			}

			if (validGrid[xIndex][yIndex] == 1) {
				validCount += std::abs(i);

				if (y < reach) {
					reach = y;
				}
			} else {
				if (i < 0) {
					leftInvalidCount += -i;
				} else if (i > 0) {
					rightInvalidCount += i;
				}
			}
		}

		for (auto ball : balls) {
			if (
					ball->y <= y &&
					ball->y > (y - yStep) &&
					std::abs(ball->x - Config::cameraWidth) > 50
					) {
				if (std::abs(ball->x - Config::cameraWidth) > 50) {
					ball->straightAheadInfo = Object::StraightAheadInfo{
							.reach = reach,
							.driveability = (float)validCount / (float)totalCount,
							.leftSideMetric = (float)leftInvalidCount / (float)totalSideCount,
							.rightSideMetric = (float)rightInvalidCount / (float)totalSideCount
					};
				} else {
					ball->straightAheadInfo = Object::StraightAheadInfo{
							.reach = reach,
							.driveability = 0.0,
							.leftSideMetric = 0.0,
							.rightSideMetric = 0.0
					};
				}
			}
		}
	}

	if (debug) {
		yIndex = 0;

		for (; yIndex < gridRowCount; yIndex++) {
			xIndex = 0;
			y = yGrid[xIndex][yIndex];

			for (; xIndex < gridColumnCount; xIndex++) {
				x = xGrid[xIndex][yIndex];

				if (validGrid[xIndex][yIndex] == 1) {
					canvas.drawMarker(x, y, 0, 255, 0);
				} else {
					canvas.drawMarker(x, y, 255, 0, 0);
				}
			}
		}
	}

	return Object::StraightAheadInfo {
		.reach = reach,
		.driveability = (float)validCount / (float)totalCount,
        .leftSideMetric = (float)leftInvalidCount / (float)totalSideCount,
        .rightSideMetric = (float)rightInvalidCount / (float)totalSideCount
	};
}

bool Vision::isColorCombinationBetweenPoints(
		int startX, int startY, int endX, int endY, std::vector<Blobber::BlobColor> requiredColors
) {
	bool debug = canvas.data != nullptr;

	bool isXShorter = true;
	int shorterAxisStart = startX;
	int shorterAxisEnd = endX;
	int longerAxisStart = startY;
	int longerAxisEnd = endY;

	if (std::abs(endX - startX) > std::abs(endY - startY)) {
		isXShorter = false;
		shorterAxisStart = startY;
		shorterAxisEnd = endY;
		longerAxisStart = startX;
		longerAxisEnd = endX;
	}

	int x = startX;
	int y = startY;
	int changingCoordinate = isXShorter ? y : x;
	int requiredColorCount = 5;
	int allowedGapSize = endY / 20;

    int maxColorLengthCount = endY / 5;
    int lastColorStartChangingCoordinate = -1;

	Blobber::BlobColor color = blobber->getColorAt(x, y);
	int colorCount = 0;
	int gapCount = 0;

	for (auto requiredColor : requiredColors) {
		colorCount = 0;
		gapCount = 0;

		while (changingCoordinate <= longerAxisEnd) {
			if (color == requiredColor) {
				colorCount++;

				if (debug) {
					canvas.drawMarker(x, y, 0, 255, 0, true);
				}

                if (colorCount == 1) {
                    if (
                            lastColorStartChangingCoordinate > -1 &&
                            std::abs(lastColorStartChangingCoordinate - changingCoordinate) > maxColorLengthCount
                    ) {
                        return false;
                    }

                    lastColorStartChangingCoordinate = changingCoordinate;
                }

				if (colorCount >= requiredColorCount) {
					break;
				}
			} else {
				if (colorCount != 0) {
					gapCount++;

					if (debug) {
						canvas.drawMarker(x, y, 255, 0, 0, true);
					}

					if (gapCount > allowedGapSize) {
						return false;
					}
				}
			}

			changingCoordinate++;
			int interpolatedValue = (int)Math::interpolate(
					(float)changingCoordinate,
					(float)longerAxisStart,
					(float)longerAxisEnd,
					(float)shorterAxisStart,
					(float)shorterAxisEnd
			);

			x = isXShorter ? interpolatedValue : changingCoordinate;
			y = isXShorter ? changingCoordinate : interpolatedValue;

			color = blobber->getColorAt(x, y);
		}

		if (colorCount < requiredColorCount) {
			return false;
		}
	}

	return true;

}

//Vision::PathMetric Vision::getPathMetric(int x1, int y1, int x2, int y2, std::vector<std::string> validColors, std::string requiredColor) {
//    int matches = 0;
//	int blacksInRow = 0;
//	int maxBlacksInRow = 8;
//    bool debug = canvas.data != NULL;
//    bool requiredColorFound = false;
//	bool sawGreen = false;
//	bool sawWhite = false;
//	bool sawBlack = false;
//	bool sawWhiteBeforeBlack = false;
//	int previousBlack = 0;
//	bool crossingGreenWhiteBlackGreen = false;
//	bool crossingGreenWhiteBlack = false;
//	bool tooManyBlacksInRow = false;
//	int invalidSpree = 0;
//	int longestInvalidSpree = 0;
//	int greensInRow = 0;
//	int lastGreensInRow = 0;
//	std::string firstColor = "";
//	std::string lastColor = "";
//
//	//int start = originalX1 < originalX2 ? 0 : senseCounter - 1;
//	//int step = originalX1 < originalX2 ? 1 : -1;
//	int sampleCount = 0;
//	float distanceStep = 0.05f;
//	//float distance1, distance2;
//
//	CameraTranslator::WorldPosition worldPos1 = cameraTranslator->getWorldPosition(x1, y1);
//	CameraTranslator::WorldPosition worldPos2 = cameraTranslator->getWorldPosition(x2, y2);
//
//	if (!worldPos1.isValid || !worldPos2.isValid) {
//		// fake very bad path metrix
//		return PathMetric(0.0f, 0, false, true, 1000);
//	}
//
//	float worldPosX1 = worldPos1.dx;
//	float worldPosY1 = worldPos1.dy;
//	float worldPosX2 = worldPos2.dx;
//	float worldPosY2 = worldPos2.dy;
//
//	Math::PointList sensePointsWorld = cameraTranslator->getPointsBetween(worldPosX1, worldPosY1, worldPosX2, worldPosY2, 0.01f);
//
//	int x, y;
//
//	//for (int i = start; (originalX1 < originalX2 ? i < senseCounter : i >= 0); i += step) {
//	for (Math::PointListIt it = sensePointsWorld.begin(); it != sensePointsWorld.end(); it++) {
//		Math::Point worldPoint = *it;
//
//		CameraTranslator::CameraPosition camPos = cameraTranslator->getCameraPosition(worldPoint.x, worldPoint.y);
//
//		x = camPos.x;
//		y = camPos.y;
//
//        //x = senseX[i];
//        //y = senseY[i];
//
//		/*if (y > Config::cameraHeight / 4) {
//			// sample less points near by and more in the distance
//			distance1 = getDistance(x, y).straight;
//			distance2 = Math::round(distance1 / distanceStep, 0) * distanceStep;
//
//			if (Math::abs(distance1 - distance2) > distanceStep / 5.0f) {
//				continue;
//			}
//		}*/
//
//		sampleCount++;
//
//		Blobber::Color* color = getColorAt(x, y);
//
//        if (color != NULL) {
//			if (firstColor == "") {
//				firstColor = std::string(color->name);
//			}
//
//			if (strcmp(color->name, "black") == 0) {
//				blacksInRow++;
//
//				// TODO Review
//				if (blacksInRow > maxBlacksInRow) {
//					tooManyBlacksInRow = true;
//				}
//
//				if (sawGreen && lastColor == "white") {
//					crossingGreenWhiteBlack = true;
//				}
//			} else {
//				blacksInRow = 0;
//			}
//
//			if (strcmp(color->name, "green") == 0) {
//				greensInRow++;
//
//				if (!sawGreen) {
//					sawGreen = true;
//
//					if (debug) {
//						canvas.drawMarker(x, y, 0, 128, 0);
//					}
//				// the greens in row avoids situation where green is seen as one sample between the white and the black lines
//				} else if ((sawWhite || firstColor == "white") && previousBlack >= 1/* && lastGreensInRow >= 2*/) {
//					crossingGreenWhiteBlackGreen = true;
//
//					if (debug) {
//						canvas.drawMarker(x, y, 128, 0, 0);
//					}
//				}
//			} else {
//				lastGreensInRow = greensInRow;
//				greensInRow = 0;
//
//				if (strcmp(color->name, "white") == 0) {
//					sawWhite = true;
//
//					// avoid not seeing balls from outside the playing field
//					blacksInRow = 0;
//					tooManyBlacksInRow = false;
//				}
//			}
//
//			if (strcmp(color->name, "black") == 0) {
//				sawBlack = true;
//				previousBlack++;
//
//				if (sawWhite) {
//					sawWhiteBeforeBlack = true;
//				}
//			} else {
//				previousBlack = 0;
//			}
//
//            if (find(validColors.begin(), validColors.end(), std::string(color->name)) != validColors.end()) {
//                matches++;
//
//				if (invalidSpree > longestInvalidSpree) {
//					longestInvalidSpree = invalidSpree;
//				}
//
//				invalidSpree = 0;
//
//                if (debug) {
//                    canvas.drawMarker(x, y, 0, 200, 0);
//                }
//            } else {
//				invalidSpree++;
//
//				if (debug) {
//                    canvas.drawMarker(x, y, 200, 0, 0);
//                }
//			}
//
//            if (requiredColor != "" && color->name == requiredColor) {
//                requiredColorFound = true;
//            }
//
//			lastColor = std::string(color->name);
//        } else {
//            if (debug) {
//                canvas.drawMarker(x, y, 200, 0, 0);
//            }
//
//			invalidSpree++;
//        }
//    }
//
//	// TODO improve and restore, can cause false positives when there are balls in front of other balls
//	/*if (
//		(lastColor == "black" && sawWhite)
//		|| (firstColor == "white" && sawWhiteBeforeBlack && lastColor == "green")
//	) {
//		std::cout << "@ OUT LATE" << std::endl;
//
//		crossingGreenWhiteBlackGreen = true;
//	}*/
//
//	//if (senseCounter < 20) {
//	/*if (sensePointsWorld.size() < 20) {
//		return PathMetric(1.0f, 0, true, false);
//	}*/
//
//	int invalidColorCount = sampleCount - matches;
//	float percentage = (float)matches / (float)sampleCount;
//	bool validColorFound = requiredColor == "" || requiredColorFound;
//	//bool isOut = crossingGreenWhiteBlackGreen || tooManyBlacksInRow;
//	bool isOut = crossingGreenWhiteBlack || (tooManyBlacksInRow && firstColor != "black");
//
//	// fake high percentage if too few samples available
//	if (sampleCount < 5) {
//		percentage = 100;
//	}
//
//	/*std::cout << "@ blacksInRow: " << blacksInRow << std::endl;
//	std::cout << "@ previousBlack: " << previousBlack << std::endl;
//	std::cout << "@ crossingGreenWhiteBlackGreen: " << crossingGreenWhiteBlackGreen << std::endl;
//	std::cout << "@ tooManyBlacksInRow: " << tooManyBlacksInRow << std::endl << std::endl;*/
//
//	return PathMetric(percentage, longestInvalidSpree, validColorFound, isOut, invalidColorCount);
//}

//Vision::EdgeDistanceMetric Vision::getEdgeDistanceMetric(int x, int y, int width, int height, std::string color1, std::string color2) {
//	Distance distance;
//	EdgeDistance leftTopDistance;
//	EdgeDistance rightTopDistance;
//	int minLeftY = Config::cameraHeight;
//	int minRightY = Config::cameraHeight;
//	int padding = (int)((float)width * 0.2f);
//	int halfWidth = width / 2;
//	int centerWidth = (int)((float)width * 0.1f);
//	Blobber::Color* color;
//	std::string colorName;
//
//	// left and right top distances
//	for (int senseX = x; senseX <= x + width; senseX++) {
//		for (int senseY = y; senseY <= y + height; senseY++) {
//			color = getColorAt(senseX, senseY);
//
//			if (color == NULL) {
//				//canvas.setPixelAt(senseX, senseY, 255, 255, 255);
//
//				continue;
//			}
//
//			colorName = std::string(color->name);
//
//			if (colorName == color1 || colorName == color2) {
//				distance = getDistance(senseX, senseY);
//
//				// left
//				if (senseX > x + padding && senseX < x + 2 * padding && senseY < minLeftY) {
//					leftTopDistance = EdgeDistance(senseX, senseY, distance.straight);
//					minLeftY = senseY;
//
//					canvas.setPixelAt(senseX, senseY, 0, 255, 0);
//				}
//
//				// right
//				if (senseX < x + width - padding && senseX > x + width - 2 * padding && senseY < minRightY) {
//					rightTopDistance = EdgeDistance(senseX, senseY, distance.straight);
//					minRightY = senseY;
//
//					canvas.setPixelAt(senseX, senseY, 0, 255, 0);
//				}
//
//				break;
//			}
//		}
//	}
//
//	// render left and right top distance boxes and distances
//	if (leftTopDistance.distance != -1) {
//		canvas.fillBoxCentered(leftTopDistance.screenX, leftTopDistance.screenY, 10, 10, 255, 0, 0);
//		canvas.drawText(leftTopDistance.screenX, leftTopDistance.screenY + 10, Util::toString(leftTopDistance.distance) + "m", 0, 0, 0);
//	}
//
//	if (rightTopDistance.distance != -1) {
//		canvas.fillBoxCentered(rightTopDistance.screenX, rightTopDistance.screenY, 10, 10, 255, 0, 0);
//		canvas.drawText(rightTopDistance.screenX, rightTopDistance.screenY + 10, Util::toString(rightTopDistance.distance) + "m", 0, 0, 0);
//	}
//
//	// center distance
//	int centerSumY = 0;
//	int centerSampleCount = 0;
//	int centerAvgY = -1;
//	int senseRows = 0;
//	int validRows = 0;
//	EdgeDistance centerDistance;
//	bool sawValidColor;
//	bool sawUndersideColor;
//	float senseWidthPercentage = 0.8f;
//	int senseStartX = (int)((float)x + (float)width * (1.0f - senseWidthPercentage));
//	int senseEndX = (int)((float)x + (float)width - (float)width * (1.0f - senseWidthPercentage));
//	std::vector<bool> validRowsMap;
//
//	int checkStartX = x;
//	int checkEndX = x + width;
//	int checkStartY = y + height / 4;
//	int checkEndY = y + height * 1.2f;
//
//	// draw check volume
//	canvas.drawBox(checkStartX, checkStartY, checkEndX - checkStartX, checkEndY - checkStartY, 128, 128, 128);
//
//	for (int senseX = checkStartX; senseX <= checkEndX; senseX++) {
//		sawValidColor = false;
//		sawUndersideColor = false;
//
//		bool isDistanceSenseRow = senseX >= senseStartX && senseX <= senseEndX;
//
//		if (isDistanceSenseRow) {
//			senseRows++;
//		}
//
//		//for (int senseY = y + height; senseY >= y; senseY--) {
//		//for (int senseY = y + height / 3; senseY < Config::cameraHeight; senseY++) {
//		for (int senseY = checkStartY; senseY < checkEndY; senseY++) {
//			color = getColorAt(senseX, senseY);
//
//			if (color == NULL) {
//				//canvas.setPixelAt(senseX, senseY, 255, 255, 255);
//
//				continue;
//			}
//
//			colorName = std::string(color->name);
//
//			if (colorName == color1 || colorName == color2) {
//				sawValidColor = true;
//			}
//
//			// also trigger for black is it may be the first color if looking at the goal from the side
//			// don't count black as many robots are black
//			if (sawValidColor && (colorName == "green"/* || colorName == "black"*/)) {
//				sawUndersideColor = true;
//
//				// draw violet if distance sense row, otherwise blue for valid point
//				if (isDistanceSenseRow) {
//					canvas.fillBoxCentered(senseX, senseY, 4, 4, 255, 0, 255);
//
//					centerSumY += senseY;
//					centerSampleCount++;
//				} else {
//					canvas.fillBoxCentered(senseX, senseY, 4, 4, 0, 0, 255);
//				}
//
//				break;
//			}
//		}
//
//		if (sawUndersideColor) {
//			validRows++;
//
//			validRowsMap.push_back(true);
//		} else {
//			validRowsMap.push_back(false);
//		}
//	}
//
//	float validSenseRowsPercentage = (float)validRows / (float)senseRows;
//
//	//std::cout << "@ valid percentage: " << validSenseRowsPercentage << std::endl;
//
//	// find goal cutting - means a low-profile opponent is in the way of the goal
//	int leftCutX = -1;
//	int rightCutX = -1;
//
//	if (validSenseRowsPercentage < 0.1f) {
//		// too few sense rows are valid, don't use this metric as distance
//
//		distance = getDistance(x + width / 2, y + height);
//		centerDistance = EdgeDistance(x + width / 2, y + height, distance.straight);
//	} else {
//		// scan pixels left to right
//		int cutThreshold = (int)((float)width * 0.15f);
//
//		// runtime, reset for right cut!
//		int lastValidX = -1;
//		int invalidCounter = 0;
//		bool sawValid = false;
//
//		// detect left cut
//		for (int i = 0; i <= width; i++) {
//			if (validRowsMap[i] == true) {
//				sawValid = true;
//
//				if (invalidCounter > 0) {
//					invalidCounter--;
//				}
//
//				if (lastValidX == -1 || i > lastValidX) {
//					lastValidX = i;
//				}
//			} else if (sawValid) {
//				invalidCounter++;
//			}
//
//			if (invalidCounter >= cutThreshold) {
//				leftCutX = lastValidX;
//
//				canvas.fillBoxCentered(x + leftCutX, y + height, 10, 10, 0, 128, 0);
//
//				break;
//			}
//		}
//
//		// detect right cut
//		lastValidX = -1;
//		invalidCounter = 0;
//		sawValid = false;
//
//		for (int i = width; i >= 0; i--) {
//			if (validRowsMap[i] == true) {
//				sawValid = true;
//
//				if (invalidCounter > 0) {
//					invalidCounter--;
//				}
//
//				if (lastValidX == -1 || i < lastValidX) {
//					lastValidX = i;
//				}
//			} else if (sawValid) {
//				invalidCounter++;
//			}
//
//			if (invalidCounter >= cutThreshold) {
//				rightCutX = lastValidX;
//
//				canvas.fillBoxCentered(x + rightCutX, y + height, 10, 10, 0, 128, 0);
//
//				break;
//			}
//		}
//
//		if (centerSampleCount > 0) {
//			centerAvgY = centerSumY / centerSampleCount;
//
//			distance = getDistance(x + width / 2, centerAvgY);
//			centerDistance = EdgeDistance(x + width / 2, centerAvgY, distance.straight);
//		}
//	}
//
//	// draw center distance box and text
//	canvas.fillBoxCentered(centerDistance.screenX, centerDistance.screenY, 10, 10, 255, 0, 0);
//	canvas.drawText(centerDistance.screenX, centerDistance.screenY + 10, Util::toString(centerDistance.distance) + "m", 0, 0, 0);
//
//	int newX = x;
//	int newWidth = width;
//	int validLeftWidth = leftCutX != -1 ? leftCutX : -1;
//	int validRightWidth = rightCutX != -1 ? width - rightCutX : -1;
//
//	// std::cout << "@ LEFT CUT: " << leftCutX << " WIDTH: " << validLeftWidth << "; RIGHT CUT: " << rightCutX << " WIDTH: " << validRightWidth << std::endl;
//
//	if (validLeftWidth != -1 && validRightWidth != -1) {
//		// got cuts from both sides, choose the widest side
//		if (validLeftWidth > validRightWidth) {
//			// choose left side, just update the width
//			newWidth = validLeftWidth;
//		} else {
//			// choose right side, update width and position
//			newX = x + rightCutX;
//			newWidth = validRightWidth;
//		}
//	} else if (validLeftWidth != -1) {
//		// use left side, just update the width
//		newWidth = validLeftWidth;
//	} else if (validRightWidth != -1) {
//		// use right side, update width and position
//		newX = x + rightCutX;
//		newWidth = validRightWidth;
//	}
//
//	/*
//	if (leftCutX == -1 && rightCutX != -1) {
//		// left side is obstructed
//		newX = x + rightCutX;
//		newWidth = width - rightCutX;
//	} else if (leftCutX != -1) {
//		if (leftCutX == rightCutX) {
//			// right side is obstructed
//			newWidth = leftCutX;
//		} else {
//			// both sides obstructed
//			newX = x + rightCutX;
//			newWidth = leftCutX - rightCutX;
//		}
//	}
//	*/
//
//	// render new goal position bottom positions
//	canvas.fillBoxCentered(newX, y + height, 5, 5, 255, 255, 0);
//	canvas.fillBoxCentered(newX + newWidth, y + height, 5, 5, 255, 255, 0);
//
//	/*if (leftCutX != -1) {
//		newX = x + leftCutX;
//
//		canvas.fillBoxCentered(newX, y + height, 15, 15, 255, 255, 0);
//	}
//
//	if (rightCutX != -1) {
//		newWidth = width - rightCutX;
//
//		if (leftCutX != -1) {
//			newWidth = newWidth - leftCutX;
//		}
//
//		canvas.fillBoxCentered(newX + newWidth, y + height, 15, 15, 255, 255, 0);
//	}*/
//
//	//std::cout << "new x: " << newX << " vs " << x << ", new width: " << newWidth << " vs " << width << ", left cut: " << leftCutX << ", right cut:" << rightCutX << std::endl;
//
//	return EdgeDistanceMetric(leftTopDistance, rightTopDistance, centerDistance, newX, newWidth);
//}

//Vision::Obstruction Vision::getGoalPathObstruction(float goalDistance) {
//	Obstruction obstruction;
//	//float corridorWidth = 0.1f;
//	float yStep = 0.05f;
//	float xStep = 0.05f;
//	float xSteps = 6.0f;
//	float startDistance = 0.35f;
//	//float endDistance = goalDistance + 0.4f; // improves goal edge detection but makes other cases worse..
//	float endDistance = goalDistance + 0.2f;
//	int stopGoalColorCount = 4; // stop searching any further if found this many goal colors
//	float goalPathObstructedThreshold = 0.4f;
//
//	float xDistance, yDistance;
//	bool debug = canvas.data != NULL;
//	Blobber::Color* color;
//	CameraTranslator::CameraPosition pos;
//	int lastSenseX = 0;
//	int lastSenseY = 0;
//	int validCountLeft = 0;
//	int validCountRight = 0;
//	int sampleCountLeft = 0;
//	int sampleCountRight = 0;
//	int goalColorCount = 0;
//	int blackColorCount = 0;
//	float maxDistanceY = startDistance;
//	bool running = true;
//	bool lastColorBall = false;
//	bool isLeft;
//	int invalidCounterLeft;
//	int invalidCounterRight;
//	int longestInvalidSpreeLeft = 0;
//	int longestInvalidSpreeRight = 0;
//	int invalidSpreeSumLeft = 0;
//	int invalidSpreeSumRight = 0;
//	int longestInvalidLineLeft;
//	int longestInvalidLineRight;
//
//	// TODO make sure finds target side color in the end
//	// sample points every step distances
//	for (xDistance = -xStep * xSteps / 2 + xStep / 2.0f; xDistance < xStep * xSteps / 2; xDistance += xStep) {
//		invalidCounterLeft = 0;
//		invalidCounterRight = 0;
//		longestInvalidLineLeft = 0;
//		longestInvalidLineRight = 0;
//
//		for (yDistance = startDistance; yDistance < endDistance; yDistance += yStep) {
//			if (yDistance > maxDistanceY) {
//				maxDistanceY = yDistance;
//			}
//
//			isLeft = xDistance < 0;
//
//			// find corridor positions
//			pos = cameraTranslator->getCameraPosition(xDistance, yDistance);
//
//			if (pos.x == lastSenseX && pos.y == lastSenseY) {
//				continue;
//			}
//
//			lastSenseX = pos.x;
//			lastSenseY = pos.y;
//
//			color = getColorAt(pos.x, pos.y);
//
//			if (color != NULL) {
//				if (strcmp(color->name, "ball") == 0) {
//					lastColorBall = true;
//				} else {
//					lastColorBall = false;
//				}
//
//				if (strcmp(color->name, "blue-goal") == 0 || strcmp(color->name, "yellow-goal") == 0) {
//					goalColorCount++;
//
//					// stop if found enough goal colors
//					if (goalColorCount >= stopGoalColorCount) {
//						if (debug) {
//							canvas.drawMarker(pos.x, pos.y, 255, 0, 0);
//						}
//
//						//running = false;
//
//						break;
//					} else {
//						if (debug) {
//							canvas.drawMarker(pos.x, pos.y, 128, 128, 128);
//						}
//					}
//
//					continue;
//				} else if (strcmp(color->name, "black") == 0) {
//					blackColorCount++;
//				}
//
//				if (find(goalObstructedValidColors.begin(), goalObstructedValidColors.end(), std::string(color->name)) != goalObstructedValidColors.end()) {
//					if (debug) {
//						canvas.drawMarker(pos.x, pos.y, 0, 255, 0);
//					}
//
//					if (isLeft) {
//						sampleCountLeft++;
//						validCountLeft++;
//
//						invalidCounterLeft = (int)Math::max((float)invalidCounterLeft - 1.0f, 0.0f);
//					}
//					else {
//						sampleCountRight++;
//						validCountRight++;
//
//						invalidCounterRight = (int)Math::max((float)invalidCounterRight - 1.0f, 0.0f);
//					}
//				} else {
//					if (isLeft) {
//						sampleCountLeft++;
//					}
//					else {
//						sampleCountRight++;
//					}
//
//					if (debug) {
//						canvas.drawMarker(pos.x, pos.y, 128, 0, 0);
//					}
//				}
//			} else {
//				// don't count holes if the last color was ball as they're probably on the ball
//				if (!lastColorBall) {
//					if (isLeft) {
//						sampleCountLeft++;
//						invalidCounterLeft++;
//					} else {
//						sampleCountRight++;
//						invalidCounterRight++;
//					}
//
//					if (invalidCounterLeft > longestInvalidSpreeLeft) {
//						longestInvalidSpreeLeft = invalidCounterLeft;
//					}
//
//					if (invalidCounterRight > longestInvalidSpreeRight) {
//						longestInvalidSpreeRight = invalidCounterRight;
//					}
//
//					if (invalidCounterLeft > longestInvalidLineLeft) {
//						longestInvalidLineLeft = invalidCounterLeft;
//					}
//
//					if (invalidCounterRight > longestInvalidLineRight) {
//						longestInvalidLineRight = invalidCounterRight;
//					}
//
//					if (debug) {
//						canvas.drawMarker(pos.x, pos.y, 128, 0, 0);
//					}
//				} else {
//					if (debug) {
//						canvas.drawMarker(pos.x, pos.y, 0, 0, 128);
//					}
//				}
//			}
//		}
//
//		invalidSpreeSumLeft += longestInvalidLineLeft;
//		invalidSpreeSumRight += longestInvalidLineRight;
//
//		/*if (!running) {
//			break;
//		}*/
//	}
//
//	// each sample is 5 centimeters apart
//
//	//std::cout << "@ max y: " << maxDistanceY << " meters, left: " << validCountLeft << "/" << sampleCountLeft << ", right: " << validCountRight << "/" << sampleCountRight << std::endl;
//
//	// never mind if we're too close to the goal
//	if (maxDistanceY < 0.5f) {
//		return obstruction;
//	}
//
//	//int maxInvalidCount = 60 / (int)(xSteps / 2);
//	//int manyBlacksCount = 4 * (int)xSteps;
//
//	// if there's lots of black matches, were probably near the line and possibly on the side of the goal so reduce threshold
//	/*if (blackColorCount >= manyBlacksCount) {
//		//maxInvalidCount /= 4;
//		invalidSpreeThreshold /= 2;
//	}*/
//
//
//
//	//int invalidSpreeThreshold = 20;
//	int invalidSpreeThreshold = (int)Math::map(goalDistance, 0.0f, 5.0f, 15.0f, 30.0f);
//
//	//std::cout << "left: " << longestInvalidSpreeLeft << " vs " << invalidSpreeSumLeft << ", right: " << longestInvalidSpreeRight << " vs " << invalidSpreeSumRight << std::endl;
//
//	/*obstruction.invalidCountLeft = longestInvalidSpreeLeft;
//	obstruction.invalidCountRight = longestInvalidSpreeRight;
//	obstruction.left = obstruction.invalidCountLeft > invalidSpreeThreshold;
//	obstruction.right = obstruction.invalidCountRight > invalidSpreeThreshold;*/
//
//	obstruction.invalidCountLeft = invalidSpreeSumLeft;
//	obstruction.invalidCountRight = invalidSpreeSumRight;
//	obstruction.left = obstruction.invalidCountLeft > invalidSpreeThreshold;
//	obstruction.right = obstruction.invalidCountRight > invalidSpreeThreshold;
//
//	//obstruction.invalidCountLeft = sampleCountLeft - validCountLeft;
//	//obstruction.invalidCountRight = sampleCountRight - validCountRight;
//
//	//std::cout << "@ blacks: " << blackColorCount << ", max invalid: " << maxInvalidCount << std::endl;
//
//	/*if (obstruction.invalidCountLeft > maxInvalidCount || obstruction.invalidCountRight > maxInvalidCount) {
//		if (obstruction.invalidCountLeft > maxInvalidCount && obstruction.invalidCountRight > maxInvalidCount) {
//			obstruction.left = true;
//			obstruction.right = true;
//		} else if (obstruction.invalidCountLeft > maxInvalidCount) {
//			obstruction.left = true;
//		} else {
//			obstruction.right = true;
//		}
//	}*/
//
//	//int invalidCountLeft = sampleCount
//
//	/*float leftValidSamplesRatio = (float)validCountLeft / (float)(sampleCount / 2);
//	float rightValidSamplesRatio = (float)validCountRight / (float)(sampleCount / 2);
//
//	// not reliable near the goal with few samples
//	if (sampleCount > 50 && goalDistance > 1.5f) {
//		bool obstructed = leftValidSamplesRatio < (1.0f - goalPathObstructedThreshold) || rightValidSamplesRatio < (1.0f - goalPathObstructedThreshold);
//
//		if (obstructed) {
//			if (leftValidSamplesRatio < rightValidSamplesRatio) {
//				obstruction = Obstruction::LEFT;
//			} else {
//				obstruction = Obstruction::RIGHT;
//			}
//		}
//	}*/
//
//	//std::cout << "@ Obstruction ratio samples: " << sampleCount << ", goal distance: " << goalDistance << ", left: " << leftValidSamplesRatio << ", right: " << rightValidSamplesRatio << ", side: " << (obstruction == Obstruction::LEFT ? "LEFT" : obstruction == Obstruction::RIGHT ? "RIGHT" : "NONE") << std::endl;
//
//	return obstruction;
//}

//float Vision::getColorDistance(std::string colorName, int x1, int y1, int x2, int y2) {
//	x1 = (int)Math::limit((float)x1, 0.0f, (float)Config::cameraWidth);
//	x2 = (int)Math::limit((float)x2, 0.0f, (float)Config::cameraWidth);
//	y1 = (int)Math::limit((float)y1, 0.0f, (float)Config::cameraHeight);
//	y2 = (int)Math::limit((float)y2, 0.0f, (float)Config::cameraHeight);
//
//	int originalX1 = x1;
//	int originalX2 = x2;
//	int originalY1 = y1;
//	int originalY2 = y2;
//
//	if (y2 > y1) {
//		return -1.0f;
//	}
//
//	int F, x, y;
//    int pixelCounter = 0;
//    int senseCounter = 0;
//    int senseStep = 3;
//    const int maxSensePoints = 512;
//    int senseX[maxSensePoints];
//    int senseY[maxSensePoints];
//	int invalidSpree = 0;
//	int longestInvalidSpree = 0;
//	//int scaler = 10;
//
//    if (x1 > x2) {
//        std::swap(x1, x2);
//        std::swap(y1, y2);
//    }
//
//    if (x1 == x2) {
//        if (y1 > y2) {
//            std::swap(y1, y2);
//        }
//
//        x = x1;
//        y = y1;
//
//        while (y <= y2) {
//			//senseStep = (y + scaler) / scaler;
//
//            if (pixelCounter % senseStep == 0 && senseCounter < maxSensePoints) {
//                senseX[senseCounter] = x;
//                senseY[senseCounter] = y;
//                senseCounter++;
//            }
//
//            pixelCounter++;
//
//            y++;
//        }
//    } else if (y1 == y2) {
//        x = x1;
//        y = y1;
//
//		//senseStep = (y + scaler) / scaler;
//
//        while (x <= x2) {
//            if (pixelCounter % senseStep == 0 && senseCounter < maxSensePoints) {
//                senseX[senseCounter] = x;
//                senseY[senseCounter] = y;
//                senseCounter++;
//            }
//
//            pixelCounter++;
//
//            x++;
//        }
//    } else {
//        int dy = y2 - y1;
//        int dx = x2 - x1;
//        int dy2 = (dy << 1);
//        int dx2 = (dx << 1);
//        int sub = dy2 - dx2;
//        int sum = dy2 + dx2;
//
//        if (dy >= 0) {
//            if (dy <= dx) {
//                F = dy2 - dx;
//                x = x1;
//                y = y1;
//
//                while (x <= x2) {
//					//senseStep = (y + scaler) / scaler;
//
//                    if (pixelCounter % senseStep == 0 && senseCounter < maxSensePoints) {
//                        senseX[senseCounter] = x;
//                        senseY[senseCounter] = y;
//                        senseCounter++;
//                    }
//
//                    pixelCounter++;
//
//                    if (F <= 0) {
//                        F += dy2;
//                    } else {
//                        y++;
//                        F += sub;
//                    }
//
//                    x++;
//                }
//            } else {
//                F = dx2 - dy;
//                y = y1;
//                x = x1;
//
//                while (y <= y2) {
//					//senseStep = (y + scaler) / scaler;
//
//                    if (pixelCounter % senseStep == 0 && senseCounter < maxSensePoints) {
//                        senseX[senseCounter] = x;
//                        senseY[senseCounter] = y;
//                        senseCounter++;
//                    }
//
//                    pixelCounter++;
//
//                    if (F <= 0) {
//                        F += dx2;
//                    } else {
//                        x++;
//                        F -= sub;
//                    }
//
//                    y++;
//                }
//            }
//        } else {
//            if (dx >= -dy) {
//                F = -dy2 - dx;
//                x = x1;
//                y = y1;
//
//                while (x <= x2) {
//					//senseStep = (y + scaler) / scaler;
//
//                    if (pixelCounter % senseStep == 0 && senseCounter < maxSensePoints) {
//                        senseX[senseCounter] = x;
//                        senseY[senseCounter] = y;
//                        senseCounter++;
//                    }
//
//                    pixelCounter++;
//
//                    if (F <= 0) {
//                        F -= dy2;
//                    } else {
//                        y--;
//                        F -= sum;
//                    }
//
//                    x++;
//                }
//            } else {
//                F = dx2 + dy;
//                y = y1;
//                x = x1;
//
//                while (y >= y2) {
//					//senseStep = (y + scaler) / scaler;
//
//                    if (pixelCounter % senseStep == 0 && senseCounter < maxSensePoints) {
//                        senseX[senseCounter] = x;
//                        senseY[senseCounter] = y;
//                        senseCounter++;
//                    }
//
//                    pixelCounter++;
//
//                    if (F <= 0) {
//                        F += dx2;
//                    } else {
//                        x++;
//                        F += sum;
//                    }
//
//                    y--;
//                }
//            }
//        }
//    }
//
//	int matches = 0;
//    bool debug = canvas.data != NULL;
//	int start = originalX1 < originalX2 ? 0 : senseCounter - 1;
//	int step = originalX1 < originalX2 ? 1 : -1;
//
//    for (int i = start; (originalX1 < originalX2 ? i < senseCounter : i >= 0); i += step) {
//        x = senseX[i];
//        y = senseY[i];
//
//        Blobber::Color* color = getColorAt(x, y);
//
//		if (color != NULL) {
//
//			if (strcmp(color->name, colorName.c_str()) == 0) {
//				if (debug) {
//					//canvas.drawMarker(x, y, 0, 200, 0);
//					canvas.fillBox(x - 5, y - 5, 10, 10, 255, 0, 0);
//				}
//
//				return getDistance(x, y).straight;
//			} else {
//				if (debug) {
//					//canvas.drawMarker(x, y, 200, 0, 0);
//				}
//			}
//		} else {
//			if (debug) {
//                //canvas.drawMarker(x, y, 64, 64, 64);
//            }
//		}
//	}
//
//	return -1.0f;
//}

//Vision::ColorDistance Vision::getColorDistance(std::string colorName) {
//	float left = getColorDistance(
//		colorName,
//		Config::cameraWidth / 2, Config::colorDistanceStartY,
//		0, 0
//	);
//	float leftMiddle = getColorDistance(
//		colorName,
//		Config::cameraWidth / 2, Config::colorDistanceStartY,
//		Config::cameraWidth / 4, 0
//	);
//	float center = getColorDistance(
//		colorName,
//		Config::cameraWidth / 2, Config::colorDistanceStartY,
//		Config::cameraWidth / 2, 0
//	);
//	float rightMiddle = getColorDistance(
//		colorName,
//		Config::cameraWidth / 2, Config::colorDistanceStartY,
//		Config::cameraWidth / 2 + Config::cameraWidth / 4, 0
//	);
//	float right = getColorDistance(
//		colorName,
//		Config::cameraWidth / 2, Config::colorDistanceStartY,
//		Config::cameraWidth, 0
//	);
//
//	/*getColorDistance(
//		colorName,
//		Config::cameraWidth - 10, 0,
//		Config::cameraWidth / 2 - 10, Config::colorDistanceStartY
//	);*/
//
//	return ColorDistance(left, leftMiddle, center, rightMiddle, right);
//}

//Vision::ColorList Vision::getViewColorOrder() {
//	ColorList colors;
//	int x = Config::cameraWidth / 2;
//	int y;
//	Blobber::Color* color;
//	bool debug = canvas.data != NULL;
//	std::string lastColor = "";
//	int sameColorCount = 0;
//	bool colorChangeDetected = false;
//	int minColorConsecutive = 2;
//
//	for (y = Config::ballPathSenseStartY; y >= 0; y -= 3) {
//		color = getColorAt(x, y);
//
//		if (color == NULL) {
//			continue;
//		}
//
//		if (color->name != lastColor) {
//			colorChangeDetected = true;
//			lastColor = color->name;
//			sameColorCount = 0;
//		} else {
//			sameColorCount++;
//		}
//
//		if (colorChangeDetected && sameColorCount >= minColorConsecutive) {
//			colors.push_back(color->name);
//
//			if (debug) {
//				canvas.fillBoxCentered(x, y, 10, 10, 128, 128, 128);
//			}
//
//			colorChangeDetected = false;
//		}
//	}
//
//	return colors;
//}

//float Vision::getBlockMetric(int x1, int y1, int blockWidth, int blockHeight, std::vector<std::string> validColors, int step) {
//	bool debug = canvas.data != NULL;
//	int matches = 0;
//	int misses = 0;
//
//	for (int x = (int)Math::max((float)x1, 0.0f); x < (int)Math::min((float)(x1 + blockWidth), (float)width); x += step) {
//		for (int y = (int)Math::max((float)y1, 0.0f); y < (int)Math::min((float)(y1 + blockHeight), (float)height); y += step) {
//			Blobber::Color* color = getColorAt(x, y);
//
//			if (color != NULL) {
//				if (find(validColors.begin(), validColors.end(), std::string(color->name)) != validColors.end()) {
//					matches++;
//
//					if (debug) {
//						canvas.drawMarker(x, y, 0, 200, 0);
//					}
//				} else {
//					misses++;
//
//					if (debug) {
//						canvas.drawMarker(x, y, 200, 0, 0);
//					}
//				}
//			} else {
//				misses++;
//
//				if (debug) {
//					canvas.drawMarker(x, y, 200, 0, 0);
//				}
//			}
//		}
//	}
//
//	int points = matches + misses;
//
//	return (float)matches / (float)points;
//}

//float Vision::getUndersideMetric(int x1, int y1, float distance, int blockWidth, int blockHeight, std::string targetColor, std::string targetColor2, std::vector<std::string> validColors, bool expand) {
//	int minValidX = -1;
//	int maxValidX = -1;
//	int minValidY = -1;
//	int maxValidY = -1;
//
//	return getUndersideMetric(x1, y1, distance, blockWidth, blockHeight, targetColor, targetColor2, validColors, minValidX, minValidY, maxValidX, maxValidY, expand);
//}

float Vision::getAreaMetric(int x1, int y1, int areaWidth, int areaHeight, std::vector<Blobber::BlobColor> validColors) {
    int xStep = 5;
    int yStep = 5;
    int matches = 0;
	int misses = 0;
	int xStart = std::max(x1, 0);
	int yStart = std::max(y1, 0);
	int xLimit = std::min(x1 + areaWidth, Config::cameraWidth - 1);
	int yLimit = std::min(y1 + areaHeight, Config::cameraHeight - 1);
    int xStepCount = (xLimit - xStart) / xStep + 1;
    int yStepCount = (yLimit - yStart) / yStep + 1;
    Blobber::BlobColor color;

    if (xStepCount < 2 || yStepCount < 2) {
        return NAN;
    }

	for (int x = xStart; x < xLimit; x += xStep) {
        for (int y = yStart; y < yLimit; y += yStep) {
		    color = blobber->getColorAt(x, y);

			if (std::find(validColors.begin(), validColors.end(), color) != validColors.end()) {
				matches++;
			} else {
				misses++;
			}
		}
	}

	int sum = matches + misses;

	// Ignore result if too few samples
	if (sum < 5) {
		return NAN;
	}

	return (float)matches / (float)sum;
}

//float Vision::getUndersideMetric(int x1, int y1, float distance, int blockWidth, int blockHeight, std::string targetColor, std::string targetColor2, std::vector<std::string> validColors, int& minValidX, int& minValidY, int& maxValidX, int& maxValidY, bool expand) {
//	bool debug = canvas.data != NULL;
//	int xStep = 6;
//	int yStep = 6;
//	int gapStep = 3;
//	int senseSteps = (int)Math::max((float)Config::undersideMetricBaseSteps / distance, 3.0f);
//	int matches = 0;
//	int misses = 0;
//	int stepsBelow;
//	bool sawGreenOrBlack;
//	bool sawWhite = false;
//	bool sawBlack = false;
//	const char* targetColorName = targetColor.c_str();
//	const char* targetColorName2 = targetColor2.c_str();
//	std::string lastColorName;
//	Blobber::Color* color;
//
//	minValidX = -1;
//	maxValidX = -1;
//	minValidY = -1;
//	maxValidY = -1;
//
//	for (int x = (int)Math::max((float)x1, 0.0f); x < (int)Math::min((float)(x1 + blockWidth), (float)width); x += xStep) {
//		if (x > width - 1) {
//			break;
//		}
//
//		stepsBelow = 0;
//
//		for (int y = y1; y < (int)Math::min((float)(y1 + blockHeight * 4), (float)height); y += yStep) {
//			if (y > height - 1) {
//				break;
//			}
//
//			color = getColorAt(x, y);
//
//			if (color == NULL || (strcmp(color->name, targetColorName) != 0 && strcmp(color->name, targetColorName2) != 0)) {
//				if (debug) {
//					canvas.drawMarker(x, y, 64, 64, 64);
//				}
//
//				continue;
//			}
//
//			if (minValidX == -1) {
//				minValidX = x;
//			}
//
//			if (minValidY == -1 || y < minValidY) {
//				minValidY = y;
//			}
//
//			if (x > maxValidX) {
//				maxValidX = x;
//			}
//
//			if (y > maxValidY) {
//				maxValidY = y;
//			}
//
//			if (debug) {
//				canvas.drawMarker(x, y, 255, 255, 255);
//			}
//
//			//std::cout << "! DOWN FROM " << (y + yStep) << " to " << y + blockHeight << std::endl;
//
//			for (int senseY = y + yStep; senseY < (int)Math::min((float)(y + blockHeight * 4), (float)height); senseY += yStep) {
//				if (senseY > height - 1) {
//					break;
//				}
//
//				color = getColorAt(x, senseY);
//
//				//std::cout << "! SENSE " << x << " " << senseY << " | " << blockHeight << std::endl;
//
//				if (color != NULL && (strcmp(color->name, targetColorName) == 0 || strcmp(color->name, targetColorName2) == 0)) {
//					if (senseY > maxValidY) {
//						maxValidY = senseY;
//					}
//
//					if (debug) {
//						canvas.drawMarker(x, senseY, 0, 0, 0);
//					}
//				} else {
//					if (debug) {
//						canvas.drawMarker(x, senseY, 255, 255, 255);
//					}
//
//					sawGreenOrBlack = false;
//					bool retryTarget = false;
//					int runMatches = 0;
//					int runMisses = 0;
//
//					for (int gapY = senseY + gapStep; gapY < (int)Math::min((float)(senseY + senseSteps * yStep), (float)height); gapY += gapStep) {
//						if (gapY > height - 1) {
//							break;
//						}
//
//						color = getColorAt(x, gapY);
//
//						if (color != NULL) {
//							if (strcmp(color->name, targetColorName) == 0 || strcmp(color->name, targetColorName2) == 0) {
//								retryTarget = true;
//
//								if (gapY > maxValidY) {
//									maxValidY = gapY;
//								}
//
//								break;
//							}
//
//							if (
//								!sawGreenOrBlack
//								&& (
//									strcmp(color->name, "green") == 0
//									|| strcmp(color->name, "black") == 0
//								)
//							) {
//								sawGreenOrBlack = true;
//							}
//
//							if (sawGreenOrBlack) {
//								if (!sawWhite && strcmp(color->name, "white") == 0) {
//									sawWhite = true;
//								} else if (!sawBlack && strcmp(color->name, "black") == 0) {
//									sawBlack = true;
//								}
//							}
//
//							if (
//								sawGreenOrBlack
//								&& find(validColors.begin(), validColors.end(), std::string(color->name)) != validColors.end()
//							) {
//								runMatches++;
//
//								lastColorName = std::string(color->name);
//
//								if (debug) {
//									canvas.drawMarker(x, gapY, 0, 200, 0, true);
//								}
//							} else {
//								runMisses++;
//
//								if (debug) {
//									canvas.drawMarker(x, gapY, 200, 0, 0, true);
//								}
//							}
//						} else {
//							// allow one invalid color after white/black
//							if (lastColorName != "black" && lastColorName != "white") {
//								canvas.drawMarker(x, gapY, 100, 0, 0, true);
//
//								runMisses++;
//							} else {
//								lastColorName = "";
//
//								if (debug) {
//									canvas.drawMarker(x, gapY, 255, 255, 0, true);
//								}
//							}
//						}
//					}
//
//					if (!retryTarget) {
//						matches += runMatches;
//						misses += runMisses;
//
//						break;
//					} else {
//
//					}
//				}
//			}
//
//			break;
//		}
//	}
//
//	/*if (expand) {
//		int maxGap = 2;
//		int expandY = 60;
//		int expandX = 60;
//
//		if (debug) {
//			canvas.drawBox(minValidX, minValidY, maxValidX - minValidX, maxValidY - minValidY, 255, 0, 0);
//			//canvas.drawBox(maxValidX, 0, Config::cameraWidth - maxValidX, Math::min(maxValidY + 60, Config::cameraHeight - 1), 255, 255, 255);
//		}
//
//		for (int y = 0; y < Math::min(maxValidY + expandY, Config::cameraHeight - 1); y += yStep) {
//			int gap = 0;
//
//			for (int x = maxValidX; x < maxValidX + expandX; x += xStep) {
//				color = getColorAt(x, y);
//
//				if (color != NULL && (strcmp(color->name, targetColorName) == 0 || strcmp(color->name, targetColorName2) == 0)) {
//					gap = 0;
//
//					if (x > maxValidX) maxValidX = x;
//					if (y > maxValidY) maxValidY = y;
//
//					if (debug) {
//						canvas.drawMarker(x, y, 255, 255, 255);
//					}
//				} else {
//					gap++;
//
//					if (debug) {
//						canvas.drawMarker(x, y, 200, 0, 0);
//					}
//				}
//
//				if (gap > maxGap) {
//					if (debug) {
//						canvas.drawMarker(x, y, 100, 0, 0);
//					}
//
//					break;
//				}
//			}
//		}
//	}*/
//
//	// sure?
//	if (y1 > Config::undersideMetricBlackWhiteMinY && !sawWhite && !sawBlack) {
//		return 0.0f;
//	}
//
//	// sure?
//	if (matches < Config::undersideMetricValidGoalMinMatches) {
//		return 0.0f;
//	}
//
//	int points = matches + misses;
//
//	return (float)matches / (float)points;
//}

/*void Vision::updateViewObstructed() {
	float validColorsPercentage = getBlockMetric(
		Config::viewObstructedX,
		Config::viewObstructedY,
		Config::viewObstructedWidth,
		Config::viewObstructedHeight,
		viewObstructedValidColors,
		20
	);

	if (validColorsPercentage < Config::viewObstructedThreshold) {
		viewObstrsucted = true;
	} else {
		viewObstructed = false;
	}
}*/

/*void Vision::updateColorDistances() {
	whiteDistance = getColorDistance("white");
	blackDistance = getColorDistance("black");
}*/

//void Vision::updateColorOrder() {
//	colorOrder = getViewColorOrder();
//
//	/*std::cout << "Color order " << dir << std::endl;
//
//	for (int i = 0; i < colorOrder.size(); i++) {
//		std::cout << "  " << i << ": " << colorOrder[i] << std::endl;
//	}
//
//	std::cout << std::endl;*/
//}

Object* Vision::Results::getClosestBall(Dir dir, bool nextClosest, bool preferLeft, bool preferRear, bool preferFront) {
	Object* blueGoal = getLargestGoal(Side::BLUE);
	Object* yellowGoal = getLargestGoal(Side::MAGENTA);

	float closestDistance = 100.0f;
	float ballDistance;
	Object* ball;
	Object* closestBall = NULL;
	Object* nextClosestBall = NULL;

	if (front != NULL && dir != Dir::REAR) {
		for (ObjectListItc it = front->balls.begin(); it != front->balls.end(); it++) {
			ball = *it;

			if (isBallInGoal(ball, blueGoal, yellowGoal)) {
				continue;
			}

			ballDistance = ball->distance;

			// fake front ball distances to be closer
			if (preferFront) {
				ballDistance *= 0.5f;
			}

			// fake balls on the left to be closer
			if (preferLeft && ball->angle < 0.0f) {
				//std::cout << "@ PREFER LEFT " << ballDistance << std::endl;

				ballDistance *= 0.5f;
			}

			if (closestBall == NULL || ballDistance < closestDistance) {
				if (closestBall != NULL) {
					nextClosestBall = closestBall;
				}

				closestBall = ball;
				closestDistance = ballDistance;
			}
		}
	}

	if (rear != NULL && dir != Dir::FRONT) {
		for (ObjectListItc it = rear->balls.begin(); it != rear->balls.end(); it++) {
			ball = *it;

			if (isBallInGoal(ball, blueGoal, yellowGoal)) {
				continue;
			}

			ballDistance = ball->distance;

			// fake balls behind to be closer
			if (preferRear) {
				//std::cout << "@ PREFER REAR " << ballDistance << std::endl;

				ballDistance *= 0.5f;
			}

			if (closestBall == NULL || ballDistance < closestDistance) {
				if (closestBall != NULL) {
					nextClosestBall = closestBall;
				}

				closestBall = ball;
				closestDistance = ballDistance;
			}
		}
	}

	/*if (closestBall != NULL) {
		std::cout << "@ CLOSEST DISTANCE: " << closestBall->distance << ", ANGLE: " << Math::radToDeg(closestBall->angle) << std::endl;
	}*/

	return nextClosest ? nextClosestBall : closestBall;
}

Object* Vision::Results::getFurthestBall(Dir dir) {
	Object* blueGoal = getLargestGoal(Side::BLUE);
	Object* yellowGoal = getLargestGoal(Side::MAGENTA);

	float furthestDistance = -1.0f;
	Object* ball;
	Object* furthestBall = NULL;

	if (front != NULL && dir != Dir::REAR) {
		for (ObjectListItc it = front->balls.begin(); it != front->balls.end(); it++) {
			ball = *it;

			if (isBallInGoal(ball, blueGoal, yellowGoal)) {
				continue;
			}

			if (furthestBall == NULL || ball->distance > furthestDistance) {
				furthestBall = ball;
				furthestDistance = ball->distance;
			}
		}
	}

	if (rear != NULL && dir != Dir::FRONT) {
		for (ObjectListItc it = rear->balls.begin(); it != rear->balls.end(); it++) {
			ball = *it;

			if (isBallInGoal(ball, blueGoal, yellowGoal)) {
				continue;
			}

			if (furthestBall == NULL || ball->distance > furthestDistance) {
				furthestBall = ball;
				furthestDistance = ball->distance;
			}
		}
	}

	return furthestBall;
}

Object* Vision::Results::getNextClosestBall(Dir dir) {
	return getClosestBall(dir, true);
}

Object* Vision::Results::getLargestGoal(Side side, Dir dir) {
	int area;
	int largestArea = 0;
	Object* goal;
	Object* largestGoal = NULL;
	std::string sideName = side == Side::BLUE ? "blue" : "yellow";

	if (front != NULL && dir != Dir::REAR) {
		for (ObjectListItc it = front->baskets.begin(); it != front->baskets.end(); it++) {
			goal = *it;

			//area = goal->area;
			area = goal->width * goal->height;
		
			if (side != Side::UNKNOWN && goal->type != (int)side) {
				//std::cout << "@ Skip " << sideName << " goal front : " << area << " at " << goal->width << "x" << goal->height << " of " << front->baskets.size() << " baskets" << " - type " << goal->type << " vs " << ((int)side) << std::endl;

				continue;
			}

			if (largestGoal == NULL || area > largestArea) {
				largestGoal = goal;
				largestArea = area;

				//std::cout << "@ New largest " << sideName << " goal front : " << area << " at " << goal->width << "x" << goal->height << " of " << front->baskets.size() << " baskets" << " - type " << goal->type << " vs " << ((int)side) << std::endl;
			} else {
				//std::cout << "@ Not largest " << sideName << " goal front : " << area << " at " << goal->width << "x" << goal->height << " of " << front->baskets.size() << " baskets" << " - type " << goal->type << " vs " << ((int)side) << std::endl;
			}
		}
	}

	if (rear != NULL && dir != Dir::FRONT) {
		for (ObjectListItc it = rear->baskets.begin(); it != rear->baskets.end(); it++) {
			goal = *it;

			if (side != Side::UNKNOWN && goal->type != (int)side) {
				continue;
			}

			//area = goal->area;
			area = goal->width * goal->height;
		
			if (largestGoal == NULL || area > largestArea) {
				largestGoal = goal;
				largestArea = area;
			}
		}
	}

	if (largestGoal != NULL) {
		area = largestGoal->width * largestGoal->height;

		if (dir == Dir::ANY) {
			Side otherSide = side == Side::BLUE ? Side::MAGENTA : Side::BLUE;
			Dir sameDir = largestGoal->behind ? Dir::REAR : Dir::FRONT;
			Object* otherGaol = getLargestGoal(otherSide, sameDir);

			// don't use the found goal if other goal is also visible on the same side and is larger
			if (otherGaol != NULL && otherGaol->area > largestGoal->area) {
				// std::cout << "@ Not returning largest " << sideName << " goal: " << area << " at " << largestGoal->width << "x" << largestGoal->height << std::endl;

				return NULL;
			}
		}

		//lastLargestGoal.copyFrom(largestGoal);

		//std::cout << "@ Final largest " << sideName << " goal: " << area << " at " << largestGoal->width << "x" << largestGoal->height << std::endl;

		return largestGoal;
	}/* else if (
		lastLargestGoal.width > 0
		&& lastLargestGoal.type == side
		&& Util::duration(lastLargestGoal.lastSeenTime) < Config::fakeObjectLifetime
		&& !frontOnly
	) {
		return &lastLargestGoal;
	}*/ else {
		return NULL;
	}
}

Object* Vision::Results::getFurthestGoal(Dir dir) {
	return NULL;

	Object* largestYellow = getLargestGoal(Side::MAGENTA, dir);
	Object* largestBlue = getLargestGoal(Side::BLUE, dir);

	if (largestYellow != NULL) {
		if (largestBlue != NULL) {
			if (largestYellow->distance > largestBlue->distance) {
				return largestYellow;
			} else {
				return largestBlue;
			}
		} else {
			return largestYellow;
		}
	} else {
		if (largestBlue != NULL) {
			return largestBlue;
		} else {
			return NULL;
		}
	}
}

bool Vision::Results::isBallInGoal(Object* ball) {
	return isBallInGoal(ball, getLargestGoal(Side::BLUE), getLargestGoal(Side::MAGENTA));
}

bool Vision::Results::isBallInGoal(Object* ball, Object* blueGoal, Object* yellowGoal) {
	// causes problems with balls near the goal when looking at the goal at a large angle
	/*if (
		(blueGoal != NULL && blueGoal->behind == ball->behind && blueGoal->contains(ball))
		|| (yellowGoal != NULL && yellowGoal->behind == ball->behind && yellowGoal->contains(ball))
	) {
		//std::cout << "@ Ball in goal, ball distance: " << ball->distance << ", blue goal: " << (blueGoal != NULL ? Util::toString(blueGoal->distance) : "n/a") << ", yellow goal: " << (yellowGoal != NULL ? Util::toString(yellowGoal->distance) : "n/a") << std::endl;
		return true;
	}*/

	return false;
}

Vision::BallInWayMetric Vision::Results::getBallInWayMetric(ObjectList balls, int goalY, Object* ignoreBall) {
	Object* blueGoal = getLargestGoal(Side::BLUE);
	Object* yellowGoal = getLargestGoal(Side::MAGENTA);

	int startY = Config::goalPathSenseStartY;
	int halfWidth = Config::cameraWidth / 2;
	float ballDiameter = 0.043f;
	//float ballInWayAngleThreshold = Math::degToRad(4.0f);
	//float ballInWayDistanceThreshold = ballDiameter * 4.0f;
	Object* ball;
	//float checkWidth;
	bool isBallInWay = false;
	float closestBallInWayDistance = -1.0f;
	float furthestBallInWayDistance = -1.0f;
	int ballInWayCount = 0;

	for (ObjectListItc it = balls.begin(); it != balls.end(); it++) {
		ball = *it;

		if (ignoreBall != NULL && (ball == ignoreBall || Math::abs(ball->distance - ignoreBall->distance) < 0.1f)) {
			//std::cout << "@ IGNORING OWN BALL" << std::endl;

			continue;
		}
		
		if (isBallInGoal(ball, blueGoal, yellowGoal) || ball->getDribblerDistance() < 0.02f) {
			continue;
		}

		// angle based
		/*float ballLeftX = ball->distanceX - ballDiameter * 1.5f;
		float ballRightX = ball->distanceX + ballDiameter * 1.5f;

		float ballLeftAngle = atan2(ballLeftX, ball->distanceY);
		float ballRightAngle = atan2(ballRightX, ball->distanceY);

		//std::cout << "@ ball angle: " << ball->angle << ", left: " << ballLeftAngle << ", right: " << ballRightAngle << std::endl;

		if (
			Math::abs(ballLeftAngle) < ballInWayAngleThreshold
			|| Math::abs(ball->angle) < ballInWayAngleThreshold
			|| Math::abs(ballRightAngle) < ballInWayAngleThreshold
			|| (ballLeftAngle < -ballInWayAngleThreshold && ballRightAngle > ballInWayAngleThreshold)
		) {
			return true;
		}*/

		float ballInWayDistanceThreshold = Math::map(ball->getDribblerDistance(), 0.0f, 2.0f, ballDiameter * 3.0f, ballDiameter * 6.0f);

		// distance based
		if (Math::abs(ball->distanceX) < ballInWayDistanceThreshold / 2.0f) {
			isBallInWay = true;
			ballInWayCount++;

			if (closestBallInWayDistance == -1.0f || ball->distanceY < closestBallInWayDistance) {
				closestBallInWayDistance = ball->distanceY;
			}

			if (furthestBallInWayDistance == -1.0f || ball->distanceY > furthestBallInWayDistance) {
				furthestBallInWayDistance = ball->distanceY;
			}
		}
		
		// pixels based
		//checkWidth = ball->width * 2.5f;

		/*if (
			ball->x - checkWidth < halfWidth && ball->x + checkWidth > halfWidth
			&& ball->y - ball->height < startY && ball->y  + ball->height > goalY
		) {
			return true;
		}*/
	}

	return BallInWayMetric(isBallInWay, ballInWayCount, closestBallInWayDistance, furthestBallInWayDistance);
}

bool Vision::Results::isRobotOut(Dir dir) {
	if (dir == Dir::ANY) {
		return isRobotOut(Dir::FRONT) || isRobotOut(Dir::REAR);
	}

	ColorList colorOrder;

	if (dir == Dir::FRONT && front != NULL) {
		colorOrder = front->colorOrder;
	} else if (dir == Dir::REAR && rear != NULL) {
		colorOrder = rear->colorOrder;
	} else {
		return false;
	}

	/*
	if (dir == Dir::FRONT) {
		std::cout << "! Checking robot out:" << std::endl;

		for (int i = 0; i < (int)colorOrder.size(); i++) {
			std::cout << "  > color #" << i << ": " << colorOrder[i] << std::endl;
		}
	}
	*/

	for (int i = 0; i < (int)colorOrder.size(); i++) {
		if (colorOrder[i] != "black") {
			//std::cout << "  > didn't find black (" << colorOrder[i] << ")" << std::endl;

			continue;
		}

		// found black, search for black > white > green
		if ((int)colorOrder.size() < i + 3) {
			//std::cout << "  > not enough colors (" << colorOrder.size() << " at " << i << ")" << std::endl;

			return false;
		}

		if (colorOrder[i + 1] == "white" && colorOrder[i + 2] == "green") {
			//std::cout << "  > found white and green following!" << std::endl;

			return true;
		} else {
			//std::cout << "  > no out color" << std::endl;
		}
	}

	//std::cout << "  > not out" << std::endl;

	return false;
}

int Vision::Results::getVisibleBallCount() {
	return front->balls.size() + rear->balls.size();
}
