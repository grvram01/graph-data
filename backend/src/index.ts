import { driver } from 'gremlin';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const NEPTUNE_PORT_FALLBACK = '8182'
const sampleData = {
  "data": [
    { name: "A", description: "This is description A", parent: "" },
    { name: "B", description: "This is description B", parent: "A" },
    { name: "C", description: "This is description C", parent: "A" },
    { name: "D", description: "This is description D", parent: "A" },
    { name: "B-1", description: "This is description B-1", parent: "B" },
    { name: "B-2", description: "This is description B-2", parent: "B" },
    { name: "B-3", description: "This is description B-3", parent: "B" }
  ]
};

// Neptune connection
const createGremlinClient = () => {
  const neptuneEndpoint = process.env.NEPTUNE_ENDPOINT || '';
  console.log("neptuneEndpoint ----------->", neptuneEndpoint)
  const neptunePort = process.env.NEPTUNE_PORT || NEPTUNE_PORT_FALLBACK;
  return new driver.Client(
    `wss://${neptuneEndpoint}:${neptunePort}/gremlin`,
    {
      traversalsource: 'g',
      mimeType: 'application/vnd.gremlin-v2.0+json',
      secure: true
    }
  );
};

// Initialization flag to ensure one-time initialization
let isInitialized = false;

// Initialize Neptune with sample data
const initializeNeptune = async () => {
  console.log('initializeNeptune started....')
  if (isInitialized) return;
  const client = createGremlinClient();
  console.log("client created..........")
  try {
    await client.open();
    // Check if data already exists
    const result = await client.submit('g.V().count()');
    console.log('result is.............', JSON.stringify(result))
    const count = result._items[0];
    if (count > 0) {
      console.log('Data already exists, skipping initialization');
      isInitialized = true;
      return;
    }
    console.log('Initializing Neptune with sample data...');

    // Create vertices
    for (const node of sampleData.data) {
      await client.submit(
        `g.addV('node')
         .property('name', '${node.name}')
         .property('description', '${node.description}')`
      );
      console.log(`Added node: ${node.name}`);
    }

    // Create edges
    for (const node of sampleData.data) {
      if (node.parent) {
        await client.submit(
          `g.V().has('node', 'name', '${node.parent}').as('parent')
           .V().has('node', 'name', '${node.name}').as('child')
           .addE('parent_of').from('parent').to('child')`
        );
        console.log(`Added edge from ${node.parent} to ${node.name}`);
      }
    }

    console.log('Neptune initialization complete');
    isInitialized = true;
  } catch (err) {
    console.error('Error initializing Neptune:', err);
    throw err;
  } finally {
    await client.close();
  }
};

// Get graph data
const getGraphData = async () => {
  const client = createGremlinClient();

  try {
    await client.open();

    // Get all vertices
    const verticesResult = await client.submit(
      `g.V().hasLabel('node').project('name', 'description')
       .by('name').by('description')`
    );

    const nodes = verticesResult._items;
    const nodesMap = new Map();

    // Create map of all nodes
    nodes.forEach((node: any) => {
      nodesMap.set(node.name, {
        name: node.name,
        description: node.description,
        parent: '',
        children: []
      });
    });

    // Get all edges
    const edgesResult = await client.submit(
      `g.E().hasLabel('parent_of')
       .project('parent', 'child')
       .by(outV().values('name'))
       .by(inV().values('name'))`
    );

    // Establish parent-child relationships
    edgesResult._items.forEach((edge: any) => {
      const childNode = nodesMap.get(edge.child);
      const parentNode = nodesMap.get(edge.parent);

      if (childNode && parentNode) {
        childNode.parent = edge.parent;
        parentNode.children.push(childNode);
      }
    });

    // Find root nodes
    const rootNodes = Array.from(nodesMap.values())
      .filter(node => !node.parent);

    return rootNodes;
  } catch (err) {
    console.error('Error fetching graph data:', err);
    throw err;
  } finally {
    await client.close();
  }
};

// Lambda initialization function
const lambdaInit = async () => {
  // Perform one-time initialization when Lambda container starts
  await initializeNeptune();
};

// Invoke initialization when the module is loaded
lambdaInit().catch(err => {
  console.error('Initialization failed:', err);
});

// Lambda handler
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Determine the route based on the path
    switch (event.path) {
      case '/api/graph':
        const data = await getGraphData();
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*' // Adjust as needed
          },
          body: JSON.stringify({ data })
        };

      case '/api/health':
        return {
          statusCode: 200,
          body: JSON.stringify({ status: 'ok' })
        };

      default:
        return {
          statusCode: 404,
          body: JSON.stringify({ message: 'Not Found' })
        };
    }
  } catch (error) {
    console.error('Error in Lambda handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to process request',
        message: error instanceof Error ? error.message : String(error)
      })
    };
  }
};