export default defineNuxtConfig({
  modules: ['@nuxtjs/tailwindcss', '@nuxt/icon'],
  tailwindcss: {
    exposeConfig: true,
    viewer: true,
    // and more...
  }
})