<template>
  <div class="container">
    <header>
      <h1>Hello World</h1>
    </header>
    <main>
      <p>This is a simple Vue 3 + TypeScript application.</p>
      <p>Built with Vite and deployed via AWS CDK to S3.</p>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'App'
});
</script>

<style>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
  text-align: center;
}

header {
  margin-bottom: 20px;
}

h1 {
  color: #42b983; /* Vue green color */
}

main {
  padding: 20px;
  background-color: #f5f5f5;
  border-radius: 8px;
}
</style>