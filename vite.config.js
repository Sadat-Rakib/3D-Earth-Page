import glsl from 'vite-plugin-glsl'

export default {
  root: 'src',
  publicDir: '../static',
  build: {
    outDir: '../dist'
  },
  plugins: [
    glsl()
  ]
}
