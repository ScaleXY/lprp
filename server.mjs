//imports
import express from 'express';
import Configstore from 'configstore';
import fs from 'fs';
import open from 'open';
import child_process from 'child_process';

//inits
const app = express()

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const config = new Configstore(packageJson.name, {
	port: 50895
});

function main()
{
	var port = config.get('port');
	app.get('/', function (req, res) {
		res.json({
			"application": {
				"name": "Local Printer Reverse Proxy",
				"version": "0.1.1",
			},
			"links": {
				"commands": {
					"printers": "http://127.0.0.1:" + port + "/printers",
					"set printer": "http://127.0.0.1:" + port + "/set-printer",
					"shutdown": "http://127.0.0.1:" + port + "/shutdown",
				},
				"ports": {
					9000: "http://127.0.0.1:" + port + "/set-port?port=9000",
					10000: "http://127.0.0.1:" + port + "/set-port?port=10000",
					50895: "http://127.0.0.1:" + port + "/set-port?port=50895",
				},
			}
		});
		// res.send('UI' + '<a href="./set-port?port=9000">Port 9000</a><a href="./set-port?port=50895">Port 50895</a>')
	});
	app.get('/set-port', function (req, res) {
		var new_port = req.query.port ?? 50895;
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
	app.get('/shutdown', function (req, res) {
		res.send("Shuting down!!!");
		process.exit();
	});
	
	app.listen(port)
	open("http://127.0.0.1:" + port)
}
main()