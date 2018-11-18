const dgram = require('dgram');
const EventEmitter = require('events');

class HubCom extends EventEmitter {
    constructor(port, hubIpAddress, hubPort, beforeClose) {
        super();

        this.socket = dgram.createSocket('udp4');
        this.port = port;
        this.hubIpAddress = hubIpAddress;
        this.hubPort = hubPort;
        this.beforeClose = beforeClose;

        this.setup();
    }

    setup() {
        process.on('SIGINT', this.close.bind(this));

        process.on('message', (message) => {
            console.log('CHILD got message:', message);

            if (message.type === 'close') {
                this.close();
            }
        });

        this.socket.on('error', (err) => {
            console.log(`socketPublisher error:\n${err.stack}`);
            this.socket.close();
        });

        this.socket.on('message', (message, rinfo) => {
            //console.log(`socket got: ${message} from ${rinfo.address}:${rinfo.port}`);

            const info = JSON.parse(message.toString());
            this.emit('info', info);
        });

        this.socket.on('listening', () => {
            const address = this.socket.address();
            console.log(`socket listening ${address.address}:${address.port}`);
        });

        this.socket.bind(this.port, () => {
            this.socket.setMulticastInterface('127.0.0.1');
        });
    }

    close() {
        console.log('closing');

        if (typeof this.beforeClose === 'function') {
            this.beforeClose();
        }

        this.send({type: 'unsubscribe'}, () => {
            this.socket.close();
            process.exit();
        });
    }

    send(info, onSent) {
        //console.log('sendToHub', info);

        const message = Buffer.from(JSON.stringify(info));

        this.socket.send(message, this.hubPort, this.hubIpAddress, (err) => {
            if (err) {
                console.error(err);
            }

            if (typeof onSent === 'function') {
                onSent(err);
            }
        });
    }
}

module.exports = HubCom;