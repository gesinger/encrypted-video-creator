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

A sample command using all the defaults just takes in a source file:

```
$ npm run start -- --source video.mp4
```

## Note

Many of the options have not been tested, but should provide a good foundation for future enhancements/fixes.
