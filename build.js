const { compile } = require("nexe");

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv)).argv

function compileForTraget(platform, target, python_path) {
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
    output: 'output/lprp_' + platform + '_' + target + '.exe',
    verbose: true,
    ico: 'renzo.ico',
	python: python_path,
    rc: {
      CompanyName: "Renzo Solutions Private Limited",
      ProductName: "Renzo LPRP",
      FileDescription: "Local reverse proxy for printers",
      FileVersion: "0.1.1",
      ProductVersion: "0.1.1",
      OriginalFilename: 'lprp_' + platform + '_' + target + (platform == 'windows' ? '.exe' : ''),
      InternalName: "lprp",
      LegalCopyright: "© 2022 Renzo Solutions Private Limited",
    }
  }).then(() => {
    console.log('success')
  })
}

compileForTraget(argv.target_platfrom, argv.target_arch, argv.python_path);	