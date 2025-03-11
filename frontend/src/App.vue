<template>
  <div>
    <h1 class="header">Graph Data Visualization</h1>
    <!-- Loading overlay -->
    <div v-if="loading" class="loading-overlay">
      <div class="loader"></div>
      <p>Loading graph data...</p>
    </div>
    <div ref="graphContainer" class="graph-container"></div>
    <div v-if="error" class="error">{{ error }}</div>

    <!-- Node popup -->
    <div v-if="showPopup" class="node-popup" :style="popupStyle">
      <button class="close-button" @click="showPopup = false">×</button>
      <h3>{{ selectedNode?.name }}</h3>
      <p>{{ selectedNode?.description }}</p>
      <p>Parent: {{ selectedNode?.parent || 'None' }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import * as d3 from 'd3';
import axios from 'axios';

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

const graphContainer = ref<HTMLDivElement | null>(null);
const apiGatewayId = import.meta.env.VITE_API_GATEWAY_ID || ''
const awsRegion = import.meta.env.VITE_AWS_REGION || 'eu-west-1'
const environment = import.meta.env.VITE_ENVIRONMENT || 'prod'

// UI state
const loading = ref(false);
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
    const graphApiUrl = `https://${apiGatewayId}.execute-api.${awsRegion}.amazonaws.com/${environment}/api/graph`
    const { data: graphApiResponse } = await axios.get(graphApiUrl);
    console.log('Graph data response:', JSON.stringify(graphApiResponse));
    const graphData = prepareGraphData(graphApiResponse.data);
    // Ensure the SVG is initialized before rendering
    initializeSVG();
    renderHierarchicalGraph(graphData);
  } catch (apiError) {
    console.error('API Error:', apiError);
    error.value = 'Could not fetch data from API';
    // Optionally, add fallback to sample data
  } finally {
    loading.value = false;
  }
};

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


const renderHierarchicalGraph = (graphData: GraphData): void => {
  // Ensure SVG is initialized
  if (!svg) return console.error('SVG not initialized');

  // Just use the svg selection directly
  const svgSelection = svg;

  // Clear existing SVG content
  svgSelection.selectAll("*").remove();

  // Configuration options
  const width = 800;
  const height = 600;
  const nodeWidth = 100;
  const nodeHeight = 50;
  const padding = 1.5;
  const stroke = "#999";
  const strokeWidth = 2;
  const nodeGap = 10;

  // Convert flat data to hierarchy format expected by Tree function
  const hierarchyData = {
    name: "root",
    children: [] as any[],
    description: '',
    id: ''
  };

  // Find root node and build tree
  const rootNode = graphData.nodes.find(n => !n.parent);
  if (!rootNode) return console.error('No root node found');

  // Build hierarchical data structure
  hierarchyData.name = rootNode.name;
  hierarchyData.description = rootNode.description;
  hierarchyData.id = rootNode.id;

  // Recursive function to build the tree
  function buildChildren(parentName: string): any[] {
    return graphData.nodes
      .filter(node => node.parent === parentName)
      .map(node => ({
        name: node.name,
        description: node.description,
        id: node.id,
        children: buildChildren(node.name)
      }));
  }

  hierarchyData.children = buildChildren(rootNode.name);

  // Create hierarchy and apply tree layout
  const root = d3.hierarchy(hierarchyData);

  // Compute the layout
  const dy = width / (root.height + padding);
  const dx = 40;

  // Use d3.tree layout
  d3.tree().nodeSize([dx, dy])(root as unknown as any);

  // Center the tree
  let x0 = Infinity;
  let x1 = -x0;
  root.each(d => {
    if (d.x != null) {
      x1 = Math.max(x1, d.x);
      x0 = Math.min(x0, d.x);
    }
  });

  // Apply viewBox and setup
  svgSelection
    .attr("viewBox", [-dy * padding / 2, x0 - dx, width, height])
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("preserveAspectRatio", "xMidYMid meet");

  // Add arrowhead marker
  svgSelection
    .append('defs').append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 8)
    .attr('refY', 0)
    .attr('orient', 'auto')
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', stroke);

  // Special case for root node
  if (root.children && root.children.length > 0) {
    const rootY = root.y || 0;
    const rootX = root.x || 0;
    const verticalX = rootY + 100;

    // Find min and max Y of children
    const childrenXs = root.children.map(d => d.x || 0);
    const minX = Math.min(...childrenXs);
    const maxX = Math.max(...childrenXs);

    // Create vertical connector
    svgSelection
      .append("line")
      .attr("x1", verticalX)
      .attr("y1", minX)
      .attr("x2", verticalX)
      .attr("y2", maxX)
      .attr("stroke", stroke)
      .attr("stroke-width", strokeWidth);

    // Create horizontal line from root to vertical
    svgSelection
      .append("path")
      .attr("d", `M${rootY},${rootX}L${verticalX},${rootX}`)
      .attr("fill", "none")
      .attr("stroke", stroke)
      .attr("stroke-width", strokeWidth);

    // Create lines from vertical to each child
    svgSelection
      .selectAll(".root-child-link")
      .data(root.children)
      .join("path")
      .attr("class", "root-child-link")
      .attr("d", d => {
        const childY = d.y || 0;
        const childX = d.x || 0;
        const endY = childY - nodeWidth / 2 - nodeGap - 10;
        return `M${verticalX},${childX}L${endY},${childX}`;
      })
      .attr("fill", "none")
      .attr("stroke", stroke)
      .attr("stroke-width", strokeWidth)
      .attr("marker-end", "url(#arrowhead)");
  }

  // Draw links between non-root nodes
  svgSelection
    .append("g")
    .attr("fill", "none")
    .attr("stroke", stroke)
    .attr("stroke-width", strokeWidth)
    .selectAll("path")
    .data(root.links().filter(d => d.source.depth > 0))
    .join("path")
    .attr("d", d => {
      const sourceY = d.source.y || 0;
      const sourceX = d.source.x || 0;
      const targetY = d.target.y || 0;
      const targetX = d.target.x || 0;
      const endY = targetY - nodeWidth / 2 - nodeGap;
      return `M${sourceY},${sourceX}L${endY},${targetX}`;
    })
    .attr("marker-end", "url(#arrowhead)");

  // Draw nodes as rectangles
  const node = svgSelection
    .append("g")
    .selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("transform", d => `translate(${d.y},${d.x})`);

  // Add rectangles
  node.append("rect")
    .attr("x", -nodeWidth / 2)
    .attr("y", -nodeHeight / 2)
    .attr("width", nodeWidth)
    .attr("height", nodeHeight)
    .attr("rx", 5)
    .attr("ry", 5)
    .attr("fill", d => colorByDepth(d.depth))
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .on("click", (event, d) => {
      // Get parent name
      let parentName = "";
      if (d.parent) {
        parentName = d.parent.data.name || "";
      }

      selectedNode.value = {
        name: d.data.name || "",
        description: d.data.description || "",
        parent: parentName,
        id: d.data.id || d.data.name || "",
        depth: d.depth
      };

      showPopup.value = true;
      popupStyle.value = {
        top: `${event.pageY}px`,
        left: `${event.pageX + 10}px`
      };
    });

  // Add labels
  node.append("text")
    .attr("dy", "0.32em")
    .attr("text-anchor", "middle")
    .attr("fill", "white")
    .attr("font-weight", "bold")
    .attr("pointer-events", "none")
    .text(d => d.data.name);
};
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
</script>

<script lang="ts">
export default {
  name: 'App'
}
</script>

<style scoped>
.graph-container {
  width: 100%;
  height: 600px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.node-popup {
  position: absolute;
  background: white;
  border: 1px solid #ccc;
  padding: 10px;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.error {
  color: red;
  margin: 10px 0;
}

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

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.loader {
  border: 5px solid #f3f3f3;
  border-top: 5px solid #3498db;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: spin 1s linear infinite;
  margin-bottom: 15px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>