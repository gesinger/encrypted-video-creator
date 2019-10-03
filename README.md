# Encrypted Video Creator

A simple script to create an encrypted HLS/DASH stream using [shaka packager](https://github.com/google/shaka-packager).

Performs most of the instructions found in the [associated doc](creating-test-drm-content.md).

## Installing

See the "Requirements" section in the [creating test drm content doc](creating-test-drm-content.md) for instructions on building [shaka packager](https://github.com/google/shaka-packager) and [pssh-box](https://github.com/google/shaka-packager/tree/master/packager/tools/pssh).

After those scripts are available, run:

```
$ npm install
```

## Using

To see the options, run:

```
$ npm run start -- -h
```

A sample command using all the defaults (generates a clear key encrypted source):

```
$ npm run start -- --source video.mp4
```

Sample command using Widevine defaults (generates a test Widevine encrypted source using the [test credentials provided by shaka packager]):

```
$ npm run start -- --source im.mp4 --key-system widevine
```

## Note

Many of the options have not been tested, but should provide a good foundation for future enhancements/fixes.

[test credentials provided by shaka packager]: https://google.github.io/shaka-packager/html/tutorials/widevine.html#widevine-test-credential
