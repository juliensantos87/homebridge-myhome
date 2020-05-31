'use strict';
const OwnPlatform = require('./lib/OwnPlatform');
module.exports = (api) =>{
  api.registerPlatform("homebridge-myhome", "MyHome", OwnPlatform.OwnPlatform);
};
