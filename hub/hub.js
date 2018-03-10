const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
let topicTargets = {};

socket.on('error', (err) => {
    console.log(`socket error:\n${err.stack}`);
socket.close();
});

socket.on('message', (message, rinfo) => {
    console.log(`socket got: ${message} from ${rinfo.address}:${rinfo.port}`);

    const info = JSON.parse(message.toString());
    handleInfo(info, rinfo.address, rinfo.port);
});

socket.on('listening', () => {
    const address = socket.address();
    console.log(`socket listening ${address.address}:${address.port}`);
});

function handleInfo(info, address, port) {
    let type = info.type;

    if (type === 'subscribe') {
        let topics = info.topics;
        let target = {address: address, port: port};

        topics.forEach(function (topic) {
            let targets = topicTargets[topic];
            if (Array.isArray(targets)) {
                for (let i = 0; i < targets.length; i++) {
                    let existingTargetIndex = targets.findIndex(function (topicTarget) {
                        return topicTarget.address === address && topicTarget.port === port
                    });

                    if (existingTargetIndex === -1) {
                        targets.append(target);
                    }
                }
            } else {
                topicTargets[topic] = [target];
            }
        });
        console.log('topicTargets:', topicTargets);
    }

    else if (type === 'unsubscribe') {
        let topics = info.topics;
        let isNonEmptyArray = Array.isArray(topics) && topics.length > 0;

        (isNonEmptyArray ? topics : Object.keys(topicTargets)).forEach(function (topic) {
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
        let targets = topicTargets[topic];

        if (Array.isArray(targets) && targets.length > 0) {
            for (let i = 0; i < targets.length; i++) {
                send(info, targets[i].address, targets[i].port);
            }
        }
    }
}

socket.bind(8091, () => {
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