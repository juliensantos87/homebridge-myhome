# homebridge-myhome
Homebridge plugin for Legrand MyHome

# Install
     npm install -g homebridge-myhome

Configuration example:
Find ids in your configuration or in debug by switching lights.

    "platforms": [
        {
            "platform": "MyHome",
            "name": "MyHome",
            "host": "192.168.1.xx",
            "password": "12345",
            "lights": [12, 13, 14],
            "blinds": [{"id": 11, "time": 15}, {"id": 21, "time": 28}, {"id": 61, "time": 23}]
        }
    ],
