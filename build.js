const { compile } = require("nexe");

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { isWindows } = require("nexe/lib/util");

const argv = yargs(hideBin(process.argv)).argv

function compileForTraget(platform, target, python_path, clean) {	
	compile({
		input: 'server.js',
		targets: [
			platform + '-' + target
		],
		resources: [
			// `./node_modules/pdf-to-printer/**/*`,
			`./node_modules/**/*`,
			`./server.js`,
			`./package.json`,
		],

		patches: [
			async (compiler, next) => {
				await compiler.setFileContentsAsync(
					'lib/new-native-module.js',
					'module.exports = 42'
				)
				return next()
			}
		],
		build: true,
		output: 'output/lprp_' + platform + '_' + target + (isWindows ? '.exe' : ''),
		verbose: true,
		ico: 'renzo.ico',
		python: python_path,
		configure: (isWindows ? '' : '--ninja'),
		// make: (isWindows ? '' : '-j3'),
		rc: {
			CompanyName: "Renzo Solutions Private Limited",
			ProductName: "Renzo LPRP",
			FileDescription: "Local reverse proxy for printers",
			FileVersion: "0.1.1",
			ProductVersion: "0.1.1",
			OriginalFilename: 'lprp_' + platform + '_' + target + (isWindows ? '.exe' : ''),
			InternalName: "lprp",
			LegalCopyright: "© 2022 Renzo Solutions Private Limited",
		},
		// clean: true
	}).then(() => {
		console.log('success')
	})
}

compileForTraget(argv.target_platform, argv.target_arch, argv.python_path, argv.clean || false);	