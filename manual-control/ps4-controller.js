var EventEmitter = require('events').EventEmitter;
var util = require('util');
var HID = require('node-hid');

var vid = 10462;
var pid = 4418;
var commands = require('./commands.json');
var current;
var device;

var PREPROCESS_BASE = 0x08;
var PREPROCESS_RAW = 0x10;
var INPUT_MASK_ACCELERATION = 0x04;
var INPUT_MASK_ROTATION = 0x08;
var INPUT_MASK_ORIENTATION = 0x10;

//https://github.com/XanClic/g1/blob/master/include/steam_controller.hpp

let controllerStatusBinary = {
    0x04: 'idle',
    0x01: 'input',
    0x03: 'hotplug',
};

function PS4Controller() {

    PS4Controller.prototype.connect = function () {
        //device = new HID.HID(vid, pid);
		
		console.log("connecting to PS4 remote");

        //var devices = HID.devices();
        var ps4Devices = [];

        /*devices.forEach(function (device) {
            if (device.vendorId == 1356 && device.productId == 1476) {
                ps4Devices.push(device);
                console.log(device);
            }
        });*/
		
		findRemote(HID, ps4Devices, this);

        process.stdin.resume();//so the program will not close instantly

        function exitHandler(options, err) {
            if (options.cleanup) {
                if (device && typeof device.close === 'function') {
                    device.close();
                }
            }
            if (err) console.log(err.stack);
            //if (options.exit) process.exit();
        }

        //do something when app is closing
        process.on('exit', exitHandler.bind(null, {cleanup: true}));

        //catches ctrl+c event
        process.on('SIGINT', exitHandler.bind(null, {exit: true}));

        //catches uncaught exceptions
        process.on('uncaughtException', exitHandler.bind(null, {exit: true}));

    };
}

function findRemote(HID, ps4Devices, controller) {
    console.log("checking for controllers");
	
	var devices = HID.devices();
	
	devices.forEach(function (device) {
		if (device.vendorId == 1356 && device.productId == 1476) {
			ps4Devices.push(device);
			console.log(device);
		}
	});
	
	if (ps4Devices.length === 0)
		setTimeout( function(){findRemote(HID, ps4Devices, controller);}, 2000);
	else {

		device = new HID.HID(ps4Devices[0].path);

		var offset = 0;
		
		console.log(device);
		
		if (isBluetoothHID(ps4Devices[0])) {
			offset = 2;
			device.getFeatureReport(0x04, 66);
		}

		initEvents(controller, offset);

	}
}

function isBluetoothHID(descriptor) {
  return descriptor.path.match(/^Bluetooth/);
}

function parseDS4HIDData(buf) {
  var dPad = buf[5] & 15;
  return {
    leftAnalogX: buf[1],
    leftAnalogY: buf[2],
    rightAnalogX: buf[3],
    rightAnalogY: buf[4],
    l2Analog: buf[8],
    r2Analog: buf[9],

    dPadUp:    dPad === 0 || dPad === 1 || dPad === 7,
    dPadRight: dPad === 1 || dPad === 2 || dPad === 3,
    dPadDown:  dPad === 3 || dPad === 4 || dPad === 5,
    dPadLeft:  dPad === 5 || dPad === 6 || dPad === 7,

    cross: (buf[5] & 32) !== 0,
    circle: (buf[5] & 64) !== 0,
    square: (buf[5] & 16) !== 0,
    triangle: (buf[5] & 128) !== 0,

    l1: (buf[6] & 0x01) !== 0,
    l2: (buf[6] & 0x04) !== 0,
    r1: (buf[6] & 0x02) !== 0,
    r2: (buf[6] & 0x08) !== 0,
    l3: (buf[6] & 0x40) !== 0,
    r3: (buf[6] & 0x80) !== 0,

    share: (buf[6] & 0x10) !== 0,
    options: (buf[6] & 0x20) !== 0,
    trackPadButton: (buf[7] & 2) !== 0,
    psButton: (buf[7] & 1) !== 0,

    // ACCEL/GYRO
    motionY: buf.readInt16LE(13),
    motionX: -buf.readInt16LE(15),
    motionZ: -buf.readInt16LE(17),

    orientationRoll: -buf.readInt16LE(19),
    orientationYaw: buf.readInt16LE(21),
    orientationPitch: buf.readInt16LE(23),

    // TRACKPAD
    trackPadTouch0Id: buf[35] & 0x7f,
    trackPadTouch0Active: (buf[35] >> 7) === 0,
    trackPadTouch0X: ((buf[37] & 0x0f) << 8) | buf[36],
    trackPadTouch0Y: buf[38] << 4 | ((buf[37] & 0xf0) >> 4),

    trackPadTouch1Id: buf[39] & 0x7f,
    trackPadTouch1Active: (buf[39] >> 7) === 0,
    trackPadTouch1X: ((buf[41] & 0x0f) << 8) | buf[40],
    trackPadTouch1Y: buf[42] << 4 | ((buf[41] & 0xf0) >> 4),

    timestamp: buf[7] >> 2,
    //battery: buf[12],
    //batteryShort1: buf[12] & 0x0f,
    //batteryShort2: buf[12] & 0xf0,
    batteryLevel: buf[12]
  };
}

function initEvents(controller, offset) {
    device.on("data", function (data) {
		
		var buttonData = parseDS4HIDData(data.slice(offset));

        controller.emit('data', buttonData);
    });
	
	device.on("error", function(error){
		controller.emit('error', error);
	})

}

util.inherits(PS4Controller, EventEmitter);

exports.PS4Controller = PS4Controller;