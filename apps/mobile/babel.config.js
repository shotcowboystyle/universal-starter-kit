/** @param {import('@babel/core').ConfigAPI} api Babel config API supplied by Metro */
// oxlint-disable-next-line unicorn/prefer-module -- Babel/Metro load this file as CommonJS
module.exports = function exports(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
