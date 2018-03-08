#ifndef XIMEA_TEST_COMM_H
#define XIMEA_TEST_COMM_H

#include <boost/asio.hpp>

using boost::asio::ip::udp;

class HubCom {
public:
    HubCom(std::string ipAddress, unsigned short port, unsigned short serverPort) :
            ipAddress(ipAddress),
            port(port),
            socket(ioService, udp::endpoint(boost::asio::ip::address::from_string(ipAddress), port)),
            serverEndpoint(udp::endpoint(boost::asio::ip::address::from_string(ipAddress), serverPort))
    {

    }

    void run();

    void send(char* data, std::size_t length);

private:
    std::string ipAddress;
    unsigned short port;
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
