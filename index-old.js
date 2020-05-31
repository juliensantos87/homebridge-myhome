'use strict';

var request = require('request');
var Service, Characteristic;

var myhome = require('./lib/myhome');

function decodeTemperature( data ) {
    var m = data.match(/(\d)(\d\d)(\d)/);
    var temperature = parseInt(m[2], 10)+ (parseInt(m[3], 10)/10);
    if ( m[1] !=  '0' )  {
       temperature *= -1;
    }
 
  return temperature;
};

function encodeTemperature( data ) {
  if ( data >= 0 ) {
     return '0'+(data * 10).toFixed().toString();
  } else {
     return '1'+(data * -10).toFixed().toString();
  }
};

function inArray(needle, haystack) {
    var length = haystack.length;
    for(var i = 0; i < length; i++) {
        if(haystack[i] == needle)
            return true;
    }
    return false;
};

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerPlatform("homebridge-myhome", "MyHome", MyHomePlatform);
};

function MyHomePlatform(log, config){
  this.logCmd = true;
  // auth info
  this.host = config["host"];
  this.password =config["password"];

  this.lights = config["lights"];
  this.blinds = config["blinds"];
  this.thermostats = config["thermostats"];

  this.log = log;

  this.mhengine = new myhome.engine({host: this.host,log:this.logCmd});

  this.foundAccessories = [];

  this.monitorTimeout = null;

  // check change
  this.mhengine.on ('packet', function (data) {
    var result = data.split('*');
    var extract;

    // Light 
    if (extract = data.match(/^\*1\*(\d+)\*(\d+)##$/)) {
      var id = extract[2];
      for (var accessory of this.foundAccessories) {
        if ( accessory.id == id && typeof(accessory.onLigth) == 'function') {
          accessory.onLigth(id, extract[1]);
        }
      }
    } 
   // Blind 
    else if (extract = data.match(/^\*2\*(\d+)\*(\d+)##$/)) {
      var id = extract[2];
      for (var accessory of this.foundAccessories) {
        if ( accessory.id == id && typeof(accessory.onBlind) == 'function') {
          accessory.onBlind(id, extract[1]);
        }
      }
    } 
    // Ambient temperature 
    else if (extract = data.match(/^\*#4\*(\d+)\*0\*(\d+)##$/)) {
    	var id = extract[1];
    	for (var accessory of this.foundAccessories) {
    		if ( accessory.id == id && typeof(accessory.onThermostatEvent) == 'function') {
				  accessory.onThermostatEvent(id,'temperature',decodeTemperature(extract[2]));
  			}
      }
    }
    // Zone operation temperature with adjust by local offset
    else if (extract = data.match(/^\*#4\*(\d+)\*12\*(\d+)\*3##$/)) {
      var id = extract[1];
      for (var accessory of this.foundAccessories) {
        if ( accessory.id == id && typeof(accessory.onThermostatEvent) == 'function') {
          accessory.onThermostatEvent(id,'targetTemperature',decodeTemperature(extract[2]));
        }
      }
    } 
    // Zone local offset
    else if (extract = data.match(/^\*#4\*(\d+)\*13\*(\d+)##$/)) {
      var id = extract[1];
      for (var accessory of this.foundAccessories) {
        if ( accessory.id == id && typeof(accessory.onThermostatEvent) == 'function') {
          accessory.onThermostatEvent(id,'localOffset',extract[2]);
        }
      }
    } 
    // Setpoint temperature
    else if (extract = data.match(/^\*#4\*(\d+)\*14\*(\d+)\*(\d+)##$/)) {
      var id = extract[1];
      for (var accessory of this.foundAccessories) {
        if ( accessory.id == id && typeof(accessory.onThermostatEvent) == 'function') {
          accessory.onThermostatEvent(id,'targetTemperature',decodeTemperature(extract[2]));
        }
      }
    }
    // Valves status
    else if (extract = data.match(/^\*#4\*(\d+)\*19\*(\d)\*(\d)##$/) ) {
      var id = extract[1];
      for (var accessory of this.foundAccessories) {
        if ( accessory.id == id && typeof(accessory.onThermostatEvent) == 'function') {
          accessory.onThermostatEvent(id,'cooling',extract[2]);
          accessory.onThermostatEvent(id,'heating',extract[3]);
        }
      }
    } 
    // Actuator status
    else if (extract = data.match(/^\*#4\*(\d+)#(\d+)\*20\*(\d+)##$/)) {
      var id = extract[1];
      for (var accessory of this.foundAccessories) {
        if ( accessory.id == id && typeof(accessory.onThermostatEvent) == 'function') {
          accessory.onThermostatEvent(id,'actuatorStatus',extract[3]);
        }
      }
    }
    //  Zone operation mode
    else if (extract = data.match(/^\*4\*(\d+)\*(\d+)##$/)) {
      var id = extract[1];
      for (var accessory of this.foundAccessories) {
        if ( accessory.id == id && typeof(accessory.onThermostatEvent) == 'function') {
          accessory.onThermostatEvent(id,'operationMode',extract[2]);
        }
      }
    }
 
    // gateway event 
    else if (result[1] == '#13') {
      clearTimeout(this.monitorTimeout)
      // retart monitor  if not event is comming since 1 min  
      this.monitorTimeout = setTimeout(function(){this.restartMonitorConnection();}.bind(this),120000/*2 min*/);
   }
  }.bind(this)
  );

   setInterval(function(){ this.checkMonitor(); }.bind(this), 30 * 1000);
}

MyHomePlatform.prototype = {
	checkMonitor: function() {
		this.mhengine.sendCommand({command: '*#13**15##',log:this.logCmd});
    },
	  restartMonitorConnection: function() {
	  this.log("monitor connexion is dead, restart it" );
      this.mhengine.startMonitor();
      this.updateAccessoriesStatus();
      clearTimeout(this.monitorTimeout);
      this.monitorTimeout = setTimeout(function(){this.restartMonitorConnection();}.bind(this),120000/*2 min*/);
    },
    updateAccessoriesStatus: function() {
      this.log("Fetching accessories status" );
      for (var accessory of this.foundAccessories) {     
        accessory.updateStatus(); 
      }
    },
    accessories: function(callback) {
        this.log("Fetching MyHome devices.");

        for (var i = this.lights.length - 1; i >= 0; i--) {
          this.foundAccessories.push(new MyHomeLightAccessory(this.log, this.mhengine, this.lights[i]));
        }

        for (var i = this.blinds.length - 1; i >= 0; i--) {
          this.foundAccessories.push(new MyHomeBlindAccessory(this.log, this.mhengine, this.blinds[i]));
        }

        for (var i = this.thermostats.length - 1; i >= 0; i--) {
          this.foundAccessories.push(new MyHomeThermostatAccessory(this.log, this.mhengine, this.thermostats[i]));
        }

        callback(this.foundAccessories);
        this.updateAccessoriesStatus();
    }
};
function MyHomeThermostatAccessory(log, mhengine, thermostat) {
  this.logCmd = false;
  this.log = log;
  this.mhengine = mhengine;

  // device info
  this.id = thermostat.id;
  this.zone = thermostat.zone;
  if ( thermostat.hasOwnProperty("name") ) {
      this.name = thermostat.name;
  } else {
      this.name = 'thermostat-' + thermostat.id;
  }

  this.temperature = 0;
  this.targetTemperature = 0;
  this.heatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
  this.targetheatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
  this.displayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;
}

MyHomeThermostatAccessory.prototype = {
  updateStatus: function () {
    this.log("["+this.id+"] updateStatus ");
    this.mhengine.sendCommand({command: '*#4*' + this.id + '##',log:this.logCmd});
  },
  onThermostatEvent: function(id,event,value){
  	if (event =='temperature') {
  		this.temperature = value;
  		this.log("["+this.id+"] zone["+this.zone+"] temperature (" + this.temperature + ")" );	
      this.thermostatService.getCharacteristic(Characteristic.CurrentTemperature).updateValue(this.temperature);
    }
  	else if (event =='targetTemperature') {
  		this.targetTemperature = value;
  		this.log("["+this.id+"] zone["+this.zone+"] target temperature (" + this.targetTemperature+ ")" );	
      this.thermostatService.getCharacteristic(Characteristic.TargetTemperature).updateValue(this.targetTemperature);
    }
    else if (event =='actuatorStatus') {
      var status ;
      if ( value == '0' )
        status = 'OFF';
      else if ( value == '1' )
        status = 'ON';
      else if ( value == '4' )
        status = 'STOP';
      else 
        status = 'not decoded :'+ value;

      this.log("["+this.id+"] zone["+this.zone+"] actuator status (" + status+ ")" );  

      // Ask valve status
      this.mhengine.sendCommand({command: '*#4*' + id + '*19##',log:this.logCmd});
    }
    else if (event =='localOffset') {
       var status ;
      if ( value == '00' )
        status = '0';
      else if ( value == '01' )
        status = '+1';
      else if ( value == '11' )
        status = '-1';
      else if ( value == '02' )
        status = '+2';
      else if ( value ==  '12' )
        status = '-2';
      else if ( value ==  '03' )
        status = '+3';
      else if ( value ==  '13' )
        status = '-3';
      else if ( value ==  '4' )
        status = 'Local OFF';
      else if ( value ==  '5' )
        status = 'Local protection';
      this.log("["+this.id+"] zone["+this.zone+"] local offset (" + status+ ")" );     
    }
    else if (event =='operationMode') {
      var status ;
      if ( value == '0' ) {
        status = 'Conditioning';
        this.heatingCoolingState = Characteristic.CurrentHeatingCoolingState.COOL;
      }
      else if ( value == '1' ){
        status = 'Heating';
        this.heatingCoolingState = Characteristic.CurrentHeatingCoolingState.HEAT;
      }
      else  if ( value == '102' ){
        status = 'Antifreeze';
        this.heatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
      }
      else if ( value == '202' ){
        status = 'Thermal Protection';
        this.heatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
      }
      else if ( value ==  '303' ){
        status = 'Generic OFF';
        this.heatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
      }
      this.log("["+this.id+"] zone["+this.zone+"] operation mode (" + status+ ")" );   
      this.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(this.heatingCoolingState);  
    }
    else if (event =='cooling') {
     if (inArray(value,[1,2])) {
        this.targetheatingCoolingState = Characteristic.TargetHeatingCoolingState.COOL;
        this.log("["+this.id+"] zone["+this.zone+"] cooling ");   
      } else if (this.targetheatingCoolingState != Characteristic.TargetHeatingCoolingState.HEAT) {
        this.targetheatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;
        this.log("["+this.id+"] zone["+this.zone+"] off "); 
      }
      this.thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(this.targetheatingCoolingState);  
    }
    else if (event =='heating') {
      if (inArray(value,[1,2])) {
        this.targetheatingCoolingState = Characteristic.TargetHeatingCoolingState.HEAT;
        this.log("["+this.id+"] zone["+this.zone+"] heating ");   
      } else if (this.targetheatingCoolingState != Characteristic.TargetHeatingCoolingState.COOL) {
        this.targetheatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;
        this.log("["+this.id+"] zone["+this.zone+"] off "); 
      }
      this.thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(this.targetheatingCoolingState); 
    }
 },
  getHeatingCoolingState: function(callback) {
    this.log("["+this.id+"] zone["+this.zone+"] getHeatingCoolingState :"+ this.heatingCoolingState);
    this.mhengine.sendCommand({command: '*#4*' + this.id + '##',log:this.logCmd});
    callback(null,this.heatingCoolingState);
  },
  getTargetHeatingCoolingState: function( callback) {
    this.log("["+this.id+"] zone["+this.zone+"] getTargetHeatingCoolingState :"+ this.targetheatingCoolingState);
    this.mhengine.sendCommand({command: '*#4*' + this.zone + '*19##',log:this.logCmd});
    callback(null,this.targetheatingCoolingState);
  },
  setTargetHeatingCoolingState: function(value, callback) {
    this.log("["+this.id+"] zone["+this.zone+"] setTargetHeatingCoolingState :"+ value );
    this.targetheatingCoolingState = value;
    callback();
  },
  getCurrentTemperature: function( callback) {
     this.log("["+this.id+"] zone["+this.zone+"] getCurrentTemperature :" + this.temperature);
     this.mhengine.sendCommand({command: '*#4*' + this.zone + '*0##',log:this.logCmd});
     callback(null,this.temperature);
  },
  getTargetTemperature: function( callback) {
     this.log("["+this.id+"] zone["+this.zone+"] getTargetTemperature :" + this.targetTemperature );
     this.mhengine.sendCommand({command: '*#4*' + this.zone + '*14##',log:this.logCmd});
     callback(null,this.targetTemperature);
  },
  setTargetTemperature: function(value, callback) {
    this.log("["+this.id+"] zone["+this.zone+"] setTargetTemperature :" + value);
    this.targetTemperature = value;
    var temperature = encodeTemperature(value);
    this.mhengine.sendCommand({command: '*#4*'+ this.zone + '*14*' + temperature + '*1##',log:this.logCmd}); 
    callback();
  },
  getDisplayUnits: function( callback) {
    this.log("["+this.id+"] zone["+this.zone+"] getDisplayUnits :" + this.displayUnits);
    callback(null, this.displayUnits);
  },
  setDisplayUnits: function(value, callback) {
    this.log("["+this.id+"] zone["+this.zone+"] setDisplayUnits :" + value);
    this.displayUnits = value;
    callback();
  },
  getServices: function() {
    this.thermostatService = new Service.Thermostat();
    this.informationService = new Service.AccessoryInformation();

    this.informationService
      .setCharacteristic(Characteristic.Manufacturer, "MyHome Assistant")
      .setCharacteristic(Characteristic.Model, "Thermostat")
      .setCharacteristic(Characteristic.SerialNumber, "xxx");

    this.thermostatService
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .on('get', function(callback) { this.getHeatingCoolingState(callback);}.bind(this));

    this.thermostatService
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('get', function(callback) { this.getTargetHeatingCoolingState(callback);}.bind(this) )
      .on('set', function(value, callback) { this.setTargetHeatingCoolingState(value,callback);}.bind(this) );

    this.thermostatService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', function(callback) {this.getCurrentTemperature(callback);}.bind(this));

    this.thermostatService
      .getCharacteristic(Characteristic.TargetTemperature)
      .on('get', function(callback) { this.getTargetTemperature(callback);}.bind(this))
      .on('set', function(value, callback) { this.setTargetTemperature(value,callback);}.bind(this));

    this.thermostatService
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .on('get', function(callback) { this.getDisplayUnits(callback);}.bind(this))
      .on('set', function(value, callback) { this.setDisplayUnits(value,callback);}.bind(this));


    return [this.informationService, this.thermostatService];
  }
};

function MyHomeLightAccessory(log, mhengine, light) {
  this.log = log;
  this.mhengine = mhengine;
  this.logCmd = false;

  // device info
  this.id     = light.id;

  if ( light.hasOwnProperty("dimmer") ) {
     this.dimmer = light.dimmer;
  } else {
     this.dimmer = false;
  }


  if ( light.hasOwnProperty("name") ) {
      this.name = light.name;
  } else {
      this.name = 'lumiere-' + light.id;
  }

  this.value = false;
}

MyHomeLightAccessory.prototype = {
  updateStatus: function () {
    this.log("["+this.id+"] updateStatus ");
    this.mhengine.sendCommand({command: '*#1*' + this.id + '##',log:this.logCmd});
  },
  onLigth: function(id, value) {
    if (value == '0') {
      this.log("["+this.id+"] power off");
      this.value = false;
    } else {
      this.log("["+this.id+"] power on");
      this.value = true;
    }
    this.lightbulbService.getCharacteristic(Characteristic.On).updateValue(this.value);
  },
  setPowerState: function(characteristic, powerOn, callback) {
    if (powerOn) {
      this.log("["+this.id+"] Setting power state to on");
      this.mhengine.sendCommand({command: '*1*1*' + this.id + '##',log:this.logCmd});
    } else {
      this.log("["+this.id+"] Setting power state to off");
      this.mhengine.sendCommand({command: '*1*0*' + this.id +'##',log:this.logCmd});
    }

    callback();
  },
  getPowerState: function(characteristic, callback) {
    this.log("["+this.id+"] Fetching power state :"+this.value);
    this.mhengine.sendCommand({command: '*#1*' + this.id + '##',log:this.logCmd});
    callback(null,this.value);
  },
  setBrightness: function(characteristic, brightlevel, callback) {
    this.log("["+this.id+"] Setting Brightness to"  + brightlevel + "%" );
    // homekit brightness is a percentage as an integer ( 0 - 100 range) while the dimmer SCS range is 2-10
    this.mhengine.sendCommand({command: '*1*' + Math.round( brightlevel/10 ) + '*' + this.id + '##',log:this.logCmd});
    callback();
  },
  getBrightness: function(characteristic, callback) {
  	this.mhengine.sendCommand({command: '*#1*' + this.id + '##',log:this.logCmd});
  	this.log("["+this.id+"] Getting Brightness"+this.value);
    callback(null, this.value);
  },
  
  
  getServices: function() {
    this.lightbulbService = new Service.Lightbulb();
    this.informationService = new Service.AccessoryInformation();

    this.informationService
      .setCharacteristic(Characteristic.Manufacturer, "MyHome Assistant")
      .setCharacteristic(Characteristic.Model, "Light")
      .setCharacteristic(Characteristic.SerialNumber, "xxx");

    this.lightbulbService
      .getCharacteristic(Characteristic.On)
      .on('get', function(callback)        { this.getPowerState("power", callback);}.bind(this))
      .on('set', function(value, callback) { this.setPowerState("power", value, callback);}.bind(this));

    // if the dimmer is set to 1 than the brightness characteristic is added.
    if (this.dimmer) {
		  this.lightbulbService
	      .addCharacteristic(Characteristic.Brightness)
	      .on('get', function(callback)        { this.getBrightness("brightness", callback);}.bind(this))
	      .on('set', function(value, callback) { this.setBrightness("brightness", value, callback);}.bind(this));
    } 
	

    return [this.informationService, this.lightbulbService];
  }
};

function MyHomeBlindAccessory(log, mhengine, blind) {
  this.logCmd = false;
  this.log = log;
  this.mhengine = mhengine;

  // device info
  this.id = blind.id;
  if ( blind.hasOwnProperty("name") ) {
      this.name = blind.name;
  } else {
      this.name = 'store-' + blind.id;
  }

  this.time = blind.time;

  this.state            = Characteristic.PositionState.STOPPED;
  this.runningDirection = Characteristic.PositionState.STOPPED;
  this.position = 0;
  this.target = 0;

  this.moveTrakingTimeout = null;
  this.packetTimeout = null;
  this.positionTimeout = null;
}

MyHomeBlindAccessory.prototype = {
  updateStatus: function () {
    this.log("["+this.id+"] updateStatus ");
    this.mhengine.sendCommand({command: '*2*2*' + this.id + '##',log:this.logCmd});
    this.position = 0;
    this.target = 0;
  }, 
  sendPacket: function() {
    clearTimeout(this.packetTimeout);
    this.packetTimeout = setTimeout(function(){clearTimeout(this.packetTimeout);this.packetTimeout = null;}.bind(this), 2000);
  },
  moveStop: function() {
    this.log("["+this.id+"] Blind send moving stop");
    this.runningDirection = Characteristic.PositionState.STOPPED;
    this.mhengine.sendCommand({command: '*2*0*' + this.id + '##',log:this.logCmd});
    this.sendPacket();
  },
  moveUp: function() {
    this.log("["+this.id+"] Blind send moving up");
    this.runningDirection = Characteristic.PositionState.INCREASING;
    this.mhengine.sendCommand({command: '*2*1*' + this.id + '##',log:this.logCmd});
    this.sendPacket();
  },
  moveDown: function() {
    this.log("["+this.id+"] Blind send moving down");
    this.runningDirection = Characteristic.PositionState.DECREASING;
    this.mhengine.sendCommand({command: '*2*2*' + this.id + '##',log:this.logCmd});
    this.sendPacket();
  },
  onBlind: function(id,direction) {
    if (direction == '0'  && this.state != Characteristic.PositionState.STOPPED) {
      this.state = Characteristic.PositionState.STOPPED;
    } else if (direction == '1'  ) {
      this.state = Characteristic.PositionState.INCREASING;
    } else if (direction == '2'  ) {
      this.state = Characteristic.PositionState.DECREASING;
    }
    this.windowCoveringService.getCharacteristic(Characteristic.PositionState).updateValue(this.state);
    this.log("["+this.id+"] change  dir : "+ direction + " pos:"+ this.position + " tag:" +  this.target);
    if (this.packetTimeout != null && this.runningDirection == this.state) {
        clearTimeout(this.packetTimeout);
        this.packetTimeout = null;
    }  
    this.evaluatePosition();
  },
  evaluatePosition: function() {
    clearTimeout(this.positionTimeout); 
    if (this.state == Characteristic.PositionState.STOPPED) {
      this.log(  "["+this.id+"] Blind is STOPPED    pos:"+ this.position + " tag:" +  this.target);
    } else if (this.state == Characteristic.PositionState.INCREASING) {
      if (this.position < 100) {
        this.position++;
        this.positionTimeout = setTimeout(function(){this.evaluatePosition();}.bind(this), this.time / 100 * 1000);
      }
      this.log("["+this.id+"] Blind is moving UP  pos:"+ this.position + " tag:" +  this.target);
    } else if (this.state == Characteristic.PositionState.DECREASING) {
      if (this.position > 0) {
        this.position--;
        this.positionTimeout = setTimeout(function(){this.evaluatePosition();}.bind(this), this.time / 100 * 1000);
      }
      this.log("["+this.id+"] Blind is moving DOWN pos:"+ this.position + " tag:" +  this.target);
    }
    this.windowCoveringService.getCharacteristic(Characteristic.CurrentPosition).updateValue(this.position);
  },
  move: function() {
    if( this.packetTimeout == null) { // check if a command is pending  
      if (this.target < this.position ) {
        var offset = Math.abs(this.target - this.position) ;
        if ( this.state != Characteristic.PositionState.DECREASING  &&  offset > 5) {
          this.moveDown();
        }
      } else if (this.target > this.position  ) {
        var offset = Math.abs(this.target - this.position) ;
        if (this.state != Characteristic.PositionState.INCREASING &&  offset > 5 ) {
          this.moveUp();
        }
      } else  {
         if ( this.state != Characteristic.PositionState.STOPPED ) {
            this.moveStop();
         }         
         this.log("["+this.id+"] Blind position is good : stop moving "+ this.position + " tag:" +  this.target);
        return; 
      }
    } else {
      this.log("["+this.id+"] Blind command is still pending : wait for action");
    }
    clearTimeout(this.moveTrakingTimeout);  
    // recheck postion in 500 ms
    this.moveTrakingTimeout = setTimeout(function(){this.move();}.bind(this), 500);
  },
  getPosition: function(characteristic, callback) {
    this.log("["+this.id+"] Blind fetching position :" + this.position);
    callback(null, this.position);
  },
  setTarget: function(target, callback) {
    this.log("["+this.id+"] Blind setting Target :" + target );
    clearTimeout(this.moveTrakingTimeout);
    this.moveTrakingTimeout = null;
    this.target = target;
    this.move();

    callback();
  },
  getTarget: function(characteristic, callback) {
    this.log("["+this.id+"] Blind fetching target :" + this.target);
    callback(null, this.target);
  },
  getState: function(characteristic, callback) {
    this.log("["+this.id+"] Blind fetching State :" + this.state);
    callback(null, this.state);
  },
  getServices: function() {
    this.windowCoveringService = new Service.WindowCovering();
    this.informationService = new Service.AccessoryInformation();

    this.informationService
      .setCharacteristic(Characteristic.Manufacturer, "MyHome Assistant")
      .setCharacteristic(Characteristic.Model, "WindowCovering")
      .setCharacteristic(Characteristic.SerialNumber, "xxx");

    this.windowCoveringService
      .getCharacteristic(Characteristic.CurrentPosition)
      .on('get', function(callback) { this.getPosition("position", callback);}.bind(this));

    this.windowCoveringService
        .getCharacteristic(Characteristic.TargetPosition)
        .on('get', function(callback) { this.getTarget("target", callback);}.bind(this))
        .on('set', function(value, callback) { this.setTarget(value, callback);}.bind(this));


    this.windowCoveringService
        .getCharacteristic(Characteristic.PositionState)
        .on('get', function(callback) { this.getState("state", callback);}.bind(this));

    return [this.informationService, this.windowCoveringService];
  }
};
