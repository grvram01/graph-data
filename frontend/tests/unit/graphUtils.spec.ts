import { describe, it, expect } from 'vitest';

function prepareGraphData(rootNodes: any) {
  const nodes = [] as any[];
  const links = [] as any[];

  const processNode = (node: any, depth = 0) => {
    const nodeObj = {
      id: node.name,
      name: node.name,
      description: node.description,
      parent: node.parent,
      depth: depth
    };
    nodes.push(nodeObj);

    if (node.children && node.children.length > 0) {
      node.children.forEach((child: any) => {
        links.push({
          source: node.name,
          target: child.name
        });
        processNode(child, depth + 1);
      });
    }
  };

  rootNodes.forEach((rootNode: any) => {
    processNode(rootNode);
  });

  return { nodes, links };
}

function colorByDepth(depth: number) {
  const colors = [
    '#4CAF50', // Green for root
    '#2196F3', // Blue
    '#FFC107', // Amber
    '#9C27B0', // Purple
    '#FF5722'  // Deep Orange
  ];
  return colors[depth % colors.length];
}

describe('Graph Utility Functions', () => {
  describe('prepareGraphData', () => {
    it('processes hierarchical data correctly', () => {
      const rootNodes = [
        {
          name: 'Root',
          description: 'Root node',
          parent: '',
          children: [
            {
              name: 'Child1',
              description: 'First child',
              parent: 'Root',
              children: []
            }
          ]
        }
      ];
      
      const result = prepareGraphData(rootNodes);
      
      expect(result.nodes.length).toBe(2);
      expect(result.links.length).toBe(1);
    });
    
    it('processes a simple hierarchy correctly', () => {
      const rootNodes = [
        {
          name: 'Root',
          description: 'Root node',
          parent: '',
          children: [
            {
              name: 'Child1',
              description: 'First child',
              parent: 'Root',
              children: []
            }
          ]
        }
      ];
      
      const result = prepareGraphData(rootNodes);
      
      expect(result.nodes[0].name).toBe('Root');
      expect(result.nodes[1].name).toBe('Child1');
      expect(result.links[0].source).toBe('Root');
      expect(result.links[0].target).toBe('Child1');
    });
    
    it('handles empty input', () => {
      const result = prepareGraphData([]);
      
      expect(result.nodes.length).toBe(0);
      expect(result.links.length).toBe(0);
    });
  });
  
  describe('colorByDepth', () => {
    it('returns appropriate colors for different depths', () => {
      const color0 = colorByDepth(0);
      const color1 = colorByDepth(1);
      const color2 = colorByDepth(2);
      
      expect(color0).toBe('#4CAF50'); // Root color
      expect(color1).toBe('#2196F3'); // First level color
      expect(color0).not.toBe(color1); // Different colors
    });
  });
});