module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // expo-router requiere reanimated SIEMPRE último.
      'react-native-reanimated/plugin',
    ],
  };
};
