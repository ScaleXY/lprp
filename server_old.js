//imports
const express = require('express');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const open = require('open');
const child_process = require('child_process');
const startupManager  = require('node-startup-manager');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const Conf = require('conf');
var fetchUrl = require("fetch").fetchUrl;
const os = require('os');
var print = require("pdf-to-printer");
// var print = require("pdf-to-printer");
var https = require('https');

// const { start } = require('repl');
// const getDirName = require('path').dirname;

// Non windows platforms
// switch(os.platform())
// {
// 	case "win32": break;
// 	case "darwin": print = require("unix-print"); break;
// 	default: console.log("Invalid platform(" + os.platform() + ")!"); process.exit(); break;
// }

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
		default: '01234567-89ab-cdef-0123-456789abcdef',
	},
	customer_id: {
		type: 'string',
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

var printers = [];

function fetchPrinterFromUUID(printers, uuid)
{
    var retval = null;
    printers.forEach(function(item){
        if(item.uuid == uuid)
            retval = item;
    });
    return retval;
}

async function makePrintCall(url, printer_uuid, options = {}) {	
	var uuid = uuidv4();
	var current_printer = fetchPrinterFromUUID(config.get('printers'), printer_uuid);
	options.printer = current_printer.deviceId;
	// options.sumatraPdfPath = "./SumatraPDF.exe"

	fetchUrl(url, (error, meta, body) => {
		fs.writeFile('./pdfs/' + uuid + '.pdf', body, (err) => {
			if (err) {
				console.log(err);
			} else {
				print.print('./pdfs/' + uuid + '.pdf', options)
				.then(() => {
					fs.rm('./pdfs/' + uuid + '.pdf', {}, () => {});
					// return true;
				})
				// .catch((e) => {
				// 	return e;
				// })
			}
		})
	});
}

async function syncPrinters() {
	printers = config.get('printers');
	// Add new printers
	var list_of_printers = await print.getPrinters();
	list_of_printers.forEach((item1) => {
		var found = false;
		printers.forEach((item2) => {
			if (item2.name == item1.name)
				found = true;
		});
		if (found == false) {
			item1.uuid = uuidv4()
			printers.push(item1);
		}
	})
	// Delete old printers
	printers.forEach((item2, index2) => {
		var found = false;
		list_of_printers.forEach((item1) => {
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
	app.get('/', (req, res) => {
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
	app.get('/printers', (req, res) => {
		var temp_printers = printers;
		temp_printers.forEach((item1, index1) => {
			item1.link = "https://127.0.0.1:" + port + "/printers/" + item1.uuid;
		});
		res.json(temp_printers);
	});
	app.get('/printers/:uuid', (req, res) => {
		res.json(fetchPrinterFromUUID(printers, req.params.uuid));
	});
	app.post('/printers/print', async (req, res) => {
		resp = await makePrintCall(req.body.url, config.get('default_printer'));
		if(resp == true) res.json({ "success": true, "message": "File printed" });
		res.json({ "success": false, "message": resp });
	});
	app.post('/printers/:uuid/print', (req, res) => {
		makePrintCall(req.body.url, req.params.uuid);
		res.json({
			"success": true
		});
	});
	app.post('/printers/:uuid/set-default', (req, res) => {
		config.set('default_printer', req.params.uuid);
		res.json({
			"success": true
		});
	});
	app.post('/service/set-port', (req, res) => {
		var new_port = req.body.port ?? 50895;
		res.send('Port set to ' + new_port)
		config.set('port', new_port);
		process.on("exit", () => {
			child_process.spawn(process.argv.shift(), process.argv, {
				cwd: process.cwd(),
				detached: true,
				stdio: "inherit"
			});
		});
		process.exit();
	});
	app.post('/service/shutdown', (req, res) => {
		res.send("Shuting down!!!");
		process.exit();
	});
	var options = {
		key: fs.readFileSync('./ssl/private.key'),
		cert: fs.readFileSync('./ssl/certificate.crt'),
		ca: fs.readFileSync('./ssl/ca_bundle.crt'),
	};
	var host = argv.bind_host ?? '127.0.0.1';
	var server = https.createServer(options, app).listen(port, host, () => {
		console.log("Express server listening on port " + port);
	});
	if (argv.open_browser == true) {
		open("https://localhost.scalexy.cloud:" + port)
	}
	if (argv.run_without_clean != true) {
		fs.rm('./pdfs/', { recursive: true, force: true }, (err) => {
			if (err)
				console.error(err);
			else
				fs.mkdir('./pdfs', {},  (err) => {
					if (err) {
						console.error(err);
					}
					else {
					}
				});
		})
	}
}
async function boot() {
	if (argv.install_service == true) {
		install_service();
	}
	if (argv.uninstall_service == true) {
		uninstall_service();
	}
		
	if(!(argv.install_service || argv.uninstall_service) == true)
	{
		await update_ssl();
		main();
	}
}

function install_service() {
	startupManager.add(install_options)
		.then(() => {
			console.log('App added to startup')
		})
		.catch((e) => {
			Console.log('Something went wrong; Perms?', e)
    });
}
function uninstall_service() {
	startupManager.remove(install_options.name)
    .then(() => {
        console.log('App removed from startup')
    })
    .catch((e) => {
        Console.log('Something went wrong; Perms?', e)
    });
}
async function update_ssl() {
	if (!fs.existsSync('./ssl'))
		fs.mkdirSync('./ssl');
	[
		"ca_bundle.crt",
		"certificate.crt",
		"private.key",
	].forEach(async (item, index) => {
		console.log(item)
		await fetchUrl("https://files.scalexy.cloud/localhost/" + item, (error, meta, body) => {
			if (error) {
				console.log(error);
			} else {
				fs.writeFileSync('./ssl/' + item, body);
			}
		});
	});
}

boot()