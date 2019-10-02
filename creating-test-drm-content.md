# Creating Test DRM Content

Testing DRM isn't always the easiest endeavor. Hopefully this document makes it a bit easier by walking through the steps to create some sample DRM content. This is particularly useful for testing [videojs-contrib-eme] in [http-streaming].

## Requirements

Although there are a few packaging tools out there that can create DRM content (e.g., [bento tools](https://www.bento4.com/)), this guide uses the [shaka-packager].

To get [shaka-packager], check out [the options on their README](https://github.com/google/shaka-packager#getting-shaka-packager). In addition, you will need the [pssh-box] utility.

For the remainder of the guide, the [shaka-packager] binary will be referred to as shaka-packager, and the [pssh-box] binary as pssh-box. In the case where you built them from source, they will be found in the following directories:

shaka-packager/src/out/Release/packager
shaka-packager/src/out/Release/pssh-box.py

### Building from Source

The following is an example set of commands to build the shaka-packager and related tools from source. See [the shaka-packager build instructions](https://github.com/google/shaka-packager/blob/master/docs/source/build_instructions.md) for more details.

```bash
# Given a dir called "repos" in the home dir
$ cd ~/repos
$ git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
# For the time being, modify your path to use the depot_tools  binaries
$ PATH="$PATH:$HOME/repos/depot_tools"
$ mkdir shaka-packager
$ cd shaka-packager
$ gclient config https://www.github.com/google/shaka-packager.git --name=src --unmanaged
$ gclient sync --no-history
$ cd src
# This build may take a while
$ ninja -C out/Release
```

The `out/Release/` directory will contain the build artifacts.

## Generating the PSSH box

The Protection System Specific Header box (PSSH, see [the spec for CENC in ISO BMFF], ISO/IEC 23001-7, for more details) defines metadata for a a specific DRM system. For all DRM systems, it has an ID for the system being used and may have [key IDs] which associate content with keys. In addition, a DRM system may include some custom information about license acquisition.

There may be multiple PSSH boxes in a media file, one for each DRM system.

To generate the PSSH box(es), use the [pssh-box] script:

```bash
KEY_ID_AUDIO=00000000000000000000000000000001
KEY_ID_SD=00000000000000000000000000000002
PSSH=`pssh-box --common-system-id --key-id $KEY_ID_AUDIO -- --common-system-id --key-id $KEY_ID_SD --hex`;
```

SD (for standard definition) and AUDIO are labels used by [shaka-packager] to know which key to use to encrypt which content stream if there are multiple.

The key IDs are 128 bits, and here are represented as hex strings. Feel free to generate random hex strings for testing. In addition, the same key ID may be used for both audio and video.

This command will generate the PSSH box as a hex string, which is passed in as the pssh argument for the [shaka-packager] script.

## Creating an HLS master playlist with clear key encrypted content

Only a few things are needed to generate an HLS or DASH encrypted source:

* Video source
* Keys and key IDs for the content
* Combined PSSH box in hex

See [Generating the PSSH box] for more details on key IDs and PSSH boxes.

For this example, we are using [Clear Key] (raw key encryption). [Clear Key] is generally used for testing, but provides a cross browser way to play DRM content without using a proprietary DRM provider (as per the spec, all browsers must support [Clear Key]).

```bash
KEY_AUDIO=000102030405060708090a0b0c0d0e0f;
KEY_SD=000102030405060708090a0b0c0d0eff;
shaka-packager \
  in=video.mp4,stream=audio,output=out/audio.mp4,drm_label=AUDIO \
  in=video.mp4,stream=video,output=out/video.mp4,drm_label=SD \
  --enable_raw_key_encryption \
  --keys label=AUDIO:key_id=$KEY_ID_AUDIO:key=$KEY_AUDIO,label=SD:key_id=$KEY_ID_SD:key=$KEY_SD \
  --pssh $PSSH \
  --hls_master_playlist_output out/master.m3u8
```

The `drm_label`s here are used by [shaka-packager] to identify which key to use to encrypt each stream.

If you want to generate a DASH manifest, change `--hls_master_playlist_output` to `--mpd_output` and the output manifest extension to `mpd`.

## Configuring content and player configs for http-streaming and videojs-contrib-eme

In order to play the content, the key has to be provided to the Content Decryption Module ([CDM]) via the browser's implementation of the Encrypted Media Extension ([EME]) APIs. 

This is done by either the user setting up the [key session]\(s\) for the video element prior to the media playing, or on an [encrypted event] from the video element.

While there are sample implementations available online, [videojs-contrib-eme] abstracts all of that logic away and handles not just the modern [EME] API, but handles older browser-specific APIs as well.

To configure [videojs-contrib-eme] you can follow the docs on the [videojs-contrib-eme README], but a sample is included below for the [Clear Key] encrypted content we created in this guide. Much of the logic is borrowed from the [videojs-contrib-eme example].

```javascript
// modified from
// https://github.com/videojs/vhs-utils/blob/master/src/decode-b64-to-uint8-array.js
const decodeB64ToUint8Array = (b64Text) => {
  // replace base64 variant characters used by shaka packager (avoids errors with atob)
  const safeText = b64Text
    .replace(/_/g,'/')
    .replace(/-/g,'+');
  const decodedString = atob(safeText);
  const array = new Uint8Array(decodedString.length);

  for (let i = 0; i < decodedString.length; i++) {
    array[i] = decodedString.charCodeAt(i);
  }

  return array;
};

// Convert Uint8Array into base64 using base64url alphabet, without padding.
const toBase64 = (u8arr) => {
  return btoa(String.fromCharCode.apply(null, u8arr)).
    replace(/\+/g, '-').replace(/\//g, '_').replace(/=*$/, '');
};

const KEY_AUDIO = new Uint8Array([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
  0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f
]);

const KEY_SD = new Uint8Array([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
  0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0xff
]);

const KEY_ID_AUDIO = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01
]);

const KEY_ID_SD = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02
]);

const keys = [
  {
    keyId: KEY_ID_AUDIO,
    key: KEY_AUDIO
  },
  {
    keyId: KEY_ID_SD,
    key: KEY_SD
  }
];

const base64EncodedPSSHBox = '0000003470737368010000001077EFECC0B24D02ACE33C1E52E2FB4B0000000100000000000000000000000000000001000000000000003470737368010000001077EFECC0B24D02ACE33C1E52E2FB4B000000010000000000000000000000000000000200000000';

const getLicense = (emeOptions, keyMessage, callback) => {
  const keyObjects = [];

  const keyIds = JSON.parse(new TextDecoder().decode(keyMessage)).kids;

  for (let i = 0; i < keyIds.length; i++) {
    const keyId = decodeB64ToUint8Array(keyIds[i]);

    for (let j = 0; j < keys.length; j++) {
      const keyDetails = keys[j];

      // not a proper equality check, but useful for this example
      if (keyId.toString() === keyDetails.keyId.toString()) {
        keyObjects.push({
          kty: 'oct',
          alg: 'A128KW',
          kid: keyIds[i],
          k: toBase64(keyDetails.key)
        });
      }
    }
  }

  callback(null, new TextEncoder().encode(JSON.stringify({ keys: keyObjects })));
};

player.src({
  src: 'https://127.0.0.1:8081/out/master.m3u8',
  type: 'application/x-mpegURL'
});
player.eme.initializeMediaKeys({
  keySystems: {
    'org.w3.clearkey': {
      audioContentType: "audio/mp4; codecs=\"mp4a.40.2\"",
      videoContentType: "video/mp4; codecs=\"avc1.64001E\"",
      pssh: decodeB64ToUint8Array(base64EncodedPSSHBox),
      getLicense
    }
  }
});
```

## Additional Tools

### Serving locally

To serve the files for testing, some browsers (e.g., Chrome) require a secure environment for the EME APIs. This means that you must serve the page and content over HTTPS.

An easy setup for an insecure HTTPS environment may be done as follows:

```bash
# (set Common Name to localhost when prompted)
$ openssl req -nodes -new -x509 -keyout server.key -out server.cert
$ npm install -g http-server
$ http-server --cors --ssl --key server.key --cert server.cert
```

Note that Chrome may require that you enable an insecure localhost flag via chrome://flags/#allow-insecure-localhost

[ffmpeg]: https://ffmpeg.org/
[shaka-packager]: https://github.com/google/shaka-packager
[pssh-box]: https://github.com/google/shaka-packager/tree/master/packager/tools/pssh
[the spec for CENC in ISO BMFF]: https://www.iso.org/obp/ui/#iso:std:iso-iec:23001:-7:ed-3:v1:en
[key IDs]: https://www.w3.org/TR/encrypted-media/#decryption-key-id
[videojs-contrib-eme]: https://github.com/videojs/videojs-contrib-eme
[videojs-contrib-eme README]: https://github.com/videojs/videojs-contrib-eme/blob/master/README.md
[videojs-contrib-eme example]: https://github.com/videojs/videojs-contrib-eme/blob/master/index.html
[http-streaming]: https://github.com/videojs/http-streaming
[Clear Key]: https://www.w3.org/TR/encrypted-media/#clear-key
[EME]: https://www.w3.org/TR/encrypted-media
[CDM]: https://www.w3.org/TR/encrypted-media/#definitions
[key session]: https://www.w3.org/TR/encrypted-media/#definitions
[encrypted event]: https://www.w3.org/TR/encrypted-media/#mediaencryptedevent
