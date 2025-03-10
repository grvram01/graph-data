<template>
  <div class="container">
    <header>
      <h1>Graph Data Visualization</h1>
    </header>
    <main>
      <div class="info-panel">
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

interface GraphNode {
  id: string;
  name: string;
  description: string;
  parent: string;
  depth: number;
  x?: number;
  y?: number;
}

type StratifyNode = GraphNode & { name: string, parent: string }

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
      // Ensure SVG is initialized and clear it
      if (!svg) return console.error('SVG not initialized');
      svg.selectAll("*").remove();

      // Node dimensions and margins
      const nodeWidth = 100;
      const nodeHeight = 50;
      const margin = { top: 40, right: 120, bottom: 40, left: 120 };
      const width = 800;
      const height = 600;

      // Transform flat data to nested hierarchy
      function buildNestedData(nodes: any) {
        // Find the root node
        const rootNode = nodes.find((node: any) => !node.parent);
        if (!rootNode) return null;

        // Recursive function to build the tree
        const buildTree = (parentName: string) => {
          const children = nodes
            .filter((node: { parent: string }) => node.parent === parentName)
            .map((node: { name: string, description: string, id: string, children: any }) => ({
              name: node.name,
              description: node.description,
              id: node.id || node.name,
              children: buildTree(node.name)
            }));

          return children.length ? children : undefined;
        }

        // Build the complete hierarchy
        return {
          name: rootNode.name,
          description: rootNode.description,
          id: rootNode.id || rootNode.name,
          children: buildTree(rootNode.name)
        };
      }

      // Create hierarchy directly from nested data
      const nestedData = buildNestedData(graphData.nodes);
      const root = d3.hierarchy(nestedData);

      // Set up tree layout with fixed dimensions
      const tree = d3.tree()
        .size([height - margin.top - margin.bottom, width - margin.left - margin.right]);

      // Apply layout
      tree(root as unknown as any);

      // Create an SVG group with margins applied
      const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      // Add arrowhead marker definition
      svg.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', -5)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#999');

      // Handle special case for root connections
      const children = root.children || [];

      if (root && children.length > 0) {
        // Create vertical connector
        const rootX = root.y || 0;
        const rootY = root.x || 0;
        const verticalLineX = rootX + 50;
        const minY = Math.min(...children.map(d => d.x || 0));
        const maxY = Math.max(...children.map(d => d.x || 0));

        // Draw vertical connector
        g.append('line')
          .attr('x1', verticalLineX)
          .attr('y1', minY)
          .attr('x2', verticalLineX)
          .attr('y2', maxY)
          .attr('stroke', '#999')
          .attr('stroke-width', 2);

        // Draw root to vertical line
        g.append('path')
          .attr('d', `M${rootX},${rootY}L${verticalLineX},${rootY}`)
          .attr('stroke', '#999')
          .attr('stroke-width', 2)
          .attr('fill', 'none');

        // Draw connector lines to children
        g.selectAll('.child-link')
          .data(children)
          .join('path')
          .attr('class', 'child-link')
          .attr('d', d => {
            const childX = d.x || 0;
            const childY = d.y || 0;
            const nodeLeftEdge = childY - nodeWidth / 2;
            const gapBeforeNode = 10;
            return `M${verticalLineX},${childX}L${nodeLeftEdge - gapBeforeNode},${childX}`;
          })
          .attr('stroke', '#999')
          .attr('stroke-width', 2)
          .attr('fill', 'none')
          .attr('marker-end', 'url(#arrowhead)');
      }

      // Draw links between lower levels (not from root)
      g.append("g")
        .selectAll("path")
        .data(root.links().filter(d => d.source.depth > 0))
        .join("path")
        .attr("d", d => {
          const nodeGap = 10;
          // Get coordinates with fallbacks to 0 if undefined
          const sourceY = d.source.y || 0;
          const sourceX = d.source.x || 0;
          const targetY = d.target.y || 0;
          const targetX = d.target.x || 0;
          // Calculate end point that stops before the target node
          const endX = targetY - nodeWidth / 2 - nodeGap;
          return `M${sourceY},${sourceX}L${endX},${targetX}`;
        })
        .attr("fill", "none")
        .attr("stroke", "#999")
        .attr("stroke-width", 2)
        .attr("marker-end", "url(#arrowhead)");

      // Draw nodes
      g.append("g")
        .selectAll("rect")
        .data(root.descendants())
        .join("rect")
        .attr("x", d => (d.y || 0) - nodeWidth / 2)
        .attr("y", d => (d.x || 0) - nodeHeight / 2)
        .attr("width", nodeWidth)
        .attr("height", nodeHeight)
        .attr("rx", 5)
        .attr("ry", 5)
        .attr("fill", d => colorByDepth(d.depth))
        .attr("stroke", "#fff")
        .attr("stroke-width", 2)
        .on("click", (_event, d) => {
          let parentName = '';
          if (d.parent) {
            parentName = d.parent.data?.name || '';
          }
          selectedNode.value = {
            name: d.data?.name || '',
            description: d.data?.description || '',
            parent: parentName,
            id: d.data?.id || d.data?.name || '',
            depth: d.depth
          };
          showPopup.value = true;
          popupStyle.value = {
            top: `${(d.x || 0) - nodeHeight / 2 + 10 + margin.top}px`,
            left: `${(d.y || 0) + nodeHeight / 2 + 10 + margin.left}px`
          };
        });

      // Add labels
      g.append("g")
        .selectAll("text")
        .data(root.descendants())
        .join("text")
        .attr("x", d => d.y || 0)
        .attr("y", d => d.x || 0)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .text(d => d.data?.name || '')
        .attr("fill", "white")
        .attr("font-weight", "bold")
        .attr("pointer-events", "none");
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