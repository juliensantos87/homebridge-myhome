'use strict';

var request = require("request");
var Service, Characteristic;

var myhome = require("myhome");

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

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerPlatform("homebridge-myhome", "MyHome", MyHomePlatform);
};

function MyHomePlatform(log, config){
  // auth info
  this.host = config["host"];
  this.password =config["password"];

  this.lights = config["lights"];
  this.blinds = config["blinds"];
  this.thermostats = config["thermostats"];

  this.log = log;

  this.mhengine = new myhome.engine({host: this.host});

  this.foundAccessories = [];

  this.monitorTimeout = null;
  var that = this;

  // check change
  this.mhengine.on ('packet', function (data) {
    var result = data.split('*');
    var extract;

    // light and auto event 
    if (result[1] == '1' || result[1] == '2') {
      for (var i = this.foundAccessories.length - 1; i >= 0; i--) {
        if (result[3] == this.foundAccessories[i].id + '##') {
            // decode value *2*1000#<what>*<where>##
            var stateValue = result[2].split('#'); 
            if ( stateValue.length == 1)
              this.foundAccessories[i].change(stateValue[0]);
         }
      }
    } 
    /* Ambient temperature */
    else if (extract = data.match(/^\*#4\*(\d+)\*0\*(\d\d\d\d)\#\#$/)) {
    	var id = extract[1];
    	for (var accessory of this.foundAccessories) {
    		if ( accessory.id == id && typeof(accessory.onThermostatEvent) == 'function') {
				accessory.onThermostatEvent(id,'temperature',decodeTemperature(extract[2]));
  			}
        }
    }
    /* Setpoint temperature */
    else if (extract = data.match(/^\*#4\*(\d+)\*14\*(\d\d\d\d)\*(\d+)\#\#$/)) {
    	var id = extract[1];
    	for (var accessory of this.foundAccessories) {
    		if ( accessory.id == id && typeof(accessory.onThermostatEvent) == 'function') {
				accessory.onThermostatEvent(id,'targetTemperature',decodeTemperature(extract[2]));
  			}
        }
    }
    // gateway event 
    else if (result[1] == '#13') {
     this.log("gateway is still alive" );
      clearTimeout(this.monitorTimeout)
      // retart monitor  if not event is comming since 1 min  
      this.monitorTimeout = setTimeout(function(){
	          this.log("monitor connexion is dead, restart it" );
	          this.mhengine.startMonitor()
          }.bind(this),60000);
    }
  }.bind(this)
  );
}

MyHomePlatform.prototype = {
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
    }
};
function MyHomeThermostatAccessory(log, mhengine, thermostat) {
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
  onThermostatEvent: function(id,event,value){
  	if (event =='temperature') {
		this.temperature = value;
		this.log("zone[" +this.zone+"] temperature (" + this.temperature + ")" );		
  	}
  	else if (event =='targetTemperature') {
		this.targetTemperature = value;
		this.log("zone[" +this.zone+"] target temperature (" + this.targetTemperature+ ")" );	
  	}
  },
  getHeatingCoolingState: function(callback) {
    this.log("zone[" +this.zone+"] getHeatingCoolingState :"+ this.heatingCoolingState);
    callback(null,this.heatingCoolingState);
  },
  getTargetHeatingCoolingState: function( callback) {
    this.log("zone[" +this.zone+"] getTargetHeatingCoolingState :"+ this.targetheatingCoolingState);
    callback(null,this.targetheatingCoolingState);
   },
  setTargetHeatingCoolingState: function(value, callback) {
    this.log("zone[" +this.zone+"] setTargetHeatingCoolingState :"+ value );
    this.targetheatingCoolingState = value;
    callback();
  },
  getCurrentTemperature: function( callback) {
     this.log("zone[" +this.zone+"] getCurrentTemperature :" + this.temperature);
     this.mhengine.sendCommand({command: '*#4*' + this.zone + '*0##',log:true});
     callback(null,this.temperature);
  },
  getTargetTemperature: function( callback) {
     this.log("zone[" +this.zone+"] getTargetTemperature :" + this.targetTemperature );
     this.mhengine.sendCommand({command: '*#4*' + this.zone + '*14##',log:true});
     callback(null,this.targetTemperature);
  },
  setTargetTemperature: function(value, callback) {
    this.log("zone[" +this.zone+"] setTargetTemperature :" + value);
    this.targetTemperature = value;
    var temperature = encodeTemperature(value);
    this.mhengine.sendCommand({command: '*#4*'+ this.zone + '*14*' + temperature + '*1##',log:true}); 
    callback();
  },
  getDisplayUnits: function( callback) {
    this.log("zone[" +this.zone+"] getDisplayUnits :" + this.displayUnits);
    callback(null, this.displayUnits);
  },
  setDisplayUnits: function(value, callback) {
    this.log("zone[" +this.zone+"] setDisplayUnits :" + value);
    this.displayUnits = value;
    callback();
  },
 getServices: function() {
    var that = this;

    var thermostatService = new Service.Thermostat();
    var informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "MyHome Assistant")
      .setCharacteristic(Characteristic.Model, "Thermostat")
      .setCharacteristic(Characteristic.SerialNumber, "xxx");

    thermostatService
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .on('get', function(callback) { that.getHeatingCoolingState(callback);});

    thermostatService
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('get', function(callback) { that.getTargetHeatingCoolingState(callback);} )
      .on('set', function(value, callback) { that.setTargetHeatingCoolingState(value,callback);} );

    thermostatService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', function(callback) {that.getCurrentTemperature(callback);});

    thermostatService
      .getCharacteristic(Characteristic.TargetTemperature)
      .on('get', function(callback) { that.getTargetTemperature(callback);})
      .on('set', function(value, callback) { that.setTargetTemperature(value,callback);});

    thermostatService
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .on('get', function(callback) { that.getDisplayUnits(callback);})
      .on('set', function(value, callback) { that.setDisplayUnits(value,callback);});


    return [informationService, thermostatService];
  }
};

function MyHomeLightAccessory(log, mhengine, light) {
  this.log = log;
  this.mhengine = mhengine;

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
  change: function(value) {
    if (value == '0') {
      this.log("["+this.id+"] power off");
      this.value = false;
    } else {
      this.log("["+this.id+"] power on");
      this.value = true;
    }
  },
  setPowerState: function(characteristic, powerOn, callback) {
    if (powerOn) {
      this.log("["+this.id+"] Setting power state to on");
      this.mhengine.sendCommand({command: '*1*1*' + this.id + '##',log:true});
    } else {
      this.log("["+this.id+"] Setting power state to off");
      this.mhengine.sendCommand({command: '*1*0*' + this.id +'##',log:true});
    }

    callback();
  },
  getPowerState: function(characteristic, callback) {
    this.log("["+this.id+"] Fetching power state :"+this.value);
    this.mhengine.sendCommand({command: '*#1*' + this.id + '##',log:true});
    callback(null,this.value);
  },
  setBrightness: function(characteristic, brightlevel, callback) {
    this.log("["+this.id+"] Setting Brightness to"  + brightlevel + "%" );
    // homekit brightness is a percentage as an integer ( 0 - 100 range) while the dimmer SCS range is 2-10
	this.mhengine.sendCommand({command: '*1*' + Math.round( brightlevel/10 ) + '*' + this.id + '##',log:true});
    callback();
  },
  getBrightness: function(characteristic, callback) {
	this.mhengine.sendCommand({command: '*#1*' + this.id + '##',log:true});
	this.log("["+this.id+"] Getting Brightness"+this.value);
    callback(null, this.value);
  },
  
  
  getServices: function() {
    var that = this;

    var lightbulbService = new Service.Lightbulb();
    var informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "MyHome Assistant")
      .setCharacteristic(Characteristic.Model, "Light")
      .setCharacteristic(Characteristic.SerialNumber, "xxx");

    lightbulbService
      .getCharacteristic(Characteristic.On)
      .on('get', function(callback) { that.getPowerState("power", callback);})
      .on('set', function(value, callback) { that.setPowerState("power", value, callback);});

    // if the dimmer is set to 1 than the brightness characteristic is added.
    if (that.dimmer) {
		  lightbulbService
	      .addCharacteristic(Characteristic.Brightness)
	      .on('get', function(callback) { that.getBrightness("brightness", callback);})
	      .on('set', function(value, callback) { that.setBrightness("brightness", value, callback);});
    } 
	

    return [informationService, lightbulbService];
  }
};

function MyHomeBlindAccessory(log, mhengine, blind) {
  var that = this;

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

  this.state = Characteristic.PositionState.STOPPED;
  this. position = 0;
  this.target = 0;

  this.isMoving = false;

  this.timeout = null;

  this.packetTimeout = null;
  this.positionTimeout = null;
}

MyHomeBlindAccessory.prototype = {
  sendPacket: function() {
    var that = this;
    this.packetTimeout = setTimeout(function(){clearTimeout(that.packetTimeout);that.packetTimeout = null;}, 2000);
  },
  moveStop: function() {
    this.log("["+this.id+"] Moving stop");

    this.mhengine.sendCommand({command: '*2*0*' + this.id + '##',log:true});
    this.isMoving = false;
  },
  moveUp: function() {
    this.log("["+this.id+"] Moving up");

    this.mhengine.sendCommand({command: '*2*1*' + this.id + '##',log:true});
    this.isMoving = true;
    this.sendPacket();
  },
  moveDown: function() {
    this.log("["+this.id+"] Moving down");

    this.mhengine.sendCommand({command: '*2*2*' + this.id + '##',log:true});
    this.isMoving = true;
    this.sendPacket();
  },
  change: function(direction) {
    var that = this;
    this.log("["+this.id+"] change  dir : "+ direction + " pos:"+ this.position + " tag:" +  this.target);

    if (direction == '0' && !this.packetTimeout) {
      clearTimeout(this.positionTimeout);
      this.isMoving = false;
      this.target = this.position;
      this.state = Characteristic.PositionState.STOPPED;
       this.log("["+this.id+"] change :  stop");
    } else if (direction == '1') {
      this.isMoving = true;

      if (this.position < 100) {
        this.position++;
        this.state = Characteristic.PositionState.INCREASING;
        clearTimeout(this.positionTimeout);
        this.positionTimeout = setTimeout(function(){that.change(direction);}, this.time / 100 * 1000);
      }
    } else if (direction == '2') {
      this.isMoving = true;

      if (this.position > 0) {
        this.position--;
        this.state = Characteristic.PositionState.DECREASING;
        clearTimeout(this.positionTimeout);
        this.positionTimeout = setTimeout(function(){that.change(direction);}, this.time / 100 * 1000);
      }
    }
  },
  move: function() {
    var that = this;

    if (this.target < this.position) {
      if ( (this.state != Characteristic.PositionState.DECREASING && !this.packetTimeout)||!this.isMoving ) {
        this.moveDown();
      }
    } else if (this.target > this.position) {
      if ( (this.state != Characteristic.PositionState.INCREASING && !this.packetTimeout)||!this.isMoving) {
        this.moveUp();
      }
    } else {
      this.moveStop();

      return;
    }

    clearTimeout(this.timeout);    
    this.timeout = setTimeout(function(){that.move();}, (this.time / 100 * 1000));
  },
  getPosition: function(characteristic, callback) {
    this.log("["+this.id+"] Fetching position");
    this.mhengine.sendCommand({command: '*#2*' + this.id + '##',log:true});

    callback(null, this.position);
  },
  setTarget: function(target, callback) {
    this.log("["+this.id+"] Setting Target :" + target );
    if ( this.isMoving )
    {
       this.log("["+this.id+"] stop move " );
       clearTimeout(this.timeout);
    }
    this.target = target;
    this.move();

    callback();
  },
  getTarget: function(characteristic, callback) {
    this.log("["+this.id+"] Fetching target");

    callback(null, this.target);
  },
  getState: function(characteristic, callback) {
    this.log("["+this.id+"] Fetching State");

    callback(null, this.state);
  },
  getServices: function() {
    var that = this;

    var windowCoveringService = new Service.WindowCovering();
    var informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "MyHome Assistant")
      .setCharacteristic(Characteristic.Model, "WindowCovering")
      .setCharacteristic(Characteristic.SerialNumber, "xxx");

    windowCoveringService
      .getCharacteristic(Characteristic.CurrentPosition)
      .on('get', function(callback) { that.getPosition("position", callback);});

    windowCoveringService
        .getCharacteristic(Characteristic.TargetPosition)
        .on('get', function(callback) { that.getTarget('target', callback);})
        .on('set', function(value, callback) { that.setTarget(value, callback);});


    windowCoveringService
        .getCharacteristic(Characteristic.PositionState)
        .on('get', function(callback) { that.getState("position", callback);});

    return [informationService, windowCoveringService];
  }
};
