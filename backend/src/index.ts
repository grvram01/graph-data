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

// Use a global variable to track initialization status
let isNeptuneInitialized = false;

const initializeNeptune = async (): Promise<void> => {
  console.log('inside initializeNeptune......')
  // If already initialized, skip
  if (isNeptuneInitialized) {
    console.log('already initialised.....')
    return
  };

  console.log('Checking Neptune initialization status...');
  let client = null;
  try {
    client = createGremlinClient();
    console.log("Created Gremlin client");
    await client.open();
    
    // Check if data already exists - with timeout protection
    let result;
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), 5000)
      );
      result = await Promise.race([
        client.submit('g.V().count()'),
        timeoutPromise
      ]);
    } catch (error) {
      console.error('Error querying Neptune:', error);
      throw error;
    }
    
    console.log('Count query result:', JSON.stringify(result));
    const count = result._items[0];
    
    if (count > 0) {
      console.log(`${count} vertices found, skipping initialization`);
      isNeptuneInitialized = true;
      return;
    }
    
    console.log('No data found. Initializing Neptune with sample data...');
    
    // Create nodes sequentially with async/await
    for (const node of sampleData.data) {
      try {
        await client.submit(
          `g.addV('node')
           .property('name', '${node.name}')
           .property('description', '${node.description}')`
        );
        console.log(`Added node: ${node.name}`);
      } catch (error) {
        console.error(`Error adding node ${node.name}:`, error);
        throw error;
      }
    }

    // Create edges
    const nodesWithParents = sampleData.data.filter(node => node.parent);
    for (const node of nodesWithParents) {
      try {
        await client.submit(
          `g.V().has('node', 'name', '${node.parent}').as('parent')
           .V().has('node', 'name', '${node.name}').as('child')
           .addE('parent_of').from('parent').to('child')`
        );
        console.log(`Added edge from ${node.parent} to ${node.name}`);
      } catch (error) {
        console.error(`Error adding edge from ${node.parent} to ${node.name}:`, error);
        throw error;
      }
    }
    
    console.log('Neptune initialization complete');
    isNeptuneInitialized = true;
  } catch (err) {
    // More detailed error logging
    if (err instanceof Error) {
      if (err.message === 'Query timeout') {
        console.error('Neptune query timed out. Check connectivity and security groups.');
      } else if (err.name === 'ConnectionError') {
        console.error('Could not connect to Neptune. Check endpoint and port settings.');
      } else {
        console.error('Error initializing Neptune:', err);
      }
    }
    throw err;
  } finally {
    // Always close the client connection to prevent leaks
    if (client) {
      try {
        await client.close();
      } catch (closeErr) {
        console.error('Error closing Gremlin client:', closeErr);
      }
    }
  }
};

// Get graph data
const getGraphData = async () => {
  // Ensure Neptune is initialized before fetching data
  if (!isNeptuneInitialized && process.env.NEPTUNE_ENDPOINT) {
    await initializeNeptune();
  }

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

// Lambda handler
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Determine the route based on the path
    switch (event.path) {
      case '/api/graph':
        console.log('calling graph........');
        const data = await getGraphData();
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ data })
        };

      case '/api/health':
        console.log('calling health...................')
        return {
          statusCode: 200,
          body: JSON.stringify({ status: 'ok' }),
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
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

// Perform initialization if endpoint is available
if (process.env.NEPTUNE_ENDPOINT) {
  initializeNeptune().catch(err => {
    console.error('Initialization failed:', err);
  });
}