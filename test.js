//@ts-check
var OwnNet = require('./lib/OwnNet.js');
var OwnProtcol = require('./lib/OwnProtcol.js');
const sprintf = require("sprintf-js").sprintf;

const host = '192.168.1.35';
const pass = '12345';
const port = 20000;

//const host = '10.0.0.178';

// Status
const start = Date.now();


var ownClient = new OwnNet.OwnClient(host, port,pass, console);
ownClient.on ('monitoring', function () {
	console.log ('started monitoring');
});

ownClient.on ('packet',function ( data ) {
	console.log ('monitor:[%s] %s',JSON.stringify(OwnProtcol.OwnProtcol.extractPacketInfo(data)),data);
});
ownClient.startMonitor();

//monitor.scanSystem(function ( data ) {
//	console.log ('scanSystem:%s',data.join());
//});

//monitor.scanUnconfigured(function ( data ) {
//	console.log ('scanUnconfigured:%s',data.join());
//});

//monitor.scanConfigured(function ( data ) {
//	console.log ('scanConfigured:%s',data.join());
//});

// Send light probe
var lights =[];
ownClient.sendCommand({
//	command:'*#4*#0#1##',
//	command:'*#1*0##',
//	command:'*#4*#0#1##',
//	command:'*#4*1##',
//	command:'*#4*1*14##',
//	command:'*#4*1*0##',
//   command:'*#4*#0#1*#14*0300*1##',  // -> set headting manual  
// command:'*4*103*#0#1##', // set heating off
 command:'*4*102*#0#1##', // Porctecttion mode
// command:'*4*304*#0#1##', // Auto mode   NOK

//command:'*4*3100*#0#1##', // set generic the last weekly program
//command:'*4*3101*#0#1##', // set generic weekly program ( programm week 1)
// command:'*4*304*#0#1##', // Auto mode   NOK

//command:'*4*13020#1103*#0#1##', // Holiday mode activation command

// command:'*4*311*#0#1##*#4*#0#1##',   
//	command:'*#4*#0#1*#14*0200*1##*#4*1##',
//	command:'*#4*1*14*0250##',
//	command:'*#4*1*14##',
//	command:'*4*102*1##',// set Antifreeze protection
//	command:'*#4*#0*3##',
//    command:'*4*303*1##',
 //   command:'*#4*#0*#0*0250*1##',
//   command:'*#4*#0*#0*0250*1##',

// Requet by dimensen *#4*zone*dim##
//    command:'*#4*1*3##',
//    command:'*#4*1*2##',
//	command:'*#4*1*0##',
//	command:'*#4*1*14##',
//	command:'*#4*1*19##',
//    command:'*4*111*#1##',
//	command:'*#4*#1*#14*0180*1##',
//	command:'*4*303*#1##',     
//	command:'*4*311*#1##',     

    stopon: ['*#*1##', '*#*0##'],
	packet: function(data) { lights.push(OwnProtcol.OwnProtcol.parseStatus(data)); },
	done:function(data,index) { console.log ('ligths: %s',JSON.stringify(lights)); }}
);

// Send automation probe
//var automations =[];
//ownClient.sendCommand({
//	command:'*#2*0##',
//	stopon: ['*#*1##', '*#*0##'],
//	packet: function(data) { automations.push(OwnProtcol.OwnProtcol.parseStatus(data)); },
//	done:function(data,index) { console.log ('automations: %s',JSON.stringify(automations)); }}
//);

//ownClient.sendCommand({command:'*#4*#1*#14*0215*1##'});
//ownClient.sendCommand({command:'*#4*#1*#14*1800*3##'});



function setSetPoint(_address,_temperature) {
	// Standard thermostat *4*40*%02d##*#4*#%02d*#14*%04d*3
	var cmd = sprintf("*4*40*%02d##*#4*#%02d*#14*%04d*3##*#4*%02d*14##",_address,_address,_temperature * 10,_address);
	ownClient.sendCommand({command: cmd});

	// 4 Zones *#4*#0#%02d*#14*%04d*3
}

//setSetPoint(1,12);