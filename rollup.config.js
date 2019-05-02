import resolve from 'rollup-plugin-node-resolve';
import serve from 'rollup-plugin-serve';
import minify from 'rollup-plugin-babel-minify';

export default {
  input: 'src/main.js',
  output: {
    file: 'dist/bundle.js',
    format: 'umd'
  },
  plugins: [ 
    resolve(),
    minify({}),
    serve('dist')
  ]
};