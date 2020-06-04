//@ts-check
var OwnProtcol = require('./OwnProtcol.js');

class OwnAccessory {
    constructor(platform, config) {
        this.log = platform.getLog();
        this.controler = platform.getControler();
        this.Service = platform.getService();
        this.Characteristic = platform.getCharacteristic();

        // device info
        this.name = config.name;
        this.id = config.id;

        this.informationService = new this.Service.AccessoryInformation();

        this.informationService
            .setCharacteristic(this.Characteristic.Manufacturer, "MyHome Assistant")
            .setCharacteristic(this.Characteristic.Model, "Accessory")
            .setCharacteristic(this.Characteristic.SerialNumber, "xxx");
    }

    getServices() {
        return [this.informationService];
    }

    updateStatus() {
        this.log.info("[" + this.id + "] Accessory updateStatus ");
    }

    onData(packet) {
        this.log.error(" OwnAccessory.OnData ", packet);
    }

    checkWhere(where) {
        const id = parseInt(where, 10);
        return this.id == id;
    }
}

class OwnLightAccessory extends OwnAccessory {
    constructor(platform, config) {
        if (!config.name) {
            config.name = 'lumiere-' + config.id;
        }
        super(platform, config)

        this.value = false;

        this.lightbulbService = new this.Service.Lightbulb();

        this.informationService
            .setCharacteristic(this.Characteristic.Model, "Light");

        this.lightbulbService
            .getCharacteristic(this.Characteristic.On)
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));
    }

    getServices() {
        return [this.informationService, this.lightbulbService];
    }

    setPowerState(value, callback) {
        if (value) {
            this.log.info("[" + this.id + "] Setting power state to on");
            this.controler.sendCommand({ command: '*1*1*' + this.id + '##', log: this.log });
        } else {
            this.log.info("[" + this.id + "] Setting power state to off");
            this.controler.sendCommand({ command: '*1*0*' + this.id + '##', log: this.log });
        }
        callback(null);
    }

    getPowerState(callback) {
        this.log.info("[" + this.id + "] Fetching power state :" + this.value);
        this.controler.sendCommand({ command: '*#1*' + this.id + '##', log: this.log });
        callback(null, this.value);
    }

    updateStatus() {
        this.log.info("[" + this.id + "] Ligth updateStatus ");
        this.controler.sendCommand({ command: '*#1*' + this.id + '##', log: this.log });
    }

    onData(packet) {
        var extract = packet.match(/^\*1\*(\d+)\*\d+##$/);
        if (extract) {
            this.log.debug("id:%s onLigth(%s) ", this.id, packet);
            if (extract[1] == '0') {
                this.log.info("[" + this.id + "] power off");
                this.value = false;
            } else {
                this.log.info("[" + this.id + "] power on");
                this.value = true;
            }
            this.lightbulbService.getCharacteristic(this.Characteristic.On).updateValue(this.value);
        } else {
            this.log.error("[%s] Ligth Unknow packet:%s", this.id, packet);
        }
    }
}


class OwnBlindAccessory extends OwnAccessory {
    constructor(platform, config) {
        if (!config.name) {
            config.name = 'store-' + config.id;
        }
        super(platform, config);

        this.time = config.time;

        this.state = this.Characteristic.PositionState.STOPPED;
        this.runningDirection = this.Characteristic.PositionState.STOPPED;
        this.position = null;
        this.target = 0;

        this.moveTrakingTimeout = null;
        this.packetTimeout = null;
        this.positionTimeout = null;

        this.informationService
            .setCharacteristic(this.Characteristic.Model, "WindowCovering");

        this.windowCoveringService = new this.Service.WindowCovering();
        this.windowCoveringService
            .getCharacteristic(this.Characteristic.CurrentPosition)
            .on('get', this.getPosition.bind(this));

        this.windowCoveringService
            .getCharacteristic(this.Characteristic.TargetPosition)
            .on('get', this.getTarget.bind(this))
            .on('set', this.setTarget.bind(this));

        this.windowCoveringService
            .getCharacteristic(this.Characteristic.PositionState)
            .on('get', this.getState.bind(this));

        this.windowCoveringService
            .getCharacteristic(this.Characteristic.HoldPosition)
            .on('set', this.setHoldPosition.bind(this));
    }

    getServices() {
        return [this.informationService, this.windowCoveringService];
    }

    getPosition(callback) {
        this.log.info("[" + this.id + "] Blind fetching position :" + this.position);
        callback(null, this.position);
    }

    setHoldPosition(hold, callback) {
        this.log.info("[" + this.id + "] Blind hold position  :" + hold);
        this.stopMoveTraking();
        this.target = this.position;
        this.move();
        callback(null);
    }

    setTarget(target, callback) {
        this.log.info("[" + this.id + "] Blind setting Target :" + target);
        this.stopMoveTraking();
        this.target = target;
        this.move();
        callback(null);
    }

    getTarget(callback) {
        this.log.info("[" + this.id + "] Blind fetching target :" + this.target);
        callback(null, this.target);
    }

    getState(callback) {
        this.log.info("[" + this.id + "] Blind fetching State :" + this.state);
        callback(null, this.state);
    }

    updateStatus() {
        this.log.info("[" + this.id + "] Blind updateStatus ");
        if (this.position == null ) {
            this.controler.sendCommand({ command: '*2*2*' + this.id + '##', log: this.log });
            this.position = 0;
            this.target = 0;    
        }
    }

    startTimerCommand() {
        clearTimeout(this.packetTimeout);
        this.packetTimeout = setTimeout(function () { clearTimeout(this.packetTimeout); this.packetTimeout = null; }.bind(this), 2000);
    }

    endTimercommand() {
        clearTimeout(this.packetTimeout);
        this.packetTimeout = null;
    }

    commandisPending() {
        return this.packetTimeout != null;
    }

    moveStop() {
        this.log.info("[" + this.id + "] Blind send moving stop");
        this.runningDirection = this.Characteristic.PositionState.STOPPED;
        this.controler.sendCommand({ command: '*2*0*' + this.id + '##', log: this.log });
        this.startTimerCommand();
    }

    moveUp() {
        this.log.info("[" + this.id + "] Blind send moving up");
        this.runningDirection = this.Characteristic.PositionState.INCREASING;
        this.controler.sendCommand({ command: '*2*1*' + this.id + '##', log: this.log });
        this.startTimerCommand();
    }

    moveDown() {
        this.log.info("[" + this.id + "] Blind send moving down");
        this.runningDirection = this.Characteristic.PositionState.DECREASING;
        this.controler.sendCommand({ command: '*2*2*' + this.id + '##', log: this.log });
        this.startTimerCommand();
    }

    onData(packet) {
        var extract = packet.match(/^\*2\*(\d+)\*\d+##$/);
        if (extract) {
            this.log.debug("id:%s onBlind(%s) ", this.id, packet);
            var direction = extract[1];
            if (direction == '0' ) {
                this.state = this.Characteristic.PositionState.STOPPED;
            } else if (direction == '1') {
                this.state = this.Characteristic.PositionState.INCREASING;
            } else if (direction == '2') {
                this.state = this.Characteristic.PositionState.DECREASING;
            }
            this.windowCoveringService.getCharacteristic(this.Characteristic.PositionState).updateValue(this.state);
            this.log.info("[" + this.id + "] change  dir : " + direction + " pos:" + this.position + " tag:" + this.target);

            if (this.runningDirection == this.state) {
                this.endTimercommand();
            }

            this.evaluatePosition();
        } else {
            this.log.error("[%s] Blind Unknow packet:%s", this.id, packet);
        }
    }

    evaluatePosition() {
        clearTimeout(this.positionTimeout);
        if (this.state == this.Characteristic.PositionState.STOPPED) {
            this.log.info("[" + this.id + "] Blind is STOPPED    pos:" + this.position + " tag:" + this.target);
        } else if (this.state == this.Characteristic.PositionState.INCREASING) {
            if (this.position < 100) {
                this.position++;
                this.startPositionTraking();
            }
            this.log.info("[" + this.id + "] Blind is moving UP  pos:" + this.position + " tag:" + this.target);
        } else if (this.state == this.Characteristic.PositionState.DECREASING) {
            if (this.position > 0) {
                this.position--;
                this.startPositionTraking();
            }
            this.log.info("[" + this.id + "] Blind is moving DOWN pos:" + this.position + " tag:" + this.target);
        }
        this.windowCoveringService.getCharacteristic(this.Characteristic.CurrentPosition).updateValue(this.position);
    }

    startPositionTraking() {
        clearTimeout(this.positionTimeout);
        this.positionTimeout = setTimeout(this.evaluatePosition.bind(this), (this.time / 100 ) * 1000);
    }

    move() {
        if (this.commandisPending()) { // check if a command is pending  
            this.log.info("[" + this.id + "] Blind command is still pending : wait for action");
        } else {
            if (this.target < this.position) {
                var offset = Math.abs(this.target - this.position);
                if (this.state != this.Characteristic.PositionState.DECREASING && offset > 5) {
                    this.moveDown();
                }
            } else if (this.target > this.position) {
                var offset = Math.abs(this.target - this.position);
                if (this.state != this.Characteristic.PositionState.INCREASING && offset > 5) {
                    this.moveUp();
                }
            } else {
                if (this.state != this.Characteristic.PositionState.STOPPED) {
                    this.moveStop();
                }
                this.log.info("[" + this.id + "] Blind position is good : stop moving " + this.position + " tag:" + this.target);
                return;
            }
        }

        this.startMoveTraking();
    }

    startMoveTraking() {
        clearTimeout(this.moveTrakingTimeout);
        // recheck postion in 500 ms
        this.moveTrakingTimeout = setTimeout(this.move.bind(this), 500);
    }

    stopMoveTraking() {
        clearTimeout(this.moveTrakingTimeout);
        this.moveTrakingTimeout = null;
    }

}

class OwnThermostatAccessory extends OwnAccessory {

    constructor(platform, config) {
        if (!config.name) {
            config.name = 'thermostat-' + config.id;
        }
        super(platform, config);

        // device info
        this.zone = config.zone;
        this.address = '#0#' + this.zone;

        this.temperature = 0;
        this.targetTemperature = 0;
        this.localOffset = 0;
        this.heatingCoolingState = this.Characteristic.CurrentHeatingCoolingState.OFF;
        this.targetheatingCoolingState = this.Characteristic.CurrentHeatingCoolingState.OFF;
        this.displayUnits = this.Characteristic.TemperatureDisplayUnits.CELSIUS;

        this.informationService
            .setCharacteristic(this.Characteristic.Model, "Thermostat");

        this.thermostatService = new this.Service.Thermostat();
        this.thermostatService
            .getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
            .on('get', this.getHeatingCoolingState.bind(this));

        this.thermostatService
            .getCharacteristic(this.Characteristic.TargetHeatingCoolingState)
            .on('get', this.getTargetHeatingCoolingState.bind(this))
            .on('set', this.setTargetHeatingCoolingState.bind(this));

        this.thermostatService
            .getCharacteristic(this.Characteristic.CurrentTemperature)
            .setProps({ minValue: -50, minStep: 0.1, maxValue: 50 })
            .on('get', this.getCurrentTemperature.bind(this));

        this.thermostatService
            .getCharacteristic(this.Characteristic.TargetTemperature)
            .on('get', this.getTargetTemperature.bind(this))
            .setProps({ minValue: -50, minStep: 0.1, maxValue: 50 })
            .on('set', this.setTargetTemperature.bind(this));

        this.thermostatService
            .getCharacteristic(this.Characteristic.TemperatureDisplayUnits)
            .on('get', this.getDisplayUnits.bind(this))
            .on('set', this.setDisplayUnits.bind(this));
    }

    getServices() {
        return [this.informationService, this.thermostatService];
    }

    updateStatus() {
        this.log.info("[" + this.id + "] Thermostat updateStatus ");
        this.controler.sendCommand({ command: '*#4*' + this.address + '##', log: this.log });
        this.controler.sendCommand({ command: '*#4*' + this.id + '##', log: this.log });
    }

    checkWhere(where) {
        return this.address == where || super.checkWhere(where);
    }


    updateCharacteristicCurrentTemperature(temperature) {
        this.log.info("[" + this.id + "] update CurrentTemperature (" + temperature + ")");
        this.temperature = temperature;
        this.thermostatService.getCharacteristic(this.Characteristic.CurrentTemperature).updateValue(this.temperature);
    }

    updateCharacteristicTargetTemperature(temperature) {
        this.log.info("[" + this.id + "] update TargetTemperature (" + temperature + ")");
        this.targetTemperature = temperature;
        this.thermostatService.getCharacteristic(this.Characteristic.TargetTemperature).updateValue(this.targetTemperature);
    }

    updateCharacteristicTargetheatingCoolingState(state) {
        this.log.info("[" + this.id + "] update TargetheatingCoolingState (" + state + ")");
        this.targetheatingCoolingState = state;
        this.thermostatService.getCharacteristic(this.Characteristic.TargetHeatingCoolingState).updateValue(this.targetheatingCoolingState);
    }

    updateCharacteristicCurrentHeatingCoolingState(state) {
        this.log.info("[" + this.id + "] update CurrentHeatingCoolingState (" + state + ")");
        this.heatingCoolingState = state;
        this.thermostatService.getCharacteristic(this.Characteristic.CurrentHeatingCoolingState).updateValue(this.heatingCoolingState);
    }

    onData(packet) {
        var extract;
        if (extract = packet.match(/^\*#4\*\d+\*0\*(\d+)##$/)) { // temperature not adjust by local offset
            this.updateCharacteristicCurrentTemperature(OwnProtcol.OwnProtcol.decodeTemperature(extract[1]));
        }
        else if (extract = packet.match(/^\*#4\*\d+\*12\*(\d+)\*3##$/)) { // target temperature with adjust by local offset
            this.temperature = OwnProtcol.OwnProtcol.decodeTemperature(extract[1]);
            this.log.debug("[" + this.id + "] zone[" + this.zone + "] target temperature with adjust by local offset (" + this.temperature + ")");
        }
        else if (extract = packet.match(/^\*#4\*\d+\*13\*(\d+)##$/)) { // Zone local offset
            var status = 'Local ON';
            var value = extract[1];
            if (value == '00')
                this.localOffset = 0;
            else if (value == '01')
                this.localOffset = 1;
            else if (value == '11')
                this.localOffset = -1;
            else if (value == '02')
                this.localOffset = +2;
            else if (value == '12')
                this.localOffset = -2;
            else if (value == '03')
                this.localOffset = 3;
            else if (value == '13')
                this.localOffset = -3;
            else if (value == '4') {
                this.localOffset = 0;
                status = 'Local OFF';
            }
            else if (value == '5') {
                this.localOffset = 0;
                status = 'Local protection';
            }
            this.log.debug("[%s] zone[%s] local offset:%s (%s)", this.id, this.zone, this.localOffset, status);
        }       
        else if (extract = packet.match(/^\*#4\*\d+\*14\*(\d+)\*3##$/)) { // Target Temperature
            this.updateCharacteristicTargetTemperature(OwnProtcol.OwnProtcol.decodeTemperature(extract[1]));
        }       
        else if (extract = packet.match(/^\*#4\*\d+\*19\*(\d)\*(\d)##$/)) {  // Valves status
            var CV = extract[1];
            var HV = extract[2];
            
            if (['1', '2'].includes(CV)) {
                this.log.debug("[" + this.id + "] zone[" + this.zone + "] cooling ON");
                this.updateCharacteristicCurrentHeatingCoolingState(this.Characteristic.CurrentHeatingCoolingState.COOL);
            } else {
                this.log.debug("[" + this.id + "] zone[" + this.zone + "] cooling OFF");
            }
            if (['1', '2'].includes(HV)) {
                this.log.debug("[" + this.id + "] zone[" + this.zone + "] heating ON");
                this.updateCharacteristicCurrentHeatingCoolingState(this.Characteristic.CurrentHeatingCoolingState.HEAT);
            } else if ( this.heatingCoolingState != this.Characteristic.CurrentHeatingCoolingState.COOL) {
                this.log.debug("[" + this.id + "] zone[" + this.zone + "] heating OFF");
                this.updateCharacteristicCurrentHeatingCoolingState(this.Characteristic.CurrentHeatingCoolingState.OFF);
            }
            
        }
        else if (extract = packet.match(/^\*#4\*\d+#\d+\*20\*(\d+)##$/)) {  // Actuator status
            var status;
            var value = extract[1];
            if (value == '0')
                status = 'OFF';
            else if (value == '1')
                status = 'ON';
            else if (value == '4')
                status = 'STOP';
            else
                status = 'not decoded :' + value;

            this.log.debug("[" + this.id + "] zone[" + this.zone + "] actuator status (" + status + ")");

            // Ask valve status
            this.controler.sendCommand({ command: '*#4*' + this.id + '*19##', log: this.log });
        }
        //  Zone operation mode
        else if (extract = packet.match(/^\*4\*(\d+)\*\d+##$/)) {
            var status;
            var value = extract[1];
            if (value == '0') {
                status = 'Conditioning';
             }
            else if (value == '1') {
                status = 'Heating';
            }
            else if (value == '102') {
                status = 'Antifreeze';
                
            }
            else if (value == '202') {
                status = 'Thermal Protection';
            }
            else if (value == '303') {
                status = 'Generic OFF';
            }
            else {
                this.log.error("[%s] zone[%s] operation mode (%s)", this.id , this.zone, value );
            }
            this.log.debug("[" + this.id + "] zone[" + this.zone + "] operation mode (" + status + ")");

        } else if (extract = packet.match(/^\*4\*(\d+)\*#\d#\d##$/)) { // Central unit operating mode ( with no param)
            var value = parseInt(extract[1], 10);
            if (value == 103) {
                this.updateCharacteristicTargetheatingCoolingState(this.Characteristic.TargetHeatingCoolingState.OFF);
                this.log.debug("[%s] zone[%s] operation mode Heating OFF", this.id , this.zone);
            }
            else if (value == 102) {
                this.updateCharacteristicTargetheatingCoolingState(this.Characteristic.TargetHeatingCoolingState.OFF);
                this.log.debug("[%s] zone[%s] operation mode Anti Freeze", this.id , this.zone);
            }
            else if (value == 1101 || value == 1102 || value == 1103) {
                this.updateCharacteristicTargetheatingCoolingState(this.Characteristic.TargetHeatingCoolingState.AUTO);
                this.log.debug("[%s] zone[%s] operation mode Heating program", this.id , this.zone);
            }
            else if (value > 13000 && value < 13255 ) {
                var days = value - 13000;
                this.updateCharacteristicTargetheatingCoolingState(this.Characteristic.TargetHeatingCoolingState.AUTO);
                this.log.debug("[%s] zone[%s] operation mode Holiday program for %s day", this.id , this.zone, days);
            }
            else if (value == 21) {
                this.log.debug("[%s] zone[%s] Remote control enabled", this.id , this.zone);
            }
            else {
                this.log.error("[%s] zone[%s] unknow value (%i)", this.id , this.zone, value, packet );
            }
        }
        else if (extract = packet.match(/^\*4\*(\d+)#(\d+)\*#\d#\d##$/)) { // Central unit operating mode ( with param)
            var value = extract[1];
            var param = extract[2];
            if (value == '110') {
                var temp = OwnProtcol.OwnProtcol.decodeTemperature(extract[2]);
                this.log.debug("[%s] zone[%s] operation mode Manual Heating (%s)", this.id , this.zone,temp);
                this.updateCharacteristicTargetheatingCoolingState(this.Characteristic.TargetHeatingCoolingState.HEAT);
                this.updateCharacteristicTargetTemperature(temp);
            }
        }
        else {
            this.log.error("[%s] zone[%s] unkonow packet:", this.id, this.zone, packet);
        }
    }

    getHeatingCoolingState(callback) {
        this.log.info("[" + this.id + "] zone[" + this.zone + "] getHeatingCoolingState :" + this.heatingCoolingState);
        this.controler.sendCommand({ command: '*#4*' + this.zone + '*19##', log: this.log });
        callback(null, this.heatingCoolingState);
    }

    getTargetHeatingCoolingState(callback) {
        this.log.info("[" + this.id + "] zone[" + this.zone + "] getTargetHeatingCoolingState :" + this.targetheatingCoolingState);
        this.controler.sendCommand({ command: '*#4*' + this.id + '##', log: this.log });
        callback(null, this.targetheatingCoolingState);
    }

    setTargetHeatingCoolingState(value, callback) {
        this.log.info("[" + this.id + "] zone[" + this.zone + "] setTargetHeatingCoolingState :" + value);
        switch (value) {
            case this.Characteristic.TargetHeatingCoolingState.HEAT:
                // send  Manual setting of zone N to temperature T
                var temperature = OwnProtcol.OwnProtcol.encodeTemperature(this.targetTemperature);
                this.log.error("send Heat Manual at ",temperature);
                this.controler.sendCommand({ command: '*#4*' + this.address + '*#14*' + temperature + '*1##', log: this.log });
                break;

            case this.Characteristic.TargetHeatingCoolingState.OFF:
                // Set N zone in off mode ( heating mode (103) or generic mode (303))
                this.controler.sendCommand({ command: '*4*103*' + this.address + '##', log: this.log });
                this.log.error("send STOP ");
                break;

            case this.Characteristic.TargetHeatingCoolingState.AUTO:
                // Last set up weekly program activation
                this.controler.sendCommand({ command: '*4*3100*' + this.address + '##', log: this.log });
                this.log.error("send AUTO");
                break;

            case this.Characteristic.TargetHeatingCoolingState.COOL:

        }
        callback(null);
    }

    getCurrentTemperature(callback) {
        this.log.info("[" + this.id + "] zone[" + this.zone + "] getCurrentTemperature :" + this.temperature);
        this.controler.sendCommand({ command: '*#4*' + this.zone + '*0##', log: this.log });
        callback(null, this.temperature);
    }

    getTargetTemperature(callback) {
        this.log.info("[" + this.id + "] zone[" + this.zone + "] getTargetTemperature :" + this.targetTemperature);
        this.controler.sendCommand({ command: '*#4*' + this.zone + '*14##', log: this.log });
        callback(null, this.targetTemperature);
    }

    setTargetTemperature(value, callback) {
        this.log.info("[" + this.id + "] zone[" + this.zone + "] setTargetTemperature :" + value);
        if ( this.targetheatingCoolingState ==  this.Characteristic.TargetHeatingCoolingState.HEAT ) {
            var temperature = OwnProtcol.OwnProtcol.encodeTemperature(value);

	        // send  Manual setting of zone N to temperature T
            this.controler.sendCommand({ command: '*#4*' + this.address + '*#14*' + temperature + '*1##', log: this.log });
            callback(null);
        } else {
            this.log.error(" Can't chnange target temperature with mode (%s)",this.targetheatingCoolingState );
            callback('Error');
        }

    }

    getDisplayUnits(callback) {
        this.log.info("[" + this.id + "] zone[" + this.zone + "] getDisplayUnits :" + this.displayUnits);
        callback(null, this.displayUnits);
    }

    setDisplayUnits(value, callback) {
        this.log.info("[" + this.id + "] zone[" + this.zone + "] setDisplayUnits :" + value);
        this.displayUnits = value;
        callback(null);
    }
}

exports.OwnLightAccessory = OwnLightAccessory;
exports.OwnBlindAccessory = OwnBlindAccessory;
exports.OwnThermostatAccessory = OwnThermostatAccessory;