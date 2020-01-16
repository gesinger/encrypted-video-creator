const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');
const handlebars = require('handlebars');
const { hexString } = require('./utils');

handlebars.registerHelper('jsifyHexStringAsUint8Array', (hexString) => {
  const hexified = hexString.match(/.{1,2}/g).map((twoChars) => `0x${twoChars}`);
  return `new Uint8Array([${hexified.join(', ')}])`;
});

const CLEARKEY_README_TEMPLATE_PATH = __dirname + '/../templates/clearkey-readme.hbs';
const CLEARKEY_CODE_TEMPLATE_PATH = __dirname + '/../templates/clearkey-code.hbs';
const WIDEVINE_README_TEMPLATE_PATH = __dirname + '/../templates/widevine-readme.hbs';
const WIDEVINE_CODE_TEMPLATE_PATH = __dirname + '/../templates/widevine-code.hbs';

// from https://google.github.io/shaka-packager/html/tutorials/widevine.html#widevine-test-credential
const WIDEVINE_TEST_KEY_SERVER_URL =
  'https://license.uat.widevine.com/cenc/getcontentkey/widevine_test';
const WIDEVINE_TEST_LICENSE_PROXY = 'https://proxy.uat.widevine.com/proxy';
const WIDEVINE_TEST_AES_SIGNING_KEY =
  '1ae8ccd0e7985cc0b6203a55855a1034afc252980e970ca90e5202689f947ab9';
const WIDEVINE_TEST_AES_SIGNING_IV = 'd58ce954203b7c9a9a9d467f59839249';
const WIDEVINE_TEST_SIGNER = 'widevine_test';

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

const getStreamsArg = ({ manifestType, sourcePath, outputDir }) => {
  const inAudio = `in=${sourcePath}`;
  const inVideo = `in=${sourcePath}`;

  if (manifestType === 'dash') {
    const initAudio = `init_segment=${outputDir}/audio/init.mp4`;
    const initVideo = `init_segment=${outputDir}/video/init.mp4`;
    // Using segment template changes the manifest from the standard segment base with
    // SIDX to segment template, and uses a dynamic manifest type (as it is assumed to be
    // live). Since it's easier to debug segment templates, use that, and the manifest
    // type will later be changed to static.
    const templateAudio = `segment_template=${outputDir}/audio/$Number$.m4s`;
    const templateVideo = `segment_template=${outputDir}/video/$Number$.m4s`;

    return `'${inAudio},stream=audio,${initAudio},${templateAudio},drm_label=AUDIO' \
      '${inVideo},stream=video,${initVideo},${templateVideo},drm_label=SD'`;
  }

  return `'${inAudio},stream=audio,output=${outputDir}/audio-out.mp4,drm_label=AUDIO' \
    '${inVideo},stream=video,output=${outputDir}/video-out.mp4,drm_label=SD'`;
};

const shakaPackagerWidevine = async ({
  shakaPackagerPath,
  sourcePath,
  outputDir,
  manifestName,
  manifestType,
  segmentDuration
}) => {
  const manifestTypeArg = manifestType === 'dash' ?
    '--mpd_output' :
    '--hls_master_playlist_output';
  const command = `${shakaPackagerPath} \
    ${getStreamsArg({ manifestType, sourcePath, outputDir })} \
    --enable_widevine_encryption \
    --key_server_url ${WIDEVINE_TEST_KEY_SERVER_URL} \
    --segment_duration ${segmentDuration} \
    --content_id ${hexString(32)} \
    --signer ${WIDEVINE_TEST_SIGNER} \
    --aes_signing_key ${WIDEVINE_TEST_AES_SIGNING_KEY} \
    --aes_signing_iv ${WIDEVINE_TEST_AES_SIGNING_IV} \
    --protection_systems Widevine \
    ${manifestTypeArg} ${outputDir}/${manifestName}
  `;
  const { error, stdout, stderr } = await exec(command);

  if (error) {
    console.error(error, stderr, stdout);
  }
};

const shakaPackagerClearkey = async ({
  shakaPackagerPath,
  sourcePath,
  outputDir,
  manifestName,
  manifestType,
  segmentDuration,
  psshHex,
  keyIdAudio,
  keyIdVideo,
  keyAudio,
  keyVideo
}) => {
  const manifestTypeArg = manifestType === 'dash' ?
    '--mpd_output' :
    '--hls_master_playlist_output';
  const command = `${shakaPackagerPath} \
    in=${sourcePath},stream=audio,output=${outputDir}/audio-out.mp4,drm_label=AUDIO \
    in=${sourcePath},stream=video,output=${outputDir}/video-out.mp4,drm_label=SD \
    --enable_raw_key_encryption \
    --segment_duration ${segmentDuration} \
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

const cleanDashManifest = ({ outputDir, masterName }) => {
  const masterPath = `${outputDir}/${masterName}`;

  // live to VOD
  replaceFromFile({
    path: masterPath,
    find: 'type=\'dynamic\'',
    replace: 'type=\'static\''
  });
};

const writeOutputFiles = ({
  readmeTemplatePath,
  codeTemplatePath,
  outputDir,
  readmeVars,
  codeVars
}) => {
  const readmeTemplateFile = fs.readFileSync(readmeTemplatePath, 'utf-8');
  const codeTemplateFile = fs.readFileSync(codeTemplatePath, 'utf-8');
  const readmeTemplate = handlebars.compile(readmeTemplateFile);
  const codeTemplate = handlebars.compile(codeTemplateFile);

  fs.writeFileSync(
    `${outputDir}/README.md`,
    readmeTemplate(readmeVars),
    'utf-8'
  );
  fs.writeFileSync(
    `${outputDir}/sample-code.js`,
    codeTemplate(codeVars),
    'utf-8'
  );
};

const generateManifest = async ({
  outputDir,
  manifestType,
  segmentDuration,
  psshBoxPath,
  shakaPackagerPath,
  sourcePath,
  keySystem,
  keyIdAudio,
  keyIdVideo,
  keyAudio,
  keyVideo
}) => {
  const manifestName = manifestType === 'dash' ? 'manifest.mpd' : 'master.m3u8';
  const codeVars = { manifestName };
  const readmeVars = {};

  if (keySystem === 'clearkey') {
    const psshHex = await pssh({ psshBoxPath, keyIds: [keyIdAudio, keyIdVideo] });

    await shakaPackagerClearkey({
      shakaPackagerPath,
      sourcePath,
      outputDir,
      manifestName,
      manifestType,
      segmentDuration,
      psshHex,
      keyIdAudio,
      keyIdVideo,
      keyAudio,
      keyVideo
    });

    const audioPsshHex = await pssh({ psshBoxPath, keyIds: [keyIdAudio] });
    const videoPsshHex = await pssh({ psshBoxPath, keyIds: [keyIdVideo] });
    const keys = [{
      type: 'audio',
      key: keyAudio,
      keyId: keyIdAudio,
      pssh: audioPsshHex
    }, {
      type: 'video',
      key: keyVideo,
      keyId: keyIdVideo,
      pssh: videoPsshHex
    }];

    readmeVars.keys = keys;
    codeVars.keys = keys;
  } else if (keySystem === 'widevine') {
    await shakaPackagerWidevine({
      shakaPackagerPath,
      sourcePath,
      outputDir,
      manifestName,
      manifestType,
      segmentDuration
    });
    readmeVars.licenseUrl = WIDEVINE_TEST_LICENSE_PROXY;
    codeVars.licenseUrl = WIDEVINE_TEST_LICENSE_PROXY;
  }

  if (manifestType === 'hls') {
    cleanHlsManifests({ outputDir, masterName: manifestName });
  } else if (manifestType === 'dash') {
    cleanDashManifest({ outputDir, masterName: manifestName });
  }

  const readmeTemplatePath = keySystem === 'clearkey' ?
    CLEARKEY_README_TEMPLATE_PATH : WIDEVINE_README_TEMPLATE_PATH;
  const codeTemplatePath = keySystem === 'clearkey' ?
    CLEARKEY_CODE_TEMPLATE_PATH : WIDEVINE_CODE_TEMPLATE_PATH;

  writeOutputFiles({
    readmeTemplatePath,
    codeTemplatePath,
    outputDir,
    readmeVars,
    codeVars
  });
};

module.exports = {
  generateManifest
}
