<template>
  <div class="container">
    <header>
      <h1>Graph Data Visualization</h1>
    </header>
    <main>
      <div class="info-panel">

        <!-- <button @click="checkHealth" :disabled="healthLoading">
          {{ healthLoading ? 'Checking...' : 'Check API Health' }}
        </button> -->

        <div v-if="apiStatus" class="status-box" :class="{ 'status-ok': apiStatus === 'ok' }">
          API Status: {{ apiStatus }}
        </div>

        <div v-if="error" class="error-box">
          Error: {{ error }}
        </div>
      </div>

      <div class="graph-container" ref="graphContainer"></div>

      <!-- Node popup details -->
      <div v-if="showPopup" class="node-popup" :style="popupStyle">
        <div class="popup-header">
          <h3>{{ selectedNode?.name }}</h3>
          <button class="close-button" @click="showPopup = false">×</button>
        </div>
        <div class="popup-body">
          <p v-if="selectedNode?.description">{{ selectedNode?.description }}</p>
          <p v-if="selectedNode?.parent"><strong>Parent:</strong> {{ selectedNode?.parent }}</p>
        </div>
      </div>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted } from 'vue';
import * as d3 from 'd3';

import { HierarchyPointLink, HierarchyPointNode } from 'd3';

interface GraphNode {
  id: string;
  name: string;
  description: string;
  parent: string;
  depth: number;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface NodeData {
  name: string;
  description: string;
  parent: string;
  children: NodeData[];
}

interface ApiResponse {
  data: NodeData[];
}

export default defineComponent({
  name: 'App',
  setup() {
    // Graph container ref
    const graphContainer = ref<HTMLDivElement | null>(null);

    // Read API URLs from environment variables with fallback values
    const graphApiUrl = 'https://ciqe0d8uig.execute-api.eu-west-1.amazonaws.com/prod/api/graph';
    const healthApiUrl = 'https://ciqe0d8uig.execute-api.eu-west-1.amazonaws.com/prod/api/health';

    console.log('Using Graph API URL:', graphApiUrl);
    console.log('Using Health API URL:', healthApiUrl);

    // UI state
    const loading = ref(false);
    const healthLoading = ref(false);
    const apiStatus = ref('');
    const error = ref('');

    // Popup state
    const selectedNode = ref<GraphNode | null>(null);
    const showPopup = ref(false);
    const popupStyle = ref({
      top: '0px',
      left: '0px'
    });

    // D3 elements
    let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;

    // Check API health
    const checkHealth = async () => {
      healthLoading.value = true;
      apiStatus.value = '';
      error.value = '';

      try {
        console.log('Calling health endpoint:', healthApiUrl);

        const response = await fetch(healthApiUrl);
        const data = await response.json();

        console.log('Health endpoint response:', data);
        apiStatus.value = data.status;
      } catch (err) {
        console.error('Error calling health endpoint:', err);
        error.value = err instanceof Error ? err.message : 'Unknown error occurred';
      } finally {
        healthLoading.value = false;
      }
    };

    // Prepare data for D3 tree layout
    const prepareGraphData = (rootNodes: NodeData[]): GraphData => {
      const nodes: GraphNode[] = [];
      const links: GraphLink[] = [];

      // Function to recursively process nodes
      const processNode = (node: NodeData, depth = 0): void => {
        // Add the current node
        const nodeObj: GraphNode = {
          id: node.name,
          name: node.name,
          description: node.description,
          parent: node.parent,
          depth: depth
        };
        nodes.push(nodeObj);

        // Process children and create links
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => {
            // Add link from parent to child
            links.push({
              source: node.name,
              target: child.name
            });

            // Process the child recursively
            processNode(child, depth + 1);
          });
        }
      };

      // Process each root node
      rootNodes.forEach(rootNode => {
        processNode(rootNode);
      });

      return { nodes, links };
    };

    const fetchGraphData = async (): Promise<void> => {
      loading.value = true;
      error.value = '';

      try {
        console.log('Fetching graph data from:', graphApiUrl);
        const response = await fetch(graphApiUrl);
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        const { data } = await response.json();
        console.log('Graph data response:', data);
        const graphData = prepareGraphData(data);

        // Ensure the SVG is initialized before rendering
        initializeSVG();
        renderHierarchicalGraph(graphData);
        console.log('success......')
      } catch (apiError) {
        console.error('API Error:', apiError);
        error.value = 'Could not fetch data from API. Using sample data instead.';
        // Optionally, add fallback to sample data
      } finally {
        loading.value = false;
      }
    };

    // Initialize SVG 
    const initializeSVG = () => {
      // Remove any existing SVG first
      if (graphContainer.value) {
        graphContainer.value.innerHTML = '';

        // Set up SVG with responsive sizing
        const width = graphContainer.value.clientWidth || 800;
        const height = graphContainer.value.clientHeight || 600;

        svg = d3.select(graphContainer.value)
          .append('svg')
          .attr('width', '100%')
          .attr('height', '100%')
          .attr('viewBox', `0 0 ${width} ${height}`)
          .attr('preserveAspectRatio', 'xMidYMid meet');
      }
    };

    // New render function for hierarchical layout
    const renderHierarchicalGraph = (graphData: GraphData): void => {
      // Ensure SVG is initialized
      if (!svg) {
        console.error('SVG not initialized');
        return;
      }

      const nodeMap = new Map<string, GraphNode>();
      graphData.nodes.forEach(node => nodeMap.set(node.id, node));
      // Node dimensions
      const nodeWidth = 100;
      const nodeHeight = 50;

      // Create a tree layout
      const treeLayout = d3.tree<GraphNode>().size([400, 500]);
      const horizontalMargin = 100; // Added margin to prevent left overflow
      // Create a hierarchical root
      const rootNode = graphData.nodes.find(n => !n.parent);
      if (!rootNode) {
        console.error('No root node found');
        return;
      }

      const hierarchyData = {
        name: rootNode.name,
        children: graphData.nodes
          .filter(n => n.parent === rootNode.name)
          .map(child => ({
            name: child.name,
            description: child.description,
            children: graphData.nodes.filter(n => n.parent === child.name)
          }))
      };
      const root = d3.hierarchy<any>(hierarchyData, d => d.children)

      // Apply the tree layout
      const treeData = treeLayout(root);

      // Draw nodes as rectangles
      const nodes = svg
        .append('g')
        .attr('transform', `translate(${horizontalMargin}, 0)`)
        .attr('class', 'nodes')
        .selectAll('rect')
        .data(treeData.descendants())
        .enter()
        .append('rect')
        .attr('width', nodeWidth)
        .attr('height', nodeHeight)
        .attr('x', d => (d.y || 0) - nodeWidth / 2)
        .attr('y', d => (d.x || 0) - nodeHeight / 2)
        .attr('rx', 5)
        .attr('ry', 5)
        .attr('fill', d => colorByDepth(d.depth))
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .on('click', (event, d) => {
          // Show popup with node details
          selectedNode.value = {
            name: d.data.name,
            description: d.data.description,
            parent: '',
            id: d.data.name,
            depth: d.depth
          };
          // selectedNode.value = d.data;
          showPopup.value = true;

          // Position popup near the clicked node
          popupStyle.value = {
            top: `${(d.x || 0) - nodeHeight / 2 + 10}px`,
            left: `${(d.y || 0) + nodeHeight / 2 + 10}px`
          };
        });

      // Add arrowhead marker
      svg.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', nodeWidth / 2 + 15)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#999');

      // Draw links
      const links = svg.append('g')
        .attr('transform', `translate(${horizontalMargin}, 0)`)
        .attr('class', 'links')
        .selectAll('path')
        .data(treeData.links())
        .enter()
        .append('path')
        .attr('d', (linkData: d3.HierarchyPointLink<GraphNode>) => {
          const sourceX = linkData.source.y ?? 0;
          const sourceY = linkData.source.x ?? 0;
          const targetX = linkData.target.y ?? 0;
          const targetY = linkData.target.x ?? 0;

          return `M${sourceX},${sourceY}C${(sourceX + targetX) / 2},${sourceY} ${(sourceX + targetX) / 2},${targetY} ${targetX},${targetY}`;
        })
        .attr('fill', 'none')
        .attr('stroke', '#999')
        .attr('stroke-width', 2)
        .attr('marker-end', 'url(#arrowhead)');

      // Add labels
      const labels = svg.append('g')
        .attr('transform', `translate(${horizontalMargin}, 0)`)
        .attr('class', 'labels')
        .selectAll('text')
        .data(treeData.descendants())
        .enter()
        .append('text')
        .attr('x', d => d.y || 0)
        .attr('y', d => d.x || 0)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .text(d => d.data.name)
        .attr('fill', 'white')
        .attr('font-weight', 'bold')
        .attr('pointer-events', 'none');
    };

    // Helper function to generate colors based on node depth
    const colorByDepth = (depth: number): string => {
      const colors = [
        '#4CAF50', // Green for root
        '#2196F3', // Blue
        '#FFC107', // Amber
        '#9C27B0', // Purple
        '#FF5722'  // Deep Orange
      ];
      return colors[depth % colors.length];
    };

    // Load initial graph data
    onMounted(() => {
      fetchGraphData();
    });

    // Clean up when component is unmounted
    onUnmounted(() => {
      // No simulation to stop in this version
    });

    return {
      graphContainer,
      fetchGraphData,
      checkHealth,
      loading,
      healthLoading,
      apiStatus,
      error,
      selectedNode,
      showPopup,
      popupStyle
    };
  }
});
</script>

<style>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

header {
  margin-bottom: 20px;
  text-align: center;
}

h1 {
  color: #42b983;
}

.info-panel {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.graph-container {
  border: 1px solid #ccc;
  border-radius: 4px;
  height: 500px;
  background-color: #f9f9f9;
  overflow: hidden;
  margin-bottom: 20px;
  position: relative;
}

.status-box {
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
  padding: 10px;
  border-radius: 4px;
  background-color: #fde8e8;
  color: #c53030;
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

/* Popup styling */
.node-popup {
  position: absolute;
  width: 200px;
  background-color: white;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.popup-header {
  background-color: #f0f0f0;
  padding: 8px 12px;
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.popup-header h3 {
  margin: 0;
  font-size: 16px;
}

.close-button {
  background: none;
  border: none;
  font-size: 20px;
  color: #666;
  cursor: pointer;
  padding: 0 5px;
}

.popup-body {
  padding: 12px;
}

.popup-body p {
  margin: 0 0 8px 0;
}
</style>