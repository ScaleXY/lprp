//imports
const express = require('express');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const open = require('open');
const child_process = require('child_process');
const startupManager  = require('node-startup-manager');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { start } = require('repl');
const Conf = require('conf');
var fetchUrl = require("fetch").fetchUrl;
const os = require('os');
var print = require("pdf-to-printer");

switch(os.platform())
{
	case "win32":
	break;
	case "darwin": 
		print = require("unix-print");
	break;
	default: 
		console.log("Invalid platform(" + os.platform() + ")!")
		process.exit();
	break;
}


//imports
// import express from 'express';
// import Configstore from 'configstore';
// import fs from 'fs';
// import { fetchPrinterFromUUID, makePrintCall } from './helpers.mjs';
// import { v4 as uuidv4 } from 'uuid';
// import open from 'open';
// import child_process from 'child_process';
// import print from "pdf-to-printer";
// import yargs from 'yargs/yargs';
// import { hideBin } from 'yargs/helpers';
// import startupManager  from 'node-startup-manager';
// import { start } from 'repl';

//inits
const app = express()
app.use(express.json());

const argv = yargs(hideBin(process.argv)).argv

var install_options = {
	path: 'C:/Program Files/Renzo/lprp.exe',
	name: 'Renzo LPRP',
	arguments: []
};

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

const schema = {
	port: {
		type: 'number',
		maximum: 65000,
		minimum: 8000,
		default: 50895
	},
	default_printer: {
		type: 'string',
		format: 'uuid',
		default: '2dbca97d-0426-49e5-bd37-0c634f80928a',
	},
	printers: {
		type: 'array',		
		default: [],
	}
};

const config = new Conf({
	schema: schema,
	projectName: "renzo_lprp",
});

// const config = new Configstore(packageJson.name + "salt1", {
// 	port: 50895,
// 	default_printer: null,
// 	: [],
// });

var printers = [];

function fetchPrinterFromUUID(printers, uuid)
{
    var retval = null;
    printers.forEach(function(item1, index1){
        if(item1.uuid == uuid)
            retval = item1;
    });
    return retval;
}

function makePrintCall(url, printer_uuid, options = {}) {	
	var uuid = uuidv4();
	var current_printer = fetchPrinterFromUUID(config.get('printers'), printer_uuid);
	console.log(current_printer);
	options.printer = current_printer.deviceId;
	options.sumatraPdfPath = "./SumatraPDF.exe"
	fetchUrl(url, function(error, meta, body){
		fs.writeFile('./pdfs/' + uuid + '.pdf', body, function (err) {
			if (err) {
				console.log(err);
			} else {
				print.print('./pdfs/' + uuid + '.pdf', options)
					.then(function (){
						fs.rm('./pdfs/' + uuid + '.pdf', {}, function (){});
					});
			}

		});
	});
}

async function syncPrinters() {
	printers = config.get('printers');
	// Add new printers
	var list_of_printers = await print.getPrinters();
	list_of_printers.forEach(function (item1, index1) {
		var found = false;
		printers.forEach(function (item2, index2) {
			if (item2.name == item1.name)
				found = true;
		});
		if (found == false) {
			item1.uuid = uuidv4()
			printers.push(item1);
		}
	})
	// Delete old printers
	printers.forEach(function (item2, index2) {
		var found = false;
		list_of_printers.forEach(function (item1, index1) {
			if (item2.name == item1.name)
				found = true;
		})
		if (found == false) {
			printers.splice(index2, 1);
		}
	});
	config.set('printers', printers);
}
function main() {
	var port = config.get('port');
	var default_printer = config.get('default_printer');
	printers = config.get('printers');
	syncPrinters();
	// Prod
	app.get('/', function (req, res) {
		default_printer = config.get('default_printer');
		res.json({
			"application": {
				"name": "Local Printer Reverse Proxy",
				"version": packageJson.version,
			},
			"printers": printers,
			"default_printer": default_printer ?? "Not Set",
		});
	});
	app.get('/printers', function (req, res) {
		var temp_printers = printers;
		temp_printers.forEach(function (item1, index1) {
			item1.link = "http://127.0.0.1:" + port + "/printers/" + item1.uuid;
		});
		res.json(temp_printers);
	});
	app.get('/printers/:uuid', function (req, res) {
		res.json(fetchPrinterFromUUID(printers, req.params.uuid));
	});
	app.post('/printers/print', function (req, res) {
		makePrintCall(req.body.url, config.get('default_printer'));
		res.json({
			"success": true
		});
	});
	app.post('/printers/:uuid/print', function (req, res) {
		makePrintCall(req.body.url, req.params.uuid);
		res.json({
			"success": true
		});
	});
	app.post('/printers/:uuid/set-default', function (req, res) {
		config.set('default_printer', req.params.uuid);
		res.json({
			"success": true
		});
	});
	app.post('/service/set-port', function (req, res) {
		var new_port = req.body.port ?? 50895;
		res.send('Port set to ' + new_port)
		config.set('port', new_port);
		process.on("exit", function () {
			child_process.spawn(process.argv.shift(), process.argv, {
				cwd: process.cwd(),
				detached: true,
				stdio: "inherit"
			});
		});
		process.exit();
	});
	app.post('/service/shutdown', function (req, res) {
		res.send("Shuting down!!!");
		process.exit();
	});
	app.listen(port, argv.bind_host ?? '127.0.0.1')
	if (argv.open_browser == true) {
		open("http://127.0.0.1:" + port)
	}
	if (argv.run_without_clean != true) {
		fs.rm('./pdfs/', { recursive: true, force: true }, (err) => {
			if (err) {
				console.error(err);
			}
			else {

				fs.mkdir('./pdfs', {},  (err) => {
					if (err) {
						console.error(err);
					}
					else {
					}
				});
		
			}
		})
	}
}
function boot() {
	if (argv.install_service == true) {
		install_service();
	} else {
		if (argv.uninstall_service == true) {
			uninstall_service();
		} else {
			main()
		}
	}
}

function install_service() {
	startupManager.add(install_options)
		.then(function() {
			console.log('App added to startup')
		})
		.catch(function(e) {
			Console.log('Something went wrong; Perms?', e)
    });
}
function uninstall_service() {
	startupManager.remove(install_options.name)
    .then(function() {
        console.log('App removed from startup')
    })
    .catch(function(e) {
        Console.log('Something went wrong; Perms?', e)
    });
}
boot()