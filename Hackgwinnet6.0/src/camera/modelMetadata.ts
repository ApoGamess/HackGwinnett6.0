/** Metadata for the one baseline object model; not observations or private data. */
export const cameraModelMetadata = Object.freeze({
  id: 'coco-ssd-lite-mobilenet-v2',
  modelPackage: '@tensorflow-models/coco-ssd',
  modelPackageVersion: '2.2.3',
  runtimePackage: '@tensorflow/tfjs',
  runtimeVersion: '4.22.0',
  base: 'lite_mobilenet_v2',
  codeLicense: 'Apache-2.0',
  upstreamLicense: 'https://github.com/tensorflow/tfjs-models/blob/master/LICENSE',
  modelSource: 'https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd',
  classesSource: 'https://github.com/tensorflow/tfjs-models/blob/master/coco-ssd/src/classes.ts',
  // Verified in installed 2.2.3 dist/coco-ssd.node.js BASE_PATH + getPrefix.
  // The loader uses the package default rather than constructing an asset URL.
  defaultModelManifest: 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json',
  processing: 'local-device',
  offlineVerified: false,
  dataset: 'COCO',
})
