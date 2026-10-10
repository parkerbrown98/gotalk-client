// Bundled images resolve to an asset reference that image components accept as a source.
declare module '*.png' {
  const source: import('react-native').ImageSourcePropType;
  export default source;
}
