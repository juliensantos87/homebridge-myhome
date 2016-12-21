'use strict';

var request = require("request");
var Service, Characteristic;

var myhome = require("myhome");

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

  this.log = log;

  this.mhengine = new myhome.engine({host: this.host});

  this.foundAccessories = [];

  var that = this;

  // check change
  this.mhengine.on ('packet', function (data) {
    var result = data.split('*');

    for (var i = that.foundAccessories.length - 1; i >= 0; i--) {
      if (result[3] == that.foundAccessories[i].id + '##') {
          that.foundAccessories[i].change(result[2]);
      }
    }
  });
}

MyHomePlatform.prototype = {
    accessories: function(callback) {
        this.log("Fetching MyHome devices.");

        for (var i = this.lights.length - 1; i >= 0; i--) {
          this.foundAccessories.push(new MyHomeLightAccessory(this.log, this.mhengine, this.lights[i].id, this.lights[i].dimmer));
        }

        for (var i = this.blinds.length - 1; i >= 0; i--) {
          this.foundAccessories.push(new MyHomeBlindAccessory(this.log, this.mhengine, this.blinds[i].id, this.blinds[i].time));
        }

        callback(this.foundAccessories);
    }
};

function MyHomeLightAccessory(log, mhengine, id, dimmer) {
  this.log = log;
  this.mhengine = mhengine;

  // device info
  this.id = id;
  this.name = 'light-' + id;
  this.dimmer = dimmer;

  this.value = false;
}

MyHomeLightAccessory.prototype = {
  change: function(value) {
    if (value == '0') {
      this.value = false;
    } else {
      this.value = true;
    }
  },
  setPowerState: function(characteristic, powerOn, callback) {
    if (powerOn) {
      this.log("["+this.id+"] Setting power state to on test");
      this.mhengine.sendCommand({command: '*1*1*' + this.id + '##'});
    } else {
      this.log("["+this.id+"] Setting power state to off test");
      this.mhengine.sendCommand({command: '*1*0*' + this.id +'##'});
    }

    callback();
  },
  getPowerState: function(characteristic, callback) {
    this.log("["+this.id+"] Fetching power state");
    this.mhengine.sendCommand({command: '*#1*' + this.id + '##'});

    callback(null, this.value);
  },
  setBrightness: function(characteristic, brightness, callback) {
    this.log("["+this.id+"] Setting Brightness");
    callback();
  },
  getBrightness: function(characteristic, callback) {
    this.log("["+this.id+"] Getting Brightness");
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

      if (that.dimmer) {
		lightbulbService
	      .addCharacteristic(Characteristic.Brightness)
	      .on('get', function(callback) { that.getBrightness("brightness", callback);})
	      .on('set', function(value, callback) { that.setBrightness("brightness", value, callback);});
      } 
	

    return [informationService, lightbulbService];
  }
};

function MyHomeBlindAccessory(log, mhengine, id, time) {
  var that = this;

  this.log = log;
  this.mhengine = mhengine;

  // device info
  this.id = id;
  this.name = 'blind-' + id;
  this.time = time;

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
    this.packetTimeout = setTimeout(function(){clearTimeout(that.packetTimeout);that.packetTimeout = null;}, 1000);
  },
  moveStop: function() {
    this.log("["+this.id+"] Moving stop");

    this.mhengine.sendCommand({command: '*2*0*' + this.id + '##'});
  },
  moveUp: function() {
    this.log("["+this.id+"] Moving up");

    this.mhengine.sendCommand({command: '*2*1*' + this.id + '##'});
    this.isMoving = true;
    this.sendPacket();
  },
  moveDown: function() {
    this.log("["+this.id+"] Moving down");

    this.mhengine.sendCommand({command: '*2*2*' + this.id + '##'});
    this.isMoving = true;
    this.sendPacket();
  },
  change: function(direction) {
    var that = this;

    if (direction == '0' && !this.packetTimeout) {
      clearTimeout(this.positionTimeout);
      this.isMoving = false;
      this.target = this.position;
      this.state = Characteristic.PositionState.STOPPED;
    } else if (direction == '1') {
      this.isMoving = true;

      if (this.position < 100) {
        this.position++;
        this.state = Characteristic.PositionState.INCREASING;
      }
      this.positionTimeout = setTimeout(function(){that.change(direction);}, this.time / 100 * 1000);
    } else if (direction == '2') {
      this.isMoving = true;

      if (this.position > 0) {
        this.position--;
        this.state = Characteristic.PositionState.DECREASING;
      }
      this.positionTimeout = setTimeout(function(){that.change(direction);}, this.time / 100 * 1000);
    }
  },
  move: function() {
    var that = this;

    if (this.target < this.position) {
      if (!this.isMoving) {
        this.moveDown();
      }
    } else if (this.target > this.position) {
      if (!this.isMoving) {
        this.moveUp();
      }
    } else {
      this.moveStop();
      that.change('0');

      return;
    }

    setTimeout(function(){that.move();}, (this.time / 100 * 1000) / 2);
  },
  getPosition: function(characteristic, callback) {
    this.log("["+this.id+"] Fetching position");

    callback(null, this.position);
  },
  setTarget: function(target, callback) {
    this.log("["+this.id+"] Setting Target");

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
