//@ts-check
const WHO = {
    scenario: 0,
    light: 1, 
    automation: 2,
    load: 3,
    temperature: 4,
    alarm: 5,
    video_door: 7,
    gateway: 13,
    CEN: 25,
    sound_system: 16,
    sound_diffusion: 22,
    scene: 17,
    energy: 18
};

class OwnProtcol {


    static reGen = /^\*([0-9]+)\*([0-2])\*([0-9]+)##$/i;
    static reTemp = /^\*#4\*([0-9]+)\*0\*([0-9]+)##$/i;
    static getWhoType(who) {
        const whoInt = parseInt(who, 10);
        switch (whoInt) {
            case 0:
                return WHO.scenario;
            case 1:
                return WHO.light;
            case 2:
                return WHO.automation;
            case 3:
                return WHO.load;
            case 4:
                return WHO.temperature;
            case 5:
                return WHO.alarm;
            case 7:
                return WHO.video_door;
            case 13:
                return WHO.gateway;
            case 15:
            case 25:
                return WHO.CEN;
            case 16:
                return WHO.sound_system;
            case 22:
                return WHO.sound_diffusion;
            case 17:
                return WHO.scene;
            case 18:
                return WHO.energy;
            default:
                return null;
        }
    }
    static getStatus(who, state) {
        const whoInt = parseInt(who, 10);
        const stateInt = parseInt(state, 10);
        switch (whoInt) {
            case 1:
                // light
                switch (stateInt) {
                    case 0:
                        return false;
                    case 1:
                        return true;
                    default:
                        return null;
                }
            case 2:
                // automation
                return stateInt;
            case 4:
                // temperature
                return stateInt / 10;
            default:
                return null;
        }
    }
    static status(_type, _id, _status) {
        return { type: _type, id: parseInt(_id, 10), status: _status };
    }
    static parseStatus(data) {
        if (typeof data !== 'string')
            return {};
        if (OwnProtcol.reGen.test(data)) {
            const response = data.match(OwnProtcol.reGen);
            return OwnProtcol.status(OwnProtcol.getWhoType(response[1]), response[3], OwnProtcol.getStatus(response[1], response[2]));
        }
        else if (OwnProtcol.reTemp.test(data)) {
            const response = data.match(OwnProtcol.reTemp);
            return OwnProtcol.status(OwnProtcol.getWhoType('4'), response[1], OwnProtcol.getStatus('4', response[2]));
        }
        return {};
    }

    static parseWHO(packet) {
        const who_1 = /^\*(\d*)\*.+##$/;
        const who_2 = /^\*#(\d*)\*.+##$/;
        var extract;
        if (extract = packet.match(who_1)) {
            return OwnProtcol.getWhoType(extract[1]);
        }
        if (extract = packet.match(who_2)) {
            return OwnProtcol.getWhoType(extract[1]);
        }
        return null;
    }

    static parseWhere(packet) {
        const where_1 = /^\*\d*\*.+\*([\d#]+)##$/;
        const where_2 = /^\*#\d*\*([\d#]*)\*.+##$/;
        var extract;
        if (extract = packet.match(where_1)) {
            return OwnProtcol.getWhoType(extract[1]);
        }
        if (extract = packet.match(where_2)) {
            return extract[1];
        }
        return null;
    }

    static extractPacketInfo(packet){
        const info_1 = /^\*(\d*)\*.+\*([\d#]+)##$/;
        const info_2 = /^\*#(\d*)\*([\d#]*)\*.+##$/;
        var extract;
        if (extract = packet.match(info_1)) {
            return {who:OwnProtcol.getWhoType(extract[1]), where:extract[2]};
        }
        if (extract = packet.match(info_2)) {
            return {who:OwnProtcol.getWhoType(extract[1]), where:extract[2]};;
        }
        return {who:null, where:null};
    }


    static decodeTemperature(data) {
        var m = data.match(/(\d)(\d\d)(\d)/);
        var temperature = parseInt(m[2], 10) + (parseInt(m[3], 10) / 10);
        if (m[1] != '0') {
            temperature *= -1;
        }

        return temperature;
    };

    static encodeTemperature(data) {
        if (data >= 0) {
            return '0' + (data * 10).toFixed().toString();
        } else {
            return '1' + (data * -10).toFixed().toString();
        }
    };
}

exports.WHO = WHO;
exports.OwnProtcol = OwnProtcol;
