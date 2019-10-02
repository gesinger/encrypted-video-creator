const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');
const handlebars = require('handlebars');

handlebars.registerHelper('jsifyHexStringAsUint8Array', (hexString) => {
  const hexified = hexString.match(/.{1,2}/g).map((twoChars) => `0x${twoChars}`);
  return `new Uint8Array([${hexified.join(', ')}])`;
});

const README_TEMPLATE_PATH = __dirname + '/../templates/readme.hbs';
const CODE_TEMPLATE_PATH = __dirname + '/../templates/code.hbs';
let readmeTemplate;
let codeTemplate;

const FORMAT_IDS = {
  clearkey: '1077efec-c0b2-4d02-ace3-3c1e52e2fb4b',
  widevine: 'edef8ba9-79d6-4ace-a3c8-27dcd51d21ed'
};

const pssh = async ({ psshBoxPath, keyIds, outputType = 'hex' }) => {
  const keyIdArgs = keyIds.reduce(
    (acc, keyId) => `${acc} --common-system-id --key-id ${keyId}`,
    ''
  );
  const command = `${psshBoxPath} ${keyIdArgs} --${outputType}`;
  const { error, stdout, stderr } = await exec(command);

  if (error) {
    console.error(error, stderr, stdout);
  }

  return stdout.trim();
};

const shakaPackager = async ({
  shakaPackagerPath,
  sourcePath,
  outputDir,
  manifestName,
  manifestType,
  keySystem,
  psshHex,
  keyIdAudio,
  keyIdVideo,
  keyAudio,
  keyVideo
}) => {
  const encryptionTypeArg = keySystem === 'clearkey' ?
    '-enable_raw_key_encryption' :
    '--protection_systems Widevine';
  const manifestTypeArg = manifestType === 'dash' ?
    '--mpd_output' :
    '--hls_master_playlist_output';
  const command = `${shakaPackagerPath} \
    in=${sourcePath},stream=audio,output=${outputDir}/audio-out.mp4,drm_label=AUDIO \
    in=${sourcePath},stream=video,output=${outputDir}/video-out.mp4,drm_label=SD \
    ${encryptionTypeArg} \
    --keys label=AUDIO:key_id=${keyIdAudio}:key=${keyAudio},label=SD:key_id=${keyIdVideo}:key=${keyVideo} \
    --pssh ${psshHex} \
    ${manifestTypeArg} ${outputDir}/${manifestName}
  `;
  const { error, stdout, stderr } = await exec(command);

  if (error) {
    console.error(error, stderr, stdout);
  }
};

const replaceFromFile = ({ path, find, replace }) => {
  const file = fs.readFileSync(path, 'utf-8');
  const newFile = file.replace(find, replace);

  fs.writeFileSync(path, newFile, 'utf-8');
};

const cleanHlsMaster = ({ masterPath }) => {
  // http-streaming requires default to be yes for it to actually be default
  replaceFromFile({
    path: masterPath,
    find: 'AUTOSELECT=YES',
    replace: 'DEFAULT=YES,AUTOSELECT=YES'
  });
};

const removeExtXKey = ({ playlistPath }) => {
  replaceFromFile({
    path: playlistPath,
    find: 'EXT-X-KEY',
    replace: '##EXT-X-KEY'
  });
};

const cleanHlsManifests = ({ outputDir, masterName }) => {
  const masterPath = `${outputDir}/${masterName}`;

  cleanHlsMaster({ masterPath });

  const audioPlaylistPath = `${outputDir}/stream_0.m3u8`;
  const videoPlaylistPath = `${outputDir}/stream_1.m3u8`;

  removeExtXKey({ playlistPath: audioPlaylistPath });
  removeExtXKey({ playlistPath: videoPlaylistPath });
};

const writeOutputMessage = ({
  outputDir,
  manifestName,
  keys,
}) => {
  if (!readmeTemplate || !codeTemplate) {
    const readmeTemplateFile = fs.readFileSync(README_TEMPLATE_PATH, 'utf-8');
    const codeTemplateFile = fs.readFileSync(CODE_TEMPLATE_PATH, 'utf-8');

    readmeTemplate = handlebars.compile(readmeTemplateFile);
    codeTemplate = handlebars.compile(codeTemplateFile);
  }

  fs.writeFileSync(
    `${outputDir}/README.md`,
    readmeTemplate({
      keys
    }),
    'utf-8'
  );
  fs.writeFileSync(
    `${outputDir}/sample-code.js`,
    codeTemplate({
      manifestName,
      keys,
    }),
    'utf-8'
  );
};

const generateManifest = async ({
  outputDir,
  manifestType,
  psshBoxPath,
  shakaPackagerPath,
  sourcePath,
  keySystem,
  keyIdAudio,
  keyIdVideo,
  keyAudio,
  keyVideo
}) => {
  const audioPsshHex = await pssh({ psshBoxPath, keyIds: [keyIdAudio] });
  const videoPsshHex = await pssh({ psshBoxPath, keyIds: [keyIdVideo] });
  const psshHex = await pssh({ psshBoxPath, keyIds: [keyIdAudio, keyIdVideo] });
  const manifestName = manifestType === 'dash' ? 'manifest.mpd' : 'master.m3u8';

  await shakaPackager({
    shakaPackagerPath,
    sourcePath,
    outputDir,
    manifestName,
    manifestType,
    keySystem,
    psshHex,
    keyIdAudio,
    keyIdVideo,
    keyAudio,
    keyVideo
  });

  cleanHlsManifests({ outputDir, masterName: manifestName });
  writeOutputMessage({
    outputDir,
    manifestName,
    keys: [{
      type: 'audio',
      key: keyAudio,
      keyId: keyIdAudio,
      pssh: audioPsshHex
    }, {
      type: 'video',
      key: keyVideo,
      keyId: keyIdVideo,
      pssh: videoPsshHex
    }]
  });
};

module.exports = {
  generateManifest
}
