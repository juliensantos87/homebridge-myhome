//@ts-check
var defaults = require('lodash');
var OwnNet = require('./OwnNet.js');
var OwnProtcol = require('./OwnProtcol.js');
var OwnAccessory = require('./OwnAccessory.js');

class OwnPlatform {
  constructor(log, config, api) {
    const defaultConfig = {
      port: 20000,
      lights:[],
      blinds:[],
      thermostats:[]
    };

    this.config = defaults.defaults(config, defaultConfig);

    this.log = log;
    this.api = api;

    this.foundAccessories = [];
    this.monitorTimeout = null;
    this.reconnectSeconds = 120;/*2 min*/

    this.log.info("LegrandMyHome for MyHome Gateway at " + this.config.host+ ":" + this.config.port);
    this.controler = new OwnNet.OwnClient(this.config.host, this.config.port, this.config.password, this.log);
    this.controler.on('packet', this.onMonitor.bind(this));
    this.controler.on('monitoring', this.updateAccessoriesStatus.bind(this));
    this.controler.startMonitor();
    this.resetAutoConnectMonitor();
  }

  accessories(callback) {
    this.log.info("Fetching OpenWebNet devices.");

    for (var light of this.config.lights) {
      this.foundAccessories.push(new OwnAccessory.OwnLightAccessory(this, light));
    }

    for (var blind of this.config.blinds) {
      this.foundAccessories.push(new OwnAccessory.OwnBlindAccessory(this, blind));
    }

    for (var thermostat of this.config.thermostats) {
      this.foundAccessories.push(new OwnAccessory.OwnThermostatAccessory(this, thermostat));
    }

    callback(this.foundAccessories);
  }


  getUUIDGen() {
    return this.api.hap.uuid;
  }

  getService() {
    return this.api.hap.Service;
  }

  getCharacteristic() {
    return this.api.hap.Characteristic;
  }

  getAccessory() {
    return this.api.platformAccessory;
  }

  getControler() {
    return this.controler;
  }

  getLog() {
    return this.log;
  }

  onMonitor(packet) {
    var info = OwnProtcol.OwnProtcol.extractPacketInfo(packet);
    switch (info.who) {
      case OwnProtcol.WHO.light:
      case OwnProtcol.WHO.automation:
      case OwnProtcol.WHO.temperature:
         this.onAccessory(info.where,packet);
      break;
      case OwnProtcol.WHO.gateway:
        this.log.info("Server MyHome is alive");
        this.resetAutoConnectMonitor();
        break;
      default:
        this.log.error("Not Supported packet", packet);
    }
  }

  onAccessory(where, packet) {
      const foundAccessory = this.foundAccessories.find(accessory => accessory.checkWhere(where));
      if (foundAccessory) {
        foundAccessory.onData(packet);
      } else {
        this.log.error("Accessory not found", where, packet);
      }
  }

  checkMonitor() {
    this.controler.sendCommand({ command: '*#13**15##', log: this.log });
  }

  resetAutoConnectMonitor() {
    if (this.monitorTimeout != null) clearTimeout(this.monitorTimeout);
    this.monitorTimeout = setTimeout(this.restartMonitorConnection.bind(this), this.reconnectSeconds * 1000);
  }

  restartMonitorConnection() {
    this.log.error("Monitor connexion is dead, restart it");
    this.controler.startMonitor();
    this.resetAutoConnectMonitor();
  }

  updateAccessoriesStatus() {
    this.log.info("Fetching accessories status");
    for (var accessory of this.foundAccessories) {
      accessory.updateStatus();
    }
  }
}

exports.OwnPlatform = OwnPlatform;
