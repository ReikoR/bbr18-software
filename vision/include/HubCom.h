#ifndef XIMEA_TEST_COMM_H
#define XIMEA_TEST_COMM_H

#include <boost/asio.hpp>

using boost::asio::ip::udp;

class HubCom {
public:
    HubCom(unsigned short port, std::string serverAddress, unsigned short serverPort) :
            port(port),
			serverAddress(serverAddress),
			socket(ioService, udp::endpoint(boost::asio::ip::address::from_string("127.0.0.1"), port)),
            serverEndpoint(udp::endpoint(boost::asio::ip::address::from_string(serverAddress), serverPort))
    {

    }

    void run();

    void send(char* data, std::size_t length);

private:
    unsigned short port;
	std::string serverAddress;
	boost::asio::io_service ioService;
    udp::socket socket;
    udp::endpoint serverEndpoint;
    enum {
        max_length = 1024
    };
    char data[max_length];

    void receive();
};

#endif //XIMEA_TEST_COMM_H
