<template>
  <div class="container">
    <header>
      <h1>Hello World</h1>
    </header>
    <main>
      <p>This is a simple Vue 3 + TypeScript application.</p>
      <p>Built with Vite and deployed via AWS CDK to S3.</p>
      
      <div class="api-section">
        <button @click="checkHealth" :disabled="loading">
          {{ loading ? 'Loading...' : 'Check API Health' }}
        </button>
        
        <div v-if="apiStatus" class="status-box" :class="{ 'status-ok': apiStatus === 'ok' }">
          API Status: {{ apiStatus }}
        </div>
        
        <div v-if="error" class="error-box">
          Error: {{ error }}
        </div>
      </div>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';

export default defineComponent({
  name: 'App',
  setup() {
    const loading = ref(false);
    const apiStatus = ref('');
    const error = ref('');
    
    const checkHealth = async () => {
      loading.value = true;
      apiStatus.value = '';
      error.value = '';
      
      try {
        // Replace with your actual API endpoint
        const apiUrl = 'https://ciqe0d8uig.execute-api.eu-west-1.amazonaws.com/prod/api/health';
        
        console.log('Calling health endpoint:', apiUrl);
        
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        // Log the full response
        console.log('Health endpoint response:', JSON.stringify(data));
        // Update UI with status
        apiStatus.value = data.status;
      } catch (err) {
        console.error('Error calling health endpoint:', err);
        error.value = err instanceof Error ? err.message : 'Unknown error occurred';
      } finally {
        loading.value = false;
      }
    };
    
    return {
      loading,
      apiStatus,
      error,
      checkHealth
    };
  }
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

.api-section {
  margin-top: 30px;
  padding: 20px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

button {
  background-color: #42b983;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  transition: background-color 0.3s;
}

button:hover {
  background-color: #3aa876;
}

button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.status-box {
  margin-top: 20px;
  padding: 10px;
  border-radius: 4px;
  background-color: #f8f8f8;
  font-weight: bold;
}

.status-ok {
  background-color: #dff2e9;
  color: #2c7a5a;
}

.error-box {
  margin-top: 20px;
  padding: 10px;
  border-radius: 4px;
  background-color: #fde8e8;
  color: #c53030;
}
</style>