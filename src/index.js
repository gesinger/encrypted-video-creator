const program = require('commander');
const { hexString } = require('./utils');
const { generateManifest } = require('./generate-manifest');

const PSSH_BOX_PATH = '~/repos/shaka-packager/src/out/Release/pssh-box.py';
const SHAKA_PACKAGER_PATH = '~/repos/shaka-packager/src/out/Release/packager';

program.version('0.0.1');

program
  .name('encrypted-video-creator')
  .usage('encrypted-video-creator <source>')
  .option('--source <path>', 'source file')
  .option('--destination <path>', 'destination directory to put assets', 'out')
  .option('--manifest-type <type>', '"hls" or "dash"', 'hls')
  .option('--segment-duration <duration>', 'segment duration to use', 6)
  .option('--pssh-box-path <path>', 'path to pssh-box.py', PSSH_BOX_PATH)
  .option('--shaka-packager-path <path>', 'path to shaka\'s packager', SHAKA_PACKAGER_PATH)
  .option('--key-system <system>', '"clearkey" and "widevine" are supported', 'clearkey')
  .option('--key-id-audio <hex>', 'custom audio 32 char hex string key ID (defaults to random)')
  .option('--key-id-video <hex>', 'custom video 32 char hex string key ID (defaults to random)')
  .option('--key-audio <hex>', 'custom audio 128 bit key in hex (defaults to random)')
  .option('--key-video <hex>', 'custom video 128 bit key (defaults to random)')
  .option('--same-key', 'use same key for audio and video (defaults to true, uses video as primary)', true)
  .option('--audio-only', 'output audio only (defaults to false)', false)
  .option('--video-only', 'output video only (defaults to false)', false);

program.parse(process.argv);

const keyIdAudio = program.keyIdAudio || hexString(32);
const keyIdVideo = program.keyIdVideo || hexString(32);
const keyVideo = program.keyVideo || hexString(32);
const keyAudio = program.sameKey ? keyVideo : (program.keyAudio || hexString(32));
const outputDir = program.destination;

generateManifest({
  outputDir,
  manifestType: program.manifestType,
  segmentDuration: program.segmentDuration,
  psshBoxPath: program.psshBoxPath,
  shakaPackagerPath: program.shakaPackagerPath,
  sourcePath: program.source,
  keySystem: program.keySystem,
  keyIdAudio,
  keyIdVideo,
  keyAudio,
  keyVideo,
  hasAudio: !program.videoOnly,
  hasVideo: !program.audioOnly,
}).then(() => {
  console.log(`Done, please check '${outputDir}/' for README and generated files`);
});
