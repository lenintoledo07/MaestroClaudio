module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // En SDK 54 / reanimated 4, el plugin se movió a react-native-worklets.
      // Este plugin tiene que ser SIEMPRE el último.
      'react-native-worklets/plugin',
    ],
  };
};
