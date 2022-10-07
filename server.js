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
var fetch = require("fetch");
var path = require("path");
const os = require('os');
var printer = require("pdf-to-printer2");
var https = require('https');

const BASE_URL = "https://localhost.scalexy.cloud";

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
function save(buffer) {
	const pdf_path = path.join(__dirname, "./pdfs/" + uuidv4() + ".pdf");
	fs.writeFileSync(pdf_path, buffer, "binary");
	return pdf_path;
}
  
function remove(pdf_path) {
	fs.unlinkSync(pdf_path);
}

async function makePrintCall(res, url, printer_uuid, options = {}) {
	function onSuccess() { res.json({ "success": true, "message": "File printed" }); }
	function onError(error) { res.json({ "success": false, "message": error }); }
	var current_printer = fetchPrinterFromUUID(config.get('printers'), printer_uuid);
	if(current_printer == null){
		onError("Invalid printer uuid");
	} else {
		options.printer = current_printer.deviceId;
		fetch.fetchUrl(url, (err, meta, body) => {
			const pdf_path = save(body);
			printer
				.print(pdf_path)
				.then(onSuccess)
				.catch(onError)
				.finally(() => remove(pdf_path));
		});
	}
}

async function syncPrinters() {
	printers = config.get('printers');
	// Add new printers
	var list_of_printers = await printer.getPrinters();
	list_of_printers.forEach((item1) => {
		var found = false;
		printers.forEach((item2) => {
			if (item2.deviceId == item1.deviceId)
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
			if (item2.deviceId == item1.deviceId)
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
			item1.link = BASE_URL + ":" + port + "/printers/" + item1.uuid;
		});
		res.json(temp_printers);
	});
	app.get('/printers/:uuid', (req, res) => {
		res.json(fetchPrinterFromUUID(printers, req.params.uuid));
	});
	app.post('/printers/print', async (req, res) => {
		makePrintCall(res, req.body.url, config.get('default_printer'));
	});
	app.post('/printers/:uuid/print', (req, res) => {
		makePrintCall(res, req.body.url, req.params.uuid);
	});
	app.post('/printers/:uuid/set-default', (req, res) => {
		config.set('default_printer', req.params.uuid);
		res.json({ "success": true, "message": "Default printer set!" });
	});
	app.post('/service/set-port', (req, res) => {
		var new_port = req.body.port ?? 50895;
		config.set('port', new_port);
		res.json({ "success": true, "message": "Port set to " + new_port });
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
		res.json({ "success": true, "message": "Shuting down." });
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
		open(BASE_URL + ":" + port)
	}
	if (argv.run_without_clean != true) {
		fs.rm('./pdfs/', { recursive: true, force: true }, (err) => {
			if (err)
				console.error(err);
			else
				fs.mkdir('./pdfs', {},  (err) => { if (err) console.error(err); });
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
	if(!(argv.install_service || argv.uninstall_service) == true) {
		make_dirs();
		await update_ssl();
		main();
	}
}

function install_service() {
	startupManager.add(install_options)
		.then(() => { console.log('App added to startup'); })
		.catch((e) => { console.log('Something went wrong; Perms?', e); });
}
function uninstall_service() {
	startupManager.remove(install_options.name)
		.then(() => { console.log('App removed from startup'); })
		.catch((e) => { console.log('Something went wrong; Perms?', e); });
}
async function make_dirs() {
	if (!fs.existsSync('./ssl')) fs.mkdirSync('./ssl');
	if (!fs.existsSync('./pdfs')) fs.mkdirSync('./pdfs');
}
async function update_ssl() {
	[ "ca_bundle.crt", "certificate.crt", "private.key"].forEach(async (item, index) => {
		await fetch.fetchUrl("https://files.scalexy.cloud/localhost/" + item, (error, meta, body) => {
			if (error) { console.log(error); }
			else { fs.writeFileSync('./ssl/' + item, body); }
		});
	});
}

boot()