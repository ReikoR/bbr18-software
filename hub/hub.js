/**
 * @typedef {Object} TopicTarget
 * @property {string} address
 * @property {number} port
 */

/**
 * @typedef {Object} HubMessage
 * @property {string} type
 * @property {string} [topic]
 * @property {string[]} [topics]
 */

const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
/**
 * @type {Object.<string, TopicTarget[]>}
 */
let topicTargets = {};
const publicConf = require('./public-conf');

socket.on('error', (err) => {
    console.log(`socket error:\n${err.stack}`);
    socket.close();
});

socket.on('message', (message, rinfo) => {
    //console.log(`socket got: ${message} from ${rinfo.address}:${rinfo.port}`);

    const info = JSON.parse(message.toString());
    handleInfo(info, rinfo.address, rinfo.port);
});

socket.on('listening', () => {
    const address = socket.address();
    console.log(`socket listening ${address.address}:${address.port}`);
});

/**
 * @param {HubMessage} info
 * @param {string} address 
 * @param {number} port 
 */
function handleInfo(info, address, port) {
    let type = info.type;

    if (type === 'subscribe') {
        let topics = info.topics;
        let target = {address: address, port: port};

        if (isNonEmptyArray(topics)) {
            topics.forEach(function (topic) {
                /** @type {TopicTarget[]} */
                let targets = topicTargets[topic];

                if (Array.isArray(targets)) {
                    if (targets.length > 0) {
                        for (let i = 0; i < targets.length; i++) {
                            let existingTargetIndex = targets.findIndex(function (topicTarget) {
                                return topicTarget.address === address && topicTarget.port === port;
                            });

                            if (existingTargetIndex === -1) {
                                targets.push(target);
                            }
                        }
                    } else {
                        targets.push(target);
                    }

                } else {
                    topicTargets[topic] = [target];
                }
            });
        }

        console.log('topicTargets:', topicTargets);
    }

    else if (type === 'unsubscribe') {
        let topics = info.topics;

        (isNonEmptyArray(topics) ? topics : Object.keys(topicTargets)).forEach(function (topic) {
            /** @type {TopicTarget[]} */
            let targets = topicTargets[topic];

            if (Array.isArray(targets)) {
                for (let i = 0; i < targets.length;) {
                    if (targets[i].address === address && targets[i].port === port) {
                        targets.splice(i, 1);
                    } else {
                        i++;
                    }
                }
            }
        });

        console.log('topicTargets:', topicTargets);
    }

    else if (type === 'message') {
        let topic = info.topic;
        /** @type {TopicTarget[]} */
        let targets = topicTargets[topic];

        if (isNonEmptyArray(targets)) {
            for (let i = 0; i < targets.length; i++) {
                send(info, targets[i].address, targets[i].port);
            }
        }
    }
}

socket.bind(publicConf.port, () => {
    socket.setMulticastInterface('127.0.0.1');
});

function send(info, address, port) {
    const message = Buffer.from(JSON.stringify(info));
    console.log('send:', info, 'to', address, port);

    socket.send(message, port, address, (err) => {
        if (err) {
            console.error(err);
        }
    });
}

process.on('SIGINT', close);

process.on('message', (message) => {
    console.log('CHILD got message:', message);

    if (message.type === 'close') {
        close();
    }
});

function close() {
    console.log('closing');
    socket.close(function () {
        if (process.connected) {
            process.exit();
        }
    });
}

/**
 * @param {Array} array
 * @returns {boolean}
 */
function isNonEmptyArray(array) {
    return Array.isArray(array) && array.length > 0;
}

module.exports = {
    handleInfo,
    topicTargets,
    close
};