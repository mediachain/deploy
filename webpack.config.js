import path from 'path';

const __dirname = path.resolve();

module.exports = {
  entry: ['babel-polyfill', path.join(__dirname, 'src', 'js', 'app.js')],
  output: {
    path: path.join(__dirname, 'build'),
    filename: 'app.min.js'
  },
  debug: true,
  resolve: {
    alias: {
      vue: 'vue/dist/vue.js',
      clipboard: 'clipboard/dist/clipboard.js',
      jquery: 'jquery/dist/jquery.js',
    }
  },
  module: {
    loaders: [{
      test: /\.js$/,
      loader: 'babel-loader?cacheDirectory',
      include: [
        path.join(__dirname, 'src', 'js'),
      ],
      exclude: /node_modules/
    }]
  }
};
